const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');const {parseHTML}=require('linkedom');
test('progress remains visible and updates while scan response is still pending',async()=>{
  const {document}=parseHTML(fs.readFileSync(path.join(__dirname,'../extension/app.html'),'utf8'));
  let storageListener,resolveScan;
  const chrome={runtime:{async sendMessage(message){if(message.type==='scan')return new Promise(resolve=>{resolveScan=resolve;});return {ok:true,value:null};}},
    storage:{session:{async get(){return {};}},onChanged:{addListener(fn){storageListener=fn;}}}};
  const context=vm.createContext({document,chrome,setInterval(){},setTimeout(){},Date,Blob,URL});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/app.js'),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  document.getElementById('scan').click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(document.getElementById('scanProgress').hidden,false);
  assert.equal(document.getElementById('scan').disabled,true);
  storageListener({scanProgress:{newValue:{active:true,phase:'verifying',processed:65,total:197,startedAt:Date.now()-5000,message:'Önceki indirmeler doğrulanıyor: 65 / 197'}}},'session');
  assert.match(document.getElementById('scanMessage').textContent,/65 \/ 197/);
  assert.equal(document.getElementById('scanBar').value,65);
  assert.equal(document.getElementById('start').disabled,true);
  storageListener({scanProgress:{newValue:{active:false,phase:'done',processed:197,total:197,startedAt:Date.now()-6000,updatedAt:Date.now(),message:'Tarama tamamlandı: 197 mevcut dosya atlanacak.'}}},'session');
  resolveScan({ok:true,value:null});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(document.getElementById('scan').disabled,false);
  assert.equal(document.getElementById('scanBar').value,197);
});
