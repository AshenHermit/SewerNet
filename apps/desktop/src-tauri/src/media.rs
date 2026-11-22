use crate::storage::accounts::AccountStore;
use crate::storage::accounts::MatrixCredentials;
use tauri::State;

#[derive(Clone, Copy, Debug)]
pub enum MediaKind {
    Download,
    Thumbnail,
}

pub fn validate_mxc(mxc: &str) -> Result<(&str, &str), &'static str> {
    let rest = mxc.strip_prefix("mxc://").ok_or("malformed MXC")?;
    let (server, media_id) = rest.split_once('/').ok_or("malformed MXC")?;
    if server.is_empty()
        || media_id.is_empty()
        || server.contains(['/', '\\', '?', '#'])
        || media_id.contains(['/', '\\', '?', '#'])
    {
        return Err("malformed MXC");
    }
    if media_id
        .split('/')
        .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err("traversal MXC");
    }
    Ok((server, media_id))
}

pub fn validate_dimensions(kind: MediaKind, size: Option<u32>) -> Result<(), &'static str> {
    if matches!(kind, MediaKind::Thumbnail) {
        let size = size.ok_or("thumbnail size missing")?;
        if !(1..=4096).contains(&size) {
            return Err("excessive dimensions");
        }
    } else if size.is_some() {
        return Err("download dimensions forbidden");
    }
    Ok(())
}

fn account_for_user(
    store: &AccountStore,
    user_id: &str,
) -> Result<MatrixCredentials, &'static str> {
    let snapshot = store.load().map_err(|_| "account storage unavailable")?;
    let active = snapshot
        .active_user_id
        .as_deref()
        .ok_or("inactive account")?;
    if !active.eq_ignore_ascii_case(user_id) {
        return Err("inactive account");
    }
    if snapshot
        .blocked_accounts
        .keys()
        .any(|id| id.eq_ignore_ascii_case(user_id))
    {
        return Err("deleted or stale account");
    }
    snapshot
        .accounts
        .get(user_id)
        .cloned()
        .ok_or("deleted or stale account")
}

pub fn allowed_media_url(
    base_url: &str,
    server: &str,
    media_id: &str,
    kind: MediaKind,
    size: Option<u32>,
) -> Result<url::Url, &'static str> {
    validate_dimensions(kind, size)?;
    let mut base = url::Url::parse(base_url).map_err(|_| "invalid base URL")?;
    if base.scheme() != "https"
        || base.username() != ""
        || base.password().is_some()
        || base.query().is_some()
        || base.fragment().is_some()
    {
        return Err("invalid base URL");
    }
    base.set_query(None);
    base.set_fragment(None);
    let kind_path = match kind {
        MediaKind::Download => "download",
        MediaKind::Thumbnail => "thumbnail",
    };
    let base_path = base.path().trim_end_matches('/');
    let path = format!(
        "{base_path}/_matrix/client/v1/media/{kind_path}/{}/{}",
        url::form_urlencoded::byte_serialize(server.as_bytes()).collect::<String>(),
        url::form_urlencoded::byte_serialize(media_id.as_bytes()).collect::<String>()
    );
    base.set_path(&path);
    if let Some(size) = size.filter(|_| matches!(kind, MediaKind::Thumbnail)) {
        base.query_pairs_mut()
            .append_pair("width", &size.to_string())
            .append_pair("height", &size.to_string())
            .append_pair("method", "scale");
    }
    Ok(base)
}

#[tauri::command]
pub async fn media_download(
    state: State<'_, crate::storage::StorageState>,
    mxc: String,
    kind: String,
    size: Option<u32>,
    user_id: String,
) -> Result<Vec<u8>, String> {
    let kind = match kind.as_str() {
        "download" => MediaKind::Download,
        "thumbnail" => MediaKind::Thumbnail,
        _ => return Err("invalid media kind".to_string()),
    };
    let (server, media_id) = validate_mxc(&mxc).map_err(str::to_string)?;
    validate_dimensions(kind, size).map_err(str::to_string)?;
    let store = state.0.clone();
    let account = tauri::async_runtime::spawn_blocking(move || account_for_user(&store, &user_id))
        .await
        .map_err(|_| "media storage failed".to_string())?
        .map_err(|e| e.to_string())?;
    let url = allowed_media_url(&account.homeserver_url, server, media_id, kind, size)
        .map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|_| "media client unavailable".to_string())?;
    let response = client
        .get(url)
        .header(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {}", account.access_token),
        )
        .send()
        .await
        .map_err(|_| "media fetch failed".to_string())?;
    if !response.status().is_success() {
        return Err("media fetch failed".to_string());
    }
    response
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|_| "media fetch failed".to_string())
}

#[tauri::command]
pub async fn media_upload(
    state: State<'_, crate::storage::StorageState>,
    file_bytes: Vec<u8>,
    content_type: String,
    filename: Option<String>,
    user_id: String,
) -> Result<String, String> {
    let store = state.0.clone();
    let account = tauri::async_runtime::spawn_blocking(move || account_for_user(&store, &user_id))
        .await
        .map_err(|_| "media storage failed".to_string())?
        .map_err(|e| e.to_string())?;

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|_| "media client unavailable".to_string())?;

    let upload_url = format!(
        "{}/_matrix/client/v3/media/upload",
        account.homeserver_url.trim_end_matches('/')
    );
    let mut multipart = reqwest::multipart::Form::new().part(
        "file",
        reqwest::multipart::Part::bytes(file_bytes)
            .file_name(filename.unwrap_or_else(|| "upload".to_string()))
            .mime_str(&content_type)
            .map_err(|_| "invalid content type".to_string())?,
    );

    let response = client
        .post(upload_url)
        .header(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {}", account.access_token),
        )
        .multipart(multipart)
        .send()
        .await
        .map_err(|_| "media upload failed".to_string())?;

    if !response.status().is_success() {
        return Err("media upload failed".to_string());
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|_| "media upload failed".to_string())?;
    json.get("content_uri")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "media upload failed: no content_uri".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_redirect_url_and_traversal() {
        assert!(validate_mxc("mxc://server/../secret").is_err());
    }

    #[test]
    fn rejects_malformed_mxc_and_excessive_dimensions() {
        assert!(validate_mxc("https://evil.test/id").is_err());
        assert!(validate_dimensions(MediaKind::Thumbnail, Some(4097)).is_err());
        assert!(validate_dimensions(MediaKind::Download, Some(32)).is_err());
    }

    #[test]
    fn derives_sdk_style_media_url_only() {
        let url = allowed_media_url(
            "https://home.test/matrix",
            "media.example",
            "abc",
            MediaKind::Thumbnail,
            Some(64),
        )
        .unwrap();
        assert_eq!(
            url.as_str(),
            "https://home.test/matrix/_matrix/client/v1/media/thumbnail/media.example/abc?width=64&height=64&method=scale"
        );
    }
}
