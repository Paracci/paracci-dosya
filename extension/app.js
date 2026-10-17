'use strict';
const $ = id => document.getElementById(id);
const statusNames = {ready:'Plan hazır',running:'Arşivleniyor',paused:'Duraklatıldı',error:'Kontrol gerekli',completed:'Tamamlandı',session_expired:'Oturum sona erdi',offline:'İnternet kesildi'};
const itemNames = {pending:'Bekliyor',starting:'Başlatılıyor',downloading:'İndiriliyor',complete:'Tamamlandı',skipped:'Mevcut',error:'Hata'};
let current = null, pending = false, renderKey = '', scanState = null,guideState=null;
const guideBlocked=()=>guideState&&guideState.stage!=='ready';
const bundleBlocked=()=>guideBlocked()||guideState?.experimental||current?.portal?.experimental;
function renderScanProgress(state) {
  if (!state) return;
  scanState = state; $('scanProgress').hidden = false;
  $('scanMessage').textContent = state.message;
  $('scanSpinner').hidden = !state.active;
  if (state.phase === 'verifying' && state.total > 0 || state.phase === 'done') {
    $('scanBar').max = Math.max(1, state.total || 1);
    $('scanBar').value = state.phase === 'done' ? $('scanBar').max : state.processed || 0;
  } else $('scanBar').removeAttribute('value');
  $('scan').textContent = state.active ? 'Taranıyor…' : 'Dosyayı tara ↗';
  $('scan').disabled = guideBlocked() || state.active || current?.active || current?.status === 'running';
  $('root').disabled = !!state.active;
  $('speed').disabled = state.active || current?.active || current?.status === 'running';
  $('start').disabled = guideBlocked() || state.active || !!current?.warnings?.length;
  $('trial').disabled = guideBlocked() || state.active || !!current?.warnings?.length || current?.active;
  updateScanElapsed();
  if (aiState) renderAI(aiState, true);
}
function updateScanElapsed() {
  if (scanState) $('scanElapsed').textContent = `Geçen süre: ${Math.max(0,Math.floor(((scanState.active ? Date.now() : scanState.updatedAt || Date.now()) - scanState.startedAt) / 1000))} sn`;
}
setInterval(updateScanElapsed, 1000);
async function command(type, extra = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...extra });
  if (!response?.ok) throw new Error(response?.error || 'Eklentiye ulaşılamadı.');
  return response.value;
}
function render(job) {
  const previousId = current?.id;
  current = job;
  $('experimentalEnabled').disabled=pending||job?.active||job?.status==='running';
  $('sourceNotice').hidden=!job?.portal?.experimental;
  $('sourceNotice').textContent=job?.portal?.experimental?'Bu plan Danıştay deneysel bölümünden oluşturuldu. Gerçek dosyayla doğrulanmadı; önce klasik tek evrak ve ekleri denemesini kontrol edin. Tek ZIP bu bölümde henüz desteklenmiyor.':'';
  $('empty').hidden = !!job; $('workspace').hidden = !job;
  if (!job) return;
  if(previousId&&previousId!==job.id){aiState=null;$('aiResults').replaceChildren();$('aiGuideText').hidden=true;renderAI({status:'idle',message:'Arşiv planı değişti. Yerel motor durumunu yenileyebilirsiniz.'});}
  if (previousId !== job.id || job.status === 'running') $('speed').value = String(job.concurrency || 1);
  $('caseTitle').textContent = job.title;
  $('scanDate').textContent = 'Son tarama: ' + new Date(job.scannedAt).toLocaleString('tr-TR');
  $('badge').textContent = statusNames[job.status] || job.status;
  const done = job.items.filter(i => ['complete','skipped'].includes(i.state)).length;
  $('mainCount').textContent = job.items.filter(i => !i.isAttachment).length;
  $('attachmentCount').textContent = job.items.filter(i => i.isAttachment).length;
  $('completeCount').textContent = done;
  $('errorCount').textContent = job.items.filter(i => i.state === 'error').length;
  $('status').textContent = job.message + (job.status === 'running' ? job.delivery==='bundle'?' · yerel işlem sürüyor':` · ${job.activeCount || 0} aktif indirme` : '');
  $('bundleBusy').hidden=job.delivery!=='bundle'||job.status!=='running';
  $('progress').max = Math.max(1, job.items.length); $('progress').value = done;
  $('warnings').hidden = !job.warnings.length;
  $('warnings').textContent = job.warnings.join(' • ');
  $('scan').disabled = guideBlocked() || scanState?.active || job.active || job.status === 'running';
  $('speed').disabled = scanState?.active || job.active || job.status === 'running';
  $('aiHelp').disabled = done !== job.items.length || job.status !== 'completed';
  $('start').hidden = job.delivery==='bundle'||['running','completed','error'].includes(job.status);
  $('start').disabled = guideBlocked() || scanState?.active || !!job.warnings.length;
  $('trial').hidden = job.delivery==='bundle'||['running','completed','error'].includes(job.status);
  $('trial').disabled = guideBlocked() || scanState?.active || !!job.warnings.length || job.active;
  $('start').textContent = job.status === 'paused' ? 'Devam et' : 'Arşivlemeyi başlat';
  $('pause').hidden = job.status !== 'running';
  $('showFolder').disabled = done === 0;
  $('bundleStart').disabled=bundleBlocked()||job.status==='running'||!!job.warnings.length||scanState?.active;
  $('bundleCalibrate').disabled=bundleBlocked()||job.status==='running'||!!job.warnings.length||scanState?.active;
  $('bundleTrial').disabled=$('bundleStart').disabled;
  $('bundleOpen').hidden=job.delivery!=='bundle'||!job.bundle?.zip||!['completed','paused'].includes(job.status);
  renderRows();
}
function renderRows() {
  if (!current) return;
  const filter = $('filter').value.toLocaleLowerCase('tr-TR');
  const key = JSON.stringify([current.id, current.items.map(i=>[i.state,i.path,i.error,i.formatRetries]),filter]);
  if (key === renderKey) return;
  renderKey = key;
  const fragment = document.createDocumentFragment();
  for (const item of current.items) {
    if (filter && ![item.label,...item.folders,item.parentLabel || ''].join(' ').toLocaleLowerCase('tr-TR').includes(filter)) continue;
    const tr = document.createElement('tr');
    if (item.isAttachment) tr.className = 'attachment';
    const label = document.createElement('td'); label.textContent = item.label;
    const detail = document.createElement('small'); detail.textContent = item.isAttachment ? `Ana evrak: ${item.parentLabel}` : item.folders.join(' › '); label.append(detail);
    if (item.formatRetries) { const retry = document.createElement('small'); retry.textContent = 'Yanıt biçimi nedeniyle 1 kontrollü yeniden deneme'; label.append(retry); }
    const path = document.createElement('td'); path.className = 'path'; path.textContent = [...item.folders,...(item.isAttachment?[item.parentLabel]:[]),item.label].filter(Boolean).join(' › ');path.title=item.path||item.preview;
    const state = document.createElement('td'); const pill = document.createElement('span'); pill.className = 'state ' + item.state; pill.textContent = itemNames[item.state]; state.append(pill);
    if (item.error) { const error = document.createElement('small'); error.textContent = item.error; state.append(error); }
    tr.append(label,path,state); fragment.append(tr);
  }
  $('rows').replaceChildren(fragment);
}
async function act(type, extra) {
  if (pending) return;
  pending = true; $('error').hidden = true; $('scan').disabled = true;
  if(type==='bundle.start'||type==='bundle.try'){$('status').textContent='Toplu iş hazırlanıyor; önceki evraklar diskte doğrulanıyor…';$('bundleBusy').hidden=false;$('bundleStart').disabled=true;$('bundleTrial').disabled=true;$('bundleCalibrate').disabled=true;}
  if (type === 'scan') renderScanProgress({ active: true, phase: 'reading', processed: 0, total: 0, startedAt: Date.now(), message: 'Tarama başlatılıyor…' });
  try { render(await command(type, extra)); }
  catch (error) {
    $('error').textContent = error.message; $('error').hidden = false;
    if(type.startsWith('bundle.'))$('status').textContent=error.message;
    if (type === 'scan') renderScanProgress({ ...scanState, active: false, phase: 'error', updatedAt: Date.now(), message: error.message });
  }
  finally { pending = false; $('scan').disabled = guideBlocked()||scanState?.active || current?.active || current?.status === 'running';if(current?.status!=='running')$('bundleBusy').hidden=true;for(const id of ['bundleStart','bundleTrial','bundleCalibrate'])$(id).disabled=bundleBlocked()||scanState?.active||current?.status==='running'||!!current?.warnings?.length; }
}
$('scan').addEventListener('click', () => act('scan',{rootFolder:$('root').value,concurrency:Number($('speed').value)}));
$('start').addEventListener('click', () => act(current?.delivery==='bundle'?'bundle.start':'start',{concurrency:Number($('speed').value)}));
$('trial').addEventListener('click', () => act('trial',{concurrency:Number($('speed').value)}));
$('pause').addEventListener('click', () => act(current?.delivery==='bundle'?'bundle.pause':'pause'));
$('showFolder').addEventListener('click', () => current?.delivery==='bundle'?openBundle('folder'):act('showFolder'));
$('bundleStart').addEventListener('click',()=>act('bundle.start'));
$('bundleTrial').addEventListener('click',()=>act('bundle.try'));
$('bundleCalibrate').addEventListener('click',()=>act('bundle.calibrate'));
$('bundleOpen').addEventListener('click',()=>openBundle('zip'));
$('aiHelp').addEventListener('click', () => { $('aiPanel').hidden = !$('aiPanel').hidden; });
$('filter').addEventListener('input', renderRows);
$('report').addEventListener('click', () => {
  if (!current) return;
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...current },null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'uyap-arsiv-raporu.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session') return;
  if (changes.scanProgress) renderScanProgress(changes.scanProgress.newValue);
  if (changes.aiState) renderAI(changes.aiState.newValue);
  if(changes.bundleProgress&&current?.delivery==='bundle'&&current.status==='running'&&changes.bundleProgress.newValue?.jobId===current.id){const progress=changes.bundleProgress.newValue;$('status').textContent=`${progress.label}: ${Math.round(progress.bytes/1024)} KiB yerel diske aktarıldı…`;}
  if (changes.job && !pending) command('get').then(render).catch(() => {});
});
chrome.storage.session.get('scanProgress').then(value => renderScanProgress(value.scanProgress));
act('get');

let aiConnected=false, aiState=null, aiBusy=false;
function renderAI(value,preserveMessage=false){
  if(!value)return;aiState=value;
  if(!preserveMessage)$('aiStatus').textContent=value.message||'Durum alındı.';
  const running=['queued','running'].includes(value.status),ready=value.status==='completed';
  $('aiPrepare').disabled=!aiConnected||running||aiBusy||scanState?.active;
  $('aiPrepare').textContent=ready?'Paketi güncelle / yeniden hazırla':'Bu arşivin AI paketini hazırla';
  $('aiRefresh').disabled=!aiConnected||aiBusy;
  $('aiDownload').disabled=!ready||aiBusy;$('aiGuide').disabled=!ready||aiBusy;
  for(const id of ['aiQuality','aiForceOcr','aiReadableCopy'])$(id).disabled=running||aiBusy;
  $('aiReadable').hidden=!ready||!value.stats?.readable_copy;
  $('aiOpenReadable').disabled=aiBusy;
  $('aiReadablePath').textContent=value.stats?.readable_copy?.path||'';
  $('aiSearchArea').hidden=!ready;
  if(value.total>0||ready){$('aiBar').max=Math.max(1,value.total||1);$('aiBar').value=ready?$('aiBar').max:value.done||0;}
  else if(running)$('aiBar').removeAttribute('value');
  const s=value.stats;
  $('aiSummary').textContent=s?`${s.profile==='quality'?'Yüksek kalite':'Standart'} · ${s.top_level_files} özgün dosya · ${s.zip_members} ZIP üyesi · ${s.unique_documents} tekil belge · ${s.review_entries} kontrol kaydı · ${s.errors} çıkarım hatası`:running?'Hazırlama sürerken bu ekranda ilerleme güncellenir.':'';
}
async function aiAction(type,extra={}){
  if(aiBusy)return;aiBusy=true;$('error').hidden=true;
  if(aiState)renderAI(aiState);
  try{
    const value=await command(type,extra);
    if(type==='ai.connect'){
      aiConnected=true;$('aiConnection').textContent='Yerel motor hazır · Belgeler bilgisayarınızda işlenir.';
      $('aiQuality').value=value.quality_ready?'quality':'standard';
      $('aiQuality').querySelector('option[value="quality"]').disabled=!value.quality_ready;
      renderAI(await command('ai.status'));
    }else if(type==='ai.openReadable')$('aiStatus').textContent=value.message;
    else renderAI(value);
  }catch(error){$('aiStatus').textContent=error.message;}
  finally{aiBusy=false;if(aiState)renderAI(aiState,true);else{$('aiPrepare').disabled=!aiConnected;$('aiRefresh').disabled=!aiConnected;}}
}
$('aiConnect').addEventListener('click',()=>aiAction('ai.connect'));
$('aiPrepare').addEventListener('click',()=>aiAction('ai.prepare',{profile:$('aiQuality').value,forcePdfOcr:!!$('aiForceOcr').checked,readableCopy:!!$('aiReadableCopy').checked}));
$('aiOpenReadable').addEventListener('click',()=>aiAction('ai.openReadable'));
$('aiRefresh').addEventListener('click',()=>aiAction('ai.status'));
async function readAIFile(file){
  const info=await command('ai.fileInfo',{file});
  if(!Number.isInteger(info.size)||info.size<0||info.size>128*1024*1024)throw new Error('Paket boyutu geçersiz.');
  const buffer=new Uint8Array(info.size);
  for(let offset=0;offset<info.size;){
    const part=await command('ai.fileChunk',{file,offset});
    const bytes=Uint8Array.from(atob(part.data),c=>c.charCodeAt(0));
    if(part.offset!==offset||bytes.length!==part.bytes||!bytes.length||offset+bytes.length>info.size)throw new Error('Paket aktarımı doğrulanamadı.');
    buffer.set(bytes,offset);offset+=bytes.length;$('aiStatus').textContent=`Paket aktarılıyor: %${Math.round(offset/info.size*100)}`;
  }
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==info.sha256)throw new Error('Paket bütünlük kontrolü geçmedi. Yeniden deneyin.');
  return {buffer,info};
}
$('aiDownload').addEventListener('click',async()=>{
  if(aiBusy)return;aiBusy=true;if(aiState)renderAI(aiState);
  try{const {buffer,info}=await readAIFile('zip');const url=URL.createObjectURL(new Blob([buffer],{type:'application/zip'}));const link=document.createElement('a');link.href=url;link.download=info.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);$('aiStatus').textContent='Paket doğrulandı ve tarayıcı indirmesi başlatıldı.';}
  catch(error){$('aiStatus').textContent=error.message;}
  finally{aiBusy=false;if(aiState)renderAI(aiState,true);}
});
$('aiGuide').addEventListener('click',async()=>{
  if(aiBusy)return;aiBusy=true;
  try{const {buffer}=await readAIFile('guide');$('aiGuideText').textContent=new TextDecoder().decode(buffer);$('aiGuideText').hidden=false;$('aiStatus').textContent='Başlangıç rehberi aşağıda açıldı.';}
  catch(error){$('aiStatus').textContent=error.message;}
  finally{aiBusy=false;if(aiState)renderAI(aiState,true);}
});
async function aiSearch(){
  if(aiBusy)return;$('aiResults').replaceChildren();$('aiSearch').disabled=true;
  try{const {results}=await command('ai.search',{query:$('aiQuery').value});
    for(const result of results){const card=document.createElement('article');card.className='ai-result';const title=document.createElement('strong');title.textContent=`[${result.doc_id}, ${result.locator}] · ${result.method}`;const text=document.createElement('pre');text.textContent=result.text;card.append(title,text);$('aiResults').append(card);}
    if(!results.length)$('aiResults').textContent='Eşleşme bulunamadı. Daha az veya farklı anahtar sözcük deneyin.';
  }catch(error){$('aiResults').textContent=error.message;}finally{$('aiSearch').disabled=false;}
}
$('aiSearch').addEventListener('click',aiSearch);$('aiQuery').addEventListener('keydown',event=>{if(event.key==='Enter')aiSearch();});

async function openBundle(kind){try{const value=await command('bundle.open',{kind});$('status').textContent=value.message;}catch(error){$('error').textContent=error.message;$('error').hidden=false;}}
function renderGuide(state){
  if(!state?.stage)return;
  guideState=state;
  $('experimentalPanel').hidden=!state.experimental;
  $('experimentalEnabled').checked=!!state.experimentalEnabled;
  $('experimentalEnabled').disabled=pending||current?.active||current?.status==='running';
  const steps=[...$('guideSteps').children];steps[0].textContent=state.sourceLabel||'Dosya Sorgulama';steps[1].textContent=state.experimental?'Danıştay Dairesi':'Yargı Türü / Mahkeme';
  $('guideMessage').textContent=state.message;
  $('guideBadge').textContent=state.experimental?'Deneysel':state.stage==='ready'?'Evrak hazır':state.stage==='session_expired'?'Giriş gerekli':state.stage==='offline'?'Çevrimdışı':'Adım bekleniyor';
  const section=$('guideMessage').closest('section');section.classList.toggle('session-expired',state.stage==='session_expired');
  const step={file_query:0,jurisdiction:1,query:2,choose_case:3,documents:4,loading:4,ready:4}[state.stage];
  [...$('guideSteps').children].forEach((el,index)=>el.classList.toggle('current',index===step));
  $('guideShow').disabled=['missing','unavailable'].includes(state.stage);
  $('scan').disabled=guideBlocked()||pending||scanState?.active||current?.status==='running';
  for(const id of ['bundleStart','bundleTrial','bundleCalibrate'])$(id).disabled=bundleBlocked()||pending||current?.status==='running'||!!current?.warnings?.length;
  for(const id of ['start','trial'])$(id).disabled=guideBlocked()||pending||scanState?.active||current?.active||current?.status==='running'||!!current?.warnings?.length;
}
async function refreshGuide(type='guide.status'){
  try{renderGuide(await command(type));}catch(error){$('guideMessage').textContent=error.message;}
}
$('guideRefresh').addEventListener('click',()=>refreshGuide());$('guideShow').addEventListener('click',()=>refreshGuide('guide.show'));$('guideOpen').addEventListener('click',()=>refreshGuide('guide.portal'));
$('experimentalEnabled').addEventListener('change',async()=>{
  $('experimentalEnabled').disabled=true;
  try{renderGuide(await command('guide.experimental',{enabled:$('experimentalEnabled').checked}));}
  catch(error){$('error').textContent=error.message;$('error').hidden=false;await refreshGuide();}
});
chrome.storage.local?.get('bundleCheckpoint').then(value=>{if(value.bundleCheckpoint){$('bundleRecovery').hidden=false;$('bundleRecover').hidden=false;$('bundleRecovery').textContent='Kaydedilmiş toplu çalışma var. Kontrol düğmesi yerel dosyaları doğrular; hepsi hazırsa yeni UYAP isteği yapmadan ZIP’i tamamlar.';}}).catch(()=>{});
$('bundleRecover').addEventListener('click',async()=>{
  $('bundleRecover').disabled=true;
  try{const value=await command('bundle.recover');$('bundleRecovery').textContent=value.message;$('bundleOpenSaved').hidden=!value.ready;}
  catch(error){$('bundleRecovery').textContent=error.message;}
  finally{$('bundleRecover').disabled=false;}
});
$('bundleOpenSaved').addEventListener('click',async()=>{try{const value=await command('bundle.openSaved');$('bundleRecovery').textContent=value.message;}catch(error){$('bundleRecovery').textContent=error.message;}});
refreshGuide();setInterval(()=>{if(!document.hidden&&!pending)refreshGuide();},5000);
