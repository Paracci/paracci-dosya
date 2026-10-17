const test=require('node:test');
const assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const {fixture,token}=require('./fixtures.cjs');
const {scanUyapDocument,inspectUyapHtmlDownload}=require('../extension/adapter.js');
const url='https://vatandas.uyap.gov.tr/save?evrakId='+encodeURIComponent(token(2));
const receipt='<html><head><meta charset="utf-8"><style>td{color:black}</style></head><body><table><tr><td>VEKALET PULU MAKBUZU</td></tr></table></body></html>';
async function inspect(html,extra={}){
  const previous={document:global.document,location:global.location,fetch:global.fetch};
  try{
    global.document=parseHTML(fixture()).document;global.location={origin:'https://vatandas.uyap.gov.tr'};
    global.fetch=async(request,options)=>{
      assert.equal(request,url);assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'error');
      return new Response(html,{status:200,headers:{'Content-Type':'text/html; charset=utf-8'}});
    };
    if(extra.setup)extra.setup(global.document);
    return await inspectUyapHtmlDownload(extra.url||url,'2026/123 - Örnek Mahkeme - Hukuk Dava Dosyası','"case-example"',token(2));
  }finally{Object.assign(global,previous);}
}
test('static receipt is validated without rendering and returns no document text',async()=>{
  const result=await inspect(receipt);
  assert.equal(result.valid,true);assert.equal(result.format,'static-vekalet-pulu-makbuzu');
  assert.ok(result.bytes>0);assert.deepEqual(Object.keys(result).sort(),['bytes','format','valid']);
});
test('login forms, scripts, event handlers, remote resources, and redirects fail validation',async()=>{
  for(const extra of ['<form><input type="password"></form>','<script>alert(1)</script>','<table onclick="alert(1)"></table>','<img src="https://example.test/tracker">','<meta http-equiv="refresh" content="0;url=https://example.test">','<style>body{background:url(https://example.test/x)}</style>']){
    assert.equal((await inspect(receipt.replace('</body>',extra+'</body>'))).valid,false);
  }
  assert.equal((await inspect('<html><body>Oturum sona erdi</body></html>')).valid,false);
});
test('case changes, another origin, and oversized HTML cannot pass',async()=>{
  assert.equal((await inspect(receipt,{url:'https://example.test/file.html'})).valid,false);
  assert.equal((await inspect(receipt,{setup:doc=>doc.querySelector('#dosyaTitle').textContent='Other case'})).valid,false);
  assert.equal((await inspect(receipt+' '.repeat(2*1024*1024))).valid,false);
});
test('attachment inherits known document type from another occurrence of the same UYAP document',()=>{
  global.document=parseHTML(fixture()).document;
  document.querySelector('.modal-content').getClientRects=()=>[{}];
  const main=Array.from(document.querySelectorAll('span.file')).find(el=>el.getAttribute('evrak_id')===token(5));
  main.setAttribute('evrak_id',token(2));
  main.parentElement.parentElement.parentElement.querySelector('span.folder').textContent='Vekalet Pulu Makbuzu (1)';
  const snapshot=scanUyapDocument();
  const attachment=snapshot.records.find(r=>r.token===token(2)&&r.isAttachment);
  assert.deepEqual(attachment.documentTypes,['Vekalet Pulu Makbuzu']);
});
