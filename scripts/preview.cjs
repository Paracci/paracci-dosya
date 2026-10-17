// Local UI preview using synthetic documents. No UYAP requests or actual downloads.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../extension/core.js');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../extension');
function previewChrome(demoJob, guide,stage) {
  let listener, progress, aiState={status:'idle',message:'DEMO · Yerel hazırlama başlatılabilir.'};
  let experimentalEnabled=false;
  if(stage==='danistay'){demoJob.portal={menuId:'28934',experimental:true,label:'Danıştay Dosya Sorgulama'};demoJob.status='ready';demoJob.message='DEMO · Deneysel plan; gerçek indirme yapmaz.';}
  return {runtime:{async sendMessage(m){
    let value=demoJob;
    if(m.type.startsWith('guide.'))value={stage,scope:stage==='ready',message:stage==='session_expired'?'DEMO · UYAP oturumu sona erdi. Normal giriş yapın ve yeniden tarayın.':stage==='choose_case'?'DEMO · İndirmek istediğiniz davanın Dosya Görüntüle düğmesini seçin.':'DEMO · Evrak bölümü hazır. Dosyayı tarayabilirsiniz.'};
    if(m.type.startsWith('guide.')&&stage==='danistay'){
      if(m.type==='guide.experimental')experimentalEnabled=m.enabled===true;
      value={stage:experimentalEnabled?'ready':'experimental_disabled',scope:experimentalEnabled,menuId:'28934',sourceLabel:'Danıştay Dosya Sorgulama',experimental:true,experimentalEnabled,message:experimentalEnabled?'DEMO · Tanınan Evrak ağacı. Önce klasik tek evrak denemesi önerilir.':'DEMO · Deneysel Danıştay desteği kapalı. Gerçek dava ile indirme doğrulanmadı.'};
    }
    if(['bundle.start','bundle.try'].includes(m.type)){const trial=m.type==='bundle.try';demoJob.delivery='bundle';demoJob.status='running';demoJob.message='DEMO · Sessiz toplama ve ZIP doğrulaması…';setTimeout(()=>{if(demoJob.status!=='running')return;demoJob.status=trial?'paused':'completed';demoJob.bundle={zip:'DEMO.zip'};demoJob.message=trial?'DEMO · Tek evrak denemesi hazır; bu tüm dava değildir.':'DEMO · Tek ZIP hazır.';listener?.({job:{newValue:demoJob}},'session');},1000);}
    if(m.type==='bundle.pause'){demoJob.status='paused';demoJob.message='DEMO · Duraklatıldı.';}
    if(m.type==='bundle.open')value={message:'DEMO · Gerçek ZIP açılmaz.'};
    if(m.type==='scan'){
      const startedAt=Date.now();
      for(let n=0;n<=3;n++){
        progress={active:n<3,phase:n<3?'verifying':'done',processed:n,total:3,startedAt,updatedAt:Date.now(),message:n<3?'Önceki indirmeler doğrulanıyor: '+n+' / 3':'Tarama tamamlandı: 3 mevcut dosya atlanacak.'};
        listener?.({scanProgress:{newValue:progress}},'session');await new Promise(r=>setTimeout(r,600));
      }
      demoJob.status='completed';demoJob.items.forEach(i=>i.state='skipped');
    }
    if(m.type==='ai.connect')value={protocol:1,ready:true,quality_ready:true};
    if(m.type==='ai.status')value=aiState;
    if(m.type==='ai.prepare'){
      aiState={status:'running',message:'DEMO · Metin ve Türkçe OCR hazırlanıyor…',done:1,total:3};value=aiState;
      setTimeout(()=>{aiState={status:'completed',message:'DEMO · AI paketi hazır.',done:3,total:3,stats:{profile:m.profile,top_level_files:3,zip_members:0,unique_documents:3,review_entries:1,errors:0,readable_copy:m.readableCopy?{path:'DEMO · İndirilenler / UYAP / Okunabilir / 2026_123 - Örnek Mahkemesi',files:3}:null}};listener?.({aiState:{newValue:aiState}},'session');},1500);
    }
    if(m.type==='ai.openReadable')value={message:'DEMO · Gerçek klasör açılmaz.'};
    if(m.type==='ai.search')value={results:[{doc_id:'DOC-ornek',locator:'sayfa 2',method:'native',text:'DEMO · Bilirkişi raporunun incelenmesi için taraflara süre verildi. Bu metin yalnızca örnektir.'}]};
    if(m.type==='ai.fileInfo'){
      if(m.file==='zip')return {ok:false,error:'DEMO · Gerçek paket indirilmez.'};
      value=guide.info;
    }
    if(m.type==='ai.fileChunk')value={offset:0,data:guide.data,bytes:guide.info.size};
    return {ok:true,value:structuredClone(value)};
  }},storage:{session:{async get(){return {scanProgress:progress};}},onChanged:{addListener(fn){listener=fn;}}}};
}
async function main() {
  const title = '2026/123 - Örnek Asliye Hukuk Mahkemesi - Hukuk Dava Dosyası';
  const snapshot = {title,records:[
    {token:'"synthetic-main-000001"',label:'Beyan Dilekçesi 08/04/2026',folders:['2026/123 (Hukuk Dava Dosyası)','Beyan Dilekçesi'],isAttachment:false},
    {token:'"synthetic-attachment-000001"',label:'Ek 1',folders:['2026/123 (Hukuk Dava Dosyası)','Beyan Dilekçesi'],parentToken:'"synthetic-main-000001"',parentLabel:'Beyan Dilekçesi 08/04/2026',isAttachment:true},
    {token:'"synthetic-main-000002"',label:'Duruşma Zaptı 16/10/2026',folders:['2026/123 (Hukuk Dava Dosyası)','Duruşma Zaptı'],isAttachment:false}
  ]};
  const plan=await C.makePlan(snapshot);
  const job={id:'demo',title,status:'completed',message:'DEMO · Örnek arşiv tamamlandı.',warnings:[],scannedAt:new Date().toISOString(),groups:['2026/123'],active:false,
    items:plan.items.map(i=>({...i,state:'complete',preview:i.directory+'/'+i.baseName+'.*'}))};
  const bytes=Buffer.from('# DEMO · Başlangıç rehberi\n\nYanıtlarda belge kimliği ve sayfa referansı kullanın. OCR işaretlerini kontrol edin.');
  const guide={info:{name:'BASLANGIC.md',size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')},data:bytes.toString('base64')};
  const prelude=stage=>`const chrome=(${previewChrome.toString()})(${JSON.stringify(job)},${JSON.stringify(guide)},${JSON.stringify(stage)});\n`;
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://127.0.0.1').pathname;
    const files={'/':'app.html','/app.html':'app.html','/app.css':'app.css','/theme.css':'theme.css','/ui.js':'ui.js','/app.js':'app.js'};
    const file=files[pathname]||(/^\/assets\/icons\/icon-(16|32|48|128|256|512)\.png$/.test(pathname)?pathname.slice(1):null);
    if(!file){res.writeHead(404);res.end();return;}
    const mime=file.endsWith('.png')?'image/png':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'application/javascript; charset=utf-8';
    if(file.endsWith('.png')){res.writeHead(200,{'Content-Type':mime});res.end(fs.readFileSync(path.join(root,file)));return;}
    let body=fs.readFileSync(path.join(root,file),'utf8');
    if(file==='app.js')body=prelude(new URL(req.url,'http://127.0.0.1').searchParams.get('stage')||'ready')+body;
    if(file==='app.html')body=body.replace('src="app.js"','src="app.js?stage='+encodeURIComponent(new URL(req.url,'http://127.0.0.1').searchParams.get('stage')||'ready')+'"');
    if(file==='app.html')body=body.replace('<body>','<body><div style="padding:9px;text-align:center;background:#e3ebd4;color:#485d31;font:12px Segoe UI">DEMO · Örnek veriler · Gerçek belge indirmez</div>');
    res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'});res.end(body);
  });
  server.listen(4173,'127.0.0.1',()=>console.log('Synthetic preview: http://127.0.0.1:4173'));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
