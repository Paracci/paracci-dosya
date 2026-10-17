/* No server, telemetry, cookies permission, or persistent host access. */
importScripts('core.js', 'adapter.js', 'ai_bridge.js', 'wizard.js', 'transport.js', 'bundle.js');
const C = ArchiveCore;
let serial = Promise.resolve();
const exclusive = task => { const p = serial.then(task); serial = p.catch(() => {}); return p; };
const read = async () => (await chrome.storage.session.get('job')).job || null;
const write = job => chrome.storage.session.set({ job });
const activeCount = job => (job?.active ? 1 : 0) + (job?.inFlight?.length || 0);
const isBusy = job => activeCount(job) > 0 || job?.status === 'running';
const concurrency = value => [1, 2, 3].includes(Number(value)) ? Number(value) : 2;

chrome.action.onClicked.addListener(async tab => {
  if (!C.isUyapUrl(tab.url)) {
    await chrome.storage.session.set({targetTabId:null});
    await chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
    return;
  }
  await chrome.storage.session.set({ targetTabId: tab.id });
  await chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
});

async function portalState(tabId){
  if(!tabId)return {stage:'missing',scope:false,message:'UYAP Vatandaş Portalı’nı açın; o sekmedeyken Paracci Dosya simgesine tıklayın.'};
  try{
    const tab=await chrome.tabs.get(tabId);
    if(!C.isUyapUrl(tab.url))return {stage:'session_expired',scope:false,message:'UYAP sekmesi giriş ekranına veya başka bir adrese geçmiş. UYAP’ta normal giriş yapıp eklenti simgesine yeniden tıklayın.'};
    const [{result:observed}]=await chrome.scripting.executeScript({target:{tabId},func:ArchiveWizard.probe});let result=observed;
    if(!result?.stage)throw new Error('state');
    const {confirmedExpiry}=await chrome.storage.session.get('confirmedExpiry');
    if(confirmedExpiry?.targetTabId===tabId){
      if((result.navigationStamp||0)!==confirmedExpiry.navigationStamp)await chrome.storage.session.set({confirmedExpiry:null});
      else if(result.stage==='ready')result={...result,stage:'session_expired',scope:false,message:'Son belge isteğinde UYAP oturumunun sona erdiği doğrulandı. Önbellekteki evrak ekranına güvenmeyin; UYAP’ta normal giriş yapıp sayfaya yeniden dönün ve tarayın.'};
    }
    if(result.stage==='session_expired')await chrome.storage.session.set({confirmedExpiry:{targetTabId:tabId,navigationStamp:result.navigationStamp||0}});
    if(result.experimental){
      const {experimentalScope}=await chrome.storage.session.get('experimentalScope');
      result={...result,experimentalEnabled:experimentalScope?.targetTabId===tabId&&experimentalScope.menuId===result.menuId};
      if(!result.experimentalEnabled&&result.stage==='ready')result={...result,scope:false,stage:'experimental_disabled',message:'Danıştay desteği deneysel ve kapalı. Gerçek dosyayla doğrulanmadığını okuyup bu sekme için etkinleştirebilirsiniz. Önce tek evrak denemesi önerilir.'};
    }
    await chrome.storage.session.set({portalState:result});return result;
  }catch{return {stage:'unavailable',scope:false,message:'UYAP sekmesine erişilemiyor. Sekmeye dönüp eklenti simgesine yeniden tıklayın; oturumunuzu da kontrol edin.'};}
}
async function recordExpiry(job){const {portalState:state}=await chrome.storage.session.get('portalState');await chrome.storage.session.set({confirmedExpiry:{targetTabId:job.targetTabId,navigationStamp:state?.navigationStamp||0}});}
async function requireDocuments(tabId,expectedTitle,expectedMenuId){
  const {targetTabId}=await chrome.storage.session.get('targetTabId');
  if(targetTabId!==tabId){const error=new Error('Seçilen UYAP sekmesi değişti. Bu sekmeden yeniden tarayın.');error.code='case_changed';throw error;}
  const state=await portalState(tabId);
  if(state.stage!=='ready'||!state.scope){const error=new Error(state.message);error.code=state.stage;throw error;}
  if(state.experimental&&!state.experimentalEnabled)throw new Error('Deneysel bölüm bu sekme için etkinleştirilmedi.');
  if(expectedMenuId&&(state.menuId||'12573')!==expectedMenuId){const error=new Error('Sorgulama bölümü değişti. Yeni bölümden yeniden tarayın.');error.code='case_changed';throw error;}
  if(expectedTitle&&state.caseTitle&&state.caseTitle!==expectedTitle){const error=new Error('Açık dava değişti. Yeni dava için Dosyayı tara düğmesini kullanın.');error.code='case_changed';throw error;}
  return state;
}
async function guide(message){
  const {targetTabId}=await chrome.storage.session.get('targetTabId');
  if(message.type==='guide.portal'){await chrome.tabs.create({url:'https://vatandas.uyap.gov.tr/main/jsp/vatandas/index.jsp?menuId=12573'});return {stage:'missing',message:'Açılan UYAP sekmesinde giriş yapın ve eklenti simgesine tıklayın.'};}
  const state=await portalState(targetTabId);
  if(message.type==='guide.experimental'){
    if(isBusy(await read()))throw new Error('Önce aktif indirmeyi duraklatıp bitmesini bekleyin.');
    if(!state.experimental||state.menuId!=='28934'||typeof message.enabled!=='boolean')throw new Error('Bu bölüm için deneysel destek tanımlı değil.');
    await chrome.storage.session.set({experimentalScope:message.enabled?{targetTabId,menuId:state.menuId}:null});
    return portalState(targetTabId);
  }
  if(message.type==='guide.show'&&targetTabId&&!['unavailable','missing'].includes(state.stage)){
    await chrome.scripting.executeScript({target:{tabId:targetTabId},files:['wizard.js']});
    await chrome.scripting.executeScript({target:{tabId:targetTabId},func:()=>ArchiveWizard.show()});
    await chrome.tabs.update(targetTabId,{active:true});
  }
  return state;
}

async function scan(rootFolder, parallel) {
  if (isBusy(await read())) throw new Error('Önce mevcut indirmeyi duraklatın ve bitmesini bekleyin.');
  const startedAt = Date.now();
  const progress = async update => chrome.storage.session.set({ scanProgress: { startedAt, updatedAt: Date.now(), active: true, processed: 0, total: 0, ...update } });
  await progress({ phase: 'reading', message: 'UYAP evrak ağacı okunuyor…' });
  try {
  const { targetTabId } = await chrome.storage.session.get('targetTabId');
  if (!targetTabId) throw new Error('UYAP sekmesine dönüp eklenti simgesine tıklayın.');
  const target = await chrome.tabs.get(targetTabId);
  if (!C.isUyapUrl(target.url)) throw new Error('Seçilen sekme UYAP değil.');
  const source=await requireDocuments(targetTabId);
  const [{ result: snapshot }] = await chrome.scripting.executeScript({ target: { tabId: targetTabId }, func: scanUyapDocument });
  if (!snapshot) throw new Error('Evrak ağacı okunamadı.');
  await requireDocuments(targetTabId,snapshot.title,source.menuId||'12573');
  snapshot.portal={menuId:source.menuId||'12573',label:source.sourceLabel||'Dosya Sorgulama',experimental:!!source.experimental};
  await progress({ phase: 'planning', message: `${snapshot.records.length} belge için klasör planı hazırlanıyor…`, total: snapshot.records.length });
  const plan = await C.makePlan(snapshot, rootFolder);
  const { history = {} } = await chrome.storage.local.get('history');
  const candidates = plan.items.filter(item => history[item.key]);
  let checked = 0, verified = 0;
  await progress({ phase: 'verifying', total: candidates.length, message: candidates.length ? `Önceki indirmeler doğrulanıyor: 0 / ${candidates.length}` : 'Önceki indirme kaydı yok; yeni plan hazırlanıyor.' });
  for (let offset = 0; offset < candidates.length; offset += 10) {
    const batch = candidates.slice(offset, offset + 10);
    const results = await Promise.allSettled(batch.map(item => chrome.downloads.search({ id: history[item.key].downloadId })));
    if (results.some(result => result.status === 'rejected')) throw new Error('Önceki indirmeler kontrol edilemedi. Chrome bağlantısını kontrol edip yeniden tarayın.');
    for (let n = 0; n < batch.length; n++) {
      const item = batch[n], previous = history[item.key], found = results[n].value[0];
      if (found?.state === 'complete' && C.isSafeDanger(found.danger) && found.exists && found.filename === previous.filename &&
          found.filename.replace(/\\/g, '/').endsWith('/' + previous.path) && previous.path.startsWith(item.directory + '/')) {
        item.state = 'skipped'; item.downloadId = found.id; item.path = previous.path; verified++;
        if(found.url&&C.canLearnRoute(found.danger)&&C.matchesDownload(found,item)){
          const template=ArchiveTransport.template(found.url,item.token,snapshot.context.caseToken,snapshot.title);
          if(template)await chrome.storage.session.set({downloadTemplate:{...template,verified:true,chromeVerdict:found.danger}});
        }
      }
    }
    checked += batch.length;
    await progress({ phase: 'verifying', processed: checked, total: candidates.length, verified,
      message: `Önceki indirmeler doğrulanıyor: ${checked} / ${candidates.length} · ${verified} dosya mevcut` });
  }
  const allPresent = verified === plan.items.length && !snapshot.warnings.length;
  const job = { id: crypto.randomUUID(), targetTabId, snapshot, ...plan, status: allPresent ? 'completed' : 'ready', active: null, inFlight: [], concurrency: concurrency(parallel),
    message: snapshot.warnings.length ? 'Tarama eksik. Uyarılar çözülmeden indirme başlamaz.' : allPresent ? 'Arşiv doğrulandı. Bütün belgeler mevcut; yeni indirme gerekmiyor.' : 'Klasör planı hazır.',
    updatedAt: Date.now() };
  await write(job);
  await progress({ phase: 'done', active: false, processed: candidates.length, total: candidates.length, verified,
    message: `Tarama tamamlandı: ${verified} mevcut dosya atlanacak, ${plan.items.length - verified} dosya indirilecek.` });
  return publicJob(job);
  } catch (error) {
    await progress({ phase: 'error', active: false, message: error.message || 'Tarama tamamlanamadı.' });
    throw error;
  }
}

function publicJob(job) {
  if (!job) return null;
  return { id: job.id, title: job.snapshot.title, status: job.status, message: job.message,portal:job.snapshot.portal,
    warnings: job.snapshot.warnings, scannedAt: job.snapshot.scannedAt, groups: job.snapshot.groups,
    active: activeCount(job) > 0, activeCount: activeCount(job), concurrency: job.concurrency || 1, delivery:job.delivery||'classic',archiveId:job.archiveId,bundle:job.bundle,bundleTrial:!!job.bundleTrial,
    items: job.items.map(({ label, folders, parentLabel, isAttachment, state, error, path, directory, baseName, verification, sourceFormat, htmlValidation, formatRetries, recovery, attempts }) =>
      ({ label, folders, parentLabel, isAttachment, state, error, path, verification, sourceFormat, htmlValidation, formatRetries, recovery, attempts, preview: `${directory}/${baseName}.*` })) };
}

async function tick() {
  const job = await read();
  if (!job || job.delivery==='bundle' || job.status !== 'running' || job.active || activeCount(job) >= (job.concurrency || 1)) return;
  if (job.cooldownUntil > Date.now()) { await scheduleNext(job); return; }
  delete job.cooldownUntil;
  const index = job.items.findIndex(item => item.state === 'pending' && (!job.trialKeys || job.trialKeys.includes(item.key)));
  if (index < 0) {
    if (activeCount(job)) return;
    job.status = job.trialKeys ? 'paused' : 'completed';
    job.message = job.calibrationOnly?'Bağlantı doğrulandı. Tek ZIP topla / devam et düğmesini kullanabilirsiniz.':job.trialKeys ? 'Deneme tamamlandı. Ana evrakı ve eklerini klasörde kontrol edin. Tüm arşiv için Devam et düğmesini kullanın.' : 'Arşivleme tamamlandı.';
    delete job.calibrationOnly;
    delete job.trialKeys;
    await write(job); await chrome.alarms.clear('queue-watch'); return;
  }
  const item = job.items[index];
  try{await requireDocuments(job.targetTabId,job.snapshot.title,job.snapshot.portal?.menuId||'12573');}catch(error){
    job.status=error.code==='session_expired'?'session_expired':'paused';job.message=error.message;await write(job);return;
  }
  item.attempts = (item.attempts || 0) + 1;
  job.active = { index, phase: 'awaiting', since: Date.now(), downloadId: null };
  item.state = 'starting'; job.message = `${item.label} indiriliyor…`; await write(job);
  await chrome.alarms.create('queue-watch', { periodInMinutes: 0.5 });
  try {
    const result = await chrome.scripting.executeScript({ target: { tabId: job.targetTabId }, world: 'MAIN',
      func: invokeUyapDownload, args: [job.snapshot.title, job.snapshot.context.caseToken, job.snapshot.context.jurisdiction, item.token,job.snapshot.portal?.menuId||'12573'] });
    if (result[0]?.result !== true) throw new Error('Kaydet işlevi tamamlanamadı.');
  } catch {
    const fresh = await read();
    if (fresh?.id !== job.id || fresh.active?.index !== index) return;
    fresh.items[index].state = 'error'; fresh.items[index].error = 'UYAP bağlantısı kullanılamadı. Evrak sekmesini kontrol edip yeniden tarayın.';
    fresh.active = null; fresh.status = 'error'; fresh.message = fresh.items[index].error;
    await write(fresh);
  }
}

async function scheduleNext(job) {
  if (job.delivery==='bundle'||job.status !== 'running') return;
  // Keep only a brief gap between starts. The slot limit bounds server load.
  const delay = Math.max(100, (job.cooldownUntil || 0) - Date.now());
  await chrome.alarms.create('queue-next', { when: Date.now() + delay });
  setTimeout(() => exclusive(tick).catch(() => {}), delay);
}

chrome.downloads.onDeterminingFilename.addListener((download, suggest) => {
  let answered = false;
  const answer = value => { if (!answered) { answered = true; suggest(value); } };
  exclusive(async () => {
    const job = await read();
    const active = job?.active;
    if (!active || active.phase !== 'awaiting') { answer(); return; }
    const item = job.items[active.index];
    if (!C.matchesDownload(download, item)) { answer(); return; }
    if (Date.now() - active.since > 90000) { answer(); return; }
    item.sourceFormat = C.downloadFormat(download);
    try {
      if (C.isHtmlDownload(download)) {
        if (!C.isReceiptRecord(item)) {
          const [{result:diagnosis}]=await chrome.scripting.executeScript({target:{tabId:job.targetTabId},func:ArchiveTransport.diagnose,args:[download.url]});
          if(diagnosis?.session==='expired'){
            const error=new Error('UYAP oturumu sona erdi. Yeniden giriş yapın, Evrak bölümünü açın ve tarayıp devam edin.');error.code='SESSION_EXPIRED';throw error;
          }
          const error = new Error('Belge iki denemede de beklenmeyen HTML biçiminde bildirildi. Dosya kaydedilmedi; UYAP oturumunu ve raporu kontrol edin.');
          error.code = 'UNEXPECTED_HTML_METADATA'; throw error;
        }
        const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: job.targetTabId },
          func: inspectUyapHtmlDownload, args: [download.url, job.snapshot.title, job.snapshot.context.caseToken, item.token] });
        item.htmlValidation = result || { valid: false, reason: 'HTML makbuz kontrolü sonuç döndürmedi.' };
        if (!item.htmlValidation.valid) throw new Error(item.htmlValidation.reason || 'HTML makbuz doğrulanamadı.');
      }
      const path = C.outputPath(item, download);
      item.path = path; item.downloadId = download.id; item.state = 'downloading';
      job.inFlight ||= [];
      job.inFlight.push({ index: active.index, downloadId: download.id, since: Date.now() });
      job.active = null;
      await write(job);
      answer({ filename: path, conflictAction: 'uniquify' });
      await scheduleNext(job);
    } catch (error) {
      await chrome.downloads.cancel(download.id).catch(() => {});
      if (error.code === 'UNEXPECTED_HTML_METADATA' && (item.formatRetries || 0) < 1) {
        item.formatRetries = 1;
        item.recovery = { reason: 'unexpected_html_metadata', firstFormat: item.sourceFormat, delayMs: 2500, concurrency: 1 };
        item.state = 'pending'; item.error = null; item.downloadId = null;
        job.active = null; job.concurrency = 1; job.cooldownUntil = Date.now() + 2500;
        job.message = `${item.label}: beklenmeyen HTML yanıtı kaydedilmedi. 2,5 saniye sonra tekli indirmeyle bir kez yeniden denenecek.`;
        await write(job); answer(); await scheduleNext(job); return;
      }
      item.state = 'error'; item.error = error.message;
      job.status = error.code==='SESSION_EXPIRED'?'session_expired':'error';if(job.status==='session_expired')await recordExpiry(job); job.active = null; job.message = error.message; await write(job); answer();
    }
  }).catch(() => answer());
  return true;
});

async function settle(downloadId) {
  const job = await read();
  // The legacy slot is reconciled too if a still-live worker receives older state.
  const flight = job?.inFlight?.find(entry => entry.downloadId === downloadId)
    || (job?.active?.downloadId === downloadId ? job.active : null);
  if (!flight) return;
  const [download] = await chrome.downloads.search({ id: downloadId });
  if (!download || !['complete', 'interrupted'].includes(download.state)) return;
  const item = job.items[flight.index];
  const resolved = C.resolveOutputPath(item.path, download.filename);
  const size = C.receivedSize(download);
  const safe = C.isSafeDanger(download.danger);
  item.verification = { state: download.state, fileSize: download.fileSize ?? null,
    bytesReceived: download.bytesReceived ?? null, totalBytes: download.totalBytes ?? null,
    danger: download.danger ?? null, pathMatches: !!resolved, sizeEvidence: size };
  const successful = download.state === 'complete' && size > 0 && resolved && safe;
  if (successful) {
    item.path = resolved;
    item.state = 'complete';
    const { history = {} } = await chrome.storage.local.get('history');
    history[item.key] = { downloadId, filename: download.filename, path: item.path, completedAt: Date.now() };
    // Bound private local history. Encrypted portal tokens are never written here.
    const entries = Object.entries(history).sort((a, b) => b[1].completedAt - a[1].completedAt).slice(0, 10000);
    await chrome.storage.local.set({ history: Object.fromEntries(entries) });
    if(C.canLearnRoute(download.danger)&&C.matchesDownload(download,item)){
      const template=ArchiveTransport.template(download.url,item.token,job.snapshot.context.caseToken,job.snapshot.title);
      if(template)await chrome.storage.session.set({downloadTemplate:{...template,verified:true,chromeVerdict:download.danger}});
    }
  } else {
    item.state = 'error';
    let expired=job.status==='session_expired';
    if(!expired&&download.state==='interrupted'&&C.matchesDownload(download,item)){
      try{const [{result}]=await chrome.scripting.executeScript({target:{tabId:job.targetTabId},func:ArchiveTransport.diagnose,args:[download.url]});expired=result?.session==='expired';}catch{}
    }
    item.error = download.state === 'interrupted' ? 'İndirme kesildi. Chrome indirmelerini ve UYAP oturumunu kontrol edin.'
      : !resolved ? 'İndirme tamamlandı fakat dosya yolu planla eşleşmedi. Raporu kaydedip dosyayı kontrol edin.'
      : !safe ? 'Chrome dosyayı güvenli olarak işaretlemedi. Chrome indirmelerindeki uyarıyı kontrol edin.'
      : 'İndirme tamamlandı fakat dosyanın sıfırdan büyük boyutu doğrulanamadı. Raporu kaydedip dosyayı kontrol edin.';
    if(expired){item.error='UYAP oturumu sona erdi. Normal giriş yapın; Evrak bölümüne dönüp yeniden tarayın. Tamamlanan dosyalar korunur.';await recordExpiry(job);}
    job.status = expired?'session_expired':'error'; job.message = item.error;
  }
  job.inFlight = (job.inFlight || []).filter(entry => entry.downloadId !== downloadId);
  if (job.active?.downloadId === downloadId) job.active = null;
  await write(job);
  await scheduleNext(job);
}
chrome.downloads.onChanged.addListener(delta => {
  if (delta.state?.current === 'complete' || delta.state?.current === 'interrupted') exclusive(() => settle(delta.id));
});
chrome.alarms.onAlarm.addListener(alarm => exclusive(async () => {
  if (alarm.name === 'queue-next') return tick();
  if (alarm.name !== 'queue-watch') return;
  let job = await read();
  for (const flight of job?.inFlight || []) await settle(flight.downloadId);
  job = await read();
  if (!job?.active) {
    if (job?.status === 'running') await tick();
    else if (!activeCount(job)) await chrome.alarms.clear('queue-watch');
    return;
  }
  if (job.active.downloadId) { await settle(job.active.downloadId); return; }
  if (Date.now() - job.active.since > 90000) {
    const item = job.items[job.active.index];
    item.state = 'error'; item.error = '90 saniyede eşleşen indirme alınamadı. Chrome indirmelerini kontrol edin; UYAP bağlantısı bu sürümle uyumlu olmayabilir.';
    job.active = null; job.status = 'error'; job.message = item.error; await write(job);
  }
}));

async function handle(message) {
  if (message.type === 'get') return publicJob(await read());
  if (message.type === 'scan') return scan(message.rootFolder, message.concurrency);
  const job = await read();
  if (!job) throw new Error('Önce dosyayı tarayın.');
  if (message.type === 'start' || message.type === 'trial') {
    if(job.delivery==='bundle')throw new Error('Bu iş Tek ZIP modunda. Tek ZIP panelinden devam edin; klasik moda dönmek için yeniden tarayın.');
    if (job.snapshot.warnings.length) throw new Error('Tarama uyarıları varken arşivleme başlamaz.');
    if (job.status === 'error') throw new Error('Hatadan sonra önce yeniden tarayın. Tamamlananlar kontrol edilerek atlanır.');
    if (!['ready', 'paused', 'running'].includes(job.status)) throw new Error('Bu plan başlatılamıyor. Yeniden tarayın.');
    if (message.type === 'trial') {
      if (activeCount(job)) throw new Error('Önce devam eden indirmeleri bekleyin.');
      const chosen = job.items.find(i => !i.isAttachment && job.items.some(a => a.isAttachment && a.directory === i.directory && a.state === 'pending'))
        || job.items.find(i => i.state === 'pending');
      if (!chosen) throw new Error('Denenecek yeni belge yok.');
      job.trialKeys = job.items.filter(i => i.directory === chosen.directory).map(i => i.key);
    } else delete job.trialKeys;
    job.concurrency = concurrency(message.concurrency ?? job.concurrency);
    job.status = 'running'; job.message = `Arşivleniyor · Aynı anda en fazla ${job.concurrency} dosya`; await write(job); await tick();
  } else if (message.type === 'pause') {
    job.status = 'paused'; job.message = activeCount(job) ? 'Başlamış indirmeler tamamlanacak; yeni belge başlatılmayacak.' : 'Duraklatıldı.';
    await write(job);
  } else if (message.type === 'showFolder') {
    const first = job.items.find(item => item.state === 'complete' || item.state === 'skipped');
    if (first?.downloadId) await chrome.downloads.show(first.downloadId);
    else throw new Error('Henüz tamamlanmış bir indirme yok.');
  } else throw new Error('Bilinmeyen işlem.');
  return publicJob(await read());
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if(message.type?.startsWith('bundle.stream.')){
    ArchiveBundle.receive(message,sender,read).then(value=>reply({ok:true,value}),error=>reply({ok:false,error:String(error.message).slice(0,400)}));return true;
  }
  // No website/content-script commands; only the packaged control page can operate the queue.
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('app.html')) return false;
  if(message.type?.startsWith('guide.')){guide(message).then(value=>reply({ok:true,value}),error=>reply({ok:false,error:error.message}));return true;}
  if(message.type?.startsWith('bundle.')){
    ArchiveBundle.handle(message,{read,write,publicJob,requireDocuments,expire:recordExpiry,classic:handle}).then(value=>reply({ok:true,value}),error=>reply({ok:false,error:error.message}));return true;
  }
  if (typeof message.type === 'string' && message.type.startsWith('ai.')) {
    ArchiveAI.handle(message,read,publicJob).then(value=>reply({ok:true,value}),error=>reply({ok:false,error:String(error.message||'Yerel AI işlemi tamamlanamadı.').slice(0,500)}));
    return true;
  }
  exclusive(() => handle(message)).then(value => reply({ ok: true, value }), error => reply({ ok: false,
    error: String(error.message || 'İşlem tamamlanamadı. UYAP Evrak sekmesini kontrol edin.').slice(0, 500) }));
  return true;
});
chrome.runtime.onStartup.addListener(() => chrome.storage.session.clear());
