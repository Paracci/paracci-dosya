/* Self-contained so the same parser can be tested against DOM fixtures. No requests. */
function scanUyapDocument() {
  const text = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const direct = (el, selector) => Array.from(el.children).find(child => child.matches(selector));
  const tree = document.querySelector('#browser');
  const title = text(document.querySelector('#dosyaTitle'));
  if (!tree || !title || !tree.closest('#dosya_evrak_bilgileri_result')) {
    throw new Error('UYAP’ta bir dosyanın Evrak sekmesini açın.');
  }
  const modal = tree.closest('.modal-content');
  if (modal && !modal.getClientRects().length) throw new Error('Evrak penceresi açık olmalı.');
  const all = Array.from(tree.querySelectorAll('span.folder')).find(el => text(el) === 'Tüm Evraklar');
  const allList = all && direct(all.parentElement, 'ul');
  if (!allList) throw new Error('Tüm Evraklar ağacı tanınamadı.');
  const scripts = Array.from(document.querySelectorAll('script')).map(s => s.textContent || '')
    .filter(s => s.includes('evrakSolClickMenu') && s.includes('downloadDoc'));
  if (scripts.length !== 1) throw new Error('UYAP kaydetme bağlantısı tekil olarak doğrulanamadı.');
  const source = scripts[0];
  const caseMatch = source.match(/var\s+dosyaId\s*=\s*'([^']+)'/);
  const jurisdictionMatch = source.match(/\.contextMenu\(\s*'([0-9]+)'\s*,\s*dosyaId/);
  if (!caseMatch || !jurisdictionMatch) throw new Error('UYAP kaydetme biçimi değişmiş; indirme başlatılmadı.');
  const context = { caseToken: caseMatch[1], jurisdiction: jurisdictionMatch[1] };
  const records = [], groups = [], warnings = [];
  function walk(list, folders, parent = null) {
    for (const li of Array.from(list.children).filter(el => el.matches('li'))) {
      const label = direct(li, 'span.folder, span.file');
      const children = direct(li, 'ul');
      if (!label) continue;
      if (label.matches('span.folder')) {
        const folder = text(label).replace(/\s*\(\d+\)\s*$/, '');
        if (folders.length === 0) groups.push(folder);
        if (children) walk(children, [...folders, folder], parent);
        else warnings.push(`${folder}: alt liste bulunamadı.`);
        continue;
      }
      const token = label.getAttribute('evrak_id');
      if (!token) { warnings.push(`${text(label)}: belge kimliği yok.`); continue; }
      const record = {
        token, label: text(label), folders: [...folders], parentToken: parent?.token || null,
        parentLabel: parent?.label || null, isAttachment: !!parent,
        mainDocumentId: label.getAttribute('ana_evrak_id') || null,
        parentRef: parent?.ref || null,
        ref: JSON.stringify([folders, parent?.ref || null, token, text(label)])
      };
      if (folders.length < 2) warnings.push(`${record.label}: dosya veya evrak türü eksik.`);
      records.push(record);
      if (children) walk(children, folders, record);
    }
  }
  walk(allList, []);
  if (!records.length) throw new Error('Arşivlenecek evrak bulunamadı.');
  const typesByToken = new Map();
  for (const record of records.filter(r => !r.isAttachment)) {
    const types = typesByToken.get(record.token) || new Set();
    types.add(record.folders.at(-1)); typesByToken.set(record.token, types);
  }
  for (const record of records) record.documentTypes = [...(typesByToken.get(record.token) || [])];
  const result = document.querySelector('#dosya_evrak_bilgileri_result');
  const pageText = text(result);
  const page = pageText.match(/Toplam\s+(\d+)\s+sayfadan\s+(\d+)/i);
  if (!page) warnings.push('Sayfa sayısı doğrulanamadı.');
  else if (Number(page[1]) !== 1) warnings.push(`Bu dava ${page[1]} sayfa. İlk sürüm yalnızca tek sayfalı evrak ağaçlarını arşivler.`);
  // Counts belong to main documents; attachment counts are separate.
  for (const folder of allList.querySelectorAll('span.folder')) {
    const expected = text(folder).match(/\((\d+)\)\s*$/);
    if (!expected) continue;
    const list = direct(folder.parentElement, 'ul');
    const actual = list ? Array.from(list.children).filter(li => li.matches('li') && direct(li, 'span.file')).length : 0;
    if (actual !== Number(expected[1])) warnings.push(`${text(folder)}: ${actual} ana evrak okunabildi.`);
  }
  return { title, context, groups, records, warnings, pageCount: page ? Number(page[1]) : null,
    scannedAt: new Date().toISOString() };
}

// Runs only after the worker has armed a single, matching download.
function invokeUyapDownload(expectedTitle, expectedCaseToken, jurisdiction, token, expectedMenuId='12573') {
  if (location.origin !== 'https://vatandas.uyap.gov.tr') throw new Error('UYAP adresi değişti.');
  if(!['12573','28934'].includes(expectedMenuId)||new URL(location.href).searchParams.get('menuId')!==expectedMenuId)throw new Error('Sorgulama bölümü değişti. Yeniden tarayın.');
  const title = document.querySelector('#dosyaTitle')?.textContent.replace(/\s+/g, ' ').trim();
  const tree = document.querySelector('#browser');
  if (title !== expectedTitle || !tree || !tree.getClientRects().length) throw new Error('Açık dava değişti. Yeniden tarayın.');
  const source = Array.from(document.querySelectorAll('script')).map(s => s.textContent || '')
    .find(s => s.includes('evrakSolClickMenu') && s.includes('downloadDoc'));
  const currentCase = source?.match(/var\s+dosyaId\s*=\s*'([^']+)'/)?.[1];
  if (currentCase !== expectedCaseToken) throw new Error('UYAP oturumu veya dava bağlantısı değişti. Yeniden tarayın.');
  const matches = Array.from(tree.querySelectorAll('span.file[evrak_id]')).filter(el => el.getAttribute('evrak_id') === token);
  if (!matches.length || typeof window.downloadDoc !== 'function') throw new Error('Belge veya Kaydet işlevi bulunamadı.');
  window.downloadDoc(token, expectedCaseToken, jurisdiction);
  return true;
}

// Self-contained isolated-world check. Only the known, static receipt format is accepted.
// Never renders or attaches the fetched HTML, and returns no document text.
async function inspectUyapHtmlDownload(downloadUrl, expectedTitle, expectedCaseToken, token) {
  const origin = 'https://vatandas.uyap.gov.tr';
  const reject = reason => ({ valid: false, reason });
  if (location.origin !== origin || new URL(downloadUrl).origin !== origin) return reject('UYAP adresi değişti.');
  const title = document.querySelector('#dosyaTitle')?.textContent.replace(/\s+/g, ' ').trim();
  const source = Array.from(document.querySelectorAll('script')).map(s => s.textContent || '')
    .find(s => s.includes('evrakSolClickMenu') && s.includes('downloadDoc'));
  const caseToken = source?.match(/var\s+dosyaId\s*=\s*'([^']+)'/)?.[1];
  const found = Array.from(document.querySelectorAll('#browser span.file[evrak_id]')).some(el => el.getAttribute('evrak_id') === token);
  if (title !== expectedTitle || caseToken !== expectedCaseToken || !found) return reject('Dava veya belge bağlantısı değişti.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(downloadUrl, { credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: controller.signal });
    if (!response.ok || !response.body || (response.url && new URL(response.url).origin !== origin)) return reject('HTML belge yanıtı alınamadı.');
    const reader = response.body.getReader(), chunks = [];
    let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 2 * 1024 * 1024) { await reader.cancel(); return reject('HTML makbuz boyutu kontrol sınırını aştı.'); }
      chunks.push(chunk.value);
    }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    const charset = response.headers.get('content-type')?.match(/charset\s*=\s*["']?([a-zA-Z0-9_-]+)/i)?.[1] || 'utf-8';
    let decoder;
    try { decoder = new TextDecoder(charset); } catch { decoder = new TextDecoder(); }
    const template = document.createElement('template');
    template.innerHTML = decoder.decode(buffer);
    const html = template.content;
    if (html.querySelector('script,iframe,frame,object,embed,form,input,button,link,base,svg,math,img,video,audio,source')) return reject('HTML belge etkin içerik veya giriş formu içeriyor.');
    for (const element of html.querySelectorAll('*')) {
      for (const attr of Array.from(element.attributes)) {
        if (/^on/i.test(attr.name) || ['src','srcset','href','xlink:href','background','poster','action','formaction','data'].includes(attr.name.toLowerCase())) return reject('HTML belge etkin bağlantı içeriyor.');
        if (element.tagName.toLowerCase() === 'meta' && attr.name.toLowerCase() === 'http-equiv' && attr.value.toLowerCase() !== 'content-type') return reject('HTML belge yönlendirme içeriyor.');
      }
    }
    const css = Array.from(html.querySelectorAll('style,[style]')).map(el => el.tagName.toLowerCase() === 'style' ? el.textContent : el.getAttribute('style')).join('\n');
    if (/url\s*\(|@import|expression\s*\(|behavior\s*:/i.test(css)) return reject('HTML belge dış kaynak veya etkin stil içeriyor.');
    const text = Array.from(html.querySelectorAll('table')).map(el => el.textContent || '').join(' ').toLocaleLowerCase('tr-TR');
    if (!text.includes('makbuz') || !text.includes('vekalet')) return reject('HTML içerik beklenen vekalet pulu makbuzuyla eşleşmedi.');
    return { valid: true, format: 'static-vekalet-pulu-makbuzu', bytes };
  } catch { return reject('HTML makbuz kontrolü tamamlanamadı; oturum veya bağlantıyı kontrol edin.'); }
  finally { clearTimeout(timeout); }
}
if (typeof module !== 'undefined') module.exports = { scanUyapDocument, invokeUyapDownload, inspectUyapHtmlDownload };
