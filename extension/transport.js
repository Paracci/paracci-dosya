(function(root){
  const bare=s=>String(s).replace(/^"|"$/g,'');
  function identify(raw,token){let value=raw;for(let depth=0;depth<4;depth++){if(bare(value)===bare(token))return {depth,quoted:value.startsWith('"')&&value.endsWith('"')};try{const next=decodeURIComponent(value);if(next===value)break;value=next;}catch{break;}}return null;}
  function template(address,token,caseToken,title){
    try{
      const url=new URL(address);if(url.origin!=='https://vatandas.uyap.gov.tr'||url.hash)return null;
      let documents=0;
      const parts=url.search.slice(1).split('&').filter(Boolean).map(pair=>{
        const i=pair.indexOf('=');if(i<0)return {literal:pair};const raw=pair.slice(i+1),doc=identify(raw,token),fileCase=identify(raw,caseToken);
        if(doc){documents++;return {key:pair.slice(0,i),kind:'document',...doc};}
        if(fileCase)return {key:pair.slice(0,i),kind:'case',...fileCase};
        return {literal:pair};
      });
      return documents?{base:url.origin+url.pathname,parts,caseToken,title}:null;
    }catch{return null;}
  }
  function address(value,token,caseToken,title){
    if(!value||value.caseToken!==caseToken||value.title!==title)throw new Error('Bu dava için indirme bağlantısı doğrulanmadı. Önce bağlantı denemesini yapın.');
    const query=value.parts.map(part=>{if(part.literal!==undefined)return part.literal;let text=bare(part.kind==='document'?token:caseToken);if(part.quoted)text='"'+text+'"';for(let n=0;n<part.depth;n++)text=encodeURIComponent(text);if(!part.depth)text=encodeURIComponent(text);return part.key+'='+text;}).join('&');
    const result=new URL(value.base+'?'+query);if(result.origin!=='https://vatandas.uyap.gov.tr')throw new Error('İndirme adresi geçersiz');return result.href;
  }
  async function stream(address,title,caseToken,token,nonce,receipt){
    const failure=(code,message)=>Object.assign(new Error(message),{code});
    const same=()=>{
      if(location.origin!=='https://vatandas.uyap.gov.tr'||new URL(location.href).searchParams.get('menuId')!=='12573'||!document.querySelector('#btnQueryDoc'))throw failure('scope','Yalnızca Dosya Sorgulama bölümünde çalışır.');
      if(document.querySelector('#dosyaTitle')?.textContent.replace(/\s+/g,' ').trim()!==title||!document.querySelector('#browser')?.getClientRects().length)throw failure('case_changed','Açık dava veya Evrak sekmesi değişti. Yeniden tarayın.');
      const script=[...document.scripts].map(s=>s.textContent||'').find(s=>s.includes('evrakSolClickMenu')&&s.includes('downloadDoc'));
      if(script?.match(/var\s+dosyaId\s*=\s*'([^']+)'/)?.[1]!==caseToken||![...document.querySelectorAll('#browser span.file[evrak_id]')].some(e=>e.getAttribute('evrak_id')===token))throw failure('case_changed','Dava/belge bağlantısı değişti. Yeniden tarayın.');
    };
    const send=async(type,extra)=>{const response=await chrome.runtime.sendMessage({type:'bundle.stream.'+type,nonce,...extra});if(!response?.ok)throw failure('paused',response?.error||'Aktarım durdu.');return response.value;};
    const controller=new AbortController();globalThis.__paracciTransfers ||= new Map();globalThis.__paracciTransfers.set(nonce,controller);
    let timeout,reader;const touch=()=>{clearTimeout(timeout);timeout=setTimeout(()=>controller.abort(),120000);};touch();
    try{
      same();const url=new URL(address);if(url.origin!==location.origin)throw failure('scope','İndirme adresi UYAP değil.');
      const response=await fetch(url.href,{credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal});
      if([401,419].includes(response.status))throw failure('session_expired','UYAP oturumu sona erdi. Normal biçimde yeniden giriş yapın; ardından tarayıp devam edin.');
      if(response.status===403)throw failure('access','UYAP erişimi reddetti. Yetkinizi ve oturumunuzu kontrol edin.');
      if(!response.ok||!response.body||new URL(response.url||url.href).origin!==location.origin)throw failure('response','Belge yanıtı alınamadı. UYAP ekranını kontrol edin.');
      reader=response.body.getReader();let first=new Uint8Array(0),initial=[];
      const remember=bytes=>{initial.push(bytes);const keep=Math.min(bytes.length,65536-first.length);if(keep>0){const merged=new Uint8Array(first.length+keep);merged.set(first);merged.set(bytes.subarray(0,keep),first.length);first=merged;}};
      while(first.length<512){const chunk=await reader.read();touch();if(chunk.done)break;remember(chunk.value);}
      if(!first.length)throw failure('empty','Boş belge yanıtı kaydedilmedi.');
      const mime=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
      let peek=new TextDecoder().decode(first).trim();
      const hex=[...first.subarray(0,8)].map(n=>n.toString(16).padStart(2,'0')).join('');
      const binary=peek.startsWith('%PDF-')||/^(49492a00|4d4d002a|ffd8ff|89504e470d0a1a0a|504b0304|504b0506|504b0708)/.test(hex);
      const html=!binary&&(/^(?:<!doctype\s+html|<html|<head|<body|<form|<table)/i.test(peek)||mime==='text/html');
      if(html||mime==='application/json'&&!binary){while(first.length<65536){const part=await reader.read();touch();if(part.done)break;remember(part.value);}peek=new TextDecoder().decode(first).trim();}
      if((html||mime==='application/json'&&!binary)&&/(oturum.{0,70}(sona er|süresi.{0,20}dol|sonlan|geçersiz)|session.{0,25}(expired|timeout|invalid)|login_required|notauthenticated|e-devlet.{0,100}giriş|type=["']password)/i.test(peek.toLocaleLowerCase('tr-TR')))throw failure('session_expired','UYAP oturumu sona ermiş veya giriş sayfası dönmüş. Giriş yapıp yeniden tarayın.');
      if(mime==='application/json'&&!binary)throw failure('response','Belge yerine hata yanıtı döndü. UYAP ekranını kontrol edin.');
      let disposition=response.headers.get('content-disposition')||'';try{disposition=decodeURIComponent(disposition);}catch{}
      const named=disposition.match(/\.([a-z0-9]{1,8})(?:["';\s]|$)/i)?.[1]?.toLowerCase();
      let extension=peek.startsWith('%PDF-')?'pdf':/^(49492a00|4d4d002a)/.test(hex)?'tif':hex.startsWith('ffd8ff')?'jpg':hex.startsWith('89504e470d0a1a0a')?'png':/^504b(?:0304|0506|0708)/.test(hex)?(['udf','docx','xlsx'].includes(named)?named:'zip'):/^\s*(?:<\?xml[^>]*>\s*)?<template/i.test(peek)?'udf':html?'html':named||({'text/plain':'txt','text/csv':'csv','application/rtf':'rtf'}[mime]);
      if(!['pdf','udf','zip','tif','tiff','jpg','jpeg','png','txt','csv','html','htm','xml','rtf','doc','docx','xls','xlsx'].includes(extension))throw failure('format','Belge biçimi doğrulanamadı; dosya başarılı sayılmadı. Klasik modla kontrol edin.');
      if(html){
        if(!receipt)throw failure('format','Belge yerine desteklenmeyen HTML döndü. Oturumunuzu kontrol edin.');
        let size=initial.reduce((n,part)=>n+part.length,0);if(size>2*1024*1024)throw failure('format','HTML makbuz sınırı aşıldı.');while(true){const part=await reader.read();touch();if(part.done)break;size+=part.value.length;if(size>2*1024*1024)throw failure('format','HTML makbuz sınırı aşıldı.');initial.push(part.value);}
        const bytes=new Uint8Array(size);let pos=0;for(const part of initial){bytes.set(part,pos);pos+=part.length;}
        const template=document.createElement('template');template.innerHTML=new TextDecoder().decode(bytes);const body=template.content;
        if(body.querySelector('script,iframe,frame,object,embed,form,input,button,link,base,svg,math,img,video,audio,source'))throw failure('format','HTML makbuz etkin içerik içeriyor.');
        for(const element of body.querySelectorAll('*'))for(const attr of element.attributes){if(/^on/i.test(attr.name)||['src','href','srcset','action','data','background','poster','formaction','xlink:href'].includes(attr.name.toLowerCase())||element.tagName.toLowerCase()==='meta'&&attr.name.toLowerCase()==='http-equiv'&&attr.value.toLowerCase()!=='content-type')throw failure('format','HTML makbuz etkin bağlantı içeriyor.');}
        if(/url\s*\(|@import|expression\s*\(|behavior\s*:/i.test([...body.querySelectorAll('style,[style]')].map(e=>e.textContent+' '+e.getAttribute('style')).join(' '))||!body.querySelector('table')||!/makbuz/i.test(body.textContent)||!/vekalet/i.test(body.textContent))throw failure('format','HTML makbuz biçimi doğrulanamadı.');
      }
      await send('begin',{extension});let offset=0;
      const write=async bytes=>{for(let start=0;start<bytes.length;start+=96*1024){same();const part=bytes.subarray(start,start+96*1024);let binary='';for(let i=0;i<part.length;i+=8192)binary+=String.fromCharCode(...part.subarray(i,i+8192));await send('chunk',{offset,data:btoa(binary)});touch();offset+=part.length;if(offset>256*1024*1024)throw failure('size','Tek belge sınırı aşıldı.');}};
      for(const part of initial)await write(part);
      if(!html)while(true){const part=await reader.read();touch();if(part.done)break;await write(part.value);}
      const declared=Number(response.headers.get('content-length'));
      if(response.headers.get('content-length')&&!response.headers.get('content-encoding')&&Number.isFinite(declared)&&declared!==offset)throw failure('incomplete','Evrak eksik geldi; tamamlandı sayılmadı. Yeniden devam edin.');
      same();const finished=await send('finish',{bytes:offset});return {ok:true,bytes:offset,extension:extension==='zip'&&finished?.extension==='udf'?'udf':extension};
    }catch(error){return {ok:false,code:error.code||(typeof navigator!=='undefined'&&navigator.onLine===false?'offline':'connection'),message:error.code?error.message:'Aktarım kesildi veya bağlantı doğrulanamadı. Tamamlanan evraklar korunur; interneti ve UYAP oturumunu kontrol edin.'};}
    finally{clearTimeout(timeout);globalThis.__paracciTransfers.delete(nonce);try{await reader?.cancel();}catch{}}
  }
  async function diagnose(address){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);let reader;
    try{
      const url=new URL(address);if(location.origin!=='https://vatandas.uyap.gov.tr'||url.origin!==location.origin)return {session:'unknown'};
      const response=await fetch(url.href,{credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal});
      if([401,419].includes(response.status))return {session:'expired'};
      if(!/html|json|text\/plain/i.test(response.headers.get('content-type')||'')||!response.body)return {session:'unknown'};
      reader=response.body.getReader();let text='',count=0;
      while(count<65536){const part=await reader.read();if(part.done)break;count+=part.value.length;text+=new TextDecoder().decode(part.value.subarray(0,65536-count+part.value.length));}
      text=text.toLocaleLowerCase('tr-TR');
      const mime=response.headers.get('content-type')||'';
      if(!/html|json/i.test(mime)&&!/^(?:\s*<!doctype|\s*<html|\s*<form|\s*\{|\s*\[|\s*oturumunuz|\s*session|\s*login_required)/i.test(text))return {session:'unknown'};
      return {session:/(oturum.{0,70}(sona er|süresi.{0,20}dol|sonlan|geçersiz)|session.{0,25}(expired|timeout|invalid)|login_required|notauthenticated|e-devlet.{0,100}giriş|type=["']password)/i.test(text)?'expired':'unknown'};
    }catch{return {session:'unknown'};}finally{clearTimeout(timer);try{await reader?.cancel();}catch{}}
  }
  root.ArchiveTransport={template,address,stream,diagnose};if(typeof module!=='undefined')module.exports=root.ArchiveTransport;
})(globalThis);
