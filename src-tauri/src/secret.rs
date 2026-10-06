//! API anahtarlarını diskte şifreli tutmak için Windows DPAPI.
//! Şifreli veri yalnızca aynı Windows kullanıcısıyla, aynı bilgisayarda çözülebilir;
//! `providers.json` başka bir yere kopyalansa bile anahtar okunamaz.

use base64::{engine::general_purpose::STANDARD, Engine as _};

const PREFIX: &str = "dpapi:";

#[cfg(windows)]
mod imp {
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    /// Uygulamaya özel ek anahtar: başka bir uygulama aynı kullanıcıyla da çözemesin.
    const ENTROPY: &[u8] = b"com.egemen.duopdf/provider-key/v1";

    fn blob(data: &[u8]) -> CRYPT_INTEGER_BLOB {
        CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 }
    }

    fn take(out: CRYPT_INTEGER_BLOB) -> Vec<u8> {
        // SAFETY: DPAPI, LocalAlloc ile ayrılmış `cbData` uzunluğunda bir arabellek döndürür.
        let bytes = unsafe { std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec() };
        unsafe { LocalFree(out.pbData as _) };
        bytes
    }

    pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> {
        let input = blob(data);
        let entropy = blob(ENTROPY);
        let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
        // SAFETY: tüm işaretçiler bu çağrı boyunca geçerli.
        let ok = unsafe {
            CryptProtectData(
                &input,
                std::ptr::null(),
                &entropy,
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out,
            )
        };
        if ok == 0 {
            return Err("Anahtar şifrelenemedi.".into());
        }
        Ok(take(out))
    }

    pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
        let input = blob(data);
        let entropy = blob(ENTROPY);
        let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
        // SAFETY: tüm işaretçiler bu çağrı boyunca geçerli.
        let ok = unsafe {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                &entropy,
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out,
            )
        };
        if ok == 0 {
            return Err("Kayıtlı anahtar bu bilgisayarda/kullanıcıda çözülemedi; anahtarı yeniden gir.".into());
        }
        Ok(take(out))
    }
}

#[cfg(not(windows))]
mod imp {
    // Android/macOS/Linux için platformun anahtar deposu Faz 9'da eklenecek.
    pub fn protect(_: &[u8]) -> Result<Vec<u8>, String> {
        Err("UNSUPPORTED".into())
    }
    pub fn unprotect(_: &[u8]) -> Result<Vec<u8>, String> {
        Err("UNSUPPORTED".into())
    }
}

pub fn encrypt(plain: &str) -> Result<String, String> {
    Ok(format!("{PREFIX}{}", STANDARD.encode(imp::protect(plain.as_bytes())?)))
}

pub fn decrypt(stored: &str) -> Result<String, String> {
    let encoded = stored.strip_prefix(PREFIX).ok_or("Tanınmayan şifreli anahtar biçimi.")?;
    let bytes = STANDARD.decode(encoded).map_err(|_| "Şifreli anahtar bozuk.")?;
    String::from_utf8(imp::unprotect(&bytes)?).map_err(|_| "Şifreli anahtar bozuk.".into())
}

/// API anahtarını şifreler: Windows'ta "dpapi:<base64>", Android'de Keystore ile "aks:<base64>".
#[tauri::command]
pub async fn protect_secret(app: tauri::AppHandle, plain: String) -> Result<String, String> {
    #[cfg(target_os = "android")]
    return mobile_secret(app, "protect", plain).await;
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        encrypt(&plain)
    }
}

/// Şifreli API anahtarını çözer.
#[tauri::command]
pub async fn unprotect_secret(app: tauri::AppHandle, data: String) -> Result<String, String> {
    #[cfg(target_os = "android")]
    return mobile_secret(app, "unprotect", data).await;
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        decrypt(&data)
    }
}

#[cfg(target_os = "android")]
async fn mobile_secret(app: tauri::AppHandle, command: &'static str, data: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::android::run::<crate::android::Data>(&app, command, serde_json::json!({ "data": data })).map(|d| d.data)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn round_trips_and_hides_the_key() {
        let stored = encrypt("nvapi-örnek-anahtar").unwrap();
        assert!(stored.starts_with(PREFIX));
        assert!(!stored.contains("nvapi"));
        assert_eq!(decrypt(&stored).unwrap(), "nvapi-örnek-anahtar");
    }

    #[test]
    fn rejects_tampered_data() {
        let mut stored = encrypt("abc").unwrap();
        stored.truncate(stored.len() - 4);
        stored.push_str("AAAA");
        assert!(decrypt(&stored).is_err());
    }
}
