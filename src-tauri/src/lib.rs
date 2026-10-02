use std::path::Path;

/// Açılabilen belge uzantıları (ön yüzdeki src/formats/types.ts ile aynı tutulmalı).
const SUPPORTED_EXTENSIONS: &[&str] = &["pdf", "epub", "docx", "pptx", "txt", "md"];

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![read_document])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
