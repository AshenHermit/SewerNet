use std::sync::Once;

static INIT: Once = Once::new();

pub fn init() {
    INIT.call_once(|| {
        #[cfg(debug_assertions)]
        {
            // In debug builds, use simple eprintln-based logging with timestamps
            // This avoids pulling in tracing dependencies for now.
        }
    });
}

#[macro_export]
macro_rules! log_oidc {
    ($($arg:tt)*) => {
        eprintln!("[oidc] {}", format!($($arg)*))
    };
}

#[macro_export]
macro_rules! log_error {
    ($($arg:tt)*) => {
        eprintln!("[ERROR] {}", format!($($arg)*))
    };
}

#[macro_export]
macro_rules! log_debug {
    ($($arg:tt)*) => {
        #[cfg(debug_assertions)]
        eprintln!("[DEBUG] {}", format!($($arg)*))
    };
}

// Re-export macros for use within the crate
pub use log_oidc;
pub use log_error;
pub use log_debug;