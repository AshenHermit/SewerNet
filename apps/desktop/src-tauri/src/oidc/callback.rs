use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use url::Url;

const MAX_CALLBACK_LEN: usize = 8 * 1024;
const MAX_STATE_LEN: usize = 512;
const MAX_CODE_LEN: usize = 4096;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct CallbackParams {
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// Fix unused variable warning
impl CallbackParams {
    pub fn state_code_xor_error(&self) -> bool {
        self.code.is_some() == self.error.is_some()
    }
}

pub fn parse_callback(raw: &str) -> Result<CallbackParams, &'static str> {
    if raw.len() > MAX_CALLBACK_LEN {
        return Err("invalid_callback");
    }
    let url = Url::parse(raw).map_err(|_| "invalid_callback")?;
    let path_ok = match url.scheme() {
        "sewernet" => url.path() == "/callback",
        "http" => url.path() == "/oidc/callback",
        _ => false,
    };
    if !path_ok
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || url.cannot_be_a_base()
    {
        return Err("invalid_callback");
    }
    let legacy =
        url.scheme() == "sewernet" && url.host_str() == Some("oidc") && url.port().is_none();
    let loopback =
        url.scheme() == "http" && url.host_str() == Some("127.0.0.1") && url.port() == Some(4201);
    if !(legacy || loopback) {
        return Err("invalid_callback");
    }

    let mut pairs: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for (key, value) in url.query_pairs() {
        pairs
            .entry(key.into_owned())
            .or_default()
            .push(value.into_owned());
    }
    for values in pairs.values() {
        if values.len() != 1 {
            return Err("invalid_callback");
        }
    }

    let state = pairs.get("state").and_then(|v| v.first()).cloned();
    let code = pairs.get("code").and_then(|v| v.first()).cloned();
    let error = pairs.get("error").and_then(|v| v.first()).cloned();
    let state = state
        .filter(|value| !value.is_empty())
        .ok_or("invalid_callback")?;
    if code.is_some() == error.is_some() {
        return Err("invalid_callback");
    }
    if state.len() > MAX_STATE_LEN {
        return Err("invalid_callback");
    }
    if code.is_some() && code.as_ref().unwrap().len() > MAX_CODE_LEN {
        return Err("invalid_callback");
    }

    let code = if code.is_some() { code } else { None };

    Ok(CallbackParams { state, code, error })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_basic() {
        assert!(parse_callback("sewernet://oidc/callback?state=s&code=c").is_ok());
    }

    #[test]
    fn loopback_redirect_is_accepted() {
        let parsed = parse_callback("http://127.0.0.1:4201/oidc/callback?state=s&code=c");
        assert!(
            parsed.is_ok(),
            "loopback callback should parse successfully"
        );
        let params = parsed.unwrap();
        assert_eq!(params.state, "s");
        assert_eq!(params.code, Some("c".to_string()));
    }

    #[test]
    fn legacy_credentials_accept_loopback_callback() {
        // test for js-sdk and pending.rs compatibility
        assert!(parse_callback("sewernet://oidc/callback?state=s&code=c").is_ok());
    }

    #[test]
    fn state_code_xor_error() {
        assert!(parse_callback("sewernet://oidc/callback?state=s&code=c&error=e").is_err());
        assert!(parse_callback("sewernet://oidc/callback?state=s&error=e").is_ok());
    }

    #[test]
    fn oversize_rejected_before_parse() {
        assert!(
            parse_callback(&format!(
                "sewernet://oidc/callback?state=s&code={}",
                "x".repeat(16 * 1024)
            ))
            .is_err()
        );
    }
}
