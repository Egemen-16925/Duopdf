mod oauth;
mod office;
mod secret;

use std::path::Path;

/// Açılabilen belge uzantıları (ön yüzdeki src/formats/types.ts ile aynı tutulmalı).
const SUPPORTED_EXTENSIONS: &[&str] = &[
    "pdf", "epub", "docx", "pptx", "txt", "md", "png", "jpg", "jpeg", "webp", "bmp",
];

/// Kullanıcının seçtiği belgeyi ham bayt olarak döndürür (JSON'a çevirmeden).
/// Yalnızca desteklenen uzantılardaki dosyaları okur.
#[tauri::command]
fn read_document(path: String) -> Result<tauri::ipc::Response, String> {
    let p = Path::new(&path);
    let supported = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| SUPPORTED_EXTENSIONS.iter().any(|s| e.eq_ignore_ascii_case(s)))
        .unwrap_or(false);
    if !supported {
        return Err("Bu dosya türü desteklenmiyor.".into());
    }
    match std::fs::read(p) {
        Ok(bytes) => Ok(tauri::ipc::Response::new(bytes)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err("NOT_FOUND".into()),
        Err(e) => Err(format!("Dosya okunamadı: {e}")),
    }
}

fn require_json(path: &Path) -> Result<(), String> {
    let is_json = path
        .extension()
        .map(|e| e.eq_ignore_ascii_case("json"))
        .unwrap_or(false);
    if is_json {
        Ok(())
    } else {
        Err("Yedek dosyası .json uzantılı olmalı.".into())
    }
}

/// Öğrenme verisi yedeğini yazar (yalnızca .json).
#[tauri::command]
fn write_backup(path: String, contents: String) -> Result<(), String> {
    let p = Path::new(&path);
    require_json(p)?;
    std::fs::write(p, contents).map_err(|e| format!("Yedek yazılamadı: {e}"))
}

/// Öğrenme verisi yedeğini okur (yalnızca .json).
#[tauri::command]
fn read_backup(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    require_json(p)?;
    std::fs::read_to_string(p).map_err(|e| format!("Yedek okunamadı: {e}"))
}

/// `encodeURIComponent` ile kodlanmış metni çözer (yol, ASCII olmayan harfler içerebilir).
fn percent_decode(text: &str) -> Result<String, String> {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).map_err(|_| "Geçersiz yol.")?;
            out.push(u8::from_str_radix(hex, 16).map_err(|_| "Geçersiz yol.")?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|_| "Geçersiz yol.".into())
}

/// Çizimli PDF'i yazar (yalnızca .pdf). Baytlar ham gövde olarak, yol `path` başlığında gelir.
#[tauri::command]
fn write_pdf(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("PDF verisi gelmedi.".into());
    };
    let encoded = request
        .headers()
        .get("path")
        .and_then(|v| v.to_str().ok())
        .ok_or("Kaydedilecek yer belirtilmedi.")?;
    let path = percent_decode(encoded)?;
    let p = Path::new(&path);
    let is_pdf = p
        .extension()
        .map(|e| e.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false);
    if !is_pdf {
        return Err("Dosya .pdf uzantılı olmalı.".into());
    }
    std::fs::write(p, bytes).map_err(|e| format!("PDF yazılamadı: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(oauth::OAuthListeners::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_document,
            write_backup,
            read_backup,
            write_pdf,
            oauth::oauth_listen,
            oauth::oauth_wait,
            oauth::oauth_cancel,
            secret::protect_secret,
            secret::unprotect_secret,
            office::office_available,
            office::convert_with_office
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::percent_decode;

    #[test]
    fn decodes_windows_paths() {
        assert_eq!(
            percent_decode("C%3A%5CDers%5C%C3%B6devler%5Cnot%20(notlu).pdf").unwrap(),
            r"C:\Ders\ödevler\not (notlu).pdf"
        );
        assert_eq!(percent_decode("abc%").unwrap(), "abc%");
    }
}
