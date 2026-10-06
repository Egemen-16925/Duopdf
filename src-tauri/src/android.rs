//! Android'e özel işler: belge seçme/kaydetme yeri seçme ve API anahtarı şifreleme Kotlin tarafında
//! (`gen/android/.../NativePlugin.kt`); `content://` adreslerinin okunup yazılması fs eklentisiyle.

use std::io::{Read, Write};
use std::str::FromStr;

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_fs::{FilePath, FsExt, OpenOptions};

pub struct Native(PluginHandle<Wry>);

pub fn init() -> TauriPlugin<Wry> {
    Builder::new("duopdf-native")
        .setup(|app, api| {
            let handle = api.register_android_plugin("com.egemen.duopdf", "NativePlugin")?;
            app.manage(Native(handle));
            Ok(())
        })
        .build()
}

/// Kotlin komutunu çalıştırır. Seçici pencereler ana iş parçacığını beklediği için çağıran
/// komutlar `async` olmalı ve bunu `spawn_blocking` içinde çağırmalı.
pub fn run<T: DeserializeOwned>(app: &AppHandle, command: &str, payload: impl Serialize) -> Result<T, String> {
    app.state::<Native>()
        .0
        .run_mobile_plugin(command, payload)
        .map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct Data {
    pub data: String,
}

fn uri_path(uri: &str) -> Result<FilePath, String> {
    FilePath::from_str(uri).map_err(|_| "Geçersiz dosya adresi.".to_string())
}

/// `content://` adresindeki dosyayı okur. İzin kalkmışsa ya da dosya silinmişse "NOT_FOUND" döner;
/// ön yüz bu durumda dosyayı yeniden seçtirir.
pub fn read_uri(app: &AppHandle, uri: &str) -> Result<Vec<u8>, String> {
    let mut file = app
        .fs()
        .open(uri_path(uri)?, OpenOptions::new().read(true).clone())
        .map_err(|_| "NOT_FOUND".to_string())?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).map_err(|e| format!("Dosya okunamadı: {e}"))?;
    Ok(bytes)
}

pub fn write_uri(app: &AppHandle, uri: &str, bytes: &[u8]) -> Result<(), String> {
    let mut file = app
        .fs()
        .open(uri_path(uri)?, OpenOptions::new().write(true).truncate(true).clone())
        .map_err(|e| format!("Dosya açılamadı: {e}"))?;
    file.write_all(bytes).map_err(|e| format!("Dosya yazılamadı: {e}"))
}
