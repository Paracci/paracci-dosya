// Creates a new source snapshot. Never copies .git, runtime state or case documents.
const fs=require('node:fs');
const path=require('node:path');
const {inspect,hashes}=require('./public-check.cjs');
const root=path.resolve(__dirname,'..'),result=inspect(root);
if(!result.ok){console.error(JSON.stringify(result.issues));process.exit(1);}
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const base=path.join(root,'artifacts','public');fs.mkdirSync(base,{recursive:true});
const destination=fs.mkdtempSync(path.join(base,'paracci-dosya-'+version+'-'));
for(const file of result.files){
  const target=path.join(destination,file);fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(path.join(root,file),target);
}
fs.writeFileSync(path.join(destination,'PUBLIC_EXPORT.json'),JSON.stringify({project:'paracci-dosya',version,historyIncluded:false,files:hashes(destination,result.files)},null,2)+'\n');
const check=inspect(destination);
if(!check.ok)throw new Error('Export validation failed');
console.log(destination);
