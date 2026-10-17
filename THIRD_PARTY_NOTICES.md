# Üçüncü taraf bileşenler

Proje AGPL-3.0-only olarak sunulur. Bağımsız bileşenlerin kendi lisans/telif/dağıtım koşulları ayrıca geçerlidir. Kaynak paketi Python/Node bağımlılıklarını, Tesseract çalıştırılabilirini veya model ağırlıklarını içermez; kurulum araçları bunları kullanıcının bilgisayarına indirir.

| Bileşen | Kullanım | Lisans / resmî kaynak |
| --- | --- | --- |
| PyMuPDF / MuPDF | PDF okuma ve rasterleştirme | Açık kaynak sürüm GNU AGPL v3; Artifex ayrıca ticari lisans sunar. [Lisanslama](https://pymupdf.io/licensing) |
| Pillow | Görüntü işleme | MIT-CMU ve dağıtımındaki ek bildirimler. [Lisans](https://github.com/python-pillow/Pillow/blob/main/LICENSE) |
| Tesseract | Ayrıca kurulan OCR motoru | [Apache-2.0](https://github.com/tesseract-ocr/tesseract/blob/main/LICENSE) |
| tessdata_fast / tessdata_best | Dil/yön modelleri | Apache-2.0: [fast](https://github.com/tesseract-ocr/tessdata_fast/blob/main/LICENSE), [best](https://github.com/tesseract-ocr/tessdata_best/blob/main/LICENSE) |
| linkedom | Geliştirme/test DOM ortamı | [ISC](https://github.com/WebReflection/linkedom/blob/main/LICENSE) |

Sürümler `requirements-ai.txt` ve `package-lock.json` içindedir. Model revizyonları/hashleri kurulum betiklerinde sabittir. Geçişli bağımlılıkların lisansları da dağıtımda incelenmelidir. İkili/kurucuya bağımlılık eklerseniz ilgili kaynak, lisans ve bildirim yükümlülüklerini ayrıca yerine getirin.

Simge built-in imagegen ile proje için üretilmiştir. Prompt: `docs/BRANDING.md`. Marka tescili/münhasır hak garantisi verilmez. Resmî kurum logoları kullanılmaz.
