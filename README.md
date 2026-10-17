# Paracci Dosya

![Paracci Dosya](extension/assets/icons/icon-128.png)

**Belgeler yerli yerinde.** Paracci tarafından geliştirilen bağımsız bir Windows/Chrome evrak arşivi. UYAP Vatandaş Portalı’ndaki açık dava ağacını ana evrak/ek ilişkisiyle kaydeder; yerel OCR ile kaynak referanslı AI okuma paketi hazırlayabilir.

**Resmî bir UYAP, Adalet Bakanlığı veya e-Devlet uygulaması değildir; bu kurumlarca onaylanmış/desteklenmiş değildir.** Uyumluluk bilgisi erişim yetkisi veya otomasyon izni anlamına gelmez. [Kullanım sınırları](docs/LEGAL.md) · [Gizlilik](docs/PRIVACY.md)

## Özellikler

- Ana evrak ve ekleri birlikte tutan klasörleme; mevcut indirmeleri doğrulama ve devam.
- Tam etiketler, isteğe bağlı temiz adlarla klasör kopyası ve kaynaklı Markdown paketi.
- PDF/UDF metni, Türkçe/İngilizce yerel OCR, ZIP içerikleri ve yerel anahtar sözcük araması.
- Standart/yüksek kalite seçimi; fare, klavye ve dokunmayla açılan açıklamalar.
- Varsayılan koyu tema; hatırlanan açık/koyu tema tercihi.
- Dosya Sorgulama’ya özel durum sihirbazı; isteğe bağlı sayfa üzerinde görsel yönlendirme ve açık oturum/bağlantı uyarıları.
- Deneysel Tek ZIP modu: yerel diskte evrak bazında devam, tek arşiv ve sunucuya yeni istek yapmadan yerel ZIP tamamlama.
- Danıştay için varsayılan kapalı deneysel klasik indirme, bölüme özel rehber ve görünür destek tablosu. [Destek ve doğrulama sınırları](docs/SUPPORT.md)

[Koyu tema örneği](docs/images/dark.png) · [Açık tema örneği](docs/images/light.png) · [Açıklama kutusu](docs/images/help.png). Görseller yalnızca sentetik demo verileri içerir.

[Hazırlık sihirbazı](docs/images/wizard.png) · [Deneysel Tek ZIP ekranı](docs/images/bundle.png)

Bir sohbet modeli veya hukuki danışmanlık hizmeti değildir. Belgeler bir AI sağlayıcısına gönderilmez. Paketi sonradan bir hizmete yüklemek ayrı bir veri aktarımıdır; paket anonimleştirmez.

## Kurulum

Windows ve Chrome 120+ gerekir. Arşivleme Python olmadan çalışır. AI hazırlama için Python 3.12+ ve resmî kaynaktan Tesseract 5 kurun. Yalnızca incelenen UYAP **Vatandaş** evrak ağacı desteklenir; diğer portallar doğrulanmamıştır.

1. Chrome’da `chrome://extensions` → **Geliştirici modu → Paketlenmemiş öğe yükle** ile `extension` klasörünü seçin.
2. Simgeyi sabitleyin. AI kullanacaksanız eklenti kartındaki 32 harfli kimliği not edin.
3. Proje klasöründeki PowerShell terminalinde:

```powershell
& .\tools\setup-ai.ps1
& .\tools\setup-quality.ps1
$ExtensionId = Read-Host 'Chrome kartindaki 32 harfli eklenti kimligi'
& .\tools\install-native-host.ps1 -ExtensionId $ExtensionId
```

Kalite modelleri isteğe bağlıdır. Tesseract ayrıca kurulmalıdır. İlk kurulum internetten bağımlılık/model indirir; modeller sabit upstream revizyon ve SHA-256 ile doğrulanır. Python paketleri proje `.venv` ortamına kurulur. Günlük kullanımda `.cmd` açılmaz. Chrome izinlerini kullanıcı tamamlar.

## Kullanım

1. UYAP’a normal giriş yapın; davanın **Evrak** bölümünde Paracci Dosya simgesine tıklayın.
2. **Dosyayı tara** ile sayıları/planı inceleyin. Bu aşama belge indirmez; mevcut indirmeleri doğrular.
3. İlk seferde **Bir evrak ve eklerini dene**, kontrol sonrasında **Devam et** kullanın. Chrome çoklu indirme izni isteyebilir.
4. **Duraklat** yeni belge başlatmaz; başlamış aktarımın bitmesini bekler. Hata sonrasında yeniden tarayın.
5. Arşiv tamamlanınca **AI paketi hazırlama → Yerel motoru bağla**. Kalite ve kopya seçeneklerini ayarlayın; `i` düğmeleri açıklar.
6. Paketi indirin, başlangıç rehberini okuyun veya kaynaklı metin arayın.

İlk ekranda **UYAP hazırlık sihirbazı** hangi adımın eksik olduğunu gösterir. **UYAP’ta beni yönlendir** ilgili kontrolü işaretler; sorgulama veya dava seçimine sizin yerinize tıklamaz. Yargı Türü seçilir; Mahkeme isteğe bağlıdır ve Tümü ile sorgu yapılabilir. Oturumun sona erdiğine dair yanıt varsa yeniden giriş yönlendirmesi gösterilir. Açık/cached bir ekran tek başına sunucu oturumunun geçerliliğini kanıtlamaz; periyodik oturum uzatma isteği yapılmaz.

**Danıştay · deneysel:** Ayrı uyarı ve sekmeye özel seçimle klasik indirme açılabilir. Canlı sorgu ekranı incelendi; gerçek dava/evrak örneği bulunmadığından indirme doğrulanmadı. Önce tek evrak ve eklerini deneyin. Tek ZIP bu bölümde kapalıdır. AYM, Duruşma, Alo Adalet ve diğer menüler evrak arşivleme için desteklenmez; tanınmayan yapı tahmin edilmez. [Bölümlere göre kapsam](docs/SUPPORT.md)

**Tek ZIP · deneysel:** Belgeleri Chrome’da tek tek indirmek yerine mevcut oturumdaki tarayıcı isteğiyle yerel motora akıtır. İlk indirme rotası yalnızca eşleşen gerçek Kaydet kaydından öğrenilir; yeni kullanıcıda **Bağlantıyı doğrula · 1 dosya** adımı normal bir Chrome indirmesi yapar. Sessiz toplama sırasında Chrome indirmesi başlatılmaz; sonuç yerel klasör ve bir ZIP’tir. Yerel bağlayıcı gerekir. Bu mod Chrome’un indirme arayüzünü/dosya uyarılarını kullanmaz; klasik yöntem ayrıca kullanılabilir. [Akış, sınırlar ve kesintiden devam](docs/BUNDLE.md).

Tarama/indirme sürerken açık davayı değiştirmeyin. Güncellemeden önce duraklatıp aktif indirmelerin bitmesini bekleyin, eklentiyi yenileyin ve yeniden tarayın. Hız seçeneği portalın izin verdiği kullanımın yerine geçmez.

## Dosyalar ve sınırlar

Özgün indirmeler yol sınırı/çakışma için kısa kimlikler taşır; tam adlar raporda korunur. İsteğe bağlı kopya `UYAP/Okunabilir/Tam dava adı` altındadır; ana belge `Ana evrak`, ekler `Ek 1` gibi adlar alır. Kopya ek disk alanı kullanır. Çok uzun yollarda sözcük sınırında kısaltma gerekebilir.

AI paketi kaynak klasörün yanındaki `__AI` klasörüne yazılır: rehber, katalog, kontrol listesi, Markdown ciltleri, manifest, arama dizini ve ZIP. DOC/SRC kimlikleri kaynak gösterir. OCR; ad, sayı, tarih, tablo, imza ve el yazısını yanlış/eksik okuyabilir. Özgün belge esas alınır. “Tamamlandı”, hukuki geçerlilik veya sunucuya karşı eksiksizlik onayı değildir. [AI hazırlama ayrıntıları](docs/AI_PREPARATION.md)

Oturum/portal değişiklikleri, Chrome indirme geçmişinin temizlenmesi ve belirsiz/sayfalı ağaçlar devam kontrolünü etkileyebilir. Güvenilir eşleşme kurulamazsa araç durur. Giriş, CAPTCHA ve yetki kontrolleri aşılmaz.

## Gizlilik ve izinler

Paracci’nin belge sunucusu, telemetri veya analitik servisi yoktur. Normal belge istekleri UYAP’a gider. Yerel AI motoru Native Messaging kullanır; ağ portu açmaz. Dosyalar ayrıca şifrelenmez; rapor/dizin/önbellek de hassas veri içerebilir. Bulut eşleme ve yedekleri değerlendirin.

| İzin | Amaç |
| --- | --- |
| activeTab / scripting | Kullanıcının seçtiği portalda ağacı okumak ve mevcut Kaydet işlevini çağırmak |
| downloads | Kendi eşleşen indirmelerine yol vermek, tamamlanmayı kontrol etmek |
| storage / alarms | Geçici plan, yerel indirme geçmişi, iş durumu ve kuyruk takibi |
| nativeMessaging | AI düğmeleriyle kayıtlı yerel hazırlayıcıya ulaşmak |

Tema `localStorage`, iş/indirme bilgileri Chrome yerel depolaması, Python iş kayıtları `%LOCALAPPDATA%\UyapArchiveAI\jobs` içindedir. [Veri yaşam döngüsü ve silme](docs/PRIVACY.md)

## Geliştirme ve dağıtım

```powershell
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd run check
& .\.venv\Scripts\python.exe -m unittest discover -s tests -p 'test_*.py'
npm.cmd run package
npm.cmd run public:check
npm.cmd run public:export
```

Eklenti `artifacts/paracci-dosya-<sürüm>`, temiz kaynak kopyası `artifacts/public` altına yazılır. Kaynak dışa aktarımı `.git`, dava belgeleri, yerel bağlayıcı ayarları, modeller, önbellek ve çalışma raporlarını içermez; SHA-256 envanteri üretir. Kontrol tüm sır/kişisel verileri bulma garantisi değildir; manuel inceleme gerekir. [Yayın rehberi](docs/RELEASE.md)

`node scripts/preview.cjs` yalnızca `127.0.0.1:4173` üzerinde sentetik örnek gösterir; UYAP’a bağlanmaz. Gerçek belge/raporları issue’ya yüklemeyin. [Katkı](CONTRIBUTING.md) · [Güvenlik](SECURITY.md) · [Doğrulama](docs/VALIDATION.md)

## Lisans ve marka

AGPL-3.0-only. [LICENSE](LICENSE) · [Üçüncü taraf bildirimleri](THIRD_PARTY_NOTICES.md) · [Paracci kimliği ve simge](docs/BRANDING.md). Dağıtım/kullanım modelinizin kaynak ve değişiklik paylaşımı yükümlülüklerini değerlendirin.
