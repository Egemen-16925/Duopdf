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

- [ ] Faz 0 — Kurulum, iskelet, GitHub
- [ ] Faz 1 — Ayarlar, API bağlantısı, model testi
- [ ] Faz 2 — PDF okuyucu
- [ ] Faz 3 — Kelime işaretleme
- [ ] Faz 4 — Cümle çevirisi
- [ ] Faz 5 — Çoktan seçmeli sınav
- [ ] Faz 6 — Açık uçlu çeviri sınavı ve aralıklı tekrar
- [ ] Faz 7 — İstatistik, sesli okuma, son rötuşlar
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

### Bilinen tuzaklar

- **CORS:** `integrate.api.nvidia.com` tarayıcıdan doğrudan çağrıya izin vermiyor. AI çağrıları için tarayıcının `fetch`'ini kullanma, hep HTTP eklentisinden geç. Kullanıcı kendi `baseUrl`'ini girebildiği için eklentinin izin kapsamı `https://**` ve `http://localhost:*` (Ollama) olmalı.
- **Geliştirme ve kurulu sürüm ayrı veri tutar:** `tauri dev` ile kurulu exe farklı origin kullandığından IndexedDB'leri ayrıdır. Egemen'e bunu Faz 3'te söyle; dışa/içe aktarma bu yüzden erken geliyor.
- **PDF metni dağınık gelir:** Satır sonu tirelemeleri, çift sütun, üstbilgi ve altbilgi cümle bölmeyi bozar. Cümleye bölmeden önce temizle; bölme için `Intl.Segmenter` kullan.
- **Taranmış PDF'lerde metin yoktur:** Metin katmanı boşsa kullanıcıya açıkça söyle. OCR kapsam dışı.
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
- Taranmış PDF'ler için OCR
- İngilizce dışındaki diller

## Karar günlüğü

Önemli kararları tarihle ve tek satırla buraya ekle.

- 2026-10-02: Tauri 2 + React + Dexie seçildi; sunucu yok, veriler cihazda.
