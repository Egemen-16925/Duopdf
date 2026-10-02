mod office;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_document,
            write_backup,
            read_backup,
            office::office_available,
            office::convert_with_office
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
