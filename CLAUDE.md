# Duopdf — Claude Code çalışma talimatı

Bu dosya, bu klasörde açılan her Claude Code oturumunda otomatik okunur. Projenin ne olduğunu, nasıl çalışılacağını ve hangi aşamada olduğumuzu anlatır. Her oturumun başında "İlerleme durumu" bölümüne bak ve kaldığın yerden devam et.

## Proje özeti

Duopdf, PDF okurken İngilizce öğrenmeyi sağlayan, AI destekli bir masaüstü PDF okuyucudur. Kullanıcı kendi ders PDF'lerini açar, bilmediği terimleri işaretler, cümleleri çevirtir ve işaretlediği kelimelerden üretilen sınavlarla tekrar yapar.

- **Kullanıcı:** Egemen (yazılım mühendisliği öğrencisi). Kod okuyabilir; açıklamaları Türkçe yap.
- **Hedef platform:** Önce Windows. Android en sona bırakılan isteğe bağlı bir aşamadır.
- **Dağıtım:** GitHub'da açık kaynak (MIT). Sunucu yok; her şey kullanıcının cihazında çalışır.
- **AI:** Kullanıcı kendi API anahtarını girer. Başlangıç sağlayıcısı NVIDIA (build.nvidia.com).
- **Dil:** Şimdilik yalnızca İngilizce → Türkçe. Arayüz Türkçe.

## Çalışma kuralları

Bu kurallar her aşamada geçerlidir.

1. **Aşama aşama ilerle.** Aynı anda tek bir faz üzerinde çalış. Sonraki fazın işine erken başlama.
2. **Faz bitince dur.** Fazı bitirdiğinde aşağıdaki "Faz kapanışı" adımlarını uygula ve Egemen'in testini bekle. Egemen "devam" demeden sonraki faza geçme.
3. **Her çalışan adımda commit at ve push'la.** Küçük ve tek amaçlı commit'ler at; uygulama derlenmiyorsa commit atma. Mesajlar İngilizce ve Conventional Commits biçiminde olsun (`feat: add word popup`, `fix: ...`, `chore: ...`). Her commit'ten sonra `git push` yap.
4. **API anahtarı asla repoya girmesin.** Anahtar yalnızca uygulamanın ayarlar ekranından girilir. Koda, test dosyasına, `.env` dosyasına veya commit mesajına anahtar yazma. Egemen sohbete anahtar yapıştırırsa kullanma, ayarlar ekranından girmesini söyle.
5. **Test edemediğin şeyi "çalışıyor" diye bildirme.** Gerçek API çağrısını ve gerçek PDF'i yalnızca Egemen deneyebilir. Neyi kendin doğruladığını, neyi onun denemesi gerektiğini ayrı ayrı yaz.
6. **Kapsamı büyütme.** "Sonraki fikirler" bölümündeki özellikleri Egemen istemeden yapma. Aklına iyi bir ek gelirse öner, onay bekle.
7. **Bu dosyayı güncel tut.** Faz bitince "İlerleme durumu"ndaki kutuyu işaretle; alınan önemli kararları "Karar günlüğü"ne tek satırla ekle.

### Faz kapanışı

Her fazın sonunda sırayla:

1. `npm run build` ve tip kontrolü hatasız geçsin; varsa testleri çalıştır.
2. Son değişiklikleri commit'le ve push'la.
3. Fazı etiketle ve etiketi gönder: `git tag faz-N` ve `git push --tags`. Bir şey bozulursa bu etikete dönülür.
4. Bu dosyada ilgili kutuyu işaretle, commit'le, push'la.
5. Egemen'e şunları yaz: bu fazda ne eklendi (3-5 madde), uygulamayı nasıl çalıştıracağı, o fazın "Egemen'in testi" listesi ve senin doğrulayamadığın noktalar.
6. Dur ve yanıtını bekle. Hata bildirirse aynı faz içinde düzelt, yeniden test iste.

## İlerleme durumu

- [x] Faz 0 — Kurulum, iskelet, GitHub
- [x] Faz 1 — Ayarlar, API bağlantısı, model testi
- [x] Faz 2 — PDF okuyucu
- [x] Faz 2b — Diğer formatlar, sekmeler, geçmişi temizleme
- [x] Faz 3 — Kelime işaretleme
- [x] Faz 4 — Cümle çevirisi
- [x] Faz 4c — Görsellerden metin (OCR)
- [x] Faz 4b — Kalemle not alma (kalem/tablet testleri Egemen'in isteğiyle proje sonuna bırakıldı)
- [x] Faz 5 — Çoktan seçmeli sınav
- [x] Faz 6 — Açık uçlu çeviri sınavı ve aralıklı tekrar
- [x] Faz 7 — İstatistik, sesli okuma, son rötuşlar
- [x] Faz 7b — Bulut eşitleme (Google Drive)
- [x] Faz 8 — Paketleme ve GitHub Release
- [ ] Faz 9 — Android (isteğe bağlı)

## Teknik kararlar

| Konu | Karar | Neden |
|---|---|---|
| Kabuk | Tauri 2 | Küçük exe, sunucu gerekmez, aynı projeden Android çıkar |
| Arayüz | React + Vite + TypeScript | Yaygın, hızlı geliştirme |
| PDF | `pdfjs-dist` | Metin katmanı sayesinde kelimeye tıklanabilir |
| Öğrenme verisi | IndexedDB (Dexie) | Kurulum gerektirmez, cihazda kalır |
| Sağlayıcı ayarları | `tauri-plugin-store`, ayrı dosya | Öğrenme verisinden bağımsız olmalı |
| AI çağrıları | `@tauri-apps/plugin-http` (istek Rust tarafından çıkar) | Tarayıcı `fetch`'i NVIDIA'da CORS'a takılıyor |
| API biçimi | OpenAI uyumlu `/v1/chat/completions` | NVIDIA, OpenRouter, Ollama aynı kodla çalışır |

### Vazgeçilmez mimari kuralı: hafıza ile sağlayıcı ayrı

Kullanıcı API anahtarını, sağlayıcıyı veya modeli değiştirdiğinde hiçbir öğrenme verisi kaybolmamalı. Bunu sağlamak için:

- AI durumsuzdur. Model hiçbir şey hatırlamaz; her istekte gereken bağlamı (cümle, kelime, kullanıcının cevabı) uygulama gönderir.
- Öğrenme verisi (kelimeler, cümleler, çeviri önbelleği, sınav geçmişi) Dexie'de durur ve sağlayıcıya dair hiçbir alana bağlı değildir.
- Sağlayıcılar (`ad`, `baseUrl`, `apiKey`) ayrı bir depoda durur. Her model rolü (hızlı, güçlü, görsel) kendi sağlayıcısını ve modelini ayrı seçer; roller farklı API'lerden çalışabilir.
- Önbellek anahtarında sağlayıcı veya model adı bulunmaz. Kötü bir çeviri için "yeniden çevir" düğmesi vardır.
- Dışa aktarılan yedek dosyasına API anahtarı yazılmaz.

### Eşitlemeye hazır veri (Faz 7b için baştan uyulacak kural)

- Her öğrenme kaydı cihazlar arasında taşınabilir, kararlı bir anahtarla tanınır (belge: hash, terim: key, geçiş: terim + belge + cümle). Sayısal `id`'ler cihaza özeldir, eşitlemede kullanılmaz.
- Her tabloda `updatedAt` olur; aynı kayıt iki cihazda değiştiyse yenisi kazanır.
- Silme, `tombstones` tablosuna iz bırakır; böylece bir cihazda silinen kayıt diğerinden geri gelmez.
- Cihaza özel alanlar (dosya yolu, son açılma, son sayfa) eşitlenmez ya da ayrı tutulur. API anahtarı ve belge dosyalarının kendisi asla eşitlenmez.

### Bilinen tuzaklar

- **CORS:** `integrate.api.nvidia.com` tarayıcıdan doğrudan çağrıya izin vermiyor. AI çağrıları için tarayıcının `fetch`'ini kullanma, hep HTTP eklentisinden geç. Kullanıcı kendi `baseUrl`'ini girebildiği için eklentinin izin kapsamı `https://**` ve `http://localhost:*` (Ollama) olmalı.
- **Geliştirme ve kurulu sürüm ayrı veri tutar:** `tauri dev` ile kurulu exe farklı origin kullandığından IndexedDB'leri ayrıdır. Egemen'e bunu Faz 3'te söyle; dışa/içe aktarma bu yüzden erken geliyor.
- **PDF metni dağınık gelir:** Satır sonu tirelemeleri, çift sütun, üstbilgi ve altbilgi cümle bölmeyi bozar. Cümleye bölmeden önce temizle; bölme için `Intl.Segmenter` kullan.
- **Taranmış PDF'lerde metin yoktur:** Metin katmanı boşsa kullanıcıya açıkça söyle. OCR Faz 4c'de gelecek.
- **Modeller bozuk JSON dönebilir:** Yanıtı şemayla (zod) doğrula, geçmezse hatayı modele gösterip bir kez yeniden dene, yine olmazsa kullanıcıya anlaşılır hata göster.
- **Hız sınırı:** NVIDIA'nın ücretsiz uçları model başına sınırlıdır ve sınırlar yayımlanmıyor (topluluk yaklaşık dakikada 40 istek bildiriyor). 429 gelirse bekleyip yeniden dene; aynı girdiyi iki kez sorma (önbellek).
- **PDF dosyasını kopyalama:** Dosyanın yolunu ve içerik özetini (hash) sakla. Dosya taşınmışsa yeniden seçtir; kelime kayıtları hash üzerinden eşleşir.

## Veri modeli (taslak)

Uygularken iyileştirebilirsin; değişiklikleri "Karar günlüğü"ne yaz.

- `documents`: id, ad, dosyaYolu, hash, sayfaSayısı, sonSayfa, eklenmeTarihi
- `terms`: id, lemma (kök hâli), görünenHâl, durum (`bilmiyorum` | `az-biliyorum` | `biliyorum`), türkçeAnlam, not, oluşturulma, tekrar alanları (aralık, sonrakiTekrar, doğruSerisi)
- `occurrences`: termId, documentId, sayfa, sentenceId — kelimenin geçtiği yerler
- `sentences`: id, documentId, sayfa, metin, türkçeÇeviri, dilbilgisiNotu
- `quizAttempts`: id, tür, sentenceId, termId'ler, kullanıcıCevabı, sonuç, geriBildirim, tarih
- `cache`: anahtar (işlem türü + girdi + istem sürümü özeti), değer

Kaynak dil ve ana dil alanlarını (`en`, `tr`) baştan ayar olarak tut; şimdilik başka dil ekleme.

## AI katmanı

- Tek bir `aiClient` modülü olsun; uygulamanın geri kalanı sağlayıcıyı bilmesin.
- İstem (prompt) şablonları tek klasörde ve sürüm numarasıyla dursun (`src/ai/prompts/`).
- İki model rolü var:
  - **Hızlı model:** kelime anlamı ve cümle çevirisi. Sık ve kısa çağrılar; düşük gecikme önemli. Uzun "düşünme" çıktısı veren modeller bu rol için uygun değil.
  - **Güçlü model:** açık uçlu çeviri değerlendirmesi ve çeldirici üretimi. Daha yavaş olabilir, doğruluk önemli.
- Yapılandırılmış çıktı desteği modele göre değişir. Önce `response_format` ile dene, desteklenmiyorsa istemde şemayı ver ve yanıtı ayrıştır. Her durumda zod ile doğrula.

### Açık uçlu değerlendirme çıktısı

```json
{
  "sonuc": "dogru | kismen | yanlis",
  "puan": 0,
  "hatalar": [
    { "tur": "anlam | dilbilgisi | kelime | eksik | fazla", "kullaniciIfadesi": "", "aciklama": "" }
  ],
  "duzeltilmisCeviri": "",
  "hedefKelimeler": [{ "lemma": "", "dogruAnlasildi": true }]
}
```

Değerlendirme anlam üzerinden yapılır: farklı ama doğru bir ifade cezalandırılmaz. Açıklamalar Türkçe ve kısa olur.

## Model seçimi: Egemen'e nasıl yardım edeceksin

Egemen NVIDIA'dan API alacak ve hangi modelleri kullanacağını bilmiyor. Faz 1'de ona şu sırayla yardım et:

1. **Anahtar almayı anlat.** build.nvidia.com'da NVIDIA geliştirici hesabıyla giriş yapılır ve bir API anahtarı (`nvapi-...`) üretilir. Tek anahtar katalogdaki tüm modellerde çalışır; model başına ayrı anahtar gerekmez. Adımları yazmadan önce güncel sayfayı kontrol et, arayüz değişmiş olabilir.
2. **Güncel kataloğa bak.** Katalog sık değişir. Web'den güncel listeyi kontrol edip her rol için 2-3 aday öner. `/v1/models` tüm modelleri döndürür ama hangisinin ücretsiz ve çağrılabilir olduğunu söylemez; bu ancak modele deneme isteği atarak anlaşılır.
3. **Uygulama içi "Model testi" ekranını yap** (Faz 1'in parçası). Egemen seçtiği modelleri aynı üç görevle dener:
   - bir kelimenin cümle içindeki anlamını Türkçe açıklama,
   - bir İngilizce teknik cümleyi Türkçeye çevirme,
   - bilerek hatalı yazılmış bir Türkçe çeviriyi yukarıdaki JSON şemasıyla değerlendirme.

   Ekran her model için HTTP durumunu, süreyi, JSON'un geçerli olup olmadığını ve çıktıyı yan yana gösterir. "Sonuçları kopyala" düğmesi olsun.
4. **Sonuçları birlikte yorumla.** Egemen sonuçları yapıştırınca ölçütlere göre öneri yap: Türkçe doğal mı, JSON geçerli mi, süre kabul edilebilir mi, 429 dönüyor mu. Hızlı ve güçlü rol için birer model öner, kararı ona bırak.

Başlangıç adayları (2 Ekim 2026'da NVIDIA belgelerinde görülen kimlikler; kullanmadan önce `/v1/models` ile doğrula):

- `meta/llama-3.3-70b-instruct`
- `deepseek-ai/deepseek-v4-flash`
- `moonshotai/kimi-k3`
- Qwen, Gemma ve GLM ailelerinin güncel sürümleri (kimliklerini listeden al)

Hiçbir modelin Türkçe kalitesi bu dosya yazılırken ölçülmedi; karar test ekranının sonuçlarına göre verilecek.

## Fazlar

Her fazın sonunda "Faz kapanışı" adımlarını uygula.

### Faz 0 — Kurulum, iskelet, GitHub

- Gerekenleri kontrol et: Node.js LTS, Rust (rustup) ve MSVC C++ derleme araçları, Git, WebView2, isteğe bağlı GitHub CLI (`gh`). Eksik olanı Egemen'e kurulum adımıyla bildir; onun yerine sistem geneli kurulum yapmadan önce sor.
- Tauri 2 + React + Vite + TypeScript iskeletini kur.
- `git init`, `.gitignore`, MIT `LICENSE`, kısa bir `README.md` (Türkçe; ne olduğu, nasıl çalıştırılacağı, anahtarın cihazda kaldığı ve sağlayıcının kullanım şartlarının kullanıcıya ait olduğu).
- GitHub deposu: adını Egemen'e sor (öneri: `duopdf`), herkese açık oluştur. `gh` varsa onunla, yoksa Egemen'e depoyu elle açtırıp adresini iste.

**Egemen'in testi:** `npm run tauri dev` boş pencereyi açıyor mu? Depo GitHub'da görünüyor mu?

### Faz 1 — Ayarlar, API bağlantısı, model testi

- Ayarlar ekranı: sağlayıcı profili ekleme, düzenleme, silme, etkin profili seçme. Varsayılan profil NVIDIA (`https://integrate.api.nvidia.com/v1`).
- "Bağlantıyı test et" düğmesi; hata mesajları anlaşılır olsun (401 anahtar hatalı, 404 model yok, 429 sınır aşıldı).
- Model listesini çekme ve yukarıda anlatılan "Model testi" ekranı.
- Hızlı ve güçlü model seçimi profile kaydedilir.

**Egemen'in testi:** Anahtarı gir, bağlantı testi geçiyor mu? Model testinde en az üç model dene, sonuçları Claude Code'a yapıştır, iki modeli seç. Uygulamayı kapatıp aç: ayarlar duruyor mu?

### Faz 2 — PDF okuyucu

- PDF açma (dosya seçici ve sürükle-bırak), sayfa görüntüleme, kaydırma, yakınlaştırma, sayfaya gitme.
- Seçilebilir metin katmanı.
- Son açılanlar listesi; belge kaldığı sayfadan açılır.
- Metin katmanı boşsa "bu PDF taranmış, metin içermiyor" uyarısı.

**Egemen'in testi:** Gerçek bir ders PDF'i aç. Metin seçilebiliyor mu, seçim doğru yere mi denk geliyor? Uzun PDF'te kaydırma akıcı mı? Kapatıp açınca aynı sayfadan devam ediyor mu? Çift sütunlu bir PDF de dene.

### Faz 2b — Diğer formatlar, sekmeler, geçmişi temizleme

- TXT, EPUB, DOCX ve PPTX açma. PDF dışındaki formatlar akan metin görünümünde gösterilir (sayfa düzeni korunmaz); PPTX slayt slayt metin olarak. Kelime işaretleme ve çeviri (Faz 3-4) her iki görünümde de çalışacak şekilde yazılır.
- Belge içeriği güvenli hâle getirilir (script vb. temizlenir); bağlantılar uygulamanın içinde gezinmez.
- Birden çok belge uygulama içinde sekmelerde açılır; her sekme kendi konumunu hatırlar.
- Son açılanlardan tek belge kaldırma ve "geçmişi temizle". Yalnızca liste temizlenir; öğrenme verisi silinmez.

**Egemen'in testi:** Her formattan gerçek bir dosya aç; metin düzgün görünüyor mu? Kapatıp açınca aynı yerden devam ediyor mu? Üç belgeyi sekmelerde aç, aralarında geç: konumlar korunuyor mu? Geçmişi temizle: liste boşalıyor mu?

### Faz 3 — Kelime işaretleme

- Kelimeye tıklayınca küçük bir pencere: cümle içindeki anlamı (hızlı model), kök hâli, "bilmiyorum / az biliyorum / biliyorum" düğmeleri.
- Birden çok kelimeyi seçip tek terim olarak işaretleme ("version control", "carry out").
- İşaretli kelimeler tüm PDF'lerde renkli vurgulanır (bilmiyorum kırmızı, az biliyorum sarı). Metin katmanını bozmamak için CSS Custom Highlight API'yi tercih et.
- Kelime listesi sayfası: arama, duruma göre süzme, geçtiği cümleye gitme, durumu değiştirme, silme.
- Kelimenin geçtiği cümle ve sayfa kaydedilir.
- Yedek: öğrenme verisini JSON olarak dışa ve içe aktarma.

**Egemen'in testi:** Bir sayfada 10 kelime işaretle; doğru kelime mi yakalanıyor? Aynı kelimenin farklı çekimi ("running", "ran") aynı kayda mı düşüyor? Başka PDF'te de vurgulanıyor mu? **API anahtarını ve modeli değiştir: işaretli kelimeler yerinde mi?** Dışa aktar, veriyi sil, içe aktar: her şey geri geldi mi?

### Faz 4 — Cümle çevirisi

- Metin temizleme ve cümlelere bölme.
- Cümleye tıklayınca veya seçince Türkçe çeviri ve kısa bir dilbilgisi notu.
- Çeviri önbelleği ve "yeniden çevir" düğmesi.

**Egemen'in testi:** Farklı sayfalardan 10 cümle çevir; cümle sınırları doğru mu (yarım cümle, iki cümle birleşmesi var mı)? Aynı cümleyi ikinci kez istediğinde anında geliyor mu? İnterneti kapat: önbellekteki çeviri hâlâ görünüyor mu?

### Faz 4b — Kalemle not alma

- Belge üzerine serbest çizim: kaleme basınç duyarlı (Pointer Events `pressure`), renk ve kalınlık, silgi.
- Geri al / yinele (Ctrl+Z / Ctrl+Y ve düğmeler).
- Geçici parlak kalem: metnin üzerinden geçince altındaki kelimelere yapışan, birkaç saniyede solan iz; bırakınca kısa parça için kelime penceresi, uzun parça için cümle çevirisi açılır. Kalıcı değildir, kaydedilmez. Fare, kalem ve parmakla (tablet) çalışır.
- Çizimler belge dosyasına yazılmaz; öğrenme verisinin yanında (Dexie) belge hash'ine bağlı saklanır ve yedeğe girer.
- Notları dışa aktarma (biçim fazın başında Egemen'le netleştirilecek).
- Aynı kod Android'de (Faz 9) dokunmatik kalemle çalışacak şekilde yazılır.

**Egemen'in testi:** Kalemle veya fareyle birkaç sayfaya çiz, sil, geri al; uygulamayı kapatıp aç: çizimler yerinde mi? Yakınlaştırınca çizim sayfayla birlikte ölçekleniyor mu? Dışa aktarılan dosya işe yarıyor mu?

### Faz 4c — Görsellerden metin (OCR)

- Yerel OCR: Tesseract.js (WASM), İngilizce dil verisi uygulamaya gömülü; internetsiz çalışır, aynı kod tablette de çalışır. Python veya sistem OCR'ı kullanılmaz.
- Metin görünümü (EPUB, DOCX, PPTX metni): resimler gösterilmez; resmin yerine içindeki yazı düz metin olarak yazılır.
- Orijinal görünüm ve PDF (taranmış sayfalar dahil): resim yerinde kalır, üstüne kelime kutularından görünmez bir metin katmanı konur; kelime işaretleme, vurgulama ve çeviri buralarda da çalışır.
- Resim dosyalarını (PNG, JPG) belge gibi açma.
- OCR sonuçları görsel/sayfa özetiyle önbelleğe alınır; aynı görsel iki kez taranmaz.
- Yedek: zor görseller için isteğe bağlı "Yapay zekâ ile oku" (görsel destekli model); sonuç ayrı pencerede düz metin olarak gösterilir.

**Egemen'in testi:** Resimli bir DOCX/PPTX'i metin görünümünde aç: resimlerin yazısı yerinde mi? Orijinal görünümde resimdeki bir kelimeye tıkla: doğru kelime mi seçiliyor, vurgulanıyor mu? Taranmış bir PDF ve bir telefon fotoğrafı (PNG/JPG) aç: okunuyor mu, ne kadar sürüyor? Okunamayan bir görselde "Yapay zekâ ile oku" işe yarıyor mu?

### Faz 5 — Çoktan seçmeli sınav

- Soru: İngilizce cümle gösterilir, "Bu cümlenin Türkçesi hangisidir?" diye sorulur, dört şık vardır.
- Sorular işaretli kelimeleri içeren cümlelerden seçilir. Çeldiricileri güçlü model üretir; hedef kelimenin yanlış anlamını kullanan, birbirine yakın şıklar olsun.
- Doğru şıkkın yeri rastgele; sonuçlar `quizAttempts`'e kaydedilir.
- Sınav sonunda özet: doğru sayısı, yanlış yapılan kelimeler.

**Egemen'in testi:** 10 soruluk bir sınav çöz. Şıklar ayırt edici mi, yoksa doğru cevap hemen belli mi oluyor? Aynı anda iki doğru şık çıkıyor mu?

### Faz 6 — Açık uçlu çeviri sınavı ve aralıklı tekrar

- Soru: bilinmeyen veya az bilinen kelimeleri içeren bir İngilizce cümle gösterilir; kullanıcı Türkçesini kendi yazar. Şık yoktur.
- Güçlü model cevabı yukarıdaki şemayla değerlendirir: doğru, kısmen doğru veya yanlış; hataları tek tek gösterir; düzeltilmiş çeviriyi verir.
- Sonuç kelimenin tekrar zamanını günceller: yanlış yapılan kelime yakında yeniden sorulur, üst üste doğru bilinen kelime "biliyorum"a yükselir.
- "Bugünkü tekrar" kuyruğu: zamanı gelen kelimelerden sınav oluşturur.

**Egemen'in testi:** Bilerek bir doğru, bir yarı doğru, bir yanlış ve bir "farklı ifadeyle doğru" çeviri yaz; değerlendirme adil mi? Gösterilen hatalar gerçekten hata mı? Yanlış yaptığın kelime tekrar kuyruğuna girdi mi?

### Faz 7 — İstatistik, sesli okuma, son rötuşlar

- İstatistik sayfası: öğrenilen kelime sayısı, günlük seri, en çok hata yapılan kelimeler.
- Sesli okuma: kelime ve cümle için tarayıcının Web Speech API'si (anahtar harcamaz).
- Açık ve koyu tema, klavye kısayolları, boş durum ekranları.

**Egemen'in testi:** Uygulamayı bir ders çalışma oturumu boyunca gerçekten kullan; takıldığın her şeyi listele.

### Faz 7b — Bulut eşitleme (Google Drive)

- Google Drive'ın gizli uygulama klasörü (`appDataFolder`, `drive.appdata` kapsamı); OAuth 2 + PKCE. Sunucu yok; her kullanıcı kendi Drive'ını kullanır.
- Egemen bir kez Google Cloud'da ücretsiz proje açıp OAuth istemci kimliği alır (Windows ve Android için); adımları fazın başında birlikte yapılır. İstemci gizli anahtarı repoya girmez.
- Kayıt kayıt birleştirme (yukarıdaki "Eşitlemeye hazır veri" kuralı); yalnızca öğrenme verisi gider, belge dosyaları ve API anahtarı gitmez.
- Otomatik: açılışta, kapanırken ve çalışırken birkaç dakikada bir; ayrıca "Şimdi eşitle" düğmesi ve son eşitleme zamanı/hata durumu.
- Drive bağlantısını kesme ve buluttaki veriyi silme seçeneği.

**Egemen'in testi:** İki cihazda (ya da geliştirme sürümü + kurulu sürüm) farklı kelimeler işaretle, eşitle: ikisinde de hepsi var mı? Birinde sil, eşitle: diğerinden de silindi mi? İnternet yokken çalış, sonra bağlan: kayıp var mı?

### Faz 8 — Paketleme ve GitHub Release

- Windows kurulum dosyasını üret (`npm run tauri build`).
- README'yi tamamla: ekran görüntüleri, kurulum, anahtar alma, gizlilik notu.
- GitHub Release oluştur ve kurulum dosyasını ekle. Yayınlamadan önce Egemen'in onayını al.

**Egemen'in testi:** Kurulum dosyasını temiz kur, yedeğini içe aktar, bir PDF aç.

### Faz 9 — Android (isteğe bağlı)

Egemen isterse: Tauri 2 mobil hedefi, dokunmatik için kelime seçimi, tablet düzeni. Android Studio ve SDK kurulumu gerekir; başlamadan önce Egemen'le konuş.

## Sonraki fikirler (istenmeden yapma)

- Sayfayı önceden tarayıp muhtemel terimleri listeleme
- Paragrafı daha basit İngilizceyle anlatma
- Boşluk doldurma ve Türkçeden İngilizceye ters çeviri soruları
- Anki'ye dışa aktarma
- İngilizce dışındaki diller

## Karar günlüğü

Önemli kararları tarihle ve tek satırla buraya ekle.

- 2026-10-02: Tauri 2 + React + Dexie seçildi; sunucu yok, veriler cihazda.
- 2026-10-02: Depo herkese açık `Egemen-16925/Duopdf` olarak açıldı; uygulama kimliği `com.egemen.duopdf`, Rust stable-msvc winget ile kuruldu.
- 2026-10-02: Yapılandırılmış çıktı: önce `response_format: json_object`, 400/422 gelirse onsuz; şema her zaman istemde, yanıt zod ile doğrulanır, `generate` bir kez onarım dener.
- 2026-10-02: NVIDIA `/v1/models` anahtarsız da döner; bağlantı testi anahtarı hızlı modele küçük bir istek atarak doğrular.
- 2026-10-02: Katalogda `meta/llama-3.3-70b-instruct` yok; `deepseek-v4-flash` yerine `deepseek-v4.1-flash` var. Model seçimi test ekranıyla yapılacak.
- 2026-10-02: Birim testleri için vitest eklendi; `aiClient` sahte HTTP yanıtlarıyla test ediliyor (`npm test`).
- 2026-10-02: Faz 1 testinde NVIDIA ücretsiz uçlarında yalnızca Nemotron ailesi ve `openai/gpt-oss-20b` makul sürede yanıt verdi; deepseek, gemma, kimi, glm zaman aşımına düştü, iki mistral modeli 404 döndü.
- 2026-10-02: Veri modelinde alan adları İngilizce (`documents`: name, filePath, hash, pageCount, lastPage, addedAt, lastOpenedAt).
- 2026-10-02: PDF, Rust `read_pdf` komutuyla ham bayt olarak okunur (fs eklentisi ve geniş dosya izni yok); görüntüleme pdf.js `PDFViewer` bileşeniyle.
- 2026-10-02: pdfjs-dist 6 kullanılıyor: belge `loadingTask.destroy()` ile kapanır, yazı tipi/CMap/wasm dosyaları derlemede `public/pdfjs/`'e kopyalanır.
- 2026-10-02: Taranmış PDF tespiti: ilk 5 sayfada toplam 20'den az metin karakteri.
- 2026-10-02: Seçilen modeller: hızlı `openai/gpt-oss-20b`, güçlü `nvidia/nemotron-3-super-120b-a12b` (Egemen'in testleri).
- 2026-10-02: Egemen'in isteğiyle Faz 2b (diğer formatlar, sekmeler, geçmiş temizleme) ve Faz 4b (kalemle not alma) eklendi. Formatlar Faz 3'ten önce, çünkü işaretleme ve çeviri baştan tüm formatlarda çalışmalı.
- 2026-10-02: PDF dışı biçimler tek bir "akan metin" modeline (bölümler + temizlenmiş HTML) çevrilir: EPUB kendi ayrıştırıcımızla (jszip), DOCX mammoth ile, PPTX slayt metni olarak, TXT UTF-8/Windows-1254. HTML DOMPurify ile temizlenir; DOMPurify desteklenmezse içerik gösterilmez.
- 2026-10-02: Akan metinde konum = bölüm (lastPage) + bölüm içi oran (lastOffset). `documents` tablosu sürüm 2: format, lastOffset, hiddenFromRecent.
- 2026-10-02: Sekmeler ve okuyucu sayfası gizlenince `display:none` değil `visibility:hidden` kullanılır; kaydırma konumu korunur.
- 2026-10-02: DOM gerektiren testler jsdom ile çalışır (happy-dom'da DOMPurify düzgün çalışmıyor).
- 2026-10-02: DOCX/PPTX için "orijinal görünüm": kurulu Microsoft Office (PowerShell + COM) belgeyi PDF'e çevirir, PDF uygulamanın önbelleğinde (`<app cache>/converted/<hash>.pdf`) tutulur. Bu, "dosyayı kopyalama" kuralının bilinçli istisnasıdır (silinebilir önbellek). Office yoksa yalnızca metin görünümü; LibreOffice desteği yok (Egemen'in kararı). Belgeler metin görünümüyle açılır.
- 2026-10-02: Kelime eşleştirme: yerel kök bulucu (wink-lemmatizer) + modelin verdiği kök. Terim, her kelime konumu için kabul edilen kökleri tutar (`pattern`); "ran/running → run", "carried out → carry out" aynı kayda düşer. Vurgulama yapay zekâ çağırmaz.
- 2026-10-02: Durumlar `unknown | learning | known` (arayüzde bilmiyorum / az biliyorum / biliyorum). `occurrences` cümle metnini ve görünümü (`text | original`) doğrudan saklar; `sentences` tablosu Faz 4'te gelecek.
- 2026-10-02: Kelime: tıkla ya da en çok 6 kelimelik öbeği seç. Vurgular CSS Custom Highlight API ile (`duo-unknown`, `duo-learning`, `duo-flash`).
- 2026-10-02: Yedek: belgeler, terimler, geçişler ve yapay zekâ önbelleği tek JSON; içe aktarma mevcut veriyi tek işlemde değiştirir. API anahtarı yedeğe girmez (testle doğrulanıyor).
- 2026-10-02: pdf.js görüntüleyicisinde `box-sizing: content-box` zorunlu; aksi hâlde metin katmanı tuvalden büyük olur ve seçim sayfanın altına doğru kayar.
- 2026-10-02: Egemen'in isteğiyle Faz 4c (görsellerden metin, OCR) eklendi: yerel Tesseract.js + isteğe bağlı görsel model yedeği. Python betiği tablette çalışmadığı ve kurulum gerektirdiği için elendi; API tek başına kelime konumu vermediği için temel yöntem olamaz.
- 2026-10-02: Faz 3 Egemen tarafından test edildi (AI anlamı, tıklama, durum kaydı, yedek dışa/içe aktarma çalışıyor).
- 2026-10-02: Egemen'in isteğiyle Faz 7b (Google Drive ile otomatik eşitleme) eklendi. VPS/kendi sunucusu "sunucu yok" ilkesine ters olduğu için elendi. Yeni tablolar baştan `updatedAt` + silme izi ile tasarlanacak.
- 2026-10-02: Cümle bölme: Intl.Segmenter + kısaltma düzeltmesi (e.g., Dr., Fig., tek harfli baş harfler). PDF'te punto %20'den fazla değişince (başlık → gövde) paragraf sonu sayılır. Sayfalar arası bölünen cümleler şimdilik iki parça kalır.
- 2026-10-02: Çeviriler `sentences` tablosunda (anahtar: temizlenmiş cümlenin SHA-256'sı) kalıcı tutulur; ayrı önbellek yok, internetsiz de görünür, "Yeniden çevir" üzerine yazar. Silmeler `tombstones` tablosuna iz bırakır (eşitleme hazırlığı). Yedek bu iki tabloyu da içerir; eski yedekler açılmaya devam eder.
- 2026-10-02: Cümle çevirisine erişim: 6 kelimeden uzun ya da cümle sınırını aşan seçim, Alt + tıklama, kelime penceresindeki "Cümleyi çevir". Çevrilen cümle sayfada `duo-sentence` vurgusuyla gösterilir.
- 2026-10-02: Egemen'in gözlemi: `gpt-oss-20b` kelime anlamlarında hata yapabiliyor ve `nemotron-3-super-120b-a12b`'den yavaş. Hızlı rol için super, güçlü rol için ultra önerildi; seçim Egemen'de.
- 2026-10-02: Sıra değişti: Faz 4c (OCR) Faz 4b'den önce. Faz 4b'ye geçici parlak kalem (kalıcı olmayan, kelime/cümle penceresi açan) eklendi.
- 2026-10-02: OCR: Tesseract.js 7, LSTM, İngilizce `4.0.0_best_int` (2,9 MB); çalışma dosyaları derlemede `public/tesseract/`'e kopyalanır, CDN kullanılmaz. Tek işçi, işler sırayla. Uzun kenarı 2400 px'ten büyük resimler küçültülür, EXIF yönü uygulanır. Güveni 55'in altındaki ve harf/rakam içermeyen kelimeler atılır.
- 2026-10-02: OCR sonuçları görsel boyutuna oranla (0-1) saklanır, `ocr` tablosunda önbelleğe alınır (anahtar: resim baytlarının SHA-256'sı ya da `page:<hash>:<görünüm>:<sayfa>`); yeniden üretilebildiği için yedeğe girmez.
- 2026-10-02: OCR metin katmanı pdf.js metin katmanıyla aynı sınıf/değişkenleri (`textLayer`, `--font-height`, `--scale-x`, `--total-scale-factor`) kullanır; kelime seçme, vurgulama, çeviri ve yakınlaştırma aynen çalışır. Satırdaki kelimeler satırın yüksekliğini paylaşır; noktalamasız biten satırdan sonra büyük harfle başlayan satır ayrı satır sayılır (başlık/etiket).
- 2026-10-02: PDF'te yalnızca büyük görsel içeren sayfalar (çizim komutlarından, ≥2500 pt²) ve yalnızca görsel bölgesi taranır; gerçek metnin üstüne düşen OCR kelimeleri atlanır. Metin görünümünde (EPUB/DOCX/PPTX) resimler gösterilmez, yerlerine OCR yazısı gelir; PPTX metin görünümü artık slayt resimlerini de alır.
- 2026-10-02: Resim dosyaları (PNG, JPG, WEBP, BMP) belge olarak açılır (`format: image`).
- 2026-10-02: Yedek yol: "Yapay zekâ ile oku", profilde isteğe bağlı `visionModel`; OpenAI `image_url` biçimi, resim en çok 1600 px JPEG. Sonuç `cache` tablosunda, panelde gösterilir ve içindeki kelimeler işaretlenebilir.
- 2026-10-02: Görüntüleyiciler hata sınırıyla sarıldı; bir belge çökerse yalnızca kendi sekmesinde hata gösterilir.
- 2026-10-02: Faz 8 için not: `public/tesseract/core/` üç çekirdek sürümü içeriyor (~20 MB); paketlemede gerçekten yüklenenler ölçülüp gereksizler çıkarılmalı.
- 2026-10-02: Ayarlar yeniden yapılandı: "etkin profil" kalktı; sağlayıcılar (adres + anahtar) ve rol atamaları (`roles.fast|strong|vision = { profileId, model }`). Eski biçim açılışta otomatik taşınır. İstekler `AiTarget` (sağlayıcı + model) alır.
- 2026-10-02: Tarayıcının `<datalist>` öneri listesi sayfa kayınca yerinde kaldığı için kendi model seçme kutumuz (`ModelInput`) kullanılıyor.
- 2026-10-02: PPTX metin görünümü SmartArt (diagrams/data), grafik başlıkları, `mc:AlternateContent` ve konuşmacı notlarını da okuyor. Egemen'in bildirdiği "çoğu metin görünmüyor" sorunu için; gerçek dosyayla doğrulanması bekleniyor.
- 2026-10-03: OCR katmanı `pointer-events: none` (yalnızca OCR kelimeleri tıklanabilir); aksi hâlde logo gibi küçük bir resmi olan sayfalarda gerçek metne tıklanamıyordu (Egemen'in PWA slaytlarında bulundu).
- 2026-10-03: Commit kimliği bu depoda `Egemen-16925 <240976138+Egemen-16925@users.noreply.github.com>` (yerel git ayarı).
- 2026-10-03: Yakınlaştırma: Ctrl+tekerlek ve touchpad sıkıştırma imlecin olduğu yere göre (küçük adımlar birikir), dokunmatik ekranda iki parmak; PDF'te pdf.js `updateScale`, akan metinde yazı boyutu.
- 2026-10-03: Çizimler `strokes` tablosunda (Dexie v6): belge hash + görünüm + sayfa, sayfaya oranlı noktalar ve basınç ağırlığı; silmeler `stroke:<id>` iziyle; yedeğe girer. Geri al / yinele oturum içidir.
- 2026-10-03: Kalem araçları (Oku / Fosforlu / Kalem / Silgi) tüm sekmelerde ortak; akan metinde yalnızca Fosforlu (sayfa düzeni sabit olmadığı için kalıcı çizim yok). Fosforlu kalem açıkken metin seçimi engellenir.
- 2026-10-03: "Parmakla çizim" varsayılan kapalı (parmak kaydırır/yakınlaştırır, kalem çizer, kalem değerken avuç içi yok sayılır); cihaza özel tercihler `localStorage` `duopdf.prefs`'te, yedeğe girmez.
- 2026-10-03: Notların dışa aktarımı "Çizimli PDF": pdf-lib ile belgenin kopyasına çizilir (resimler tek sayfalık PDF olur), asıl dosya değişmez. Rust `write_pdf` ham bayt alır, yol başlıkta kodlu gelir, yalnızca `.pdf` yazar.
- 2026-10-03: Tauri penceresinde `window.confirm()` gösterilmiyor (silmeler sormadan yapılıyordu); tüm onaylar uygulama içi `askConfirm` penceresinde. Kelime silmede "Bir daha sorma" var; Ayarlar → Tercihler'den sıfırlanır.
- 2026-10-03: Her model rolüne isteğe bağlı yedek sağlayıcı + model (`roles.*.fallback`); 429'da beklemeden yedeğe geçilir. Yedek yoksa eski davranış (bekleyip yeniden dene).
- 2026-10-03: API anahtarları `providers.json`'da Windows DPAPI ile şifreli (`apiKeyEnc`, uygulamaya özel ek anahtar); eski düz metin anahtarlar açılışta şifrelenir. Başka kullanıcı/bilgisayarda çözülemezse anahtar boş kalır, yeniden girilir. Android için platform anahtar deposu Faz 9'da.
- 2026-10-03: Fosforlu kalem izin yalnızca uçlarına değil, geçtiği tüm noktalara bakar (harfin kutusuna yakın olanlar); büyük başlıkların üstünü çizmek yeter. Ana pencere büyütülmüş açılır.
- 2026-10-03: Çoktan seçmeli sınav: her kelimeye bir soru, kelimenin kayıtlı cümlelerinden (15-400 karakter) biri; az sorulan ve uzun süredir sorulmayan kelimeler önce. Şıkları güçlü model üretir (doğru çeviri + 3 çeldirici ve her birinin "neden yanlış" açıklaması); okuyucuda yapılmış çeviri varsa doğru şık o olur.
- 2026-10-03: Şıklar zod ile denetlenir: tam 3 çeldirici, büyük/küçük harf ve noktalama dışında dört şık birbirinden farklı; değilse model bir kez düzeltir. Sorular `cache` tablosunda (istem `multipleChoice@1`); "Soruyu yenile" yeniden üretir. Sonraki 2 soru arka planda hazırlanır.
- 2026-10-03: `quizAttempts` tablosu (Dexie v7): UUID, `termKeys` (kararlı terim anahtarları), şıklar, doğru/seçilen şık, `updatedAt`; yedeğe girer. Sınav sonucu kelime durumunu değiştirmez (aralıklı tekrar Faz 6'da).
- 2026-10-03: Yedek modele geçiş artık her yapay zekâ hatasında (istek sınırı, zaman aşımı, sunucu hatası, bozuk yanıt; ayar eksikliği hariç). Yedek seçilmezse hızlı ve güçlü model birbirinin yedeğidir; yedek varken asıl model en çok 45 sn beklenir.
- 2026-10-03: Egemen'in isteğiyle sınav yenilendi (istem `multipleChoice@2`): soru cümlesini model her seferinde yeniden kurar (sıcaklık 0.9); belgedeki cümle yalnızca anlamı belirlemek için gönderilir, kelimenin son 8 soru cümlesi "bunlara benzeme" diye verilir. Sorular önbelleğe alınmaz.
- 2026-10-03: Soru yönü: İngilizce → Türkçe, Türkçe → İngilizce ya da karışık (varsayılan). `quizAttempts` kayıtlarına `direction` ve `translation` eklendi. Kelime seçimi: önce az sorulan, sonra çok yanlış yapılan kelime; geçtiği cümle kayıtlı olmayan kelimeler de sorulabilir.
- 2026-10-03: Kelime başına doğru/yanlış sayısı sınav ayar ekranında ("Kelimelerdeki başarın"), sınav sonunda ve Kelimeler sayfasında gösterilir.
- 2026-10-03: Sınavda cevaptan sonra İngilizce metin okuyucudaki gibi tıklanıp seçilebilir (kelime/cümle penceresi; sınav cümlesinden işaretlenen kelimeye geçiş kaydı yazılmaz). Uzun şıklar alt satıra iner.
- 2026-10-03: Açık uçlu soru: cümleyi model kurar (`openQuestion@1`), kullanıcı çevirisini yazar (iki yön), güçlü model `evaluateTranslation@2` ile anlam üzerinden değerlendirir (örnek çeviri yalnızca yol gösterir). Kelime doğru sayılır: modelin `hedefKelimeler` kararı doğruysa ve sonuç "yanlis" değilse.
- 2026-10-03: Aralıklı tekrar (`src/quiz/review.ts`): her cevap (çoktan seçmeli dahil) `terms.review`'u günceller. Doğru: aralık 1, 3, 7 gün, sonra ×2,5; ilk doğru "bilmiyorum"u "az biliyorum"a, üst üste 3 doğru "biliyorum"a çıkarır. Yanlış: seri sıfırlanır, kelime hemen yeniden sorulabilir; "biliyorum" ise "az biliyorum"a iner.
- 2026-10-03: "Bugünkü tekrar": tekrar zamanı bugün biten ya da geçmiş kelimeler, en çok gecikmiş önce. Soru türü (çoktan seçmeli / yazılı / karışık) ve yönü ayarlanabilir. Kelimeler sayfasında her kelimenin tekrar günü görünür. `quizAttempts`'e `kind: "open"`, `userAnswer`, `result`, `score`, `feedback` eklendi.
- 2026-10-03: Sınav zorluğu: kolay (A2, 6-10 kelime), orta (B1, 8-14, varsayılan), zor (B2-C1, 12-22); her iki soru türünün istemine aynı kural eklenir (`multipleChoice@3`, `openQuestion@2`), seçim hatırlanır.
- 2026-10-03: Tema: Sistem / Açık / Koyu (`prefs.theme`, `:root[data-theme]`); ilk çizimden önce uygulanır. Belge sayfaları her temada beyaz.
- 2026-10-03: Sesli okuma: Web Speech API, yalnızca İngilizce sesler; ses ve hız Tercihler'de. Kelime/cümle pencerelerinde ve sınavda düğme; Türkçe → İngilizce soruda İngilizce cümle ancak cevaptan sonra okunur.
- 2026-10-03: İstatistik sayfası: durum sayıları, günlük seri (sınav cevabı ya da yeni işaretlenen kelime olan günler; bugün çalışılmadıysa dünden sayılır), bugünkü tekrar, son 30 gün başarı, günlük cevap grafiği (tek seri, üzerine gelince ayrıntı, tablo görünümü), en çok yanlış yapılan kelimeler.
- 2026-10-03: Kısayollar: F1 liste, Alt+1-5 sayfalar, Ctrl+O belge aç, Ctrl+W sekme kapat, Ctrl+Tab sekmeler arası. Belge listesi boşken "Nasıl başlanır?" rehberi.
- 2026-10-03: Yazılı cevapta 80 puan ve üstü yeşil gösterilir ("Neredeyse doğru"); kolay düzeyde hedef dışındaki kelimeler en yaygın 1000 kelimeden istenir.
- 2026-10-03: Google Drive eşitlemesi: masaüstü OAuth istemcisi (Egemen kendi Google Cloud projesinde oluşturur, kimlik ve gizli anahtar Ayarlar'dan girilir, DPAPI ile şifreli `sync.json`'da), PKCE + 127.0.0.1 loopback (Rust `oauth_listen`/`oauth_wait`), kapsamlar `openid email drive.appdata` (hassas değil; uygulama "Üretim" moduna alınınca oturum 7 günde düşmez).
- 2026-10-03: Bulutta tek dosya `duopdf-sync.json` (appDataFolder): belgeler (hash, ad), terimler, geçişler (terim anahtarı + belge hash'i), çeviriler, çizimler, sınav cevapları, silme izleri. Birleştirme: terim/çeviri/çizimde yeni `updatedAt` kazanır, geçiş ve cevaplar birleşir, silme izi kaydı yalnızca kayıttan yeniyse siler. Önbellek, OCR, dosya yolları, son sayfa, API anahtarları gitmez.
- 2026-10-03: Eşitleme zamanları: açılışta, açıkken 5 dakikada bir, kapanırken (en çok 8 sn; `core:window:allow-destroy` izni) ve "Şimdi eşitle". "Öğrenme verisini sil" bağlıyken buluttaki kopyayı da silmeyi sorar; aksi hâlde veriler bir sonraki eşitlemede geri gelir.
- 2026-10-03: Faz 8: yalnızca NSIS kurulum dosyası (`Duopdf_1.0.0_x64-setup.exe`, ~12,5 MB) yayınlanır; kod imzası yok (SmartScreen uyarısı README'de). Tesseract'tan yalnızca yüklenen `*-lstm.wasm.js` çekirdekleri pakete girer; `public/__harness` derlemeden sonra `dist`'ten silinir. Uygulama simgesi `app-icon.svg`'den `tauri icon` ile üretilir.
- 2026-10-03: Derleme yarıda kesilirse Tauri'nin sıkıştırılmış varlık önbelleği (`target/release/build/duopdf-*/out/tauri-codegen-assets`) bozuk kalabilir ve uygulama gri ekranla açılır; çözüm `cargo clean --release -p duopdf`. Yayından önce gömülü varlıkların `dist` ile aynı olduğu kontrol edilir.
- 2026-10-03: Geliştirme sürümü ayrı kimlikle çalışır (`com.egemen.duopdf.dev`, `src-tauri/tauri.dev.conf.json`, `npm run tauri dev` bunu `scripts/tauri.mjs` ile kendiliğinden ekler); kurulu uygulama (`com.egemen.duopdf`) ayarlarını ve verisini ondan ayrı tutar.
- 2026-10-03: GitHub Release `v1.0.0` Egemen'in onayıyla yayınlandı. README ekran görüntüleri sonra eklenecek.
- 2026-10-06: Güvenlik incelemesi: sürümde CSP var (dış adrese doğrudan istek, `eval`, eklenti/çerçeve yok; yapay zekâ ve Drive istekleri HTTP eklentisinden geçtiği için etkilenmez). `style-src` Tauri'nin hash eklemesinden muaf (`'unsafe-inline'`), zod `jitless`. Geliştirme sürümünde CSP kapalı (Vite HMR).
- 2026-10-06: Office dönüştürmesi makrolar kapalı çalışır (`AutomationSecurity = 3`); uzantısı .docx/.pptx olan makrolu bir dosya kod çalıştıramaz.
- 2026-10-06: Gizlilik politikası `PRIVACY.md` (TR + EN; Play için adres: GitHub'daki dosya). Android'de `allowBackup=false` (Google'ın otomatik yedeği öğrenme verisini almaz); TV desteği kaldırıldı.
- 2026-10-06: Faz 9 Android: hedef API 37 (Play API 36 istiyor), en düşük Android 7 (API 24), uygulama kimliği `com.egemen.duopdf`, sürüm 1.1.0 (sürüm kodu 1001000). `src-tauri/gen/android` git'te.
- 2026-10-06: Android dosya erişimi: kendi Kotlin eklentimiz (`NativePlugin.kt`, Rust'ta satır içi eklenti `duopdf-native`) ACTION_OPEN_DOCUMENT + kalıcı okuma izni ve ACTION_CREATE_DOCUMENT; `documents.filePath` Android'de `content://` adresidir, ad seçiciden gelir. Okuma/yazma Rust'ta fs eklentisinin Rust API'siyle (JS izni yok); izin kalkarsa "yeniden seç". Listeden kaldırılan belgenin izni bırakılır.
- 2026-10-06: Android'de API anahtarları Android Keystore'daki AES-GCM anahtarıyla (`aks:` öneki), sesli okuma TextToSpeech ile (WebView'da Web Speech yok), Google Drive eşitlemesi gizli (Android OAuth istemcisi ayrı iş).
- 2026-10-06: Egemen "web sitesi gibi" dediği için Android'e ayrı görünüm (`:root.android`): alt gezinme çubuğu (model testi Ayarlar'dan), üst uygulama çubuğu, yüzen "Belge aç", alttan açılan kelime/cümle pencereleri, 44-48 px dokunma alanları, geri tuşu (pencere → belge listesi → arka plan), kenardan kenara çizimde sistem çubukları kadar iç boşluk. Masaüstü görünümü değişmedi.
- 2026-10-06: Dokunmatik çok kelimelik seçim: seçim 700 ms değişmeden kalınca seçimin başına yapay `mouseup` gönderilir; tüm görüntüleyiciler mevcut seçim akışıyla çalışır.
- 2026-10-06: R8 küçültmesi `NativePlugin` ve `*Args` sınıflarını korur (`proguard-rules.pro`); yayın APK'sı emülatörde denendi.
- 2026-10-06: Tablet düzeni (Android, ≥840 px): alt çubuk yerine solda dikey gezinme şeridi, alt pencereler ortada en çok 680 px, kelime satırları tek satır, istatistik kutuları 3 sütun. Play görselleri `docs/play/` (telefon 1080×1920, tablet 1920×1080, öne çıkan 1024×500, simge 512).
