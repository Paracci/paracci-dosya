const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const {webcrypto}=require('node:crypto');const T=require('../extension/transport.js');
function harness(){
  const data={calls:[],timers:[],released:0,streamResult:{ok:true,bytes:20,extension:'pdf'},session:{},local:{}};
  let job={id:'job',caseKey:'b'.repeat(64),targetTabId:7,status:'ready',snapshot:{title:'Case',context:{caseToken:'"case"'},warnings:[]},items:[{key:'a'.repeat(64),token:'"document"',label:'Belge',directory:'UYAP/Case [bbbbbbbb]/Type',baseName:'Belge [aaaaaaaaaaaa]',state:'pending'}]};
  data.session.downloadTemplate=T.template('https://vatandas.uyap.gov.tr/save?e='+encodeURIComponent('"document"'),'"document"','"case"','Case');
  Object.assign(data.session.downloadTemplate,{verified:true,chromeVerdict:'safe'});
  const native=async(op,payload)=>{data.calls.push({op,...payload});if(op==='archive_prepare')return {archive_id:'c'.repeat(64),items:[{key:'a'.repeat(64),complete:false}]};if(op==='archive_status')return {title:'Case',items:[{complete:true}],status:'collecting'};if(op==='archive_finalize')return {status:'completed',source:'C:/Downloads/UYAP/Case [bbbbbbbb]',zip:'case.zip'};return {};};
  const chrome={runtime:{id:'extension'},storage:{session:{async get(k){return {[k]:data.session[k]};}},local:{async get(k){return {[k]:data.local[k]};},async set(value){Object.assign(data.local,value);}}},alarms:{async create(){}},scripting:{async executeScript(options){data.streamArgs=options.args;if(data.waitStream)return new Promise(resolve=>{data.resolveStream=()=>resolve([{result:data.streamResult}]);});return [{result:data.streamResult}];}}};
  const context=vm.createContext({chrome,ArchiveAI:{request:native,hold(){return ()=>data.released++;}},ArchiveTransport:T,ArchiveCore:{isReceiptRecord(){return false;},canLearnRoute(value){return value==='safe';}},crypto:webcrypto,URL,TextEncoder,setTimeout(fn){data.timers.push(fn);}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/bundle.js'),'utf8'),context);
  const api={async read(){return structuredClone(job);},async write(value){job=structuredClone(value);},publicJob:v=>v,async requireDocuments(){if(data.expired){const e=new Error('Oturum sona erdi');e.code='session_expired';throw e;}},async classic(){}};
  return {data,api,bridge:context.ArchiveBundle,get job(){return job;}};
}
test('silent job completes through the native archive without invoking Chrome downloads',async()=>{
  const h=harness();await h.bridge.handle({type:'bundle.start'},h.api);assert.ok(h.data.local.bundleCheckpoint);
  await h.data.timers.shift()();assert.equal(h.job.items[0].state,'complete');
  await h.data.timers.shift()();assert.equal(h.job.status,'completed');assert.equal(h.data.released,1);assert.equal(h.data.calls.at(-1).op,'archive_finalize');
});
test('stream commands require the active nonce, extension identity and original top tab',async()=>{
  const h=harness();h.data.waitStream=true;await h.bridge.handle({type:'bundle.start'},h.api);const running=h.data.timers.shift()();for(let n=0;n<5;n++)await new Promise(r=>setImmediate(r));
  const nonce=h.data.streamArgs[4],message={type:'bundle.stream.begin',nonce,extension:'pdf',key:'d'.repeat(64)};
  for(const sender of [{id:'other',tab:{id:7},origin:'https://vatandas.uyap.gov.tr'},{id:'extension',tab:{id:8},origin:'https://vatandas.uyap.gov.tr'},{id:'extension',tab:{id:7},origin:'https://example.org',url:'https://example.org'}])await assert.rejects(h.bridge.receive(message,sender,h.api.read),/doğrulanamadı/);
  await h.bridge.receive(message,{id:'extension',tab:{id:7},origin:'https://vatandas.uyap.gov.tr'},h.api.read);assert.equal(h.data.calls.at(-1).key,'a'.repeat(64));
  h.data.resolveStream();await running;
});
test('session expiry keeps the document pending and never finalizes a partial archive',async()=>{
  const h=harness();h.data.streamResult={ok:false,code:'session_expired',message:'Oturum sona erdi'};
  await h.bridge.handle({type:'bundle.start'},h.api);await h.data.timers.shift()();assert.equal(h.job.status,'session_expired');assert.equal(h.job.items[0].state,'pending');assert.equal(h.data.calls.some(c=>c.op==='archive_finalize'),false);
});
test('missing verified download route fails before creating any native archive',async()=>{
  const h=harness();delete h.data.session.downloadTemplate;
  await assert.rejects(h.bridge.handle({type:'bundle.start'},h.api),/doğrulanmadı/);assert.equal(h.data.calls.length,0);
  h.data.session.downloadTemplate=T.template('https://vatandas.uyap.gov.tr/save?e='+encodeURIComponent('"document"'),'"document"','"case"','Case');
  await assert.rejects(h.bridge.handle({type:'bundle.start'},h.api),/doğrulanmadı/);assert.equal(h.data.calls.length,0);
});

test('unverified experimental menus cannot enter silent collection or calibration',async()=>{
  const h=harness(),job=await h.api.read();job.snapshot.portal={menuId:'28934',experimental:true};await h.api.write(job);
  for(const type of ['bundle.start','bundle.try','bundle.calibrate'])await assert.rejects(h.bridge.handle({type},h.api),/Danıştay/);
  assert.equal(h.data.calls.length,0);assert.equal(h.data.streamArgs,undefined);
});

test('a saved fully fetched archive can finish locally after restart without a portal or session',async()=>{
  const h=harness();await h.api.write(null);h.data.expired=true;h.data.local.bundleCheckpoint={archiveId:'c'.repeat(64)};
  const result=await h.bridge.handle({type:'bundle.recover'},h.api);assert.equal(result.ready,true);assert.equal(h.data.streamArgs,undefined);assert.equal(h.data.calls.at(-1).op,'archive_finalize');
});

test('one-document silent trial stops with a partial-case notice instead of fetching the rest',async()=>{
  const h=harness();const job=await h.api.read();job.items.push({...job.items[0],key:'d'.repeat(64),baseName:'Belge [dddddddddddd]'});await h.api.write(job);
  await h.bridge.handle({type:'bundle.try'},h.api);assert.equal(h.data.calls.find(c=>c.op==='archive_prepare').plan.items.length,1);
  await h.data.timers.shift()();await h.data.timers.shift()();assert.equal(h.job.status,'paused');assert.equal(h.job.items[1].state,'pending');assert.match(h.job.message,/tüm dava değildir/);assert.equal(h.data.local.bundleCheckpoint.trial,true);
});
