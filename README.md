# Duopdf

PDF okurken İngilizce öğrenmeni sağlayan, AI destekli bir masaüstü PDF okuyucu.

Kendi ders PDF'lerini açarsın, bilmediğin terimleri işaretlersin, cümleleri Türkçeye çevirtirsin ve işaretlediğin kelimelerden üretilen sınavlarla tekrar yaparsın.

> **Durum:** Erken geliştirme aşamasında. Henüz kullanıma hazır değil.

## Özellikler (planlanan)

- PDF okuyucu: seçilebilir metin, yakınlaştırma, kaldığın sayfadan devam
- Kelime işaretleme: cümle içindeki anlam, kök hâli, "bilmiyorum / az biliyorum / biliyorum"
- Cümle çevirisi ve kısa dilbilgisi notu
- Çoktan seçmeli ve açık uçlu çeviri sınavları, aralıklı tekrar
- Şimdilik yalnızca İngilizce → Türkçe

## Gizlilik ve API anahtarı

- Sunucu yok. Tüm veriler (kelimeler, çeviriler, sınav geçmişi) yalnızca senin cihazında durur.
- AI özellikleri için **kendi API anahtarını** uygulamanın ayarlar ekranından girersin (başlangıç sağlayıcısı: [NVIDIA build.nvidia.com](https://build.nvidia.com)). Anahtar cihazında saklanır, başka hiçbir yere gönderilmez; yalnızca seçtiğin sağlayıcıya yapılan isteklerde kullanılır.
- AI isteklerinde gönderilen metin (kelime, cümle, senin cevabın) seçtiğin sağlayıcıya gider. **Sağlayıcının kullanım şartları ve veri politikası senin sorumluluğundadır.**

## Geliştirme ortamında çalıştırma

Gerekenler (Windows):

- [Node.js](https://nodejs.org/) LTS
- [Rust](https://rustup.rs/) (stable, MSVC araç zinciri)
- Visual Studio C++ derleme araçları ("Desktop development with C++")
- WebView2 (Windows 11'de hazır gelir)

```bash
npm install
npm run tauri dev
```

## Teknolojiler

Tauri 2, React, Vite, TypeScript.

## Lisans

[MIT](LICENSE)
