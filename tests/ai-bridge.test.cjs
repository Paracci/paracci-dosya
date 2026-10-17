const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');const {webcrypto}=require('node:crypto');
function harness(){
  const data={local:{},session:{},calls:[]},listeners={};
  const port={onMessage:{addListener(fn){listeners.message=fn;}},onDisconnect:{addListener(fn){listeners.disconnect=fn;}},disconnect(){listeners.disconnect?.();},postMessage(message){
    data.calls.push(message);let value;
    if(message.op==='hello')value={protocol:1,ready:true};
    if(message.op==='prepare')value={task_id:'a'.repeat(32),source:message.source,status:'queued'};
    if(message.op==='status')value={task_id:'a'.repeat(32),source:data.local.aiTask?.source,status:'completed'};
    if(message.op==='latest')value={task_id:'c'.repeat(32),source:message.source,status:'completed'};
    if(message.op==='archive_status')value=data.archiveState||{status:'completed',case_key:'b'.repeat(64),source:'C:/Downloads/UYAP/Case [aaaaaaaa]'};
    queueMicrotask(()=>listeners.message({id:message.id,ok:true,value}));
  }};
  const store=area=>({async get(k){return {[k]:data[area][k]};},async set(v){Object.assign(data[area],v);}});
  const chrome={runtime:{connectNative(){return port;}},storage:{session:store('session'),local:store('local')},downloads:{async search(){return [{exists:true,filename:'C:\\Downloads\\UYAP\\Case [aaaaaaaa]\\Group\\file.pdf'}];}}};
  const context=vm.createContext({chrome,crypto:webcrypto,setTimeout(){return 1;},clearTimeout(){}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/ai_bridge.js'),'utf8'),context);
  const job={id:'case',status:'completed',items:[{state:'complete',path:'UYAP/Case [aaaaaaaa]/Group/file.pdf',downloadId:7}]};
  return {data,chrome,api:context.ArchiveAI,job};
}
test('native preparation derives the archive from owned downloads and ignores a caller source path',async()=>{
  const h=harness();await h.api.handle({type:'ai.prepare',source:'C:/Windows'},async()=>h.job,v=>v);
  const call=h.data.calls.find(c=>c.op==='prepare');
  assert.equal(call.source,'C:/Downloads/UYAP/Case [aaaaaaaa]');assert.equal(h.data.local.aiTask.task_id,'a'.repeat(32));
});
test('incomplete or actively scanned archives cannot start the native engine',async()=>{
  const h=harness();h.job.status='running';
  await assert.rejects(h.api.handle({type:'ai.prepare'},async()=>h.job,v=>v),/tamamlayın/);
  h.job.status='completed';h.data.session.scanProgress={active:true};
  await assert.rejects(h.api.handle({type:'ai.prepare'},async()=>h.job,v=>v),/taramasının/);
  assert.equal(h.data.calls.length,0);
});
test('a package from another case cannot be searched or downloaded',async()=>{
  const h=harness();h.data.local.aiTask={task_id:'b'.repeat(32),source:'C:/Downloads/UYAP/Other [bbbbbbbb]'};
  await assert.rejects(h.api.handle({type:'ai.search',query:'test'},async()=>h.job,v=>v),/başka bir davaya/);
  await assert.rejects(h.api.handle({type:'ai.fileChunk',file:'zip',offset:0},async()=>h.job,v=>v),/başka bir davaya/);
  await assert.rejects(h.api.handle({type:'ai.openReadable'},async()=>h.job,v=>v),/başka bir davaya/);
  assert.equal(h.data.calls.length,0);
});

test('quality choices reach the native worker without accepting arbitrary paths',async()=>{
  const h=harness();await h.api.handle({type:'ai.prepare',profile:'quality',forcePdfOcr:true,readableCopy:true,source:'C:/Windows'},async()=>h.job,v=>v);
  const call=h.data.calls.find(c=>c.op==='prepare');assert.equal(call.profile,'quality');assert.equal(call.force_pdf_ocr,true);assert.equal(call.readable_copy,true);
  assert.equal(call.source,'C:/Downloads/UYAP/Case [aaaaaaaa]');
});

test('reconnecting finds the latest prepared package for the current owned archive',async()=>{
  const h=harness();h.data.local.aiTask={task_id:'a'.repeat(32),source:'C:/Downloads/UYAP/Old [bbbbbbbb]'};
  const value=await h.api.handle({type:'ai.status'},async()=>h.job,v=>v);
  assert.equal(value.task_id,'c'.repeat(32));assert.equal(h.data.local.aiTask.source,'C:/Downloads/UYAP/Case [aaaaaaaa]');
});

test('AI can use a verified silent archive but cannot substitute another case identity',async()=>{
  const h=harness();h.job.delivery='bundle';h.job.archiveId='c'.repeat(64);h.job.caseKey='b'.repeat(64);
  assert.equal(await h.api.sourceFor(h.job),'C:/Downloads/UYAP/Case [aaaaaaaa]');
  h.data.archiveState={status:'completed',case_key:'d'.repeat(64),source:'C:/Downloads/UYAP/Other [dddddddd]'};
  await assert.rejects(h.api.sourceFor(h.job),/bu dava/);
});
