# Dosya Sorgulama sihirbazı ve Tek ZIP

0.7.0’ın Tek ZIP özelliği **deneyseldir**. Otomatik/sentetik testler, gerçek UYAP ağ yanıtlarının tamamının doğrulanması anlamına gelmez. Klasik indirme bağımsız seçenek olarak korunur.

## Sihirbaz

Tek ZIP için yalnızca `vatandas.uyap.gov.tr` üzerindeki **Dosya Sorgulama** (`menuId=12573`) ve bu sorgu ekranının kontrolleri birlikte kabul edilir. Normal akış: Dosya Sorgulama → Yargı Türü ve isteğe bağlı Mahkeme/Tümü → Dosya Sorgula → seçilen satırın Dosya Görüntüle düğmesi → Evrak. 0.8.0 ile eklenen [deneysel Danıştay desteği](SUPPORT.md) yalnızca klasik indirmedir; Tek ZIP veya sessiz bağlantı kalibrasyonu için kullanılamaz.

Rehber sayfa durumunu okur ve kullanıcının isteğiyle kontrolleri görsel olarak işaretler. Dava/mahkeme seçmez, sorgulamaya basmaz, oturum açmaz ve belge indirmez. Birden fazla sonuçta kullanıcı kendi satırını seçer. Kapalı dosya penceresi, yüklenen evrak ağacı, yanlış menü, boş sonuç, çevrimdışı durum ve görünen giriş/süre aşımı uyarıları farklı açıklanır. Sekme veya dava değişirse eski plandan aktarım başlamaz.

## İndirme rotası

Sistem özel bir indirme endpoint’i tahmin etmez. Yalnızca eklentinin kendi planındaki tam evrak kimliğiyle eşleşen normal Chrome Kaydet kaydından URL şablonu öğrenilir. Şablon aynı dava başlığı/bağlantısıyla sınırlıdır; başka origin veya kısmi kimlik eşleşmesi kabul edilmez. Önceki doğrulanmış indirme kaydı varsa taramada kullanılır. Yoksa **Bağlantıyı doğrula · 1 dosya** normal bir dosya indirir; bu ilk doğrulama bildirimi tamamen gizlenmez.

Rota ancak indirme tamamlanıp Chrome’un güvenli/derin taramada güvenli/kurum politikasıyla izinli kararı alındıktan sonra öğrenilir. Kullanıcının tehlike uyarısını kabul ettiği `accepted` kararı klasik dosyayı tamamlayabilir; sessiz rota kalibrasyonu için kullanılmaz. Bilinmeyen/bekleyen/tehlikeli Chrome kararları başarılı indirme sayılmaz. Bu kararlar daha sonraki sessiz dosyaların tarandığı anlamına gelmez.

Sonraki **Tek ZIP topla / devam et** kullanıcı başlatımıyla çalışır. Tarayıcının mevcut aynı-origin oturumu kullanılır; şifre/çerez okunmaz ve Python’a aktarılmaz. Her dosya ve her parçada açık dava/evrak yeniden kontrol edilir. İstekler sırayla yapılır. Sunucunun şablon/nonce/başlık davranışı uyumsuzsa işlem durur; farklı endpoint veya yetki aşımı denenmez. Klasik modla kontrol edilebilir.

İlk canlı kontrol için **Tek evrakla dene** seçeneği yalnızca bir ana evrakı kapsayan ZIP hazırlayıp duraklar. Bu dosya tüm dava olarak gösterilmez. Sonrasında tam planla devam edilebilir; doğrulanmış aynı evrak yeniden kullanılabilir. Bu deneme de gerçek portal isteği/dosya işlemi yapar.

## Disk ve güvenlik

Akış bellek içinde bütün davayı biriktirmez. Yerel motorun izinli arşiv kökündeki `.paracci-stage` altında bilinen evrak anahtarlarıyla geçici parçalar yazılır. Her parça sırası/boyutu ve dosya türü kontrol edilir. Evrak ancak EOF, varsa uygun Content-Length, dosya imzası ve SHA-256 kontrolünden sonra tamamlanmış sayılır. Veri ve kontrol kayıtları diske flush/fsync edilir. Bu, sunucudaki belgenin hukuki geçerliliği/eksiksizliği değildir.

Hatalı HTML MIME/uzantı bilgisi tek başına gerçek PDF/TIFF gibi bilinen ikili dosya imzasını değiştirmez. ZIP olarak bildirilen bir UDF, sınırlı `content.xml` template kontrolüyle `.udf` olarak korunabilir; içerik değiştirilmez. Metadata düzeltmesi hukuki belge doğrulaması değildir.

Yalnızca planlanan dava kökü ve sabit dosya türleri kabul edilir. Çalıştırılabilir uzantılar, yol geçişi ve symlink/junction yolları reddedilir. HTML yalnızca tanınan statik makbuz bağlamında kabul edilir. Native akış mesajı yalnızca aktif tek kullanımlık aktarım nonce’u, eklenti kimliği, üst çerçeve ve seçilen portal sekmesiyle eşleşirse işlenir. Yerel motor ağ isteği yapmaz, çerez/URL saklamaz ve ağ portu açmaz.

Tüm evraklar tamamlanınca özgün klasör ağacı yayımlanır, ardından tek ZIP içerik/hash kontrolüyle oluşturulur. Farklı mevcut dosyalar üzerine yazılmaz; ZIP adı çakışırsa numara eklenir. ZIP doğrulanmadan iş başarılı sayılmaz. Sonuç `UYAP/<dava klasörü>` ve `UYAP/<dava klasörü>.zip` konumundadır; Chrome indirme listesinde görünmesi beklenmez. Geçici tamamlanmış veri kopyaları başarılı bitişten sonra kaldırılır. En yüksek anda parçalar + klasör + ZIP için ek disk alanı gerekir.

**Chrome’un indirme arayüzü ve bu arayüzün dosya uyarıları kullanılmaz.** Bunlar küresel olarak kapatılmaz; klasik mod Chrome indirmeleriyle çalışır. Yerel dosya/antivirüs korumanızı değerlendirin. Uzantı/imza sınırları bir kötü amaçlı içerik tarayıcısı değildir. ZIP/özgün belgeler otomatik çalıştırılmaz; açma kullanıcı düğmesidir.

Sınırlar: en çok 4.000 evrak ve 3 MiB plan mesajı, tek evrak 256 MiB, plan toplamı 8 GiB, parça 96 KiB; 120 saniye veri/ilerleme gelmezse istek durur. Yerel kökün uzunluğu Windows yol sınırını aşarsa başlatma reddedilir. Disk dolması/yerel yazma hatası tamamlandı sayılmaz. Limit dışındaki belge için klasik mod veya uygun yeni geliştirme gerekir.

## Kesintiden devam

- İnternet/oturum kesilince yeni evrak başlatılmaz. Tamamlanmış evraklar kalıcı hash kayıtlarıyla korunur; yarım evrak tamamlandı sayılmaz ve tekrar baştan alınır. HTTP Range/bayt bazında devam desteği iddia edilmez.
- Tarayıcı/bilgisayar kapanırsa planın kimlik ve dosya kayıtları yerel motorda, son iş özeti Chrome yerel depolamasında kalır. Yeniden ilgili Dosya Sorgulama/Evrak ekranına gelip tarayın ve Tek ZIP ile devam edin. Aktarım URL/tokenları kalıcı depolamaya yazılmaz; yeni doğrulama gerekebilir.
- Yeni plan eski planla **tam evrak kimliği ve yol** üzerinden eşleşen, diskte hash’i doğrulanan tamamlanmış dosyaları kullanabilir. Yalnızca ad benzerliğine bakılarak birleştirme yapılmaz. Oturum sonrası bütün kimlikler değişirse otomatik atlama garanti edilmez; eski parçalar ayrı tutulur. Yeni dosya eklenmesi, değişmeyen kesin kimliklerin tekrar indirilmesini gerektirmez.
- Bütün evraklar diskteyse **Kaydedilen işi kontrol et / ZIP’i tamamla** UYAP’a bağlanmadan dosyaları doğrular ve ZIP’i bitirir. Eksik evrak varsa adım adım portala dönmeyi ister. Kaybolmuş/yarım ZIP, hazır evraklardan yeniden yapılabilir.
- Ani güç kaybı, disk bozulması veya kullanıcının dosyaları değiştirmesi için mutlak veri kaybı garantisi yoktur. Yeniden başlatma kontrolü eksik/değişmiş dosyayı atlamaz; farklı hedef dosya üzerine yazılmaz.

## Oturum durumu

Görünen giriş/süre aşımı mesajları ve HTTP 401/419/giriş HTML’si gibi açık belirtiler oturum/giriş uyarısı verir. HTTP 403 tek başına süre aşımı sayılmaz; yetki/oturum kontrolü istenir. İnternet kesintisi veya belirsiz redirect/ağ hatası kesin süre aşımı diye gösterilmez. Klasik indirme hatasında sınırlı aynı-origin tanı isteği yapılabilir; yanıt gövdesi rapora yazılmaz. Sadece görünür ve eski bir ekran, sunucu oturumunun hâlâ geçerli olduğunu kanıtlamaz. Kullanıcının giriş adımlarını veya CAPTCHA’yı araç tamamlamaz.

Açık süre aşımı tespit edildikten sonra aynı eski sayfa belgesinin hâlâ evrak göstermesi durumu “hazır”a geri çevirmez. Geçici oturum işareti yeni sayfa belgesi/yönlendirme ile yeniden değerlendirilir; tarayıcı oturumu dışında auth URL/token kalıcı saklanmaz.
