# Herkese açık kaynak hazırlama

Proje adı **Paracci Dosya**, önerilen repo adı **paracci-dosya**. Bu adın kullanımı marka tescili veya münhasır hak iddiası değildir. Yayın lisansı AGPL-3.0-only; PyMuPDF açık kaynak lisansı ve diğer bileşen bildirimleri ayrıca incelenmelidir.

## Kaynak paketi

1. `npm ci --ignore-scripts`, Node/Python testleri ve `npm run check` çalıştırın. PASS/FAIL/SKIP sonuçlarını ayrı kaydedin.
2. `npm run public:check` ile izinli kaynakları kontrol edin. Bu desen kontrolü tam sır/kişisel veri denetimi değildir; kodu, belgeleri ve görselleri ayrıca gözden geçirin.
3. `npm run public:export` ile `artifacts/public` altında **yeni** kaynak kopyası oluşturun. SHA-256 envanteri `PUBLIC_EXPORT.json` içindedir.
4. GitHub deposunu bu temiz kopyadan yeni geçmişle başlatın. `.git`, eski branch/tag, yama, eski ZIP veya çalışma klasörünü kopyalamayın. Eski bir yerel geçmiş, çalışma ağacı temizlense bile kişisel e-posta ve kaldırılmış belge örnekleri taşıyabilir. `git archive HEAD` de bu sürüm için sağlanan izinli kaynak dışa aktarımının yerine geçirilmemelidir.
5. İlk commit öncesi GitHub hesabınızın doğrulanmış **noreply** adresini kullanacak şekilde yeni deponun **yerel** Git yazar ayarlarını kontrol edin. Başka bir kişinin adresini veya tahmini GitHub kimliğini kullanmayın.
6. Üretilecek kaynak ZIP’inde `.git`, `.env`, gerçek evrak/rapor, OCR metni, SQLite/önbellek, bağlayıcı `config.json`, log ve kişisel kullanıcı yolu olmadığını doğrulayın. Kapsam dışındaki yerel dosyaların varlığı yayın paketine eklenmeleri için gerekçe değildir.

## Dağıtım sınırı

`npm run package` yalnızca Chrome kaynaklarını ve simgeleri paketler; Python/model/bağlayıcı ayarlarını içermez. Bu sürüm imzalı kurucu veya Chrome Web Store yayını değildir. Yeni bir makinede eklenti kimliği/indirme kökü kullanıcı tarafından bir kez kaydedilir. İkili bağımlılıkları daha sonra dağıtıma eklerseniz ilgili lisans/kaynak/bildirimleri tekrar değerlendirin.

Yayın öncesi portalın güncel otomasyon/işlem sınırlarını, KVKK veri yaşam döngüsünü, resmî bağlantı izlenimi oluşmamasını ve lisans yükümlülüklerini inceleyin. Yasal açıklama eklenmesi bunların yerine geçmez. Bu rehber GitHub’a gönderme/yayınlama işlemi yapmaz; depo oluşturma, push ve mağaza yayını ayrı işlemlerdir.
