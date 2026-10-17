const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {inspect,collect}=require('../scripts/public-check.cjs');
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'paracci-public-test-'));
  const write=(file,text)=>{const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);};
  const cleanup=()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^paracci-public-test-/);fs.rmSync(root,{recursive:true,force:true});};
  return {root,write,cleanup};
}
test('public export inventory excludes runtime files, case data and git history',()=>{
  const h=fixture();try{h.write('README.md','public');h.write('tools/worker.py','pass');h.write('tools/native-runtime/config.json','private');h.write('.git/config','private');h.write('artifacts/case.pdf','private');
    assert.deepEqual(collect(h.root),['README.md','tools/worker.py']);
  }finally{h.cleanup();}
});
test('checks reject personal paths, secret patterns and unexpected document files',()=>{
  const h=fixture();try{
    h.write('docs/test.md',['C:', 'Users','Sample','private'].join('/'));h.write('tools/secret.py','token="'+'ghp_'+'x'.repeat(36)+'"');h.write('docs/case.pdf','private');
    h.write('docs/identity.md',['12345','678901'].join(''));h.write('docs/contact.md',['private','invalid.test'].join('@'));
    const rules=inspect(h.root).issues.map(i=>i.rule);assert.ok(rules.includes('personal-user-path'));assert.ok(rules.includes('access-token'));assert.ok(rules.includes('unexpected-release-file'));
    assert.ok(rules.includes('identifier-like-number'));assert.ok(rules.includes('unreviewed-email-address'));
  }finally{h.cleanup();}
});
test('symlinks cannot make the allowlist follow another directory',()=>{
  const h=fixture();try{fs.mkdirSync(path.join(h.root,'outside'));fs.mkdirSync(path.join(h.root,'tools'));fs.symlinkSync(path.join(h.root,'outside'),path.join(h.root,'tools','linked'),'junction');
    assert.throws(()=>collect(h.root),/symlink/);
  }finally{h.cleanup();}
});
