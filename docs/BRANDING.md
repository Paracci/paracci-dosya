# Paracci Dosya kimliği

Ürün: **Paracci Dosya**. Repo adı önerisi: `paracci-dosya`. Paracci tarafından geliştirilen bağımsız yerel evrak arşivi. Adın kullanımı marka tescili, müsaitlik veya münhasır hak garantisi değildir.

UYAP adı yalnızca portal uyumluluğunu açıklar. Resmî kurum/e-Devlet logosu, hilal/yıldız, mühür veya resmî onay izlenimi kullanılmaz. Değiştirilmiş sürümler, özgün Paracci ürünü veya resmî kurum ürünü gibi sunulmamalıdır; yazılım lisansı ayrı uygulanır.

## Simge üretimi

İlk simge proje için built-in **imagegen** ile üretildi; CLI/API anahtarı kullanılmadı. **0.8.1’de kullanıcı tarafından sağlanan şeffaf klasör/belge PNG’si seçildi.** Bu sürümde yeni görsel üretimi veya arka plan kaldırma yapılmadı; mevcut RGBA şeffaflığı korunarak yalnızca standart boyutlara küçültüldü ve meta veriler dışlandı. Dosyalar: `extension/assets/icons/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`, `icon-256.png`, `icon-512.png`. UI/manifest aynı dosyaları kullanır. Kaynak görselin yerel adı/yolu yayın paketine eklenmez. Gerçek dava belgesi veya ekranı logo üretiminde kullanılmadı.

İlk sürümün üretim prompt’u (0.8.1’de yeni prompt kullanılmadı):

```text
Use case: logo-brand. Asset type: production Chrome extension app icon for Paracci Dosya, an independent local document archive utility. Create exactly one square app icon, not a sheet or mockup. A bold, original geometric letter P formed from a neatly layered document/folder silhouette, mint jade and pale ivory on a deep midnight-green rounded square. Flat, crisp, simple, strong silhouette readable at 16 pixels; centered with generous safe margins. Restrained premium software identity, subtly architectural. No words, no extra letters, no gradients, no tiny details, no shadows, no watermark, no justice scales, gavel, crescent, star, seals, national flags or official government/ UYAP logos. Opaque dark background, square 1024 by 1024.
```

Varsayılan palet koyu yeşil, yeşim ve fildişidir. Açık tema aynı kimliğin erişilebilir renklerini kullanır. Yalnızca tema tercihi yerel olarak hatırlanır.

Eski kurulumlarla uyum için `com.uyap.archive_ai` ve `UyapArchiveAI` teknik yerel kimlikleri korunur. Bunlar kamu kurumuna ait olma veya resmî bağlantı iddiası değildir.
