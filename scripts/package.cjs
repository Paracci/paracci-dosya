const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const version=JSON.parse(fs.readFileSync(path.join(root,'extension','manifest.json'),'utf8')).version;
const destination=path.join(root,'artifacts','paracci-dosya-'+version);
fs.mkdirSync(destination,{recursive:true});
const hashes={};
function copy(directory,relative=''){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const name=path.posix.join(relative,entry.name),source=path.join(directory,entry.name);
    if(entry.isSymbolicLink())throw new Error('Symbolic links are not packaged');
    if(entry.isDirectory()){copy(source,name);continue;}
    fs.mkdirSync(path.dirname(path.join(destination,name)),{recursive:true});
    fs.copyFileSync(source,path.join(destination,name));
    hashes[name]=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  }
}
copy(path.join(root,'extension'));
for(const name of ['LICENSE','NOTICE','THIRD_PARTY_NOTICES.md']){
  fs.copyFileSync(path.join(root,name),path.join(destination,name));
  hashes[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex');
}
fs.writeFileSync(path.join(root,'artifacts','SHA256.json'),JSON.stringify(hashes,null,2)+'\n');
console.log(destination);
