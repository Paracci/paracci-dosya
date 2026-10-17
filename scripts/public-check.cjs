// Deterministic release checks. This is a guard, not a complete secret/PII audit.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const TOP=['README.md','LICENSE','NOTICE','THIRD_PARTY_NOTICES.md','SECURITY.md','CONTRIBUTING.md','.gitignore','.gitattributes','package.json','package-lock.json','requirements-ai.txt','AI-Paketi-Hazirla.cmd'];
const DIRS=['extension','tools','scripts','tests','docs','.github'];
const SKIP=new Set(['ocr-data','ocr-best','native-runtime','__pycache__','node_modules']);
function collect(root){
  const files=TOP.filter(file=>fs.existsSync(path.join(root,file)));
  function walk(relative){
    for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){
      if(SKIP.has(entry.name))continue;
      const name=path.posix.join(relative,entry.name);
      if(entry.isSymbolicLink())throw new Error('Release symlink rejected: '+name);
      if(entry.isDirectory()){walk(name);continue;}
      files.push(name);
    }
  }
  for(const dir of DIRS)if(fs.existsSync(path.join(root,dir)))walk(dir);
  return files.sort();
}
function inspect(root){
  const files=collect(root),issues=[];
  const rules=[
    ['personal-user-path',/(?:\b[A-Z]:[\\/]+Users[\\/]+|\/(?:Users|home)\/)[^\s<>"'`\\/]+/i],
    ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['access-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{30,})\b/],
    ['credential-assignment',/\b(?:api_key|password|client_secret)\s*[:=]\s*["'][^"'<>]{12,}["']/i],
    ['identifier-like-number',/(?<![A-Za-z0-9])\d{11}(?![A-Za-z0-9])/]
  ];
  for(const file of files){
    const icon=/^extension\/assets\/icons\/icon-(16|32|48|128|256|512)\.png$/.test(file)||/^docs\/images\/(dark|light|help|wizard|bundle|support)\.png$/.test(file);
    if(icon){
      const bytes=fs.readFileSync(path.join(root,file));
      if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')issues.push({file,rule:'invalid-icon'});
      continue;
    }
    if(!/\.(?:md|txt|js|cjs|py|ps1|cmd|json|html|css|yml|yaml)$/.test(file)&&!TOP.includes(file)){
      issues.push({file,rule:'unexpected-release-file'});continue;
    }
    const text=fs.readFileSync(path.join(root,file),'utf8');
    for(const [rule,pattern] of rules)if(pattern.test(text))issues.push({file,rule});
    for(const match of text.matchAll(/\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi)){
      if(!['example.com','example.org','example.net','example.invalid','gnu.org','fsf.org'].includes(match[1].toLowerCase()))issues.push({file,rule:'unreviewed-email-address'});
    }
    if(/chrome-extension:\/\/[a-p]{32}\//.test(text))issues.push({file,rule:'installation-specific-extension-origin'});
  }
  for(const required of ['README.md','LICENSE','NOTICE','docs/PRIVACY.md','docs/LEGAL.md','extension/manifest.json']){
    if(!files.includes(required))issues.push({file:required,rule:'required-release-document'});
  }
  return {ok:issues.length===0,files,issues};
}
function hashes(root,files){return Object.fromEntries(files.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));}
if(require.main===module){
  const result=inspect(path.resolve(process.argv[2]||path.join(__dirname,'..')));
  console.log(JSON.stringify({ok:result.ok,files:result.files.length,issues:result.issues},null,2));
  if(!result.ok)process.exitCode=1;
}
module.exports={collect,inspect,hashes};
