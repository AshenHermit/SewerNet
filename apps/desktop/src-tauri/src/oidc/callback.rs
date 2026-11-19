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

pub fn parse_callback(raw: &str) -> Result<CallbackParams, &'static str> {
    if raw.len() > MAX_CALLBACK_LEN {
        return Err("invalid_callback");
    }
    let url = Url::parse(raw).map_err(|_| "invalid_callback")?;
    if url.scheme() != "sewernet"
        || url.host_str() != Some("oidc")
        || url.path() != "/callback"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.fragment().is_some()
        || url.cannot_be_a_base()
    {
        return Err("invalid_callback");
    }

    let mut pairs: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for (key, value) in url.query_pairs() {
        pairs
            .entry(key.into_owned())
            .or_default()
            .push(value.into_owned());
    }
    for (key, values) in &pairs {
        if values.len() != 1 {
            return Err("invalid_callback");
        }
        if key != "state" && key != "code" && key != "error" {
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
    if state.len() > MAX_STATE_LEN
        || code
            .as_ref()
            .is_some_and(|value| value.is_empty() || value.len() > MAX_CODE_LEN)
        || error
            .as_ref()
            .is_some_and(|value| value.is_empty() || value.len() > MAX_CODE_LEN)
    {
        return Err("invalid_callback");
    }
    Ok(CallbackParams { state, code, error })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_scheme_host_path_only() {
        assert!(parse_callback("sewernet://oidc/callback?state=s&code=c").is_ok());
        for raw in [
            "https://oidc/callback?state=s&code=c",
            "sewernet://evil/callback?state=s&code=c",
            "sewernet://oidc/other?state=s&code=c",
            "sewernet://user@oidc/callback?state=s&code=c",
            "sewernet://oidc:123/callback?state=s&code=c",
            "sewernet://oidc/callback?state=s&code=c#x",
            "sewernet://oidc/callback?state=s&code=c&=x",
            "sewernet://oidc/callback?state=s&code=c&%73tate=x",
            "sewernet://oidc/callback?state=s&code=c&code=d",
            "sewernet://oidc/callback?state=s&code=c&extra=x",
            "sewernet://oidc/callback?state=s&state=d&code=c",
        ] {
            assert!(parse_callback(raw).is_err(), "accepted {raw}");
        }
    }

    #[test]
    fn state_code_xor_error() {
        assert!(parse_callback("sewernet://oidc/callback?state=s").is_err());
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
