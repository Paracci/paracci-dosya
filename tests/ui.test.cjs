const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const {parseHTML}=require('linkedom');
function harness(saved,denied=false){
  const {document,window}=parseHTML(fs.readFileSync(path.join(__dirname,'../extension/app.html'),'utf8'));
  const storage=new Map(saved?[['paracci-dosya.theme',saved]]:[]);
  const localStorage={getItem(k){if(denied)throw new Error('blocked');return storage.get(k);},setItem(k,v){if(denied)throw new Error('blocked');storage.set(k,v);}};
  Object.defineProperty(document,'readyState',{value:'complete'});
  Object.defineProperty(document,'activeElement',{value:document.body,writable:true});
  for(const button of document.querySelectorAll('.info-button'))button.getBoundingClientRect=()=>({left:100,top:100,bottom:128});
  for(const tip of document.querySelectorAll('.tooltip')){Object.defineProperty(tip,'offsetWidth',{value:340});Object.defineProperty(tip,'offsetHeight',{value:180});}
  const context=vm.createContext({document,localStorage,window:{innerWidth:1200,innerHeight:800,addEventListener(){}},setTimeout(fn){fn();},clearTimeout(){}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/ui.js'),'utf8'),context);
  return {document,window,storage};
}
test('dark is default and a deliberate light preference is persisted',()=>{
  const h=harness();assert.equal(h.document.documentElement.dataset.theme,'dark');
  h.document.getElementById('themeToggle').click();assert.equal(h.document.documentElement.dataset.theme,'light');
  assert.equal(h.storage.get('paracci-dosya.theme'),'light');assert.equal(h.document.getElementById('themeToggle').getAttribute('aria-pressed'),'false');
  assert.equal(harness('light').document.documentElement.dataset.theme,'light');
});
test('help works on hover and focus, closes with Escape, and describes its control',()=>{
  const h=harness(),help=h.document.querySelector('.help'),button=help.querySelector('button');
  help.dispatchEvent(new h.window.Event('mouseenter'));assert.equal(button.getAttribute('aria-expanded'),'true');
  assert.equal(button.getAttribute('aria-describedby'),help.querySelector('[role=tooltip]').id);
  h.document.dispatchEvent(Object.assign(new h.window.Event('keydown'),{key:'Escape'}));assert.equal(button.getAttribute('aria-expanded'),'false');
  button.dispatchEvent(new h.window.Event('focusin',{bubbles:true}));assert.equal(button.getAttribute('aria-expanded'),'true');
});
test('help can be pinned by click and dismissed outside without issuing app commands',()=>{
  const h=harness(),help=h.document.querySelector('.help'),button=help.querySelector('button');
  button.click();assert.equal(help.dataset.pinned,'true');help.dispatchEvent(new h.window.Event('mouseleave'));assert.equal(button.getAttribute('aria-expanded'),'true');
  h.document.getElementById('scan').click();assert.equal(button.getAttribute('aria-expanded'),'false');
});
test('invalid or blocked theme storage falls back to dark without breaking the page',()=>{
  assert.equal(harness('invalid').document.documentElement.dataset.theme,'dark');
  const h=harness(null,true);h.document.getElementById('themeToggle').click();assert.equal(h.document.documentElement.dataset.theme,'light');
});
