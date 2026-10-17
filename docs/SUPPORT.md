# Portal bölümleri ve deneysel destek

| Bölüm | Destek | Kanıt sınırı |
| --- | --- | --- |
| Dosya Sorgulama (`12573`) | Klasik indirme, sihirbaz ve deneysel Tek ZIP | Kullanıcı Hukuk/Ceza arşivlerini ve 0.7.0 tek evrak ZIP/sihirbaz akışını çalıştırdığını bildirdi. Diğer yargı türleri ayrı gerçek örneklerle doğrulanmadı. |
| Danıştay Dosya Sorgulama (`28934`) | **Deneysel, varsayılan kapalı; klasik indirme** | Sorgu kontrolleri, dosya görüntüleme kodu ve evrak bağlantısı canlı sayfada incelendi. Hesapta dosya yoktu; gerçek evrak ağacı, Kaydet yanıtı ve eksiksiz indirme doğrulanmadı. |
| AYM Bireysel Başvuru Sorgulama (`22016`) | Belirsiz / desteklenmiyor | Boş başvuru listesi gözlemlendi; evrak indirme akışı doğrulanmadı. Sayfada ortak gizli modal bulunması tek başına uyumluluk kanıtı değildir. |
| Duruşma Sorgulama (`12577`) | Desteklenmiyor | Tarih aralığı / duruşma listesi gözlemlendi; desteklenen evrak arşivleme akışı bulunmadı. |
| Alo Adalet Başvurularım (`37120`) | Desteklenmiyor | Başvuru bulunmadığı bildirildi; evrak indirme akışı doğrulanmadı. |
| İBAN sorgulaması ve diğer menüler | Desteklenmiyor | Bir menünün varlığı indirme desteği anlamına gelmez. |

Bu tablo sunucunun bütün belge türlerini kapsayan bir uygunluk belgesi değildir. Portal değişiklikleri desteği etkileyebilir. **Deneysel gerçek işlem yapabilir; demo değildir.** Etiket, doğrulama eksiğini açıklar.

## Danıştay denemesi

1. UYAP’ta normal girişle Danıştay Dosya Sorgulama’yı açın ve eklenti simgesine tıklayın.
2. Uyarıyı okuyup **Bu UYAP sekmesinde deneysel Danıştay desteğini aç** seçimini yapın. Başka sekmeye aktarılmaz; tarayıcı oturumu dışında saklanmaz. Aktif indirme varken değiştirilemez.
3. Danıştay Dairesi → Dosya Sorgula → seçtiğiniz satırın Dosya Görüntüle → Evrak. Dosya yoksa sihirbaz bunu bildirir. Rehber sorgulamaya veya dava seçimine sizin yerinize basmaz.
4. **Dosyayı tara**. Yalnızca mevcut `Tüm Evraklar` ağacı, ana/ek kimlikleri, tekil Kaydet bağlamı, sayfa ve sayı kontrolleri geçerse plan oluşur. Danıştay’dan gelen bir ağacın farklı olması durumunda endpoint/evrak kimliği tahmin edilmez; işlem durur.
5. Önce klasik **Bir evrak ve eklerini dene** kullanın. Dosyaları ve ek ilişkisini özgün portal görünümüyle kontrol ettikten sonra Devam et ile tam plana geçebilirsiniz. Klasik indirme Chrome bildirimlerini kullanır.

**Tek ZIP ve sessiz bağlantı kalibrasyonu Danıştay’da engellenir.** Gerçek örnek ve indirme yanıtlarıyla ayrıca doğrulanmadan mevcut Dosya Sorgulama akışı genişletilmez. Yerel AI hazırlama, klasik arşiv başarıyla tamamlanırsa mevcut yerel kurallarla kullanılabilir.

Plan kaynak menüye bağlanır. Aynı dava başlığı başka menüde görünse bile eski plan yeni bölümde indirme başlatmaz. Sekme/bölüm değişiminde yeniden taramak gerekir. UYAP origin, dava/evrak kimliği, oturum ve dosya kontrolleri deneysel seçenekte de uygulanır; erişim yetkisi genişletilmez, giriş/ödeme/başvuru işlemleri otomatik yapılmaz.

## Katkı ve doğrulama

Gerçek dava belgelerini, kişisel bilgileri, oturum kimliklerini, URL parametrelerini veya ham sayfa kaynağını herkese açık issue’ya yüklemeyin. Menü adı, sürüm, kişisel veri içermeyen hata açıklaması ve sentetik test örnekleri tercih edilir. Yeni bölüm desteği ayrı bir tanımlı akış, kaynağa bağlama ve regresyon testleri gerektirir; genel bir “her menüde çalıştır” anahtarı yoktur.
