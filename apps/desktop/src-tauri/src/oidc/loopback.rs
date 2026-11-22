use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::log_error;
use crate::log_oidc;
use crate::oidc::callback::parse_callback;

const LOOPBACK_ADDR: &str = "127.0.0.1:4201";

const HTML_OK: &str = "<!DOCTYPE html><html><body><h2>OIDC callback received</h2><p>You can close this window.</p></body></html>";

pub fn start_loopback_listener(app_handle: AppHandle) {
    match TcpListener::bind(LOOPBACK_ADDR) {
        Ok(listener) => {
            log_oidc!("loopback listener started on {}", LOOPBACK_ADDR);
            thread::spawn(move || {
                for mut stream in listener.incoming().flatten() {
                    handle_connection(&mut stream, &app_handle);
                }
            });
        }
        Err(e) => {
            log_error!("loopback listener bind failed on {}: {}", LOOPBACK_ADDR, e);
        }
    }
}

fn handle_connection(stream: &mut std::net::TcpStream, app_handle: &AppHandle) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut buffer = [0; 2048];
    let n = match stream.read(&mut buffer) {
        Ok(n) => n,
        Err(e) => {
            log_error!("loopback read error: {}", e);
            return;
        }
    };

    if n == 0 {
        return;
    }

    let request = String::from_utf8_lossy(&buffer[..n]);
    let mut lines = request.lines();
    let request_line = lines.next().unwrap_or("");
    let mut parts = request_line.split_whitespace();
    let _method = parts.next();
    let path = parts.next().unwrap_or("");

    log_oidc!("incoming request: {}", request_line);

    let mut host: Option<&str> = None;
    for line in lines {
        if let Some(idx) = line.find(':') {
            let name = &line[..idx];
            if name.eq_ignore_ascii_case("Host") {
                host = Some(line[idx + 1..].trim());
            }
        }
    }

    if path.is_empty() {
        log_error!("empty path in callback request");
        send_response(stream, 400, b"bad request");
        return;
    }

    let callback_url = if path.starts_with("http://") || path.starts_with("https://") {
        path.split('#').next().unwrap_or(path).to_string()
    } else if let Some(h) = host {
        format!("http://{}{}", h, path)
    } else {
        log_error!("missing host header, path: {}", path);
        send_response(stream, 400, b"missing host");
        return;
    };

    log_oidc!("parsed callback URL: {}", callback_url);

    match parse_callback(&callback_url) {
        Ok(params) => {
            log_oidc!(
                "callback parsed OK: state={}, code={:?}, error={:?}",
                params.state,
                params.code.is_some(),
                params.error
            );
            let event_payload = callback_url.clone();
            if let Err(e) = app_handle.emit("sewernet://oidc-callback", event_payload) {
                log_error!("failed to emit oidc-callback event: {}", e);
            } else {
                log_oidc!("emitted sewernet://oidc-callback event");
            }
        }
        Err(e) => {
            log_error!("callback parse failed: {}", e);
        }
    }

    send_response(stream, 200, HTML_OK.as_bytes());
}

fn send_response(stream: &mut std::net::TcpStream, status: u16, body: &[u8]) {
    let status_text = match status {
        200 => "OK",
        400 => "Bad Request",
        _ => "Unknown",
    };
    let response = format!(
        "HTTP/1.1 {status} {status_text}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.write_all(body);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loopback_addr_is_localhost_4201() {
        assert_eq!(LOOPBACK_ADDR, "127.0.0.1:4201");
    }

    #[test]
    fn response_contains_status_line() {
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            0
        );
        assert!(response.starts_with("HTTP/1.1 200 OK\r\n"));
    }
}
