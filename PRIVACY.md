# Duopdf Gizlilik Politikası / Privacy Policy

Yürürlük tarihi / Effective date: 6 Ekim 2026 / October 6, 2026

[Türkçe](#türkçe) · [English](#english)

---

## Türkçe

Duopdf, PDF ve diğer belgeleri okurken İngilizce öğrenmeye yardım eden açık kaynaklı bir uygulamadır. Geliştirici bir sunucu işletmez; uygulama hesap açtırmaz, reklam göstermez, kullanım istatistiği ya da çökme raporu toplamaz. Geliştiricinin senin verilerine erişimi yoktur.

### Cihazında saklanan veriler

- Açtığın belgelerin adı, cihazdaki yolu ve içerik özeti (hash). Belge dosyalarının kendisi kopyalanmaz ve hiçbir yere gönderilmez.
- İşaretlediğin kelimeler, kelimelerin geçtiği cümleler, çeviriler, dilbilgisi notları, çizimlerin, sınav cevapların ve sonuçların, tekrar zamanları.
- Görsellerden okunan metin (OCR önbelleği) ve uygulama tercihlerin.
- Yapay zekâ sağlayıcılarının adresleri ve API anahtarların. Anahtarlar cihazda, işletim sisteminin sağladığı şifrelemeyle saklanır; dışa aktarılan yedeğe ve buluta girmez.

### Yapay zekâ sağlayıcısına gönderilen veriler

Kelime anlamı, cümle çevirisi, sınav sorusu ve çeviri değerlendirmesi için uygulama; seçtiğin kelimeyi, geçtiği cümleyi, senin yazdığın cevabı ve "Yapay zekâ ile oku" seçeneğini kullanırsan görselin kendisini, **senin ayarlarda girdiğin sağlayıcıya** (ör. NVIDIA, OpenRouter ya da kendi bilgisayarındaki Ollama) ve **senin API anahtarınla** gönderir. Bu veriler geliştiriciye uğramaz. Sağlayıcının bu verileri nasıl işlediği onun kullanım şartlarına ve gizlilik politikasına bağlıdır; hangi sağlayıcıyı kullanacağını sen seçersin.

### Google Drive eşitlemesi (isteğe bağlı)

Eşitlemeyi açarsan uygulama Google hesabınla giriş yapar ve yalnızca şu izinleri ister: `openid`, `email` (bağlı hesabı sana göstermek için) ve `drive.appdata` (Drive'ında yalnızca bu uygulamaya ait gizli klasör). Bu klasöre tek bir dosya yazılır: kelimeler, cümleler, çeviriler, çizimler, sınav cevapları ve silme kayıtları. Belge dosyaları, dosya yolları ve API anahtarları gönderilmez. Uygulama Drive'ındaki diğer dosyaları göremez. Veriler doğrudan senin cihazınla Google arasında taşınır; geliştiricinin bir kopyası yoktur.

Duopdf'un Google API'lerinden aldığı bilgileri kullanması ve başka uygulamalara aktarması, Sınırlı Kullanım (Limited Use) şartları dahil olmak üzere [Google API Hizmetleri Kullanıcı Verileri Politikası](https://developers.google.com/terms/api-services-user-data-policy)'na uyar. Bu veriler yalnızca eşitleme için kullanılır; satılmaz, reklam için kullanılmaz, kimseyle paylaşılmaz.

Ayarlar → Eşitleme'den bağlantıyı kesebilir ve buluttaki kopyayı silebilirsin. Erişimi [Google hesabı izinleri](https://myaccount.google.com/permissions) sayfasından da kaldırabilirsin.

### Cihazda yapılan işlemler

- Görsellerdeki yazıyı okuma (OCR) tamamen cihazda yapılır.
- Sesli okuma cihazın ses motorunu kullanır. Çevrim içi çalışan bir ses seçersen okunan metin o ses hizmetine (ör. Microsoft, Google) gidebilir.
- Windows'ta DOCX/PPTX'in "orijinal görünümü" bilgisayarda kurulu Microsoft Office ile oluşturulur.

### Paylaşım

Verilerin satılmaz ve geliştirici tarafından üçüncü kişilerle paylaşılmaz. Yalnızca senin seçtiğin yapay zekâ sağlayıcısına ve (açarsan) kendi Google Drive'ına, yukarıda anlatılan biçimde gider. Ağ bağlantıları HTTPS ile yapılır; yalnızca kendi bilgisayarındaki bir sağlayıcıyı (ör. `http://localhost` adresinde Ollama) seçersen şifresiz yerel bağlantı kullanılır.

### Verilerini silme ve dışa aktarma

- Ayarlar → Yedek: öğrenme verini JSON dosyası olarak dışa aktarabilir, geri yükleyebilir ya da tamamen silebilirsin.
- Uygulamayı kaldırmak cihazdaki verileri de siler (Android'de otomatik; Windows'ta uygulama klasörleri elle silinebilir).
- Buluttaki kopyayı Ayarlar → Eşitleme'den silebilirsin.

### Çocuklar

Uygulama 13 yaşın altındaki çocuklara yönelik değildir ve onlardan bilerek veri toplamaz.

### Değişiklikler ve iletişim

Bu politika değişirse güncel hâli bu sayfada, yeni yürürlük tarihiyle yayımlanır. Sorular için: [GitHub Issues](https://github.com/Egemen-16925/Duopdf/issues).

---

## English

Duopdf is an open-source app that helps you learn English while reading PDFs and other documents. The developer runs no servers; the app requires no account, shows no ads and collects no analytics or crash reports. The developer has no access to your data.

### Data stored on your device

- The name, on-device path and content hash of documents you open. The document files themselves are never copied or uploaded.
- Words you mark, the sentences they appear in, translations, grammar notes, your drawings, your quiz answers and results, and review schedules.
- Text recognized from images (OCR cache) and your app preferences.
- The addresses and API keys of your AI providers. Keys are stored on the device using encryption provided by the operating system; they are never included in exported backups or cloud sync.

### Data sent to your AI provider

To explain a word, translate a sentence, create quiz questions or evaluate your translation, the app sends the selected word, its sentence, your typed answer and, if you use "Read with AI", the image itself to **the provider you configure** (e.g. NVIDIA, OpenRouter, or Ollama on your own computer) **using your own API key**. This data never passes through the developer. How the provider handles it is governed by that provider's terms and privacy policy; you choose which provider to use.

### Google Drive sync (optional)

If you turn on sync, the app signs in with your Google account and requests only these scopes: `openid`, `email` (to show which account is connected) and `drive.appdata` (a hidden folder in your Drive that belongs to this app only). A single file is written there containing your words, sentences, translations, drawings, quiz answers and deletion records. Document files, file paths and API keys are never uploaded. The app cannot see any other files in your Drive. Data moves directly between your device and Google; the developer keeps no copy.

Duopdf's use and transfer to any other app of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements. This data is used only for sync; it is not sold, not used for advertising and not shared with anyone.

You can disconnect and delete the cloud copy in Settings → Sync, or revoke access at [Google Account permissions](https://myaccount.google.com/permissions).

### On-device processing

- Reading text in images (OCR) runs entirely on your device.
- Text-to-speech uses your device's speech engine. If you pick an online voice, the text being read may be sent to that voice service (e.g. Microsoft, Google).
- On Windows, the "original view" of DOCX/PPTX files is produced by Microsoft Office installed on your computer.

### Sharing

Your data is not sold and is not shared with third parties by the developer. It goes only to the AI provider you choose and, if enabled, your own Google Drive, as described above. Network connections use HTTPS; plain local connections are used only if you choose a provider on your own machine (e.g. Ollama at `http://localhost`).

### Deleting and exporting your data

- Settings → Backup lets you export your learning data as a JSON file, restore it, or delete it entirely.
- Uninstalling the app removes its data from the device (automatically on Android; on Windows the app folders can be deleted manually).
- You can delete the cloud copy in Settings → Sync.

### Children

The app is not directed to children under 13 and does not knowingly collect data from them.

### Changes and contact

If this policy changes, the updated version will be published on this page with a new effective date. Questions: [GitHub Issues](https://github.com/Egemen-16925/Duopdf/issues).
