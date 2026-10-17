# Doğrulama kapsamı

Herkese açık bu kayıt gerçek dava/kişi bilgileri, kaynak yolları veya kurulum kimlikleri içermez. Test örnekleri sentetiktir.

Otomatik kapsam: ağaç/ek ilişkileri, tekrarlar, Windows yolları, indirme origin/token eşleşmesi, kuyruk/duraklatma/yeniden başlama, dosya boyutu/yolu/tamamlama, mevcut indirmeleri atlama, statik makbuz HTML’si ve etkin içerik reddi, sınırlı tekrar, tarama ilerlemesi, UDF/PDF/OCR/ZIP, TSV tırnakları, bozuk PDF katmanı, kalite profilleri, DOC/SRC/parça aralıkları, yerel Türkçe arama, SHA-256 aktarımı, Native Messaging origin/kök/dosya sınırları, mükerrer iş/kesinti, okunabilir kopya/çakışma/üzerine yazmama/uzun yol, tema ve açıklama kutuları, temiz kaynak dışa aktarımı.

Node testleri Chrome API’lerini simüle eder; canlı UYAP/izin ekranı kanıtı değildir. Python OCR smoke testi yalnızca yerel motor/modeller varsa çalışır; eksikse SKIP olur. Explorer açılışı testlerde mock edilir. UI önizlemesi sentetiktir. Güncel PASS/FAIL/SKIP sayıları çalıştırılan komutların çıktısından alınmalıdır.

Kurulu Chrome/izinleri, portal/oturum değişimi, sunucuya karşı eksiksizlik ve bütün sayfaların görsel/hukuki doğruluğu ayrıca doğrulama gerektirir. OCR güveni doğruluk yüzdesi değildir. Desen tabanlı yayın kontrolü kapsamlı güvenlik veya kişisel veri denetimi değildir.

## 0.6.0 yerel kontrol kaydı

16 Ekim 2026: 54 Node + 30 Python testi, **84 PASS / 0 FAIL / 0 SKIP**. Python motor/modellerinin kurulu olduğu geliştirme ortamı kullanıldı. JS sözdizimi, Python derleme ve eklenti paketleme PASS. Windows’un kısa süreli dosya okuma kilidinde durum dosyasını atomik değiştirme hatası için sınırlı retry ve regresyon testi eklendi.

Chrome’da sentetik önizlemede koyu ilk görünüm, açık temaya geçiş, yeniden yüklemede tercih, bilgi düğmesi/açıklama, Escape ve yasal ayrıntılar gözlemlendi. Ekranlar `docs/images` içindedir; PNG meta verileri dışlandı. Önizleme sekmesi ve sunucu kapatıldı. Gerçek 0.6.0 kurulu eklenti ekranı/izin adımı ve yeni bir canlı UYAP arşivleme denemesi bu UI çalışmasında NOT RUN. CI dosyası hazırlanmıştır; GitHub üzerinde çalıştırılmış sayılmaz.

Yayın kontrolü yalnızca izinli kaynaklar üzerinde yürütülür; kişisel kullanıcı yolu, gözden geçirilmemiş e-posta, olası 11 haneli kimlik, bilinen sır deseni, kurulum origin’i, beklenmeyen dosya ve symlink için koruma vardır. Ekranlar ayrıca sentetik oldukları yönünden gözden geçirildi. Eski Git geçmişi bu kontrolün temiz saydığı kapsam değildir; dışa aktarım geçmiş içermez. Geliştirme kopyasının yerel push engeli beklenen ret ile sınandı; gerçek bir remote push yapılmadı.

Temiz kaynak dışa aktarımının ayrı QA kopyasında bağımlılıklar `npm ci --ignore-scripts` ile kuruldu: 54 Node PASS, Python 28 PASS + **2 SKIP** (model/çalışan OCR kurulumuna bağlı testler; modeller kaynak paketine dahil değildir). JS ve yayın kontrolü de PASS. Bu, GitHub CI çalıştırması değildir. Kayıtlı Windows Native Messaging başlatıcısının ayrı stdio denemesi `version=0.6.0`, `ready=true`, `quality_ready=true` verdi; Chrome üzerinden yeni kurulum denemesi sayılmaz.

## 0.7.0 sihirbaz, oturum ve deneysel Tek ZIP

**77 Node + 41 Python = 118 PASS / 0 FAIL / 0 SKIP** yerel ortamda. Mevcut klasik indirme testleri korunur. Yeni testler Dosya Sorgulama dışını engelleme, filtre/sorgu/çoklu dava/modal/Evrak/yükleme/çevrimdışı/süre aşımı durumlarını, rehberin kendiliğinden sorgu/dava tıklamamasını ve eski cached ekrandan süre aşımı işaretinin kaybolmamasını kapsar. HTTP 403, bozuk/eksik yanıt ve belge içindeki benzer sözcükler otomatik süre aşımı sayılmaz.

İndirme şablonu yalnızca doğru origin ve tam evrak sorgu değerinden öğrenilir; farklı dava başlığına uygulanamaz. Stream testleri 96 KiB parça sınırı/sırası, EOF ve Content-Length doğrulaması, giriş HTML/401 reddi, nonce/eklentinin kimliği/sekme sınırı, bir evraklık denemenin durması ve farklı dava arşivinin AI kaynağı yapılamamasını denetler.

Gerçek yerel dosya I/O testleri tamamlanan/yarım evrakın ayrılmasını, hash değişimini, hedef dosyasını korumayı, ZIP/CRC/hash doğrulamasını, yarım/kaybolmuş ZIP’i yeniden üretmeyi, önceki tarayıcı dosyasını içeri almayı ve plana yeni evrak eklenince yalnızca kesin kimlikleri kullanmayı kapsar. Ayrı bir Python Native Messaging süreci, tam evrak ACK’si ve ikinci evrakın yarım parçasından sonra **zorla sonlandırıldı**; yeni süreç/depo okumasında yalnızca tamamlanan evrak korundu. Bu, fiziksel bilgisayar/güç kaybı testi değildir. Tam evraklar yereldeyse portal/oturum olmadan ZIP bitirme yolu ayrıca test edildi.

Sentetik Chrome önizlemesinde eksik adım yönlendirmesi, süre aşımı mesajı/düğme engeli, Tek ZIP çalışma göstergesi ve tek evrak denemesi görüldü. Görseller `docs/images/wizard.png` ve `bundle.png`; gerçek dava içermez. **NOT RUN:** kurulu eklentiden yeni sihirbaz overlay’i ve yeni sessiz HTTP akışının canlı UYAP denemesi. Portal statik indirme betiğine araç erişimi kapalı olduğundan endpoint tahmin edilmedi; normal Kaydet kaydı kalibrasyonu ve sınırlı canlı deneme gerekir. Başarılı demo gerçek ağ/Chrome eklenti kanıtı sayılmaz.

Son kaynak dışa aktarımının ayrı QA kopyasında `npm ci --ignore-scripts --offline` sonrasında **77 Node PASS**, Python **39 PASS / 2 SKIP** (kaynak paketine dahil edilmeyen OCR modellerine bağlı testler) alındı. JS sözdizimi ve 76 izinli kaynak dosyasının yayın kontrolü PASS. Bu kopyada gerçek UYAP isteği veya GitHub CI çalıştırılmadı.

Sonraki kullanıcı geri bildirimi 0.7.0 sihirbaz/tek evrak canlı kontrolünün çalıştığını bildirdi. Bu, bütün dava türleri, bütün arşivlerin eksiksizliği veya fiziksel kesinti testi için kanıt sayılmaz.

## 0.8.0 deneysel bölüm desteği

**84 Node + 41 Python = 125 PASS / 0 FAIL / 0 SKIP** yerel ortamda. Yeni regresyonlar Danıştay’ın farklı sorgu kontrolleri/penceresi, boş dosya durumu, varsayılan kapalı sekmeye özel seçim, menü değişiminde eski planın reddi, aktif işte seçimin değiştirilememesi, desteklenmeyen menüde ortak gizli pencerenin kabul edilmemesi ve Danıştay’da sessiz indirme/kalibrasyonun reddini kapsar.

Canlı portalda Danıştay sorgu kontrolleri, dosya görüntüleme kodu ve ortak evrak yükleme bağlantısı okundu. Hesapta Danıştay dosyası bulunmadığı görüldü; **gerçek Danıştay evrak ağacı ve indirmesi NOT RUN**. AYM’de boş başvuru tablosu, Duruşma’da tarih/listesi, Alo Adalet’te başvuru bulunmadığı durumu gözlemlendi. Bunlar için arşivleme desteği ilan edilmedi. Özgün açık dava sekmesi korunarak ayrı inceleme sekmesi kullanıldı ve kapatıldı. Başvuru/ödeme/gönderim yapılmadı.

Chrome sentetik önizlemesinde deneysel uyarı/kapalı seçim, açma-kapatmada klasik düğmelerin durumu, Tek ZIP engeli, destek tablosu ve koyu/açık tema gözlemlendi. Normal Dosya Sorgulama görünümü ayrıca kontrol edildi. `docs/images/support.png` sentetik örnektir; portal ekran görüntüsü veya dava verisi içermez. Önizleme sekmesi ve yerel sunucu kapatıldı. Kaynak yayın kontrolü, JS sözdizimi ve paketleme ayrıca yürütülür; canlı Danıştay doğrulaması yerine geçmez.

## 0.8.1 şeffaf simge ve ilk depo hazırlığı

Kullanıcının sağladığı RGBA simge 16/32/48/128/256/512 boyutlarına küçültüldü; şeffaflık korundu ve PNG meta verileri eklenmedi. Yeni görsel üretilmedi. **84 Node + 41 Python = 125 PASS / 0 FAIL / 0 SKIP**; JS sözdizimi ve 79 izinli dosyanın yayın kontrolü PASS. Yeni logo 128 pikselde ayrıca görüntülendi. Güncelleme yeni bir portal indirme denemesi içermez.

İlk depo gönderimi için izinli kaynak dışa aktarımından yeni Git geçmişi hazırlanır. Geliştirme geçmişi, kurulum ayarları, gerçek belgeler, modeller ve çalışma dosyaları taşınmaz. Yerel kontrol bir güvenlik/kişisel veri incelemesinin tüm kapsamını garanti etmez; GitHub Actions sonucu ayrıca değerlendirilir.
