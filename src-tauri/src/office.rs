//! DOCX/PPTX dosyalarını kurulu Microsoft Office ile PDF'e çevirir ("orijinal görünüm").
//! Office COM otomasyonu PowerShell üzerinden çalıştırılır; Office yoksa bu özellik kapalıdır.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const TIMEOUT: Duration = Duration::from_secs(120);

// Otomasyonla açılan dosyalarda Office makroları varsayılan olarak çalışır; uzantısı .docx/.pptx olan
// ama içinde makro taşıyan bir dosya kod çalıştırmasın diye `AutomationSecurity = 3` (makrolar kapalı).

/// Word belgesini PDF'e çevirir. Yalnızca kendi açtığı Word örneğini kapatır.
const WORD_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
try {
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $word.AutomationSecurity = 3
  $doc = $word.Documents.Open($env:DUOPDF_SRC, $false, $true, $false)
  try { $doc.ExportAsFixedFormat($env:DUOPDF_OUT, 17) } finally { $doc.Close($false) }
} finally {
  if ($word.Documents.Count -eq 0) { $word.Quit() }
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
}
"#;

/// PowerPoint tek örnekli çalışır: kullanıcı açık bir sunumla çalışıyorsa uygulamayı kapatmaz.
const POWERPOINT_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$wasRunning = [bool](Get-Process POWERPNT -ErrorAction SilentlyContinue)
$pp = New-Object -ComObject PowerPoint.Application
$security = $pp.AutomationSecurity
try {
  $pp.AutomationSecurity = 3
  $pres = $pp.Presentations.Open($env:DUOPDF_SRC, -1, 0, 0)
  try { $pres.SaveAs($env:DUOPDF_OUT, 32) } finally { $pres.Close() }
} finally {
  $pp.AutomationSecurity = $security
  if (-not $wasRunning -and $pp.Presentations.Count -eq 0) { $pp.Quit() }
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($pp)
}
"#;

fn prog_id_registered(prog_id: &str) -> bool {
    let mut cmd = Command::new("reg");
    cmd.args(["query", &format!(r"HKCR\{prog_id}\CLSID")]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.output().map(|o| o.status.success()).unwrap_or(false)
}

#[derive(serde::Serialize)]
pub struct OfficeAvailability {
    word: bool,
    powerpoint: bool,
}

#[tauri::command]
pub async fn office_available() -> OfficeAvailability {
    tauri::async_runtime::spawn_blocking(|| OfficeAvailability {
        word: cfg!(windows) && prog_id_registered("Word.Application"),
        powerpoint: cfg!(windows) && prog_id_registered("PowerPoint.Application"),
    })
    .await
    .unwrap_or(OfficeAvailability { word: false, powerpoint: false })
}

fn run_script(script: &str, src: &Path, out: &Path) -> Result<(), String> {
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", script])
        .env("DUOPDF_SRC", src)
        .env("DUOPDF_OUT", out)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let mut child = cmd.spawn().map_err(|e| format!("PowerShell başlatılamadı: {e}"))?;

    let started = Instant::now();
    loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            if status.success() {
                return Ok(());
            }
            let mut stderr = String::new();
            if let Some(mut pipe) = child.stderr.take() {
                use std::io::Read;
                let _ = pipe.read_to_string(&mut stderr);
            }
            let detail = stderr.lines().find(|l| !l.trim().is_empty()).unwrap_or("").trim().to_string();
            return Err(format!("Office dosyayı dönüştüremedi. {detail}"));
        }
        if started.elapsed() > TIMEOUT {
            let _ = child.kill();
            return Err("Office 2 dakikada yanıt vermedi; dönüştürme iptal edildi.".into());
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

/// Belgeyi PDF'e çevirir ve önbellekteki PDF'in yolunu döndürür.
/// Önbellek dosya adı içerik özetidir (hash); aynı içerik ikinci kez çevrilmez.
#[tauri::command]
pub async fn convert_with_office(app: tauri::AppHandle, path: String, hash: String) -> Result<String, String> {
    use tauri::Manager;
    if hash.is_empty() || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Geçersiz belge özeti.".into());
    }
    let src = PathBuf::from(&path);
    let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    let script = match ext.as_str() {
        "docx" => WORD_SCRIPT,
        "pptx" => POWERPOINT_SCRIPT,
        _ => return Err("Orijinal görünüm yalnızca DOCX ve PPTX için var.".into()),
    };
    if !src.exists() {
        return Err("NOT_FOUND".into());
    }
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("converted");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let out = dir.join(format!("{hash}.pdf"));
    if out.exists() {
        return Ok(out.to_string_lossy().into_owned());
    }
    let partial = dir.join(format!("{hash}.partial.pdf"));
    let _ = std::fs::remove_file(&partial);

    let partial_clone = partial.clone();
    tauri::async_runtime::spawn_blocking(move || run_script(script, &src, &partial_clone))
        .await
        .map_err(|e| e.to_string())??;
    std::fs::rename(&partial, &out).map_err(|e| format!("Dönüştürülen dosya kaydedilemedi: {e}"))?;
    Ok(out.to_string_lossy().into_owned())
}
