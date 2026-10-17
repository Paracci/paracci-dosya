const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const { token } = require('./fixtures.cjs');
function snapshot() {
  return { title:'Örnek Mahkeme - 2026/123', context:{caseToken:'"case"',jurisdiction:'1'}, warnings:[],groups:['2026/123'],scannedAt:new Date().toISOString(),
    records:[{token:token(1),label:'Beyan 08/04/2026',folders:['2026/123','Beyan'],parentToken:null,isAttachment:false},
      {token:token(2),label:'Ek 1',folders:['2026/123','Beyan'],parentToken:token(1),parentLabel:'Beyan 08/04/2026',isAttachment:true},
      {token:token(3),label:'Başka Evrak',folders:['2026/123','Başka Tür'],parentToken:null,isAttachment:false}] };
}
function harness(saved) {
  const data = saved || {session:{targetTabId:7},local:{},downloads:{},calls:[],timers:[]};
  const listeners={};
  const event = name => ({addListener(fn){listeners[name]=fn;}});
  const store = area => ({async get(key){return {[key]:structuredClone(data[area][key])};},async set(obj){Object.assign(data[area],structuredClone(obj));
    if(area==='session'&&obj.scanProgress){data.progressEvents ||= [];data.progressEvents.push(structuredClone(obj.scanProgress));}},async clear(){data[area]={};}});
  const chrome={
    action:{onClicked:event('action')},runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:event('message'),onStartup:event('startup')},
    tabs:{async get(){return {id:7,url:'https://vatandas.uyap.gov.tr/main/jsp/vatandas/index.jsp'};},async create(){}},
    storage:{session:store('session'),local:store('local')},
    scripting:{async executeScript(options){if(options.func.name==='probe')return [{result:data.portal||{stage:'ready',scope:true}}];if(options.func.name==='scanUyapDocument')return [{result:data.snapshot||snapshot()}];
      if(options.func.name==='inspectUyapHtmlDownload')return [{result:data.htmlResult||{valid:false,reason:'HTML kontrolü reddedildi.'}}];
      if(options.func.name==='diagnose')return [{result:data.diagnosis||{session:'unknown'}}];
      data.calls.push(options.args);return [{result:true}];}},
    alarms:{async create(){},async clear(){},onAlarm:event('alarm')},
    downloads:{onDeterminingFilename:event('filename'),onChanged:event('changed'),async search({id}){return data.downloads[id]?[structuredClone(data.downloads[id])]:[];},
      async cancel(id){data.downloads[id]={...data.downloads[id],state:'interrupted'};},async show(){}}
  };
  class ClockDate extends Date { static now(){return data.now ?? Date.now();} }
  const context=vm.createContext({chrome,crypto:webcrypto,TextEncoder,URL,console,Date:ClockDate,setTimeout:fn=>data.timers.push(fn)});
  context.importScripts=(...names)=>names.forEach(name=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension',name),'utf8'),context));
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/background.js'),'utf8'),context);
  const send=(type,extra={})=>new Promise(resolve=>listeners.message({type,rootFolder:'UYAP',concurrency:1,...extra},{id:'test',url:'chrome-extension://test/app.html'},resolve));
  const filename=download=>new Promise(resolve=>listeners.filename(download,resolve));
  const flush=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));};
  return {data,listeners,send,filename,flush};
}
test('queue serializes native downloads, ignores unrelated files, and keeps attachments with parent',async()=>{
  const h=harness();
  assert.equal((await h.send('scan')).ok,true);
  await h.send('start'); assert.equal(h.data.calls.length,1);
  const unrelated=await h.filename({id:50,url:'https://example.org/file.pdf',filename:'file.pdf',mime:'application/pdf'});
  assert.equal(unrelated,undefined); assert.equal(h.data.session.job.active.phase,'awaiting');
  const suggestion=await h.filename({id:51,url:'https://vatandas.uyap.gov.tr/save?e='+encodeURIComponent(token(1)),filename:'evrak.udf',mime:'application/octet-stream'});
  assert.match(suggestion.filename,/UYAP\/.*\.udf$/);
  h.data.downloads[51]={id:51,state:'complete',exists:true,fileSize:123,mime:'application/octet-stream',filename:'C:\\Downloads\\'+suggestion.filename.replaceAll('/','\\'),danger:'safe'};
  h.listeners.changed({id:51,state:{current:'complete'}}); await h.flush();
  assert.equal(h.data.session.job.items[0].state,'complete');
  assert.equal(h.data.calls.length,1); // Never starts the next document before completion.
  await h.listeners.alarm({name:'queue-next'}); await h.flush();
  assert.equal(h.data.calls.length,2);
  const attachment=await h.filename({id:52,url:'https://vatandas.uyap.gov.tr/save?e='+encodeURIComponent(token(2)),filename:'ek.pdf',mime:'application/pdf'});
  assert.equal(path.dirname(attachment.filename),path.dirname(suggestion.filename));
});

test('only file query documents can be scanned and an expired session stops before another download',async()=>{
  const h=harness();h.data.portal={stage:'file_query',scope:false,message:'Yalnızca Dosya Sorgulama'};
  const rejected=await h.send('scan');assert.equal(rejected.ok,false);assert.match(rejected.error,/Dosya Sorgulama/);assert.equal(h.data.calls.length,0);
  h.data.portal={stage:'ready',scope:true};await h.send('scan');h.data.portal={stage:'session_expired',scope:false,message:'UYAP oturumu sona erdi'};
  await h.send('start');assert.equal(h.data.session.job.status,'session_expired');assert.equal(h.data.calls.length,0);
});

test('experimental Danistay requires a per-tab opt-in and binds classic downloads to the source menu',async()=>{
  const h=harness();h.data.portal={stage:'ready',scope:true,experimental:true,menuId:'28934',sourceLabel:'Danıştay Dosya Sorgulama',caseTitle:snapshot().title};
  assert.equal((await h.send('scan')).ok,false);assert.equal(h.data.calls.length,0);
  assert.equal((await h.send('guide.experimental',{enabled:true})).ok,true);
  const plan=await h.send('scan');assert.equal(plan.ok,true);assert.equal(plan.value.portal.experimental,true);
  await h.send('trial');assert.equal(h.data.calls.length,1);assert.equal(h.data.calls[0][4],'28934');
  assert.equal((await h.send('guide.experimental',{enabled:false})).ok,false);
});

test('changing menu cannot reuse a scan, and an opt-in is not shared with another tab',async()=>{
  const h=harness();await h.send('scan');
  h.data.portal={stage:'ready',scope:true,experimental:true,menuId:'28934',caseTitle:snapshot().title};
  await h.send('guide.experimental',{enabled:true});await h.send('start');assert.equal(h.data.calls.length,0);assert.equal(h.data.session.job.status,'paused');assert.match(h.data.session.job.message,/bölümü değişti/);
  h.data.session.experimentalScope={targetTabId:8,menuId:'28934'};assert.equal((await h.send('scan')).ok,false);
  await h.send('guide.experimental',{enabled:true});assert.equal((await h.send('scan')).ok,true);
  await h.send('guide.experimental',{enabled:false});assert.equal((await h.send('start')).ok,true);assert.equal(h.data.calls.length,0);assert.equal(h.data.session.job.status,'paused');
});

test('a login HTML response is reported as expiry and is never retried as a document',async()=>{
  const h=harness();await h.send('scan');await h.send('start');h.data.diagnosis={session:'expired'};
  await h.filename({id:910,url:'https://vatandas.uyap.gov.tr/save?e='+encodeURIComponent(token(1)),filename:'login.html',mime:'text/html'});
  assert.equal(h.data.session.job.status,'session_expired');assert.equal(h.data.session.job.items[0].formatRetries,undefined);assert.equal(h.data.calls.length,1);
  assert.equal((await h.send('guide.status')).value.stage,'session_expired');
  h.data.portal={stage:'ready',scope:true,navigationStamp:1};assert.equal((await h.send('guide.status')).value.stage,'ready');
});

test('a silent route is learned only after successful completion and a safe Chrome verdict',async()=>{
  for(const danger of ['safe','file','accepted']){
    const h=harness();await h.send('scan');await h.send('start');const url='https://vatandas.uyap.gov.tr/save?e='+encodeURIComponent(token(1));
    const suggested=await h.filename({id:911,url,filename:'doc.pdf',mime:'application/pdf'});assert.equal(h.data.session.downloadTemplate,undefined);
    h.data.downloads[911]={id:911,url,state:'complete',exists:true,fileSize:100,danger,filename:'C:/Downloads/'+suggested.filename};h.listeners.changed({id:911,state:{current:'complete'}});await h.flush();
    assert.equal(!!h.data.session.downloadTemplate,danger==='safe');
    if(danger==='file')assert.equal(h.data.session.job.status,'error');
  }
});
test('HTML response pauses the queue and cannot be reported complete',async()=>{
  const h=harness();h.data.snapshot=snapshot();h.data.snapshot.records[0].documentTypes=['Vekalet Pulu Makbuzu']; await h.send('scan'); await h.send('start');
  h.data.downloads[61]={id:61,state:'in_progress'};
  await h.filename({id:61,url:'https://vatandas.uyap.gov.tr/save?e='+encodeURIComponent(token(1)),filename:'login.html',mime:'text/html'});
  assert.equal(h.data.session.job.status,'error');
  assert.equal(h.data.session.job.items[0].state,'error');
  assert.equal(h.data.calls.length,1);
  assert.equal(Object.keys(h.data.local.history||{}).length,0);
});
test('pause lets current download finish; restarted worker reconciles completion from persisted download ID',async()=>{
  let h=harness(); await h.send('scan'); await h.send('start');
  const suggestion=await h.filename({id:71,url:'https://vatandas.uyap.gov.tr/save?e='+encodeURIComponent(token(1)),filename:'evrak.pdf',mime:'application/pdf'});
  await h.send('pause');
  h.data.downloads[71]={id:71,state:'complete',exists:true,fileSize:123,filename:'C:\\Downloads\\'+suggestion.filename.replaceAll('/','\\'),danger:'safe'};
  h=harness(h.data); // Recreate service worker, keep storage and browser downloads.
  await h.listeners.alarm({name:'queue-watch'}); await h.flush();
  assert.equal(h.data.session.job.items[0].state,'complete');
  assert.equal(h.data.session.job.status,'paused');
  assert.equal(h.data.calls.length,1);
  const rescanned=await h.send('scan');
  assert.equal(rescanned.value.items[0].state,'skipped');
});
test('wrong output path and empty file never enter incremental history',async()=>{
  const h=harness(); await h.send('scan'); await h.send('start');
  await h.filename({id:81,url:'https://vatandas.uyap.gov.tr/save?e='+encodeURIComponent(token(1)),filename:'evrak.pdf',mime:'application/pdf'});
  h.data.downloads[81]={id:81,state:'complete',exists:true,fileSize:0,filename:'C:\\Downloads\\wrong.pdf',danger:'safe'};
  h.listeners.changed({id:81,state:{current:'complete'}}); await h.flush();
  assert.equal(h.data.session.job.status,'error');
  assert.equal(Object.keys(h.data.local.history||{}).length,0);
});
test('control messages from websites and content scripts are rejected',()=>{
  const h=harness(); let replied=false;
  assert.equal(h.listeners.message({type:'start'},{id:'test',url:'https://vatandas.uyap.gov.tr/'},()=>{replied=true}),false);
  assert.equal(replied,false);
});
test('trial downloads one main and its attachment, then pauses without starting the rest',async()=>{
  const h=harness(); await h.send('scan'); await h.send('trial');
  for(const [id,n] of [[91,1],[92,2]]){
    const suggestion=await h.filename({id,url:'https://vatandas.uyap.gov.tr/save?e='+encodeURIComponent(token(n)),filename:'evrak.pdf',mime:'application/pdf'});
    h.data.downloads[id]={id,state:'complete',exists:true,fileSize:123,filename:'C:\\Downloads\\'+suggestion.filename.replaceAll('/','\\'),danger:'safe'};
    h.listeners.changed({id,state:{current:'complete'}}); await h.flush();
    await h.listeners.alarm({name:'queue-next'}); await h.flush();
  }
  assert.equal(h.data.session.job.status,'paused');
  assert.equal(h.data.session.job.items[2].state,'pending');
  assert.equal(h.data.calls.length,2);
});
test('completed download with unknown fileSize uses received bytes and proceeds to its attachment',async()=>{
  const h=harness(); await h.send('scan'); await h.send('trial');
  const suggestion=await h.filename({id:101,url:'https://vatandas.uyap.gov.tr/save?e='+encodeURIComponent(token(1)),filename:'evrak.udf',mime:'application/octet-stream'});
  h.data.downloads[101]={id:101,state:'complete',exists:true,fileSize:-1,bytesReceived:2864,totalBytes:-1,filename:'C:\\Downloads\\'+suggestion.filename.replaceAll('/','\\'),danger:'safe'};
  h.listeners.changed({id:101,state:{current:'complete'}}); await h.flush();
  assert.equal(h.data.session.job.items[0].state,'complete');
  await h.listeners.alarm({name:'queue-next'}); await h.flush();
  assert.equal(h.data.calls.length,2);
});
test('Chrome unique filename is accepted only in the planned document directory',async()=>{
  const h=harness(); await h.send('scan'); await h.send('trial');
  const suggestion=await h.filename({id:102,url:'https://vatandas.uyap.gov.tr/save?e='+encodeURIComponent(token(1)),filename:'evrak.udf',mime:'application/octet-stream'});
  const unique=suggestion.filename.replace(/\.udf$/, ' (1).udf');
  h.data.downloads[102]={id:102,state:'complete',exists:true,fileSize:2864,filename:'C:\\Downloads\\'+unique.replaceAll('/','\\'),danger:'safe'};
  h.listeners.changed({id:102,state:{current:'complete'}}); await h.flush();
  assert.equal(h.data.session.job.items[0].state,'complete');
  assert.equal(h.data.session.job.items[0].path,unique);
});
async function nameDownload(h,id,n) {
  const suggestion=await h.filename({id,url:'https://vatandas.uyap.gov.tr/save?e='+encodeURIComponent(token(n)),filename:'evrak.udf',mime:'application/octet-stream'});
  h.data.downloads[id]={id,state:'in_progress',exists:true,fileSize:-1,bytesReceived:0,filename:'C:\\Downloads\\'+suggestion.filename.replaceAll('/','\\'),danger:'safe'};
  return suggestion;
}
async function completeDownload(h,id) {
  h.data.downloads[id]={...h.data.downloads[id],state:'complete',fileSize:2864,bytesReceived:2864};
  h.listeners.changed({id,state:{current:'complete'}}); await h.flush();
}
test('parallel queue fills two slots, accepts out-of-order completion, and refills only the freed slot',async()=>{
  const h=harness(); await h.send('scan',{concurrency:2}); await h.send('start',{concurrency:2});
  await nameDownload(h,201,1); await h.listeners.alarm({name:'queue-next'});
  await nameDownload(h,202,2); await h.listeners.alarm({name:'queue-next'});
  assert.equal(h.data.calls.length,2);
  assert.equal(h.data.session.job.inFlight.length,2);
  await completeDownload(h,202); await h.listeners.alarm({name:'queue-next'});
  assert.equal(h.data.calls.length,3);
  assert.equal(h.data.session.job.items[0].state,'downloading');
  assert.equal(h.data.session.job.items[1].state,'complete');
  assert.equal(h.data.session.job.items[2].state,'starting');
  await nameDownload(h,203,3); await completeDownload(h,203);
  await h.listeners.alarm({name:'queue-next'});
  assert.equal(h.data.session.job.status,'running'); // First download is still running.
  await completeDownload(h,201); await h.listeners.alarm({name:'queue-next'});
  assert.equal(h.data.session.job.status,'completed');
  assert.equal(h.data.session.job.inFlight.length,0);
});
test('pause stops new starts while both active slots finish and are recorded',async()=>{
  const h=harness(); await h.send('scan',{concurrency:2}); await h.send('start',{concurrency:2});
  await nameDownload(h,211,1); await h.listeners.alarm({name:'queue-next'}); await nameDownload(h,212,2);
  await h.send('pause'); await completeDownload(h,211); await completeDownload(h,212);
  await h.listeners.alarm({name:'queue-next'});
  assert.equal(h.data.calls.length,2);
  assert.equal(h.data.session.job.status,'paused');
  assert.equal(h.data.session.job.items[2].state,'pending');
  assert.equal(h.data.session.job.inFlight.length,0);
});
test('a failed parallel download stops new starts while the other slot can complete',async()=>{
  const h=harness(); await h.send('scan',{concurrency:2}); await h.send('start',{concurrency:2});
  await nameDownload(h,221,1); await h.listeners.alarm({name:'queue-next'}); await nameDownload(h,222,2);
  h.data.downloads[221].state='interrupted';
  h.listeners.changed({id:221,state:{current:'interrupted'}}); await h.flush();
  await completeDownload(h,222); await h.listeners.alarm({name:'queue-next'});
  assert.equal(h.data.calls.length,2);
  assert.equal(h.data.session.job.status,'error');
  assert.equal(h.data.session.job.items[1].state,'complete');
  assert.equal(h.data.session.job.items[2].state,'pending');
});
test('parallel trial never starts other main documents and waits for every trial file',async()=>{
  const h=harness(); await h.send('scan',{concurrency:3}); await h.send('trial',{concurrency:3});
  await nameDownload(h,231,1); await h.listeners.alarm({name:'queue-next'});
  await nameDownload(h,232,2); await h.listeners.alarm({name:'queue-next'});
  assert.equal(h.data.calls.length,2);
  assert.equal(h.data.session.job.status,'running');
  await completeDownload(h,232); await h.listeners.alarm({name:'queue-next'});
  assert.equal(h.data.session.job.status,'running');
  await completeDownload(h,231); await h.listeners.alarm({name:'queue-next'});
  assert.equal(h.data.session.job.status,'paused');
  assert.equal(h.data.session.job.items[2].state,'pending');
});
test('restarted worker reconciles multiple slots without starting a duplicate download',async()=>{
  let h=harness(); await h.send('scan',{concurrency:2}); await h.send('start',{concurrency:2});
  await nameDownload(h,241,1); await h.listeners.alarm({name:'queue-next'}); await nameDownload(h,242,2);
  h.data.downloads[241]={...h.data.downloads[241],state:'complete',fileSize:2864};
  h=harness(h.data); await h.listeners.alarm({name:'queue-watch'});
  assert.equal(h.data.session.job.items[0].state,'complete');
  assert.equal(h.data.session.job.items[1].state,'downloading');
  assert.equal(h.data.session.job.items[2].state,'starting');
  assert.equal(h.data.calls.length,3);
});
test('validated HTML receipt attachment is named in the parent folder and can complete',async()=>{
  const h=harness();h.data.snapshot=snapshot();h.data.snapshot.records[1].documentTypes=['Vekalet Pulu Makbuzu'];
  h.data.htmlResult={valid:true,format:'static-vekalet-pulu-makbuzu',bytes:19201};
  await h.send('scan');await h.send('start');
  await nameDownload(h,301,1);await completeDownload(h,301);await h.listeners.alarm({name:'queue-next'});
  const suggestion=await h.filename({id:302,url:'https://vatandas.uyap.gov.tr/save?e='+encodeURIComponent(token(2)),filename:'evrak.html',mime:'text/html'});
  assert.match(suggestion.filename,/\.html$/);
  assert.equal(path.dirname(suggestion.filename),h.data.session.job.items[0].directory);
  h.data.downloads[302]={id:302,state:'complete',exists:true,fileSize:19201,filename:'C:\\Downloads\\'+suggestion.filename.replaceAll('/','\\'),danger:'safe'};
  h.listeners.changed({id:302,state:{current:'complete'}});await h.flush();
  assert.equal(h.data.session.job.items[1].state,'complete');
  const report=(await h.send('get')).value;
  assert.equal(report.items[1].sourceFormat.extension,'html');
  assert.equal(report.items[1].htmlValidation.valid,true);
});
test('HTML receipt validation failure stops new starts and reports format without document text',async()=>{
  const h=harness();h.data.snapshot=snapshot();h.data.snapshot.records[0].documentTypes=['Vekalet Pulu Makbuzu'];
  h.data.htmlResult={valid:false,reason:'HTML belge etkin içerik veya giriş formu içeriyor.'};
  await h.send('scan');await h.send('start');
  await h.filename({id:311,url:'https://vatandas.uyap.gov.tr/save?e='+encodeURIComponent(token(1)),filename:'evrak.html',mime:'application/octet-stream'});
  const report=(await h.send('get')).value;
  assert.equal(report.status,'error');assert.equal(report.items[0].sourceFormat.extension,'html');
  assert.equal(report.items[0].htmlValidation.valid,false);assert.equal(h.data.calls.length,1);
});
test('rescan preserves 197 verified completed downloads and only schedules the remaining files',async()=>{
  const C=require('../extension/core.js');
  const h=harness();h.data.snapshot=snapshot();
  h.data.snapshot.records=Array.from({length:200},(_,n)=>({token:token(n+1),label:'Document '+n,folders:['2026/123','Documents'],parentToken:null,isAttachment:false}));
  const plan=await C.makePlan(h.data.snapshot);h.data.local.history={};
  for(const [n,item] of plan.items.slice(0,197).entries()){
    const relative=item.directory+'/'+item.baseName+'.udf',filename='C:\\Downloads\\'+relative.replaceAll('/','\\');
    h.data.local.history[item.key]={downloadId:1000+n,filename,path:relative,completedAt:Date.now()};
    h.data.downloads[1000+n]={id:1000+n,state:'complete',exists:true,fileSize:100,filename,danger:'safe'};
  }
  const result=(await h.send('scan')).value;
  assert.equal(result.items.filter(i=>i.state==='skipped').length,197);
  assert.equal(result.items.filter(i=>i.state==='pending').length,3);
  assert.ok(h.data.progressEvents.some(event=>event.phase==='verifying'&&event.processed===10&&event.total===197));
  assert.equal(h.data.session.scanProgress.phase,'done');
  assert.equal(h.data.session.scanProgress.active,false);
  assert.equal(h.data.session.scanProgress.verified,197);
  await h.send('start');assert.equal(h.data.calls[0][3],token(198));
});
test('a fully verified existing archive is immediately completed without another download',async()=>{
  const h=harness();await h.send('scan');await h.send('start');
  for(const [id,n] of [[401,1],[402,2],[403,3]]){
    await nameDownload(h,id,n);await completeDownload(h,id);await h.listeners.alarm({name:'queue-next'});
  }
  const result=(await h.send('scan')).value;
  assert.equal(result.status,'completed');assert.equal(result.items.filter(i=>i.state==='skipped').length,3);
  assert.equal(h.data.calls.length,3);
});
test('unexpected HTML metadata gets one delayed single-slot retry and can recover as TIFF',async()=>{
  const h=harness();h.data.now=Date.now();
  await h.send('scan',{concurrency:3});await h.send('start',{concurrency:3});
  await h.filename({id:501,url:'https://vatandas.uyap.gov.tr/save?e='+encodeURIComponent(token(1)),filename:'evrak.html',mime:'text/plain'});
  assert.equal(h.data.session.job.status,'running');assert.equal(h.data.session.job.items[0].state,'pending');
  assert.equal(h.data.session.job.concurrency,1);
  await h.listeners.alarm({name:'queue-next'});assert.equal(h.data.calls.length,1);
  h.data.now+=3000;await h.listeners.alarm({name:'queue-next'});assert.equal(h.data.calls.length,2);
  const suggestion=await h.filename({id:502,url:'https://vatandas.uyap.gov.tr/save?e='+encodeURIComponent(token(1)),filename:'evrak.tif',mime:'image/tiff'});
  assert.match(suggestion.filename,/\.tif$/);
  h.data.downloads[502]={id:502,state:'complete',exists:true,fileSize:3109469,filename:'C:\\Downloads\\'+suggestion.filename.replaceAll('/','\\'),danger:'safe'};
  h.listeners.changed({id:502,state:{current:'complete'}});await h.flush();
  assert.equal(h.data.session.job.items[0].state,'complete');
  const report=(await h.send('get')).value;assert.equal(report.items[0].formatRetries,1);
});
test('repeated unexpected HTML stops after one retry and never counts an HTML error page',async()=>{
  const h=harness();h.data.now=Date.now();await h.send('scan');await h.send('start');
  const url='https://vatandas.uyap.gov.tr/save?e='+encodeURIComponent(token(1));
  await h.filename({id:511,url,filename:'evrak.html',mime:'text/plain'});
  h.data.now+=3000;await h.listeners.alarm({name:'queue-next'});
  await h.filename({id:512,url,filename:'evrak.html',mime:'text/plain'});
  await h.listeners.alarm({name:'queue-next'});
  assert.equal(h.data.calls.length,2);assert.equal(h.data.session.job.status,'error');
  assert.equal(h.data.session.job.items[0].state,'error');assert.equal(Object.keys(h.data.local.history||{}).length,0);
});
test('pause during recovery cooldown prevents a new native download',async()=>{
  const h=harness();h.data.now=Date.now();await h.send('scan');await h.send('start');
  await h.filename({id:521,url:'https://vatandas.uyap.gov.tr/save?e='+encodeURIComponent(token(1)),filename:'evrak.html',mime:'text/plain'});
  await h.send('pause');h.data.now+=3000;await h.listeners.alarm({name:'queue-next'});
  assert.equal(h.data.calls.length,1);assert.equal(h.data.session.job.status,'paused');
});
test('format recovery waits for already active parallel transfers and preserves their completion',async()=>{
  const h=harness();h.data.now=Date.now();await h.send('scan',{concurrency:3});await h.send('start',{concurrency:3});
  await nameDownload(h,531,1);await h.listeners.alarm({name:'queue-next'});
  await h.filename({id:532,url:'https://vatandas.uyap.gov.tr/save?e='+encodeURIComponent(token(2)),filename:'evrak.html',mime:'text/plain'});
  h.data.now+=3000;await h.listeners.alarm({name:'queue-next'});
  assert.equal(h.data.calls.length,2);assert.equal(h.data.session.job.inFlight.length,1);
  await completeDownload(h,531);await h.listeners.alarm({name:'queue-next'});
  assert.equal(h.data.session.job.items[0].state,'complete');assert.equal(h.data.calls.length,3);
  assert.equal(h.data.calls[2][3],token(2));assert.equal(h.data.session.job.items[1].state,'starting');
});
