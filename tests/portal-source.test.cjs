const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');const {parseHTML}=require('linkedom');const {fixture,token}=require('./fixtures.cjs');
test('classic page invocation rejects a changed menu before calling the portal download function',()=>{
  const {document}=parseHTML(fixture());for(const el of document.querySelectorAll('*'))el.getClientRects=()=>[{}];
  const calls=[],location={origin:'https://vatandas.uyap.gov.tr',href:'https://vatandas.uyap.gov.tr/main/jsp/vatandas/index.jsp?menuId=28934'};
  const context=vm.createContext({document,location,URL,window:{downloadDoc(...args){calls.push(args);}}});vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/adapter.js'),'utf8'),context);
  const args=['2026/123 - Örnek Mahkeme - Hukuk Dava Dosyası','"case-example"','1',token(1)];
  assert.throws(()=>context.invokeUyapDownload(...args,'12573'),/bölümü değişti/);assert.equal(calls.length,0);
  assert.equal(context.invokeUyapDownload(...args,'28934'),true);assert.equal(calls.length,1);
  location.href=location.href.replace('28934','22016');assert.throws(()=>context.invokeUyapDownload(...args,'22016'),/bölümü değişti/);assert.equal(calls.length,1);
});
