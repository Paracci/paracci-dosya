# Gizlilik ve yerel veri yaşam döngüsü

Paracci’nin belge yükleme, hesap veya analitik/telemetri servisi yoktur. Kurulum ağı, portal indirmeleri ve yerel hazırlama ayrı akışlardır.

| Veri | Konum | Saklama / silme |
| --- | --- | --- |
| Açık ağaç, tokenlar, geçici plan | Chrome storage.session | Tarayıcı oturumu; yeniden tarama planı değiştirir. |
| Deneysel Danıştay tercihi | Chrome storage.session | Yalnızca seçilen sekme ve bölüm; tarayıcı oturumu bitince silinir. Yeni izin veya hesap erişimi vermez. |
| İndirme özeti, Chrome indirme kimliği, yol/zaman | Chrome storage.local; en çok 10.000 geçmiş kaydı | Eklenti verileriyle silinir; normal dosya/Chrome geçmişi ayrı kalır. |
| Son AI iş kimliği/yolu | Chrome storage.local; ilerleme session | Eklenti verileriyle silinir; Python iş kayıtlarını silmez. |
| Koyu/açık tema | Eklenti localStorage | Yalnızca dark/light; belge verisi içermez. |
| Özgün dosyalar | Seçilen İndirilenler/arşiv klasörü | Kullanıcı yönetir; ayrıca şifrelenmez. |
| Markdown/ZIP/dizin/OCR önbelleği | Kaynak klasör yanındaki __AI | Kullanıcı yönetir; önbellek/dizin de belge metni içerir. |
| Okunabilir kopya ve eşleme | Arşiv kökündeki Okunabilir | Kullanıcı yönetir; özgünler ayrıca kalır. |
| AI iş durumu, etiket raporu ve hata kaydı | %LOCALAPPDATA%\UyapArchiveAI\jobs | Kullanıcı yönetir; başlık/yol/hata bağlamı içerebilir. |
| Bağlayıcı kurulum yolları | tools/native-runtime ve kullanıcının HKCU kaydı | Seçilen origin/kök ile sınırlı; kaynak dışa aktarımına alınmaz. |
| Tek ZIP geçici evrak parçaları | İzinli arşiv kökündeki .paracci-stage | Hassas özgün belge bytes; tamamlananlar kesintide korunur, başarılı bitişte geçici veri temizlenir. Kullanıcı yönetir; ayrıca şifrelenmez. |
| Tek ZIP planı, opak evrak kimlikleri, yollar, hashler | %LOCALAPPDATA%\UyapArchiveAI\archives | Kullanıcı yönetir; devam için kalır. Auth URL/token/çerez içermez. |
| Son toplu iş özeti | Chrome storage.local bundleCheckpoint | Arşiv kimliği, dava başlığı ve zaman; eklenti verileriyle silinir, dosyaları silmez. |
| Geçici indirme URL şablonu | Chrome storage.session | Yalnızca mevcut dava/oturum; tarayıcı kapanınca silinir. Yerel motora gönderilmez. |
| İlk bağımlılık/model kurulumu | Paket dizini ve resmî upstream | IP gibi ağ verileri oluşabilir; dava belgesi gönderilmez. |
| Belge indirme ve makbuz kontrolü | Mevcut oturumla UYAP | Portal koşulları geçerlidir; şifre/çerez okuma izni istenmez. |

Dosya adları/yollar/raporlar hassas olabilir. Hash kullanılması kalan metni anonimleştirmez. OS, tarayıcı profili, antivirüs, yedekleme ve bulut eşleme bu aracın dışında veri işleyebilir. Yerel çalışma bu ortamların da çevrimdışı olduğuna garanti değildir.

ZIP’i AI hizmetine elle yüklemek ayrı aktarım işlemidir. Paket anonimleştirmez; hukuki sebep/şartlar ve gerektiğinde yurt dışı aktarım düzeni değerlendirilmelidir. Gerçek belge, rapor veya ekranı herkese açık issue’ya eklemeyin; sentetik örnek kullanın.

Saklama ihtiyacınızı değerlendirin. Özgün, AI, kopya, rapor, iş kaydı, Chrome geçmişi ve yedekler ayrı kopyalardır. Araç güvenli disk silme garantisi sunmaz. `tools/uninstall-native-host.ps1` yalnızca bu kuruluma ait Chrome bağlayıcı kaydını kaldırır; belgeleri, modelleri ve iş kayıtlarını silmez. Kaldırma/silme öncesi çalışan işleri bitirin.

KVKK rolleri/yükümlülükleri somut kullanım bağlamına bağlıdır. [Yasal bilgiler](LEGAL.md).

Sihirbazın periyodik kontrolü DOM okumasıdır; oturumu uzatmak için periyodik HTTP isteği yapmaz. Klasik indirme hatasında oturum tanısı için sınırlı aynı-origin belge isteği yapılabilir; yanıt metni rapora/depolamaya yazılmaz. Tek ZIP, aynı oturumda tarayıcıdan belge bytes’ını yerel motora aktarır; Chrome indirme güvenlik UI’sini kullanmaz. [Tek ZIP ayrıntıları](BUNDLE.md).
