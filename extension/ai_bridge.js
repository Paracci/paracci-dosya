/* Scoped, on-demand Native Messaging client. Never accepts commands from a web page. */
(function(root){
  const HOST='com.uyap.archive_ai';
  let port=null, idleTimer=null, pollTimer=null,holds=0;
  const requests=new Map();
  function idle(){
    clearTimeout(idleTimer);
    if(!pollTimer&&!holds)idleTimer=setTimeout(()=>{if(!requests.size&&port){const old=port;port=null;old.disconnect();}},20000);
  }
  function connection(){
    if(port)return port;
    const current=chrome.runtime.connectNative(HOST);port=current;
    current.onMessage.addListener(response=>{
      const pending=requests.get(response.id);if(!pending)return;
      requests.delete(response.id);clearTimeout(pending.timer);
      if(response.ok)pending.resolve(response.value);else pending.reject(new Error(response.error||'Yerel işlem tamamlanamadı.'));
      idle();
    });
    current.onDisconnect.addListener(()=>{
      const reason=chrome.runtime.lastError?.message;
      if(port!==current)return;
      port=null;
      for(const pending of requests.values()){clearTimeout(pending.timer);pending.reject(new Error(reason?'Yerel motor bağlantısı açılamadı. Bir kerelik bağlayıcı kaydını ve eklentinin yerel uygulama iznini kontrol edin.':'Yerel motor bağlantısı kesildi. Yeniden bağlanın.'));}
      requests.clear();
    });
    return current;
  }
  function request(op,payload={}){
    clearTimeout(idleTimer);
    return new Promise((resolve,reject)=>{
      const id=crypto.randomUUID();
      const timer=setTimeout(()=>{requests.delete(id);reject(new Error('Yerel motor zamanında yanıt vermedi. Yeniden bağlanın.'));},['archive_prepare','archive_finalize'].includes(op)?120000:15000);
      requests.set(id,{resolve,reject,timer});
      try{connection().postMessage({id,op,...payload});}
      catch{clearTimeout(timer);requests.delete(id);reject(new Error('Yerel motor izni kullanılamıyor. Eklentiyi yeni izinle yeniden yükleyin.'));}
    });
  }
  async function sourceFor(job){
    if(!job||job.status!=='completed'||!job.items.length||job.items.some(i=>!['complete','skipped'].includes(i.state)))throw new Error('Önce dava arşivini tamamlayın.');
    if(job.delivery==='bundle'){
      const state=await request('archive_status',{archive_id:job.archiveId,verify:true});
      if(state.status!=='completed'||state.case_key!==job.caseKey)throw new Error('Toplu arşiv bu dava için doğrulanamadı. Tek ZIP işlemini tamamlayın.');return state.source;
    }
    const first=job.items.find(i=>i.downloadId&&i.path);
    if(!first)throw new Error('Doğrulanmış indirme yolu bulunamadı. Yeniden tarayın.');
    const [download]=await chrome.downloads.search({id:first.downloadId});
    const absolute=download?.filename?.replace(/\\/g,'/'),relative=first.path;
    if(!download?.exists||!absolute?.endsWith('/'+relative))throw new Error('Arşivin konumu doğrulanamadı. Yeniden tarayın.');
    const parts=relative.split('/');
    if(parts.length<3||parts.some(p=>p==='..'||!p))throw new Error('Arşiv yolu geçersiz.');
    const casePrefix=parts.slice(0,2).join('/');
    if(job.items.some(i=>!i.path?.startsWith(casePrefix+'/')))throw new Error('Arşiv dosyaları aynı dava kökünde değil.');
    return absolute.slice(0,-relative.length)+casePrefix;
  }
  async function remember(value){
    await chrome.storage.local.set({aiTask:{task_id:value.task_id,source:value.source}});
    await chrome.storage.session.set({aiState:value});
  }
  function samePath(a,b){return a?.replace(/\\/g,'/').toLowerCase()===b?.replace(/\\/g,'/').toLowerCase();}
  async function taskForCurrent(readJob){
    const {aiTask}=await chrome.storage.local.get('aiTask');
    if(!aiTask)throw new Error('Bu arşiv için önce AI paketi hazırlayın.');
    if(!samePath(await sourceFor(await readJob()),aiTask.source))throw new Error('Son AI işlemi başka bir davaya ait. Bu dava için yeni paket hazırlayın.');
    return aiTask;
  }
  function watch(taskId){
    clearTimeout(pollTimer);
    pollTimer=setTimeout(async()=>{
      pollTimer=null;
      try{
        const value=await request('status',{task_id:taskId});await remember(value);
        if(['queued','running'].includes(value.status))watch(taskId);else idle();
      }catch(error){await chrome.storage.session.set({aiState:{task_id:taskId,status:'disconnected',message:error.message}});idle();}
    },1200);
  }
  async function handle(message,readJob,publicJob){
    if(message.type==='ai.connect'){
      const hello=await request('hello');
      if(hello.protocol!==1||!hello.ready)throw new Error('Yerel motor kurulumu tamamlanmamış. Python, OCR ve model kurulumunu kontrol edin.');
      return hello;
    }
    if(message.type==='ai.prepare'){
      const {scanProgress}=await chrome.storage.session.get('scanProgress');
      if(scanProgress?.active)throw new Error('Önce arşiv taramasının bitmesini bekleyin.');
      const job=await readJob(),source=await sourceFor(job);
      const value=await request('prepare',{source,report:publicJob(job),profile:message.profile||'standard',force_pdf_ocr:message.forcePdfOcr??false,readable_copy:message.readableCopy??false});await remember(value);
      if(['queued','running'].includes(value.status))watch(value.task_id);
      return value;
    }
    if(message.type==='ai.status'){
      const source=await sourceFor(await readJob());
      const value=await request('latest',{source});
      if(!value)return {status:'idle',message:'Bu arşiv için AI paketi hazırlayabilirsiniz.'};
      await remember(value);
      if(['queued','running'].includes(value.status))watch(value.task_id);
      return value;
    }
    const task=await taskForCurrent(readJob);
    if(message.type==='ai.openReadable')return request('open_readable',{task_id:task.task_id});
    if(message.type==='ai.search')return request('search',{task_id:task.task_id,query:message.query});
    if(message.type==='ai.fileInfo')return request('file_info',{task_id:task.task_id,file:message.file});
    if(message.type==='ai.fileChunk')return request('file_chunk',{task_id:task.task_id,file:message.file,offset:message.offset,size:192*1024});
    throw new Error('Bilinmeyen AI işlemi.');
  }
  root.ArchiveAI={handle,sourceFor,request,hold(){holds++;clearTimeout(idleTimer);let ended=false;return ()=>{if(!ended){ended=true;holds=Math.max(0,holds-1);idle();}};}};
})(globalThis);
