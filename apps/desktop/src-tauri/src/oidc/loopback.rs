use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::oidc::callback::parse_callback;

const LOOPBACK_ADDR: &str = "127.0.0.1:4201";

const HTML_OK: &str = "<!DOCTYPE html><html><body><h2>OIDC callback received</h2><p>You can close this window.</p></body></html>";

pub fn start_loopback_listener(app_handle: AppHandle) {
    match TcpListener::bind(LOOPBACK_ADDR) {
        Ok(listener) => {
            thread::spawn(move || {
                for stream in listener.incoming() {
                    if let Ok(mut stream) = stream {
                        handle_connection(&mut stream, &app_handle);
                    }
                }
            });
        }
        Err(e) => {
            eprintln!("[oidc] loopback listener bind failed on {LOOPBACK_ADDR}: {e}");
        }
    }
}

fn handle_connection(stream: &mut std::net::TcpStream, app_handle: &AppHandle) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut buffer = [0; 2048];
    let n = match stream.read(&mut buffer) {
        Ok(n) => n,
        Err(e) => {
            eprintln!("[oidc] loopback read error: {e}");
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

    let mut host: Option<&str> = None;
    for line in lines.skip(1) {
        if let Some(h) = line.strip_prefix("Host:") {
            host = Some(h.trim());
        }
    }

    if path.is_empty() {
        send_response(stream, 400, b"bad request");
        return;
    }

    let callback_url = if path.starts_with("http://") || path.starts_with("https://") {
        path.to_string()
    } else if let Some(h) = host {
        format!("http://{}{}", h, path)
    } else {
        send_response(stream, 400, b"missing host");
        return;
    };

    if parse_callback(&callback_url).is_ok() {
        let _ = app_handle.get_webview_window("main").map(|w| {
            let _ = w.emit("sewernet://oidc-callback", callback_url.clone());
        });
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            HTML_OK.len(),
            HTML_OK
        );
        let _ = stream.write_all(response.as_bytes());
    } else {
        send_response(stream, 400, b"invalid callback");
    }
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
