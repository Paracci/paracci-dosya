/* Passive portal state + user-requested visual guidance. No server requests. */
(function(root){
  function probe(){
    const visible=e=>!!e&&!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
    const text=e=>(e?.textContent||'').replace(/\s+/g,' ').trim();
    const clean=s=>s.toLocaleLowerCase('tr-TR');
    const base={checkedAt:Date.now(),navigationStamp:typeof performance==='undefined'?0:performance.timeOrigin,scope:false,online:typeof navigator==='undefined'||navigator.onLine!==false};
    if(location.origin!=='https://vatandas.uyap.gov.tr')return {...base,stage:'unsupported',message:'Yalnızca UYAP Vatandaş Portalı desteklenir.'};
    if(!base.online)return {...base,stage:'offline',message:'İnternet bağlantısı yok. Tamamlanan dosyalar korunur; bağlantı gelince kontrol edin.'};
    const alerts=[...document.querySelectorAll('[role="alert"],.bootbox,.alert,.jAlert,#popup_container')].filter(visible).map(text).join(' ').slice(0,12000);
    const expired=/(oturum.{0,50}(sona er|süresi.{0,15}dol|sonlan|zaman aş|geçersiz)|session.{0,20}(expired|timeout|invalid)|yeniden giriş yapmanız|tekrar giriş yapmanız)/i.test(clean(alerts));
    const loginUrl=/(?:^|\/)(?:giris|login|logout|index\.html)(?:[./]|$)/i.test(location.pathname);
    const loginForm=[...document.querySelectorAll('input[type="password"],form[action*="login"],form[action*="giris"]')].some(visible);
    const loginAction=!document.querySelector('#menuUL')&&[...document.querySelectorAll('a,button')].some(e=>visible(e)&&/giriş yap|e.devlet.{0,30}giriş/i.test(clean(text(e))));
    if(expired||loginForm||loginAction||loginUrl&&!document.querySelector('#menuUL'))return {...base,stage:'session_expired',message:'UYAP oturumu sona ermiş veya giriş bekliyor. UYAP’ta normal biçimde yeniden giriş yapın; ardından Evrak bölümüne dönüp yeniden tarayın.'};
    const route=new URL(location.href).searchParams.get('menuId');
    const danistay=route==='28934';
    const query=danistay?visible(document.querySelector('#btnQueryDocDanistay'))&&!!document.querySelector('#danistayDairesi'):visible(document.querySelector('#btnQueryDoc'))&&!!document.querySelector('#yargiTuru')&&!!document.querySelector('#mahkeme');
    const unsupported={'22016':'AYM başvuru listesi için evrak indirme bağlantısı doğrulanmadı.','12577':'Duruşma Sorgulama ekranında desteklenen evrak arşivi akışı bulunamadı.','37120':'Alo Adalet başvuruları için evrak indirme akışı doğrulanmadı.','28161':'İBAN sorgulaması bir evrak arşivi ekranı değildir.'};
    if(!['12573','28934'].includes(route)||!query)return {...base,menuId:route,stage:'file_query',message:(unsupported[route]||'Bu ekranın arşivleme akışı tanınmadı.')+' Dosya Sorgulama bölümünü kullanın. Danıştay desteği ayrı bir deneysel seçenektir.',selector:visible(document.querySelector('#a_12573'))?'#a_12573':'#a_15360'};
    Object.assign(base,{menuId:route,sourceLabel:danistay?'Danıştay Dosya Sorgulama':'Dosya Sorgulama',experimental:danistay});
    base.scope=true;
    const modalSelector=danistay?'#dosya_goruntule':'#dosya_goruntule_modal';
    const modal=document.querySelector(modalSelector);
    if(visible(modal)){
      const tab=modal.querySelector('a[href="#dosya_evrak_bilgileri_tab"]');
      if(!tab||!visible(tab))return {...base,stage:'unrecognized',scope:false,message:'Bu dosyada erişilebilir Evrak sekmesi bulunamadı. İndirme başlatılmadı.'};
      if(!tab.parentElement.classList.contains('active'))return {...base,stage:'documents',message:'Açtığınız dosyada Evrak sekmesine tıklayın.',selector:modalSelector+' a[href="#dosya_evrak_bilgileri_tab"]'};
      const tree=modal.querySelector('#dosya_evrak_bilgileri_result #browser');
      if(!visible(tree))return {...base,stage:'loading',message:'Evrak ağacı yükleniyor. Uzun sürerse UYAP ekranındaki uyarıyı ve oturumunuzu kontrol edin.'};
      return {...base,stage:'ready',message:'Evrak bölümü hazır. Paracci Dosya sekmesine dönüp Dosyayı tara düğmesini kullanın.',caseTitle:text(modal.querySelector('#dosyaTitle')),selector:modalSelector+' a[href="#dosya_evrak_bilgileri_tab"]'};
    }
    const jurisdiction=document.querySelector(danistay?'#danistayDairesi':'#yargiTuru');
    const selected=jurisdiction?.selectedOptions?.[0]||jurisdiction?.querySelector('option[selected]');
    if(danistay&&/dosyanız bulunmamaktadır|dosyanız bulunmuyor/i.test(text(selected)))return {...base,stage:'no_cases',message:'Danıştay birimlerinde bu hesaba ait dosya görünmüyor. Deneysel indirme bu hesapta sınanamaz.',selector:'#s2id_danistayDairesi,#danistayDairesi'};
    if(danistay&&(!jurisdiction?.value||/seçiniz|seçim yap/i.test(text(selected))))return {...base,stage:'jurisdiction',message:'Danıştay Dairesi seçimini yapın; sonra Dosya Sorgula düğmesine tıklayın.',selector:'#s2id_danistayDairesi,#danistayDairesi'};
    if(!danistay){
    if(!jurisdiction?.value||/seçiniz|seçim yap/i.test(text(selected)))return {...base,stage:'jurisdiction',message:'Önce dosyanızın Yargı Türü seçimini yapın. Ardından Mahkeme seçebilir veya Tümü seçeneğiyle sorgulayabilirsiniz.',selector:document.querySelector('#s2id_yargiTuru')?'#s2id_yargiTuru':'#yargiTuru'};
    }
    const buttons=[...document.querySelectorAll('#dosya_listesi_table tbody button')].filter(e=>visible(e)&&/Dosya Görüntüle/i.test(text(e)));
    if(buttons.length)return {...base,stage:'choose_case',message:'İndirmek istediğiniz davanın satırındaki Dosya Görüntüle düğmesine tıklayın. Dava seçimini siz yaparsınız.',selector:'#dosya_listesi_table tbody button',caseCount:buttons.length};
    const empty=visible(document.querySelector('#dosya_listesi_table .dataTables_empty'));
    return {...base,stage:'query',message:empty?'Bu filtrelerle dosya bulunamadı. Seçiminizi değiştirip yeniden sorgulayın.':danistay?'Danıştay Dairesini seçip Dosya Sorgula düğmesine tıklayın.':'Mahkeme seçebilir veya Tümü ile devam edebilirsiniz. Sonra Dosya Sorgula düğmesine tıklayın.',selector:danistay?'#s2id_danistayDairesi,#danistayDairesi,#btnQueryDocDanistay':'#s2id_mahkeme,#mahkeme,#btnQueryDoc'};
  }
  function show(){
    const previous=document.getElementById('paracci-dosya-guide');
    if(previous){if(previous.dataset.paracci!=='guide')throw new Error('Rehber alanı oluşturulamadı.');previous.dispatchEvent(new Event('paracci-close'));previous.remove();}
    const box=document.createElement('section');box.id='paracci-dosya-guide';box.dataset.paracci='guide';box.setAttribute('role','region');box.setAttribute('aria-label','Paracci Dosya yönlendirmesi');
    box.style.cssText='position:fixed;right:18px;top:76px;width:min(340px,calc(100vw - 36px));z-index:2147483000;background:#13231c;color:#edf4ed;border:2px solid #ace2b3;border-radius:12px;padding:18px;font:14px/1.6 system-ui;box-shadow:0 10px 35px #0005;';
    const heading=document.createElement('strong');heading.textContent='Paracci Dosya · Yol gösterici';
    const description=document.createElement('p');description.setAttribute('aria-live','polite');
    const note=document.createElement('small');note.textContent='Seçimleri ve tıklamaları siz yaparsınız. Rehber belge indirmez.';
    const close=document.createElement('button');close.textContent='Rehberi kapat';close.style.cssText='display:block;margin-top:12px;background:#ace2b3;color:#13231c;border:0;border-radius:6px;padding:8px 12px;cursor:pointer';
    box.append(heading,description,note,close);document.body.append(box);
    let highlighted=[],last='';
    function restore(){for(const [el,value] of highlighted)el.style.outline=value;highlighted=[];}
    const update=()=>{
      if(!box.isConnected){restore();clearInterval(timer);return;}
      const state=probe(),signature=state.stage+'|'+state.selector+'|'+state.message;
      const targets=state.selector?[...document.querySelectorAll(state.selector)].filter(e=>e.getClientRects().length&&(state.stage!=='choose_case'||/Dosya Görüntüle/i.test(e.textContent))):[];
      if(signature===last&&targets.length===highlighted.length&&targets.every((el,i)=>el===highlighted[i][0]))return;
      last=signature;restore();description.textContent=(state.experimental?'DENEYSEL · Gerçek dosyayla doğrulanmadı. ':'')+state.message;
      for(const el of targets){highlighted.push([el,el.style.outline||'']);el.style.outline='3px solid #64b985';}targets[0]?.scrollIntoView({block:'center',behavior:'smooth'});
    };
    const stop=()=>{restore();clearInterval(timer);box.remove();};close.addEventListener('click',stop);box.addEventListener('paracci-close',stop);
    const timer=setInterval(update,1000);update();return true;
  }
  root.ArchiveWizard={probe,show};
  if(typeof module!=='undefined')module.exports=root.ArchiveWizard;
})(globalThis);
