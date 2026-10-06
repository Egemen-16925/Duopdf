# Duopdf

PDF okurken İngilizce öğrenmeni sağlayan, yapay zekâ destekli bir masaüstü belge okuyucu (Windows).

Kendi ders belgelerini açarsın, bilmediğin kelimelere tıklayıp anlamını görürsün ve işaretlersin, cümleleri Türkçeye çevirtirsin; işaretlediğin kelimeler sana yapay zekânın her seferinde yeni cümlelerle hazırladığı sınavlarla ve aralıklı tekrarla geri gelir.

## Özellikler

- **Belgeler:** PDF (seçilebilir metin, yakınlaştırma, kaldığın sayfadan devam), EPUB, DOCX, PPTX, TXT ve resim dosyaları. Birden çok belge sekmelerde açılır. DOCX/PPTX, bilgisayarda Microsoft Office varsa "orijinal görünümde" de açılabilir.
- **Kelime işaretleme:** Kelimeye tıkla; cümle içindeki anlamını, kök hâlini gör, "bilmiyorum / az biliyorum / biliyorum" diye işaretle. "carry out" gibi öbekleri seçerek işaretleyebilirsin. İşaretli kelimeler bütün belgelerde renkli görünür; "ran" ve "running" aynı kayda ("run") düşer.
- **Cümle çevirisi:** Uzun bir seçim ya da Alt + tıklama cümleyi Türkçeye çevirir ve kısa bir dilbilgisi notu verir. Çeviriler kaydedilir, internetsiz de görünür.
- **Görsellerdeki yazılar (OCR):** Taranmış PDF'ler, şekiller, slayt resimleri ve resim dosyaları yerel olarak (internetsiz) okunur; kelimeleri tıklanabilir. Zor görseller için isteğe bağlı "Yapay zekâ ile oku".
- **Kalem:** Basınca duyarlı kalem, silgi, geri al / yinele; geçici fosforlu kalemle üstünden geçtiğin kelime ya da cümle açılır. Çizimler belgenin bir kopyasına işlenip "Çizimli PDF" olarak kaydedilebilir.
- **Sınavlar:** Çoktan seçmeli ya da çeviriyi kendin yazdığın sorular, İngilizce → Türkçe ve Türkçe → İngilizce, kolay / orta / zor. Yazdığın çeviriyi yapay zekâ anlam üzerinden değerlendirir, hatalarını tek tek gösterir.
- **Aralıklı tekrar:** Doğru bildiğin kelime giderek daha seyrek (1, 3, 7 gün…), yanlış yaptığın hemen yeniden sorulur; üst üste 3 doğru "biliyorum"a yükseltir. Her gün "Bugünkü tekrar".
- **İstatistik:** Öğrenilen kelimeler, günlük seri, son 30 günün başarısı, en çok yanlış yapılan kelimeler.
- **Sesli okuma:** Kelime ve cümleleri Windows'un İngilizce sesleriyle okur (internet ve anahtar gerekmez).
- **Eşitleme ve yedek:** İsteğe bağlı Google Drive eşitlemesi (birden çok bilgisayar); öğrenme verisini JSON dosyasına yedekleme.
- Açık / koyu tema, klavye kısayolları (F1). Şimdilik yalnızca İngilizce → Türkçe.

## Kurulum

1. [Releases](https://github.com/Egemen-16925/Duopdf/releases/latest) sayfasından en son sürümün `Duopdf_…_x64-setup.exe` dosyasını indir ve çalıştır.
2. Uygulama kod imzalı olmadığı için Windows "Windows bilgisayarınızı korudu" diyebilir: **Ek bilgi → Yine de çalıştır**.
3. Windows 10'da WebView2 yoksa kurulum onu kendisi indirir (Windows 11'de hazır gelir).

## İlk ayarlar: yapay zekâ anahtarı

Kelime anlamı, çeviri ve sınavlar için kendi API anahtarın gerekir. Uygulama OpenAI uyumlu her sağlayıcıyla çalışır; başlangıç için [NVIDIA build.nvidia.com](https://build.nvidia.com) ücretsiz modeller sunar.

1. build.nvidia.com'da NVIDIA hesabınla giriş yap ve bir API anahtarı oluştur (`nvapi-` ile başlar). Tek anahtar katalogdaki bütün modellerde çalışır.
2. Duopdf → **Ayarlar → Sağlayıcılar**: NVIDIA sağlayıcısına anahtarı gir, **Kaydet**, **Bağlantıyı test et**.
3. **Ayarlar → Modeller**: hızlı (kelime anlamı, çeviri), güçlü (sınav, değerlendirme) ve isteğe bağlı görsel model seç. **Model testi** sekmesi seçtiğin modelleri aynı görevlerle yan yana dener.
4. Bir model hata verirse (istek sınırı, zaman aşımı) yedek modele kendiliğinden geçilir; yedek seçmezsen hızlı ve güçlü model birbirinin yedeğidir.

OpenRouter (`https://openrouter.ai/api/v1`) ya da kendi bilgisayarında Ollama (`http://localhost:11434/v1`) gibi başka sağlayıcılar da eklenebilir; her rol farklı bir sağlayıcıdan çalışabilir.

## Google Drive eşitlemesi (isteğe bağlı)

Öğrenme verin Google Drive'ındaki gizli uygulama klasörüne eşitlenir; aynı hesapla bağlanan diğer bilgisayarlarda hepsi gelir. Bunun için bir kez kendi Google Cloud istemcini oluşturursun (ücretsiz, ~10 dakika):

1. [Google Cloud Console](https://console.cloud.google.com/)'da yeni bir proje aç.
2. **APIs & Services → Library → Google Drive API → Enable**.
3. **Google Auth Platform**: *Branding* (uygulama adı, e-posta) → *Audience*: External, sonra **Publish app** ("In production"; test modunda giriş 7 günde bir düşer) → *Data Access*: `.../auth/drive.appdata` kapsamını ekle.
4. **Clients → Create client → Desktop app**. Client ID ve Client secret'ı Duopdf → **Ayarlar → Eşitleme**'ye gir.
5. **Google ile bağlan**: tarayıcıda izin verirken Drive kutusunu işaretle. "Doğrulanmamış uygulama" uyarısında *Gelişmiş → Duopdf'e git* ile devam edebilirsin (uygulamayı kendin oluşturdun).

Eşitleme açılışta, açıkken 5 dakikada bir, kapanırken ve "Şimdi eşitle" ile yapılır. Aynı kelime iki bilgisayarda değiştiyse en son değişiklik kazanır; silinen kelime diğer bilgisayardan geri gelmez.

## Gizlilik

- **Sunucu yok.** Kelimeler, çeviriler, çizimler ve sınav geçmişi bilgisayarında durur.
- **API anahtarları** yalnızca bu bilgisayarda, Windows'un kullanıcıya özel şifrelemesiyle (DPAPI) saklanır; yedeğe, eşitlemeye ve depoya girmez. Google istemci gizli anahtarı ve oturum anahtarı da aynı şekilde saklanır.
- **Yapay zekâ isteklerinde** gönderilen metin (kelime, cümle, senin cevabın; "Yapay zekâ ile oku"da resim) yalnızca seçtiğin sağlayıcıya gider. **Sağlayıcının kullanım şartları ve veri politikası senin sorumluluğundadır.**
- **Google Drive'a** yalnızca öğrenme verisi gider; belge dosyaları, dosya yolları ve API anahtarları gitmez. Uygulama yalnızca kendi gizli klasörüne erişir, Drive'daki diğer dosyalarını göremez.
- OCR tamamen yereldir. Sesli okuma cihazın ses motorunu kullanır; çevrim içi bir ses seçersen okunan metin o ses hizmetine gider.

Ayrıntılar: [Gizlilik politikası](PRIVACY.md).

## Verilerin

- **Ayarlar → Yedek**: öğrenme verisini JSON olarak dışa / içe aktar.
- Geliştirme sürümü (`npm run tauri dev`, uygulama kimliği `com.egemen.duopdf.dev`) ile kurulu uygulama (`com.egemen.duopdf`) ayarlarını ve verilerini ayrı tutar; aralarında taşımak için yedeği ya da Google Drive eşitlemesini kullan.

## Kısa kullanım

| Ne | Nasıl |
|---|---|
| Kelime anlamı | Kelimeye tıkla |
| Öbek işaretleme | 2-6 kelimeyi seç |
| Cümle çevirisi | Uzun seçim ya da Alt + tıklama |
| Fosforlu kalem | Araç çubuğunda "Fosforlu", metnin üstünden geç |
| Yakınlaştırma | Ctrl + tekerlek ya da touchpad'de iki parmak |
| Bütün kısayollar | F1 |

## Geliştirme

Gerekenler (Windows): [Node.js](https://nodejs.org/) LTS, [Rust](https://rustup.rs/) (stable, MSVC), Visual Studio C++ derleme araçları ("Desktop development with C++"), WebView2.

```bash
npm install
npm run tauri dev     # geliştirme sürümü
npm test              # birim testleri (Vitest)
npm run tauri build   # Windows kurulum dosyaları: src-tauri/target/release/bundle/
```

### Android

Gerekenler: Android Studio (SDK ve NDK), Rust'ın Android hedefleri (`rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android`) ve Windows'ta **Geliştirici modu** (Ayarlar → Sistem → Geliştiriciler için; Tauri derlenen kütüphaneyi sembolik bağlantıyla yerleştirir). Ortam değişkenleri: `JAVA_HOME` (Android Studio'nun `jbr` klasörü), `ANDROID_HOME` (SDK), `NDK_HOME` (SDK içindeki `ndk/<sürüm>`).

```bash
npm run tauri android dev                 # bağlı cihazda / emülatörde geliştirme
npm run tauri android build -- --aab      # Play için AAB: src-tauri/gen/android/app/build/outputs/bundle/universalRelease/
```

AAB, `src-tauri/gen/android/keystore.properties` varsa onunla imzalanır (git'e girmez):

```properties
storeFile=C:/Users/<kullanıcı>/duopdf-upload.jks
keyAlias=upload
password=<anahtar deposunun şifresi>
```

Android'de belgeler sistem seçicisiyle açılır ve kalıcı okuma izniyle `content://` adresi olarak tutulur; API anahtarları Android Keystore ile şifrelenir; sesli okuma Android'in metin okuma motorunu kullanır. Google Drive eşitlemesi Android'de henüz yok; veriler yedek dosyasıyla taşınır.

Yapı: `src/ai` (sağlayıcıdan bağımsız yapay zekâ istemcisi ve sürümlü istemler), `src/reader` ve `src/formats` (belge görüntüleyiciler), `src/learning` (kelime eşleştirme, vurgu, çeviri), `src/quiz` (sınav ve aralıklı tekrar), `src/ocr`, `src/ink`, `src/sync` (Google Drive), `src-tauri` (Rust: dosya okuma, Office dönüştürme, DPAPI, OAuth), `src-tauri/gen/android` (Android projesi; `NativePlugin.kt`: dosya seçici, Keystore, metin okuma).

Teknolojiler: Tauri 2, React, TypeScript, Vite, Dexie (IndexedDB), pdf.js, Tesseract.js, pdf-lib, mammoth, DOMPurify, zod.

## Lisans

[MIT](LICENSE). Kullanılan açık kaynak kütüphaneler kendi lisanslarıyla dağıtılır (ör. pdf.js ve Tesseract.js: Apache-2.0).
