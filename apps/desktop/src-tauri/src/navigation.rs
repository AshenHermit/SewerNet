use tauri::{Manager, Runtime, plugin::TauriPlugin};
use tauri_plugin_opener::OpenerExt;

fn is_local_app_url(url: &url::Url) -> bool {
    match url.scheme() {
        "tauri" => true,
        "http" | "https" => matches!(url.host_str(), Some("tauri.localhost")),
        _ => false,
    }
}

#[cfg(debug_assertions)]
fn is_dev_url(url: &url::Url) -> bool {
    matches!(url.host_str(), Some("localhost" | "127.0.0.1")) && url.scheme() == "http"
}

#[cfg(not(debug_assertions))]
fn is_dev_url(_url: &url::Url) -> bool {
    false
}

pub fn is_blocked_privileged_url(url: &str) -> bool {
    let Ok(parsed) = url::Url::parse(url) else {
        return true;
    };
    matches!(parsed.scheme(), "blob" | "javascript" | "data" | "file")
        || parsed.scheme() == "sewernet" && parsed.host_str() == Some("oidc")
}

pub fn is_allowed_privileged_navigation(url: &str) -> bool {
    let Ok(parsed) = url::Url::parse(url) else {
        return false;
    };
    if is_blocked_privileged_url(url) {
        return false;
    }
    is_local_app_url(&parsed) || is_dev_url(&parsed)
}

pub fn external_navigation_allowed(url: &str) -> bool {
    matches!(url::Url::parse(url), Ok(parsed) if matches!(parsed.scheme(), "http" | "https") && parsed.has_host() && parsed.username().is_empty() && parsed.password().is_none() && parsed.fragment().is_none())
}

pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("sewernet-navigation")
        .on_navigation(|webview, url| {
            if is_allowed_privileged_navigation(url.as_str()) {
                return true;
            }
            if external_navigation_allowed(url.as_str()) {
                let _ = webview
                    .app_handle()
                    .opener()
                    .open_url(url.as_str(), None::<String>);
            }
            false
        })
        .build()
}

#[tauri::command]
pub async fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if !external_navigation_allowed(&url) {
        return Err("blocked external URL".to_string());
    }
    app.opener()
        .open_url(url, None::<String>)
        .map_err(|_| "unable to open external URL".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn external_navigation_cannot_invoke_ipc() {
        assert!(!is_allowed_privileged_navigation(
            "sewernet://oidc/callback"
        ));
        assert!(!is_allowed_privileged_navigation("javascript:alert(1)"));
        assert!(!is_allowed_privileged_navigation(
            "blob:https://local.test/id"
        ));
        assert!(!is_allowed_privileged_navigation("https://evil.test/"));
    }

    #[test]
    fn only_local_bundle_navigates_privileged_webview() {
        assert!(is_allowed_privileged_navigation(
            "tauri://localhost/index.html"
        ));
        assert!(is_allowed_privileged_navigation(
            "https://tauri.localhost/index.html"
        ));
        assert!(!is_allowed_privileged_navigation(
            "data:text/html,<h1>x</h1>"
        ));
        assert!(!is_allowed_privileged_navigation(
            "file:///C:/Windows/System32/"
        ));
    }

    #[test]
    fn external_links_require_plain_http_or_https() {
        assert!(external_navigation_allowed("https://example.org/path?q=1"));
        assert!(!external_navigation_allowed(
            "https://user:pass@example.org/"
        ));
        assert!(!external_navigation_allowed(
            "https://example.org/#fragment"
        ));
        assert!(!external_navigation_allowed("ms-settings:privacy"));
    }

    #[test]
    fn blob_downloads_are_not_privileged_navigation() {
        assert!(is_blocked_privileged_url(
            "blob:https://tauri.localhost/uuid"
        ));
    }
}
