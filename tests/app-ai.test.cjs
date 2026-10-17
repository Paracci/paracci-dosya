const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');const {parseHTML}=require('linkedom');const {webcrypto,createHash}=require('node:crypto');
function harness(){
  const {document}=parseHTML(fs.readFileSync(path.join(__dirname,'../extension/app.html'),'utf8'));
  // LinkeDOM has a getter-only select.value; browsers also implement its setter.
  for(const select of document.querySelectorAll('select'))Object.defineProperty(select,'value',{get(){return this.querySelector('option[selected]')?.value||this.querySelector('option')?.value;},set(value){for(const option of this.querySelectorAll('option'))option.selected=option.value===value;}});
  const job={id:'case',title:'Örnek dava',status:'completed',message:'Tamamlandı',warnings:[],scannedAt:new Date().toISOString(),items:[{state:'complete',label:'Örnek',folders:['case','type'],path:'UYAP/file.pdf'}]};
  const data={calls:[],failPrepare:false,tamper:false,bytes:Buffer.from('synthetic zip bytes')};let storageListener;
  const chrome={runtime:{async sendMessage(message){
    data.calls.push(message);
    if(message.type==='bundle.start'&&data.failBundle)return {ok:false,error:'Önce Bağlantıyı doğrula adımını kullanın.'};
    let value=job;
    if(message.type==='guide.status')value=data.portal||{stage:'ready',scope:true,message:'Evrak hazır'};
    if(message.type==='guide.experimental'){data.portal={...data.portal,stage:message.enabled?'ready':'experimental_disabled',scope:message.enabled,experimentalEnabled:message.enabled};value=data.portal;}
    if(message.type==='ai.connect')value={protocol:1,ready:true,quality_ready:true};
    if(message.type==='ai.status')value={status:'idle',message:'Hazır'};
    if(message.type==='ai.prepare'){if(data.failPrepare)return {ok:false,error:'Örnek hazırlama hatası'};value={status:'running',message:'OCR hazırlanıyor',done:1,total:3};}
    if(message.type==='ai.search')value={results:[{doc_id:'DOC-test',locator:'sayfa 1',method:'native',text:'<script>untrusted()</script> kaynak metni'}]};
    if(message.type==='ai.fileInfo')value={size:data.bytes.length,sha256:createHash('sha256').update(data.bytes).digest('hex'),name:'AI_PAYLASIM.zip'};
    if(message.type==='ai.fileChunk'){const bytes=data.tamper?Buffer.from('invalid altered data'):data.bytes;value={offset:0,data:bytes.toString('base64'),bytes:bytes.length};}
    return {ok:true,value};
  }},storage:{session:{async get(){return {};}},onChanged:{addListener(fn){storageListener=fn;}}}};
  const context=vm.createContext({document,chrome,crypto:webcrypto,setTimeout(){},setInterval(){},Date,Blob,URL,TextDecoder,atob});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/app.js'),'utf8'),context);
  const flush=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};
  return {document,data,context,flush,storage:(v)=>storageListener({aiState:{newValue:v}},'session')};
}
test('AI panel connects, starts preparation, and updates progress without leaving the page',async()=>{
  const h=harness();await h.flush();h.document.getElementById('aiHelp').click();
  assert.equal(h.document.getElementById('aiPanel').hidden,false);
  h.document.getElementById('aiConnect').click();await h.flush();assert.equal(h.document.getElementById('aiPrepare').disabled,false);
  h.document.getElementById('aiPrepare').click();await h.flush();assert.equal(h.document.getElementById('aiBar').value,1);
  h.storage({status:'completed',message:'Paket hazır',done:3,total:3,stats:{top_level_files:3,zip_members:1,unique_documents:4,review_entries:0,errors:0}});
  assert.equal(h.document.getElementById('aiDownload').disabled,false);assert.equal(h.document.getElementById('aiSearchArea').hidden,false);
});
test('AI request failures remain visible after busy controls reset',async()=>{
  const h=harness();await h.flush();h.document.getElementById('aiConnect').click();await h.flush();h.data.failPrepare=true;
  h.document.getElementById('aiPrepare').click();await h.flush();assert.match(h.document.getElementById('aiStatus').textContent,/Örnek hazırlama hatası/);
  h.data.failBundle=true;h.document.getElementById('bundleStart').click();await h.flush();assert.match(h.document.getElementById('status').textContent,/Bağlantıyı doğrula/);assert.equal(h.document.getElementById('bundleStart').disabled,false);
});

test('preparation sends selected quality and copy flags; displayed tree uses full labels',async()=>{
  const h=harness();await h.flush();h.document.getElementById('aiConnect').click();await h.flush();h.document.getElementById('aiQuality').value='quality';
  h.document.getElementById('aiForceOcr').checked=true;h.document.getElementById('aiReadableCopy').checked=true;
  h.document.getElementById('aiPrepare').click();await h.flush();
  const call=h.data.calls.find(m=>m.type==='ai.prepare');assert.equal(call.profile,'quality');assert.equal(call.forcePdfOcr,true);assert.equal(call.readableCopy,true);
  assert.equal(h.document.querySelector('.path').textContent,'case › type › Örnek');
});
test('source search results are displayed as text and package bytes must pass SHA-256',async()=>{
  const h=harness();await h.flush();h.document.getElementById('aiQuery').value='test';h.document.getElementById('aiSearch').click();await h.flush();
  assert.equal(h.document.getElementById('aiResults').querySelector('script'),null);assert.match(h.document.getElementById('aiResults').textContent,/DOC-test/);
  const file=await h.context.readAIFile('zip');assert.equal(Buffer.from(file.buffer).toString(),'synthetic zip bytes');
  h.data.tamper=true;await assert.rejects(h.context.readAIFile('zip'),/bütünlük|doğrulanamadı/);
});

test('session wizard gives an explicit login instruction and blocks scan and bundle actions',async()=>{
  const h=harness();await h.flush();h.data.portal={stage:'session_expired',message:'UYAP oturumu sona erdi. Yeniden giriş yapın.'};
  await h.context.refreshGuide();assert.match(h.document.getElementById('guideMessage').textContent,/Yeniden giriş/);
  assert.equal(h.document.getElementById('scan').disabled,true);assert.equal(h.document.getElementById('bundleStart').disabled,true);
  h.data.portal={stage:'ready',scope:true,message:'Evrak hazır'};await h.context.refreshGuide();assert.equal(h.document.getElementById('scan').disabled,false);
});

test('experimental support is visible, requires a user choice, and leaves silent mode disabled',async()=>{
  const h=harness();await h.flush();assert.equal(h.document.getElementById('experimentalPanel').hidden,true);
  h.data.portal={stage:'experimental_disabled',experimental:true,experimentalEnabled:false,sourceLabel:'Danıştay Dosya Sorgulama',message:'Deneysel bölüm kapalı'};await h.context.refreshGuide();
  assert.equal(h.document.getElementById('experimentalPanel').hidden,false);assert.equal(h.document.getElementById('experimentalEnabled').checked,false);assert.equal(h.document.getElementById('scan').disabled,true);
  h.document.getElementById('experimentalEnabled').checked=true;h.document.getElementById('experimentalEnabled').dispatchEvent(new h.document.defaultView.Event('change'));await h.flush();
  assert.equal(h.data.calls.find(m=>m.type==='guide.experimental').enabled,true);assert.equal(h.data.calls.some(m=>m.type==='scan'),false);assert.equal(h.document.getElementById('scan').disabled,false);assert.equal(h.document.getElementById('bundleStart').disabled,true);
  assert.equal(h.document.getElementById('guideBadge').textContent,'Deneysel');assert.match(h.document.getElementById('guideSteps').textContent,/Danıştay Dairesi/);
  h.context.render({id:'experimental-case',title:'Örnek',status:'ready',scannedAt:new Date().toISOString(),warnings:[],portal:{menuId:'28934',experimental:true},items:[]});
  assert.equal(h.document.getElementById('sourceNotice').hidden,false);assert.equal(h.document.getElementById('trial').disabled,false);assert.equal(h.document.getElementById('bundleTrial').disabled,true);
});

test('a paused silent trial offers its ZIP but does not expose classical trial controls',async()=>{
  const h=harness();await h.flush();const job=await h.context.command('get');job.delivery='bundle';job.status='paused';job.bundle={zip:'demo.zip'};h.context.render(job);
  assert.equal(h.document.getElementById('trial').hidden,true);assert.equal(h.document.getElementById('start').hidden,true);assert.equal(h.document.getElementById('bundleOpen').hidden,false);
});
