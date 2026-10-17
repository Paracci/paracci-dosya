# Paracci Dosya · Yerel yapay zekâ paketi

Bu araç, indirilen dava arşivini bir modelin okuyabileceği kaynak referanslı metne dönüştürür. Bir yapay zekâ hizmetine bağlanmaz ve dava hakkında otomatik hukuki sonuç üretmez.

## Kullanım

Önce README’deki yerel motor/model/Chrome bağlayıcı kurulumunu tamamlayın. Açık UYAP Evrak sekmesinden eklenti simgesine tıklayıp **Dosyayı tara** ile mevcut indirmeleri doğrulatın. Arşiv **Tamamlandı** durumundayken:

1. **AI paketi hazırlama → Yerel motoru bağla** seçin.
2. **Okuma kalitesi** seçin; isteğe bağlı zorunlu PDF OCR ve okunabilir kopya kutularını ayarlayın. **Bu arşivin AI paketini hazırla** ile başlatın. Motor ayrı pencere açmadan çalışır; metin/OCR, kopyalama ve paket yazma aşamaları görünür. Bir büyük TIFF/PDF tek evrak sayıldığından evrak sayacı uzun süre aynı kalabilir.
3. Tamamlanınca **AI paketini indir**, **Başlangıç rehberi** ve **Pakette kaynaklı metin ara** aynı ekranda kullanılabilir.

Çıktı, özgün klasörün yanında `__AI` son ekli ayrı klasöre yazılır. İndirme düğmesi hazırlanan ZIP’i parçalar halinde alır, SHA-256 değerini doğrular ve tarayıcı indirmesini başlatır. Paket zaten `__AI` klasöründe de vardır. Tarayıcıya aktarım sınırı 128 MiB’dir; daha büyük paket klasörden kullanılabilir. Günlük kullanımda `.cmd` açmak gerekmez; **AI-Paketi-Hazirla.cmd** alternatif masaüstü arayüzü olarak korunur.

İsteğe bağlı arşiv raporu seçilirse, aynı dosya yollarına karşılık gelen tam evrak türü ve etiketler kullanılır. Eski raporun indirme durumları güncel doğrulama yerine geçmez; yalnızca eşleşen etiketler zenginleştirilir.

Eklenti güncel arşiv raporunun token içermeyen etiketlerini yerel motora iletir. Dava kökü tamamlanan Chrome indirme kaydından türetilir; web sayfaları yerel motora komut gönderemez. Sadece eklentinin paketli `app.html` ekranından gelen istekler kabul edilir. Bir anda bir arşiv hazırlanır; aynı işin tekrar başlatılması ikinci bir çalışan oluşturmaz. Kesilen işlem tamamlanmış sayılmaz. Yeniden başlatma yerel önbelleği kullanır; arşivleme sonrası dosya eklenmiş/silinmiş/değişmişse doğrulama durur. Tarayıcı/Windows kapanınca kesintisiz devam garantisi yoktur; ekranı yeniden açıp bağlanın ve durumu kontrol edin.

Önceden masaüstü aracıyla oluşturulan paketin ilk kez eklentiye bağlanması için aynı dava üzerinde hazırlamayı bir kez başlatın. Uyumlu önbellek yeniden OCR yapmadan kullanılır. Arama anahtar sözcüklere dayanır; bu ekranda bir sohbet modeli çalışmaz.

## Yapay zekâya hangi dosyalar verilir?

1. `BASLANGIC.md`: kaynak gösterme, OCR ve eksik kapsam kuralları.
2. `DOSYA_KATALOGU.md` ve `KONTROL_GEREKENLER.md`: özgün belge bağlantıları ve çıkarım sınırlamaları.
3. `AI_OKUMA_01.md`, `AI_OKUMA_02.md` …: bütün metin ciltleri.

`AI_PAYLASIM.zip` bunları tek dosyada içerir. ZIP açamayan hizmette Markdown dosyaları doğrudan kullanılır. Bir hizmetin bağlamına bütün ciltler sığmayabilir; sırayla yüklemek önceki ciltlerin bellekte kaldığını garanti etmez. Büyük arşivlerde yerel arama ile ilgili kaynak parçaları seçilip soruya eklenmelidir.

Paket kişisel/hukuki veriler içerir. Kullanıcının daha sonra seçtiği hizmete yüklemesi ayrı bir veri aktarımıdır; araç herhangi bir hizmete yükleme yapmaz.

## İşlenen biçimler

| Kalite | Yerel motor | PDF tarama çözünürlüğü | Kullanım |
| --- | --- | --- | --- |
| Standart | Tesseract tessdata_fast tur+eng | 200 DPI | Daha hızlı ilk hazırlama |
| Yüksek kalite | Tesseract tessdata_best tur+eng | 300 DPI | Küçük/bulanık yazı ve sorunlu belgeleri yeniden işleme; daha yavaş |

Bu iki seçenek aynı yerel OCR motorunun farklı model/çözünürlük profilleridir; bir bulut/VLM hizmeti değildir. Görselde olmayan metin tahmin edilmez. Tesseract güveni gerçek doğruluk oranı değildir; yüksek kalite her sayfada daha iyi sonuç garantilemez. PDF’nin sağlıklı doğal metni PyMuPDF ile alınır. Tam sayfa tarama veya bozuk karakter kodlaması saptanırsa eski metin uzun olsa da yeniden OCR yapılır. **PDF’nin mevcut metnini atla** tüm PDF sayfalarını OCR’ye zorlar. UDF doğal metni bu seçenekten etkilenmez.

Kalite/model/DPI/zorunlu PDF OCR seçimi önbellek anahtarına dahildir. Eski 0.4.0 çıktıları düzeltilmiş PDF/TSV mantığının yerine kullanılmaz; ilk 0.5.0 çalıştırması yeniden okuma yapar. Sonraki aynı ayarlar önbelleği kullanır. Dava klasörü içindeki `[abcdef12]` benzeri kodlar içerik değildir; Markdown başlıkları rapordaki tam etiketlerden üretilir. Özgün fiziksel yollar manifestte SRC kimliğiyle bulunabilir. Okunabilir kopya, ana evrakın tam başlıklı klasörüne `Ana evrak` dosyasını ve eklerini yazar; SHA-256 ile doğrular. Kopya sonundaki `okunabilir-arsiv.json`, özgün/kopya yolu, tam etiket ve hash eşlemesini tutar. Bilinmeyen mevcut dosyalar ve kullanıcının değiştirdiği kopyalar üzerine yazılmaz. Çok uzun yollarda sözcük sınırında `…` gerekebilir; tam ad eşleme kaydında korunur.

| Biçim | Yöntem / kaynak referansı |
| --- | --- |
| UDF | ZIP içindeki `content.xml` veya doğrudan XML; CDATA metni ve `<data>` alanları. Özgün sayfa numarası uydurulmaz; bölüm referansı kullanılır. |
| PDF | Sıralanmış doğal metin; tam sayfa tarama, bozuk Unicode, seyrek metin veya kullanıcı zorlamasında sayfa rasterleştirilip OCR yapılır. Bozuk eski metin yeni OCR metnine eklenmez; yerel önbellekte denetim için tutulur. Sayfa numarası korunur. |
| TIFF/JPG/PNG | Her görsel/kare için Türkçe+İngilizce Tesseract OCR; otomatik yön algılama. |
| ZIP | İçerikler bellekte okunur; alt dosyalar aynı kaynak zincirine bağlanır. Özgün dosyalar dışarıya açılıp çalıştırılmaz. |
| HTML | Betik/stil metni dışlanır; tablo satırları ve hücre sınırları korunarak metin çıkarılır. HTML çalıştırılmaz, dış kaynaklar yüklenmez. |
| TXT/CSV | UTF-8/UTF-16/Windows-1254 metin çözümleme. |

Aynı bayt içeriği tek bir `DOC-...` kimliğiyle işlenir; farklı arşiv konumları ayrı `SRC-...` kimlikleriyle saklanır. Ana evrak/ek ve ZIP üyesi ilişkileri manifestte tutulur. Dosya adlarındaki tarihler etiket olarak dizine alınır; hukuki olay tarihleri oldukları varsayılmaz.

## Paket dosyaları

- `belgeler/DOC-....md`: belge metni, bütün kaynak konumları, sayfa/bölüm ve çıkarım yöntemi.
- `parcalar.jsonl`: kaynaklı, karakter aralıkları belirli ve kısmen örtüşen arama parçaları.
- `arama.sqlite`: FTS5 tam metin arama dizini. Türkçe büyük/küçük harf normalleştirmesi uygulanır; bu bir anlamsal embedding araması değildir.
- `manifest.json`: boyutlar, SHA-256, kaynak/ebeveyn ilişkileri, biçimler ve çıkarım durumları.
- `TARIH_DIZINI.md`: dosya adlarından otomatik tarih dizini.
- `KONTROL_GEREKENLER.md`: boş/düşük güvenli OCR birimleri ve çıkarım hataları.
- `sonuc.json`: son kapsam sayıları ve özgün dosyaların SHA-256 ile değişmediği kontrolü.
- `cache/`: yalnızca yerel yeniden çalıştırma önbelleği; paylaşım ZIP’ine dahil edilmez.

OCR güven puanı doğruluk garantisi değildir. El yazısı, mühür, imza, çizim/kroki ve tablo ilişkileri yalnızca metinle tam temsil edilemez. Kritik ad, sayı ve tarih özgün sayfadan kontrol edilmelidir. Araç kaynak metni bir LLM’ye düzelttirmez, eksik metni tahmin ederek doldurmaz.

## Kurulum / komut satırı

Python 3.12 ve Tesseract 5 gerekir. Bu bilgisayarda Tesseract zaten kuruluydu. Python bağımlılıkları proje `.venv` ortamına kuruldu; sistem Python paketleri değiştirilmedi. Resmî Tesseract `tessdata_fast` deposunun sabit revizyonundaki tur/eng/osd modelleri proje içine indirildi ve SHA-256 ile doğrulandı.

```powershell
& .\tools\setup-ai.ps1
& .\tools\setup-quality.ps1
& .\tools\install-native-host.ps1 -ExtensionId $ExtensionId
& .\.venv\Scripts\python.exe tools\ai_prepare.py build --source 'DAVA_KLASORU' --workers 3
& .\.venv\Scripts\python.exe tools\ai_prepare.py build --source 'DAVA_KLASORU' --report 'uyap-arsiv-raporu.json'
& .\.venv\Scripts\python.exe tools\ai_prepare.py build --source 'DAVA_KLASORU' --report 'uyap-arsiv-raporu.json' --profile quality --readable-copy
& .\.venv\Scripts\python.exe tools\ai_prepare.py search --package 'DAVA_KLASORU__AI' --query 'bilirkişi raporu'
```

ZIP için 3 iç içe arşiv, 2.000 üye, 128 MiB tek üye ve 512 MiB toplam açılmış boyut sınırı vardır. Şifreli/güvensiz üyeler açık hata olarak raporlanır. OCR çağrıları sayfa başına 120 saniye ile sınırlıdır. Dönüşüm durursa mevcut önbellek korunur; aynı kaynak ve çıktı klasörüyle tekrar çalıştırılabilir.

Bağlayıcı kaydı yalnızca geçerli Windows kullanıcısının `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.uyap.archive_ai` anahtarına yazılır. `allowed_origins` tam eklenti kimliğiyle sınırlıdır. İzinli arşiv kökü varsayılan Windows İndirilenler klasörünün `UYAP` altıdır; farklı konum için bir kerelik `install-native-host.ps1 -ArchiveRoot 'TAM_YOL'` gerekir. Eklenti başka klasöre taşındığında kimlik değişirse kayıt yeni kimlikle güncellenmelidir. Üretilen mutlak yollar `tools/native-runtime` içindedir ve Git’e alınmaz. Yerel iş raporları `%LOCALAPPDATA%\UyapArchiveAI\jobs` içindedir. Kaldırmak için `tools/uninstall-native-host.ps1` çalıştırılır; özgün belgeler ve paketler korunur.

## Doğrulama

Sentetik testler UDF CDATA+alanlarını, düz XML UDF’yi, ZIP kaynak zincirini ve yol geçişi reddini, metin parçası aralıklarını, Türkçe arama/kaynak eşleşmesini, hatalı OCR çıktı biçiminin reddini ve gerçek yerel OCR motorunu denetler. Gerçek arşiv üzerinde çıkarım, özgün SHA-256 kontrolü, arama dizini ve paylaşım ZIP bütünlüğü ayrıca denetlenir. Sayfaların tamamının görsel/hukuki doğruluk denetimi yapılmış sayılmaz.

Kalite modelleri resmî `tessdata_best` deposunun `e12c65a915945e4c28e237a9b52bc4a8f39a0cec` revizyonuna sabitlendi. tur SHA-256: `e0c3338dc17503dc7d335a507c9ae01b2b46cfd07561171e1e1ac55d85e8e438`; eng: `8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba`. OSD, doğrulanmış standart modelden kopyalanır. Modeller `tools/ocr-best` içindedir ve Git’e alınmaz.

Kaynaklar: [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging), [PyMuPDF metin çıkarımı](https://pymupdf.readthedocs.io/en/latest/recipes-text.html), [Tesseract kalite modelleri](https://tesseract-ocr.github.io/tessdoc/Data-Files-in-tessdata_best.html), [OCR kalitesi ve DPI](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html), [standart modeller](https://github.com/tesseract-ocr/tessdata_fast/tree/87416418657359cb625c412a48b6e1d6d41c29bd).
