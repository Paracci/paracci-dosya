(function (root) {
  'use strict';
  function safePart(value, limit = 64) {
    let part = String(value || '').normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_')
      .replace(/\s+/g, ' ').replace(/^[ .]+|[ .]+$/g, '');
    if (!part || part === '.' || part === '..') part = 'Adsız';
    if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)) part = '_' + part;
    return Array.from(part).slice(0, limit).join('').replace(/[ .]+$/g, '') || 'Adsız';
  }
  function bareToken(value) { return String(value || '').replace(/^"|"$/g, ''); }
  async function digest(value) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
  }
  function datedLabel(label) {
    const match = label.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
    return match ? `${match[3]}-${match[2]}-${match[1]} ${label.replace(match[0], '').trim()}` : label;
  }
  async function makePlan(snapshot, rootFolder = 'UYAP') {
    const caseKey = await digest(snapshot.title);
    const maxFolders = Math.max(2, ...snapshot.records.map(record => record.folders.length));
    const folderBudget = Math.min(44, Math.floor((205 - (16 + 43 + 37 + 37 + maxFolders + 3) - maxFolders * 9) / maxFolders));
    if (folderBudget < 8) throw new Error('Klasör ağacı Windows için çok derin.');
    const unique = new Map();
    const reference = record => record.ref || JSON.stringify([record.folders, record.parentToken || null, record.token, record.label]);
    for (const record of snapshot.records) {
      // The same document may be referenced as an attachment AND a standalone record.
      // Preserve each logical placement; deduplicate only an identical tree occurrence.
      unique.set(reference(record), record);
    }
    const result = [];
    for (const record of unique.values()) {
      if (record.folders.length < 2) throw new Error('Belgenin dosya ve evrak türü klasörü eksik.');
      const key = await digest(`${caseKey}\n${reference(record)}`);
      let parent = record;
      const ancestors = new Set([reference(record)]);
      while (parent.parentToken) {
        const candidates = parent.parentRef ? [unique.get(parent.parentRef)].filter(Boolean)
          : Array.from(unique.values()).filter(r => bareToken(r.token) === bareToken(parent.parentToken) && JSON.stringify(r.folders) === JSON.stringify(parent.folders));
        parent = candidates.length === 1 ? candidates[0] : null;
        if (!parent) throw new Error('Ekin ana evrakı bulunamadı.');
        const ancestor = reference(parent);
        if (ancestors.has(ancestor)) throw new Error('Evrak eklerinde döngü bulundu.');
        ancestors.add(ancestor);
      }
      const parentKey = await digest(`${caseKey}\n${reference(parent)}`);
      const dateLabel = datedLabel(record.label);
      const parentLabel = datedLabel(parent.label);
      const segments = [{ label: rootFolder, suffix: '', limit: 16 },
        { label: snapshot.title, suffix: ` [${caseKey.slice(0, 8)}]`, limit: 32 }];
      for (let i = 0; i < record.folders.length; i++) {
        const folderKey = await digest(`${caseKey}\n${record.folders.slice(0, i + 1).join('\n')}`);
        segments.push({ label: record.folders[i], suffix: ` [${folderKey.slice(0, 6)}]`, limit: folderBudget });
      }
      segments.push({ label: parentLabel, suffix: ` [${parentKey.slice(0, 12)}]`, limit: 22 });
      segments.push({ label: dateLabel, suffix: ` [${key.slice(0, 12)}]`, limit: 22 });
      const values = () => segments.map(s => safePart(s.label, s.limit) + s.suffix);
      const parts = values();
      const baseName = parts.pop();
      const directory = parts.join('/');
      result.push({ ...record, key, directory, baseName,
        state: 'pending', downloadId: null, error: null });
    }
    const paths = new Set();
    for (const item of result) {
      const path = `${item.directory}/${item.baseName}`.toLocaleLowerCase('tr-TR');
      if (paths.has(path)) throw new Error('Dosya yolu çakışması bulundu.');
      if (path.length > 225) throw new Error('Klasör yolu çok uzun. Daha kısa bir kök klasör adı seçin.');
      paths.add(path);
    }
    return { caseKey, items: result };
  }
  function matchesDownload(item, expected) {
    const needle = bareToken(expected.token);
    if (needle.length < 12) return false;
    try {
      const url = new URL(item.url);
      if (url.origin !== 'https://vatandas.uyap.gov.tr') return false;
      // Exact query value match; never substring-match another document's token.
      const rawValues = url.search.slice(1).split('&').filter(pair => pair.includes('=')).map(pair => pair.slice(pair.indexOf('=') + 1));
      for (const value of [...url.searchParams.values(), ...rawValues]) {
        let decoded = value;
        for (let i = 0; i < 3; i++) {
          if (bareToken(decoded) === needle) return true;
          try { const next = decodeURIComponent(decoded); if (next === decoded) break; decoded = next; } catch { break; }
        }
      }
    } catch { /* Not an eligible UYAP URL. */ }
    return false;
  }
  function downloadFormat(item) {
    const mime = String(item.mime || '').split(';')[0].trim().toLowerCase().slice(0, 128);
    const file = String(item.filename || '').split(/[\\/]/).pop();
    const ext = file?.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1].toLowerCase();
    return { mime, extension: ext || null };
  }
  function isHtmlDownload(item) {
    const { mime, extension } = downloadFormat(item);
    return ['text/html', 'application/xhtml+xml'].includes(mime) || ['html','htm'].includes(extension);
  }
  function isReceiptRecord(item) {
    return [...(item.documentTypes || []), ...(item.folders || [])].includes('Vekalet Pulu Makbuzu');
  }
  function extensionFor(item, validatedReceipt = false) {
    const { mime, extension: ext } = downloadFormat(item);
    if (['exe','com','bat','cmd','ps1','js','vbs','msi','scr'].includes(ext)) throw new Error('Beklenmeyen dosya biçimi; indirme durduruldu.');
    if (mime === 'application/json') throw new Error('Belge yerine giriş/hata sayfası döndü. UYAP oturumunu kontrol edin.');
    if (isHtmlDownload(item)) {
      if (!validatedReceipt) throw new Error('HTML belge doğrulanamadı; giriş/hata sayfası veya desteklenmeyen HTML olabilir.');
      return ext === 'htm' ? '.htm' : '.html';
    }
    if (ext) return '.' + ext;
    return ({'application/pdf':'.pdf','application/zip':'.zip','image/tiff':'.tif','image/jpeg':'.jpg','image/png':'.png','text/xml':'.xml','application/xml':'.xml','text/plain':'.txt'})[mime] || '.bin';
  }
  function outputPath(item, download) { return `${item.directory}/${item.baseName}${extensionFor(download, item.htmlValidation?.valid === true)}`; }
  function resolveOutputPath(expected, absolute) {
    if (typeof expected !== 'string' || typeof absolute !== 'string') return null;
    const actual = absolute.replace(/\\/g, '/');
    if (actual.endsWith('/' + expected)) return expected;
    const split = expected.lastIndexOf('/');
    if (split < 0) return null;
    const directory = expected.slice(0, split);
    const last = actual.lastIndexOf('/');
    if (!actual.slice(0, last).endsWith('/' + directory)) return null;
    const filename = expected.slice(split + 1), dot = filename.lastIndexOf('.');
    if (dot <= 0) return null;
    const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp('^' + escape(filename.slice(0, dot)) + ' \\([1-9][0-9]*\\)' + escape(filename.slice(dot)) + '$');
    const actualName = actual.slice(last + 1);
    return pattern.test(actualName) ? directory + '/' + actualName : null;
  }
  function receivedSize(download) {
    // fileSize=-1 is explicitly "unknown" in the Chrome API, not an empty file.
    // A known zero remains authoritative; expected totalBytes is never completion proof.
    if (Number.isFinite(download.fileSize) && download.fileSize >= 0) return download.fileSize;
    return Number.isFinite(download.bytesReceived) && download.bytesReceived > 0 ? download.bytesReceived : null;
  }
  function isUyapUrl(url) { try { return new URL(url).origin === 'https://vatandas.uyap.gov.tr'; } catch { return false; } }
  const isSafeDanger=value=>['safe','accepted','allowlistedByPolicy','deepScannedSafe'].includes(value);
  const canLearnRoute=value=>['safe','allowlistedByPolicy','deepScannedSafe'].includes(value);
  const api = { safePart, bareToken, digest, makePlan, matchesDownload, downloadFormat, isHtmlDownload, isReceiptRecord, extensionFor, outputPath, resolveOutputPath, receivedSize, isUyapUrl,isSafeDanger,canLearnRoute };
  if (typeof module !== 'undefined') module.exports = api;
  else root.ArchiveCore = api;
})(globalThis);
