#[cfg(target_os = "android")]
mod android;
mod oauth;
mod office;
mod secret;

use std::path::Path;
use tauri::AppHandle;

/// Açılabilen belge uzantıları (ön yüzdeki src/formats/types.ts ile aynı tutulmalı).
const SUPPORTED_EXTENSIONS: &[&str] = &[
    "pdf", "epub", "docx", "pptx", "txt", "md", "png", "jpg", "jpeg", "webp", "bmp",
];

/// Android'de belgeler dosya yolu yerine sistem seçicisinin verdiği `content://` adresiyle tutulur.
fn is_uri(path: &str) -> bool {
    path.starts_with("content://")
}

fn has_extension(path: &str, allowed: &[&str]) -> bool {
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| allowed.iter().any(|s| e.eq_ignore_ascii_case(s)))
        .unwrap_or(false)
}

fn read_bytes(app: &AppHandle, path: &str) -> Result<Vec<u8>, String> {
    #[cfg(target_os = "android")]
    if is_uri(path) {
        return android::read_uri(app, path);
    }
    let _ = app;
    match std::fs::read(path) {
        Ok(bytes) => Ok(bytes),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err("NOT_FOUND".into()),
        Err(e) => Err(format!("Dosya okunamadı: {e}")),
    }
}

fn write_bytes(app: &AppHandle, path: &str, bytes: &[u8]) -> Result<(), String> {
    #[cfg(target_os = "android")]
    if is_uri(path) {
        return android::write_uri(app, path, bytes);
    }
    let _ = app;
    std::fs::write(path, bytes).map_err(|e| e.to_string())
}

/// Dosya işlerini arka planda yapar (Android'de ana iş parçacığını beklemesin).
async fn blocking<T: Send + 'static>(job: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(job).await.map_err(|e| e.to_string())?
}

/// Kullanıcının seçtiği belgeyi ham bayt olarak döndürür (JSON'a çevirmeden).
/// Dosya yolunda yalnızca desteklenen uzantılar okunur.
#[tauri::command]
async fn read_document(app: AppHandle, path: String) -> Result<tauri::ipc::Response, String> {
    if !is_uri(&path) && !has_extension(&path, SUPPORTED_EXTENSIONS) {
        return Err("Bu dosya türü desteklenmiyor.".into());
    }
    let bytes = blocking(move || read_bytes(&app, &path)).await?;
    Ok(tauri::ipc::Response::new(bytes))
}

fn require_json(path: &str) -> Result<(), String> {
    if is_uri(path) || has_extension(path, &["json"]) {
        Ok(())
    } else {
        Err("Yedek dosyası .json uzantılı olmalı.".into())
    }
}

/// Öğrenme verisi yedeğini yazar (yalnızca .json).
#[tauri::command]
async fn write_backup(app: AppHandle, path: String, contents: String) -> Result<(), String> {
    require_json(&path)?;
    blocking(move || write_bytes(&app, &path, contents.as_bytes()))
        .await
        .map_err(|e| format!("Yedek yazılamadı: {e}"))
}

/// Öğrenme verisi yedeğini okur (yalnızca .json).
#[tauri::command]
async fn read_backup(app: AppHandle, path: String) -> Result<String, String> {
    require_json(&path)?;
    let bytes = blocking(move || read_bytes(&app, &path))
        .await
        .map_err(|e| format!("Yedek okunamadı: {e}"))?;
    String::from_utf8(bytes).map_err(|_| "Yedek okunamadı: dosya UTF-8 değil.".into())
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
async fn write_pdf(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("PDF verisi gelmedi.".into());
    };
    let encoded = request
        .headers()
        .get("path")
        .and_then(|v| v.to_str().ok())
        .ok_or("Kaydedilecek yer belirtilmedi.")?;
    let path = percent_decode(encoded)?;
    if !is_uri(&path) && !has_extension(&path, &["pdf"]) {
        return Err("Dosya .pdf uzantılı olmalı.".into());
    }
    let bytes = bytes.clone();
    blocking(move || write_bytes(&app, &path, &bytes))
        .await
        .map_err(|e| format!("PDF yazılamadı: {e}"))
}

#[derive(serde::Serialize, serde::Deserialize)]
struct PickedFile {
    uri: String,
    name: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct CreatedFile {
    uri: Option<String>,
    name: Option<String>,
}

/// Android: belgeleri sistem seçicisiyle seçtirir (kalıcı okuma izniyle).
#[tauri::command]
async fn pick_documents(app: AppHandle, mime_types: Vec<String>, multiple: bool) -> Result<Vec<PickedFile>, String> {
    #[cfg(target_os = "android")]
    {
        #[derive(serde::Deserialize)]
        struct Picked {
            files: Vec<PickedFile>,
        }
        let payload = serde_json::json!({ "mimeTypes": mime_types, "multiple": multiple });
        blocking(move || android::run::<Picked>(&app, "pickDocuments", payload).map(|p| p.files)).await
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, mime_types, multiple);
        Err("UNSUPPORTED".into())
    }
}

/// Android: kaydedilecek yeri seçtirir; vazgeçilirse `uri` boş döner.
#[tauri::command]
async fn create_document(app: AppHandle, name: String, mime_type: String) -> Result<CreatedFile, String> {
    #[cfg(target_os = "android")]
    {
        let payload = serde_json::json!({ "name": name, "mimeType": mime_type });
        blocking(move || android::run::<CreatedFile>(&app, "createDocument", payload)).await
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, name, mime_type);
        Err("UNSUPPORTED".into())
    }
}

/// Android: "son açılanlar"dan kaldırılan belgenin kalıcı okuma iznini bırakır.
#[tauri::command]
async fn release_document(app: AppHandle, uri: String) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        let payload = serde_json::json!({ "uri": uri });
        blocking(move || android::run::<serde_json::Value>(&app, "releaseDocument", payload).map(|_| ())).await
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, uri);
        Ok(())
    }
}

/// Android: sesli okuma motoru (TextToSpeech) kullanılabilir mi.
#[tauri::command]
async fn speech_available(app: AppHandle) -> Result<bool, String> {
    #[cfg(target_os = "android")]
    {
        #[derive(serde::Deserialize)]
        struct Availability {
            available: bool,
        }
        blocking(move || android::run::<Availability>(&app, "speechAvailable", serde_json::json!({})).map(|a| a.available)).await
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(false)
    }
}

/// Android: İngilizce metni okur; okuma bitince (ya da durdurulunca) döner.
#[tauri::command]
async fn speak(app: AppHandle, text: String, rate: f32) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        let payload = serde_json::json!({ "text": text, "rate": rate });
        blocking(move || android::run::<serde_json::Value>(&app, "speak", payload).map(|_| ())).await
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, text, rate);
        Err("UNSUPPORTED".into())
    }
}

#[tauri::command]
async fn stop_speaking(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        blocking(move || android::run::<serde_json::Value>(&app, "stopSpeaking", serde_json::json!({})).map(|_| ())).await
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(())
    }
}

/// Android: geri tuşu en başta basılınca uygulamayı arka plana alır.
#[tauri::command]
async fn move_to_background(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        blocking(move || android::run::<serde_json::Value>(&app, "moveToBackground", serde_json::json!({})).map(|_| ())).await
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "android")]
    let builder = builder.plugin(tauri_plugin_fs::init()).plugin(android::init());
    builder
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
            pick_documents,
            create_document,
            release_document,
            move_to_background,
            speech_available,
            speak,
            stop_speaking,
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
