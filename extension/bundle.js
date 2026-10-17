/* Durable silent collection controller. Binary messages only from its active isolated stream. */
(function(root){
  let active=null,hold=null;
  const native=(op,payload={})=>ArchiveAI.request(op,payload);
  async function receive(message,sender,read){
    const job=await read();
    if(!active||sender.id!==chrome.runtime.id||sender.tab?.id!==job?.targetTabId||sender.frameId!==undefined&&sender.frameId!==0||sender.origin!=='https://vatandas.uyap.gov.tr'&&new URL(sender.url||'https://invalid.example').origin!=='https://vatandas.uyap.gov.tr'||message.nonce!==active.nonce||job.id!==active.jobId||job.status!=='running')throw new Error('Aktarım durdu veya gönderen doğrulanamadı.');
    if(message.type==='bundle.stream.begin')return native('archive_begin',{archive_id:job.archiveId,key:active.key,extension:message.extension});
    if(message.type==='bundle.stream.chunk'){
      const transfer=active;
      const result=await native('archive_chunk',{archive_id:job.archiveId,key:active.key,offset:message.offset,data:message.data});
      if(active===transfer&&Date.now()-(transfer.lastProgressAt||0)>800){transfer.lastProgressAt=Date.now();await chrome.storage.session.set({bundleProgress:{jobId:job.id,label:job.items.find(i=>i.key===transfer.key)?.label||'Evrak',bytes:result.offset,updatedAt:Date.now()}});}
      return result;
    }
    if(message.type==='bundle.stream.finish')return native('archive_finish_file',{archive_id:job.archiveId,key:active.key,bytes:message.bytes});
    throw new Error('Geçersiz aktarım işlemi.');
  }
  async function pump(api){
    if(active)return;
    const job=await api.read();if(job?.delivery!=='bundle'||job.status!=='running')return;
    const index=job.items.findIndex(i=>(!job.bundleKeys||job.bundleKeys.includes(i.key))&&!['complete','skipped'].includes(i.state));
    if(index<0){
      try{job.message='Dosyalar doğrulandı; tek ZIP hazırlanıyor…';await api.write(job);const result=await native('archive_finalize',{archive_id:job.archiveId});job.status=job.bundleTrial?'paused':'completed';job.bundle=result;job.message=job.bundleTrial?'Tek evrak denemesi tamamlandı. Hazır ZIP’i kontrol edin; bu tüm dava değildir. Tek ZIP topla / devam et ile tam plana geçin.':'Tek ZIP hazır. Dosyalar yerel klasörünüzde; Chrome’da tek tek indirme başlatılmadı.';await api.write(job);}
      catch(error){job.status='error';job.message=error.message;await api.write(job);}finally{hold?.();hold=null;}
      return;
    }
    const item=job.items[index],nonce=crypto.randomUUID();active={nonce,key:item.key,jobId:job.id};
    try{
      await api.requireDocuments(job.targetTabId,job.snapshot.title,job.snapshot.portal?.menuId||'12573');
      const {downloadTemplate}=await chrome.storage.session.get('downloadTemplate');
      const url=ArchiveTransport.address(downloadTemplate,item.token,job.snapshot.context.caseToken,job.snapshot.title);
      item.state='downloading';job.message=`Sessiz toplama: ${item.label}`;await api.write(job);
      const [{result}]=await chrome.scripting.executeScript({target:{tabId:job.targetTabId},func:ArchiveTransport.stream,args:[url,job.snapshot.title,job.snapshot.context.caseToken,item.token,nonce,ArchiveCore.isReceiptRecord(item)]});
      const fresh=await api.read();if(fresh?.id!==job.id||fresh.status!=='running')return;
      if(!result?.ok){const error=new Error(result?.message||'Aktarım tamamlanamadı.');error.code=result?.code;throw error;}
      item.state='complete';item.path=item.directory+'/'+item.baseName+'.'+result.extension;item.verification={method:'native_sha256',bytes:result.bytes};await api.write(job);
    }catch(error){
      const fresh=await api.read();if(fresh?.id===job.id&&fresh.status==='running'){
        fresh.items[index].state='pending';fresh.status=error.code==='session_expired'?'session_expired':error.code==='offline'?'offline':'paused';fresh.message=error.message;if(fresh.status==='session_expired')await api.expire?.(fresh);await api.write(fresh);
      }
    }finally{active=null;}
    if((await api.read())?.status==='running')setTimeout(()=>pump(api).catch(()=>{}),150);
    else{hold?.();hold=null;}
  }
  async function handle(message,api){
    if(['bundle.recover','bundle.openSaved'].includes(message.type)){
      if(active||(await api.read())?.status==='running')throw new Error('Önce aktif aktarımı duraklatın.');
      const {bundleCheckpoint}=await chrome.storage.local.get('bundleCheckpoint');
      if(!bundleCheckpoint)throw new Error('Kaydedilmiş toplu çalışma bulunamadı.');
      if(message.type==='bundle.openSaved')return native('archive_open',{archive_id:bundleCheckpoint.archiveId,kind:'zip'});
      const saved=await native('archive_status',{archive_id:bundleCheckpoint.archiveId,verify:true});
      const done=saved.items.filter(i=>i.complete).length;
      if(done!==saved.items.length)return {ready:false,message:`${saved.title}: ${done} / ${saved.items.length} evrak doğrulandı. Eksikler için Dosya Sorgulama → Evrak bölümünü açın, tarayın ve Tek ZIP ile devam edin.`};
      const result=await native('archive_finalize',{archive_id:bundleCheckpoint.archiveId});
      const current=await api.read();if(current?.archiveId===bundleCheckpoint.archiveId){current.status='completed';current.bundle=result;current.message='Yerel evraklar doğrulandı; tek ZIP hazır.';await api.write(current);}
      return {ready:true,message:`${saved.title}: ZIP hazır. Yeni UYAP isteği yapılmadı.${bundleCheckpoint.trial?' Bu yalnızca tek evrak denemesidir; tüm dava değildir.':''}`,zip:result.zip};
    }
    const job=await api.read();if(!job)throw new Error('Önce Dosya Sorgulama → Evrak bölümünü açıp dosyayı tarayın.');
    if(job.snapshot.portal?.experimental&&['bundle.start','bundle.try','bundle.calibrate'].includes(message.type))throw new Error('Danıştay bölümünde Tek ZIP henüz doğrulanmadı. Klasik indirme bölümündeki Bir evrak ve eklerini dene seçeneğini kullanın.');
    if(message.type==='bundle.calibrate'){
      if(active||job.status==='running'||job.active||job.inFlight?.length||job.snapshot.warnings.length)throw new Error('Önce aktif aktarımı ve tarama uyarılarını kontrol edin.');
      await api.requireDocuments(job.targetTabId,job.snapshot.title,job.snapshot.portal?.menuId||'12573');
      const chosen=job.items.find(i=>i.state==='pending')||job.items[0];if(!chosen)throw new Error('Önce yeniden tarayın.');
      chosen.state='pending';chosen.error=null;chosen.downloadId=null;
      job.delivery='classic';job.calibrationOnly=true;job.trialKeys=[chosen.key];job.concurrency=1;job.status='running';await api.write(job);
      await chrome.alarms.create('queue-next',{when:Date.now()+100});return api.publicJob(await api.read());
    }
    if(message.type==='bundle.pause'){
      job.status='paused';job.message='Sessiz toplama duraklatıldı. Tamamlanan evraklar diskte korunur.';await api.write(job);
      for(const item of job.items)if(item.state==='downloading')item.state='pending';await api.write(job);
      if(active)await chrome.scripting.executeScript({target:{tabId:job.targetTabId},func:nonce=>globalThis.__paracciTransfers?.get(nonce)?.abort(),args:[active.nonce]}).catch(()=>{});
      return api.publicJob(job);
    }
    if(message.type==='bundle.open')return native('archive_open',{archive_id:job.archiveId,kind:message.kind==='zip'?'zip':'folder'});
    if(!['bundle.start','bundle.try'].includes(message.type))throw new Error('Bilinmeyen toplu indirme işlemi.');
    if(job.snapshot.warnings.length)throw new Error('Tarama uyarıları varken toplu arşivleme başlamaz.');
    if(active||job.status==='running'||job.active||job.inFlight?.length)throw new Error('Önce devam eden aktarımı duraklatıp bitmesini bekleyin.');
    await api.requireDocuments(job.targetTabId,job.snapshot.title,job.snapshot.portal?.menuId||'12573');
    const {downloadTemplate}=await chrome.storage.session.get('downloadTemplate');
    if(!downloadTemplate?.verified||!ArchiveCore.canLearnRoute(downloadTemplate.chromeVerdict))throw new Error('Bu dava için güvenli indirme bağlantısı doğrulanmadı. Önce yeniden tarayın veya Bağlantıyı doğrula adımını kullanın.');
    ArchiveTransport.address(downloadTemplate,job.items[0].token,job.snapshot.context.caseToken,job.snapshot.title);
    const trial=message.type==='bundle.try';
    const selected=trial?[job.items.find(i=>!i.isAttachment)||job.items[0]]:job.items;
    const plan={title:job.snapshot.title,case_key:job.caseKey,items:selected.map(i=>({key:i.key,directory:i.directory,base_name:i.baseName,label:i.label,receipt:ArchiveCore.isReceiptRecord(i),existing:!trial&&['complete','skipped'].includes(i.state)?i.path:null}))};
    if(plan.items.length>4000||new TextEncoder().encode(JSON.stringify(plan)).length>3*1024*1024)throw new Error('Tek ZIP plan sınırı aşıldı. Bu dava için klasik modu kullanın.');
    const state=await native('archive_prepare',{plan});
    job.delivery='bundle';job.bundleTrial=trial;job.bundleKeys=trial?selected.map(i=>i.key):null;job.archiveId=state.archive_id;job.bundle=null;job.active=null;job.inFlight=[];
    for(const item of selected){const complete=state.items.find(i=>i.key===item.key&&i.complete);item.state=complete?'complete':'pending';if(complete)item.path=item.directory+'/'+item.baseName+'.'+complete.extension;}
    job.status='running';job.message=`Sessiz toplama hazır: ${state.items.filter(i=>i.complete).length} tamamlanan evrak doğrulandı.`;await api.write(job);
    await chrome.storage.local.set({bundleCheckpoint:{archiveId:state.archive_id,caseKey:job.caseKey,title:job.snapshot.title,trial,updatedAt:Date.now()}});
    hold=ArchiveAI.hold();setTimeout(()=>pump(api).catch(()=>{}),0);return api.publicJob(job);
  }
  root.ArchiveBundle={receive,handle};
})(globalThis);
