const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');const {parseHTML}=require('linkedom');const {fixture,token}=require('./fixtures.cjs');const T=require('../extension/transport.js');
test('download route is learned only from exact document query values and bound to one case',()=>{
  const old='"synthetic+old/token"',fresh='"synthetic+new/token"',caseToken='"case"';
  for(const encoded of [encodeURIComponent(old),encodeURIComponent(encodeURIComponent(old))]){
    const value=T.template('https://vatandas.uyap.gov.tr/save?doc='+encoded+'&case='+encodeURIComponent(caseToken)+'&type=1',old,caseToken,'Case');assert.ok(value);
    const url=T.address(value,fresh,caseToken,'Case');assert.ok(decodeURIComponent(decodeURIComponent(url)).includes(fresh));
    assert.throws(()=>T.address(value,fresh,caseToken,'Other'),/doğrulanmadı/);
  }
  assert.equal(T.template('https://example.org/save?doc='+encodeURIComponent(old),old,caseToken,'Case'),null);
  assert.equal(T.template('https://vatandas.uyap.gov.tr/save?doc=prefix'+encodeURIComponent(old),old,caseToken,'Case'),null);
});
async function run(response,{offline=false,diagnosis=false}={}){
  const {document}=parseHTML(fixture().replace('<body>','<body><button id=btnQueryDoc></button>'));for(const el of document.querySelectorAll('*'))el.getClientRects=()=>[{}];
  Object.defineProperty(document,'scripts',{get(){return document.querySelectorAll('script');}});
  const calls=[];const context=vm.createContext({document,location:{origin:'https://vatandas.uyap.gov.tr',href:'https://vatandas.uyap.gov.tr/main/jsp/vatandas/index.jsp?menuId=12573'},navigator:{onLine:!offline},chrome:{runtime:{async sendMessage(message){calls.push(message);return {ok:true,value:{}};}}},fetch:async()=>response,URL,AbortController,TextDecoder,Uint8Array,btoa,setTimeout,clearTimeout,Map});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/transport.js'),'utf8'),context);
  const result=diagnosis?await context.ArchiveTransport.diagnose('https://vatandas.uyap.gov.tr/save?doc='+encodeURIComponent(token(1))):await context.ArchiveTransport.stream('https://vatandas.uyap.gov.tr/save?doc='+encodeURIComponent(token(1)),'2026/123 - Örnek Mahkeme - Hukuk Dava Dosyası','"case-example"',token(1),'nonce',false);
  return {result,calls};
}
test('silent stream sends sequential bounded bytes and commits only after EOF',async()=>{
  const bytes=Buffer.from('%PDF-1.7\n'+'synthetic '.repeat(18000));const {result,calls}=await run(new Response(bytes,{headers:{'content-type':'application/pdf','content-length':String(bytes.length)}}));
  assert.equal(result.ok,true);const chunks=calls.filter(c=>c.type==='bundle.stream.chunk');assert.ok(chunks.length>1);
  let offset=0;for(const part of chunks){assert.equal(part.offset,offset);const data=Buffer.from(part.data,'base64');assert.ok(data.length<=96*1024);offset+=data.length;}
  assert.equal(offset,bytes.length);assert.equal(calls.at(-1).type,'bundle.stream.finish');
});
test('expired login responses never write a file and access denial is not falsely called expiry',async()=>{
  for(const response of [new Response('expired',{status:401}),new Response('<html><form><input type="password"></form></html>',{headers:{'content-type':'text/html'}})]){
    const {result,calls}=await run(response);assert.equal(result.code,'session_expired');assert.equal(calls.length,0);
  }
  assert.equal((await run(new Response('denied',{status:403}))).result.code,'access');
});
test('an incomplete declared body cannot be committed',async()=>{
  const {result,calls}=await run(new Response('%PDF-1.7\nshort',{headers:{'content-type':'application/pdf','content-length':'999'}}));
  assert.equal(result.code,'incomplete');assert.equal(calls.some(c=>c.type==='bundle.stream.finish'),false);
});

test('a real PDF signature wins over incorrect HTML metadata',async()=>{
  for(const mime of ['text/html','application/json']){
    const {result}=await run(new Response('%PDF-1.7\nSession expired sample in synthetic document',{headers:{'content-type':mime,'content-disposition':'attachment; filename=wrong.html'}}));
    assert.equal(result.ok,true);assert.equal(result.extension,'pdf');
  }
});

test('session diagnosis does not classify document words inside a binary response as login HTML',async()=>{
  assert.equal((await run(new Response('%PDF-1.7\nSession expired sample in document',{headers:{'content-type':'text/plain'}}),{diagnosis:true})).result.session,'unknown');
  assert.equal((await run(new Response('<html>Session expired</html>',{headers:{'content-type':'text/html'}}),{diagnosis:true})).result.session,'expired');
});
