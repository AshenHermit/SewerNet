use std::sync::{Arc, Mutex};

pub const OIDC_CALLBACK_SCHEME: &str = "sewernet";
pub const OIDC_CALLBACK_HOST: &str = "oidc";
pub const OIDC_CALLBACK_PATH: &str = "/callback";

#[derive(Default)]
pub struct DeepLinkQueue {
    urls: Arc<Mutex<Vec<String>>>,
}

impl DeepLinkQueue {
    pub fn push(&self, url: String) {
        self.urls.lock().unwrap().push(url);
    }

    pub fn take_all(&self) -> Vec<String> {
        std::mem::take(&mut *self.urls.lock().unwrap())
    }
}

pub fn dev_registration_enabled() -> bool {
    std::env::var_os("SEWERNET_OIDC_DEV_REGISTER").is_some_and(|v| v == "1")
}

pub fn is_trusted_callback(raw: &str) -> bool {
    crate::oidc::callback::parse_callback(raw).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cold_warm_queue_preserves_each_delivery_once() {
        let queue = DeepLinkQueue::default();
        queue.push("sewernet://oidc/callback?state=cold&code=c".into());
        assert_eq!(queue.take_all().len(), 1);
        assert!(queue.take_all().is_empty());
        queue.push("sewernet://oidc/callback?state=warm&code=c".into());
        assert_eq!(queue.take_all().len(), 1);
    }

    #[test]
    fn dev_registration_is_explicit_only() {
        assert!(
            !std::env::var_os("SEWERNET_OIDC_DEV_REGISTER").is_some_and(|v| v == "1")
                || dev_registration_enabled()
        );
    }
}
