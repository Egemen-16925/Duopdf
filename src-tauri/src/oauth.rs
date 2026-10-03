//! Google girişi için geçici yerel adres (OAuth "loopback" yöntemi).
//! Uygulama 127.0.0.1'de rastgele bir kapıyı dinler; kullanıcı tarayıcıda izin verince Google
//! oraya döner, biz de adresteki `code`/`state` bilgisini ön yüze veririz. Yalnızca bu bilgisayardan
//! gelen tek bir istek beklenir; zaman aşımında kapı kapanır.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Default)]
pub struct OAuthListeners(Mutex<HashMap<u16, TcpListener>>);

const PAGE: &str = "<!doctype html><html lang=\"tr\"><meta charset=\"utf-8\"><title>Duopdf</title>\
<body style=\"font-family:Segoe UI,sans-serif;text-align:center;padding:48px\">\
<h2>Duopdf</h2><p>Google bağlantısı tamamlandı. Bu sekmeyi kapatıp uygulamaya dönebilirsin.</p></body></html>";

/// Yerel kapıyı açar ve numarasını döndürür (yönlendirme adresi: http://127.0.0.1:<kapı>).
#[tauri::command]
pub fn oauth_listen(state: tauri::State<'_, OAuthListeners>) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("Yerel kapı açılamadı: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    state.0.lock().unwrap().insert(port, listener);
    Ok(port)
}

/// İstek satırından ("GET /?code=..&state=.. HTTP/1.1") sorgu kısmı.
fn query_of(request: &str) -> Option<String> {
    let path = request.lines().next()?.split_whitespace().nth(1)?;
    if !path.starts_with("/?") && path != "/" {
        return None; // favicon vb.
    }
    Some(path.trim_start_matches('/').trim_start_matches('?').to_string())
}

fn answer(mut stream: TcpStream, ok: bool) {
    let body = if ok { PAGE } else { "" };
    let status = if ok { "200 OK" } else { "404 Not Found" };
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.flush();
}

fn wait_for_callback(listener: TcpListener, timeout: Duration) -> Result<String, String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + timeout;
    loop {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_nonblocking(false);
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut buf = [0u8; 8192];
                let n = stream.read(&mut buf).unwrap_or(0);
                let request = String::from_utf8_lossy(&buf[..n]).to_string();
                match query_of(&request) {
                    Some(query) => {
                        answer(stream, true);
                        return Ok(query);
                    }
                    None => answer(stream, false),
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() >= deadline {
                    return Err("TIMEOUT".into());
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(format!("Yerel kapı hatası: {e}")),
        }
    }
}

/// Google'ın yönlendirmesini bekler ve sorgu dizgesini (code=..&state=..) döndürür.
#[tauri::command]
pub async fn oauth_wait(state: tauri::State<'_, OAuthListeners>, port: u16, timeout_secs: u64) -> Result<String, String> {
    let listener = state.0.lock().unwrap().remove(&port).ok_or("Bu kapı açık değil.")?;
    tauri::async_runtime::spawn_blocking(move || wait_for_callback(listener, Duration::from_secs(timeout_secs)))
        .await
        .map_err(|e| e.to_string())?
}

/// Bekleme yarıda bırakılırsa (kullanıcı vazgeçti) kapıyı kapatır.
#[tauri::command]
pub fn oauth_cancel(state: tauri::State<'_, OAuthListeners>, port: u16) {
    state.0.lock().unwrap().remove(&port);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_the_query_of_the_redirect_and_ignores_other_paths() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let client = std::thread::spawn(move || {
            let mut favicon = TcpStream::connect(("127.0.0.1", port)).unwrap();
            write!(favicon, "GET /favicon.ico HTTP/1.1\r\nHost: x\r\n\r\n").unwrap();
            let mut s = String::new();
            let _ = favicon.read_to_string(&mut s);
            assert!(s.starts_with("HTTP/1.1 404"));
            let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
            write!(stream, "GET /?state=abc&code=4%2F0Ab HTTP/1.1\r\nHost: x\r\n\r\n").unwrap();
            let mut page = String::new();
            let _ = stream.read_to_string(&mut page);
            page
        });
        let query = wait_for_callback(listener, Duration::from_secs(5)).unwrap();
        assert_eq!(query, "state=abc&code=4%2F0Ab");
        assert!(client.join().unwrap().contains("Google bağlantısı tamamlandı"));
    }

    #[test]
    fn times_out_without_a_redirect() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        assert_eq!(wait_for_callback(listener, Duration::from_millis(200)).unwrap_err(), "TIMEOUT");
    }
}
