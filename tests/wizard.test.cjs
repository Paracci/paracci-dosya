const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');const {parseHTML}=require('linkedom');
function harness({route='12573',origin='https://vatandas.uyap.gov.tr',offline=false,extra='',jurisdiction='Ceza',modal=false,active=false,tree=false,rows=0}={}){
  const {document,window}=parseHTML(`<html><body><ul id=menuUL><a id=a_15360></a><a id=a_12573></a></ul><select id=yargiTuru><option value="${jurisdiction}" selected>${jurisdiction||'Seçiniz'}</option></select><select id=mahkeme><option selected value=all>Tümü</option></select><button id=btnQueryDoc>Dosya Sorgula</button><table id=dosya_listesi_table><tbody>${'<tr><td><button>Dosya Görüntüle</button></td></tr>'.repeat(rows)}</tbody></table><div id=dosya_goruntule_modal ${modal?'':'hidden'}><h4 id=dosyaTitle>Örnek dava</h4><ul><li class="${active?'active':''}"><a href="#dosya_evrak_bilgileri_tab">Evrak</a></li></ul>${tree?'<div id=dosya_evrak_bilgileri_result><ul id=browser></ul></div>':''}</div>${extra}</body></html>`);
  for(const el of document.querySelectorAll('*')){el.getClientRects=()=>el.closest('[hidden]')?[]:[{}];el.scrollIntoView=()=>{};}
  if(route==='28934'){
    document.getElementById('yargiTuru').id='danistayDairesi';document.getElementById('mahkeme').remove();document.getElementById('btnQueryDoc').id='btnQueryDocDanistay';document.getElementById('dosya_goruntule_modal').id='dosya_goruntule';
  }
  const timers=[];const context=vm.createContext({document,location:{origin,pathname:'/main/jsp/vatandas/index.jsp',href:origin+'/main/jsp/vatandas/index.jsp?menuId='+route},navigator:{onLine:!offline},getComputedStyle:()=>({visibility:'visible'}),setInterval(fn){timers.push(fn);return timers.length;},clearInterval(){},Event:window.Event,Date,URL});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/wizard.js'),'utf8'),context);return {api:context.ArchiveWizard,document,timers};
}
test('wizard distinguishes filters, query, multiple cases, file tabs and ready documents',()=>{
  assert.equal(harness({jurisdiction:''}).api.probe().stage,'jurisdiction');assert.equal(harness().api.probe().stage,'query');
  const choices=harness({rows:2}).api.probe();assert.equal(choices.stage,'choose_case');assert.equal(choices.caseCount,2);
  assert.equal(harness({modal:true}).api.probe().stage,'documents');assert.equal(harness({modal:true,active:true}).api.probe().stage,'loading');
  assert.equal(harness({modal:true,active:true,tree:true}).api.probe().stage,'ready');
});
test('only file query scope is accepted, and offline differs from session expiry',()=>{
  assert.equal(harness({route:'12577',modal:true,active:true,tree:true}).api.probe().scope,false);
  assert.equal(harness({offline:true}).api.probe().stage,'offline');
  assert.equal(harness({extra:'<div role=alert>Oturumunuzun süresi doldu. Tekrar giriş yapmanız gerekiyor.</div>'}).api.probe().stage,'session_expired');
  assert.equal(harness({origin:'https://example.org'}).api.probe().stage,'unsupported');
});
test('visual guide highlights controls but never clicks a court, query or case',()=>{
  const h=harness();let clicks=0;h.document.getElementById('btnQueryDoc').addEventListener('click',()=>clicks++);
  h.api.show();assert.equal(clicks,0);assert.match(h.document.getElementById('btnQueryDoc').style.outline,/3px/);
  h.api.show();h.document.querySelector('#paracci-dosya-guide button').click();assert.equal(h.document.getElementById('btnQueryDoc').style.outline,'');
});

test('expanding a parent menu moves the highlight to File Query without requiring a page reload',()=>{
  const h=harness({route:'12577'}),child=h.document.getElementById('a_12573'),parent=h.document.getElementById('a_15360');child.setAttribute('hidden','');
  h.api.show();assert.match(parent.style.outline,/3px/);child.removeAttribute('hidden');h.timers.at(-1)();
  assert.equal(parent.style.outline,'');assert.match(child.style.outline,/3px/);
});

test('Danistay uses its observed controls and distinct modal, with an experimental label',()=>{
  const initial=harness({route:'28934'}).api.probe();assert.equal(initial.stage,'query');assert.equal(initial.experimental,true);assert.equal(initial.menuId,'28934');assert.match(initial.selector,/btnQueryDocDanistay/);
  assert.equal(harness({route:'28934',rows:2}).api.probe().stage,'choose_case');
  assert.equal(harness({route:'28934',modal:true}).api.probe().stage,'documents');
  assert.equal(harness({route:'28934',modal:true,active:true}).api.probe().stage,'loading');
  const ready=harness({route:'28934',modal:true,active:true,tree:true}).api.probe();assert.equal(ready.stage,'ready');assert.equal(ready.caseTitle,'Örnek dava');assert.equal(ready.experimental,true);
  assert.equal(harness({route:'28934',jurisdiction:'Danıştay birimlerinde dosyanız bulunmamaktadır.'}).api.probe().stage,'no_cases');
});

test('unsupported menus cannot be enabled by a leftover shared document modal',()=>{
  for(const route of ['22016','12577','37120','28161','99999']){const result=harness({route,modal:true,active:true,tree:true}).api.probe();assert.equal(result.scope,false);assert.equal(result.experimental,undefined);}
  const h=harness({route:'28934',modal:true,active:true,tree:true});h.document.getElementById('btnQueryDocDanistay').remove();assert.equal(h.api.probe().scope,false);
});
