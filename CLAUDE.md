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
- [ ] Faz 4b — Kalemle not alma
- [ ] Faz 4c — Görsellerden metin (OCR)
- [ ] Faz 5 — Çoktan seçmeli sınav
- [ ] Faz 6 — Açık uçlu çeviri sınavı ve aralıklı tekrar
- [ ] Faz 7 — İstatistik, sesli okuma, son rötuşlar
- [ ] Faz 7b — Bulut eşitleme (Google Drive)
- [ ] Faz 8 — Paketleme ve GitHub Release
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
- Sağlayıcı profilleri (`ad`, `baseUrl`, `apiKey`, `hızlıModel`, `güçlüModel`) ayrı bir depoda durur. Birden çok profil kaydedilebilir, aralarında geçilebilir.
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
