use std::path::Path;

/// Kullanıcının seçtiği PDF'i ham bayt olarak döndürür (JSON'a çevirmeden).
/// Yalnızca .pdf uzantılı dosyaları okur.
#[tauri::command]
fn read_pdf(path: String) -> Result<tauri::ipc::Response, String> {
    let p = Path::new(&path);
    let is_pdf = p
        .extension()
        .map(|e| e.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false);
    if !is_pdf {
        return Err("Yalnızca PDF dosyaları açılabilir.".into());
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
        .invoke_handler(tauri::generate_handler![read_pdf])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
