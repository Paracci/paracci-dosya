"""Durable file-level collection. No HTTP, cookies, credentials or arbitrary paths."""
import base64
import hashlib
import json
import os
from pathlib import Path,PurePosixPath
import re
import shutil
import time
import uuid
import zipfile
from native_host import load,save,manager_lock

EXTENSIONS={'pdf','udf','zip','tif','tiff','jpg','jpeg','png','txt','csv','html','htm','xml','rtf','doc','docx','xls','xlsx'}
MAX_FILE=256*1024*1024
MAX_ARCHIVE=8*1024*1024*1024

def digest(file):
    with file.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def safe(path):
    for part in [path,*path.parents]:
        if part.is_symlink() or getattr(part,'is_junction',lambda:False)():raise ValueError('Bağlantı/junction yolu kabul edilmez')
    return path

def relative(value):
    if not isinstance(value,str) or len(value)>225:raise ValueError('Arşiv yolu geçersiz')
    parts=PurePosixPath(value).parts
    if not parts or PurePosixPath(value).is_absolute() or any(p in ('..','.') or re.search(r'[<>:"\\|?*\x00-\x1f]',p) or p.endswith((' ','.')) for p in parts):raise ValueError('Arşiv yolu geçersiz')
    return parts

class ArchiveStore:
    def __init__(self,config):
        self.config=config;self.state_root=Path(config['state_root'])/'archives'

    def state_file(self,archive_id):
        if not isinstance(archive_id,str) or not re.fullmatch('[a-f0-9]{64}',archive_id):raise ValueError('Toplu arşiv kimliği geçersiz')
        return self.state_root/archive_id/'state.json'

    def scope(self,state):
        root=Path(state['root']).resolve(strict=True)
        if root not in [Path(p).resolve(strict=True) for p in self.config['allowed_roots']]:raise ValueError('Arşiv kökü yetkili değil')
        source=safe(root/state['case_folder']);stage=safe(root/'.paracci-stage'/state['archive_id'])
        if source.parent!=root or not source.name.endswith(' ['+state['case_key'][:8]+']'):raise ValueError('Dava klasörü doğrulanamadı')
        return root,source,stage

    def public(self,state):
        _root,source,_stage=self.scope(state)
        return {'archive_id':state['archive_id'],'case_key':state['case_key'],'status':state['status'],'title':state['title'],'source':str(source),'zip':state.get('zip_path'),
                'items':[{k:item.get(k) for k in ('key','complete','extension','bytes','sha256')} for item in state['items']],
                'message':state.get('message',''),'created_at':state['created_at']}

    def blob(self,state,item,partial=False):
        _root,_source,stage=self.scope(state);return safe(stage/(item['key']+('.part' if partial else '.data')))

    def target(self,state,item):
        root,_source,_stage=self.scope(state)
        parts=relative(item['directory'])
        file=safe(root.joinpath(*parts[1:],item['base_name']+'.'+item['extension']))
        if not file.is_relative_to(root/state['case_folder']):raise ValueError('Hedef arşiv dışında')
        return file

    def verify(self,state):
        changed=False
        for item in state['items']:
            if not item.get('complete'):continue
            file=self.blob(state,item)
            if not file.is_file():file=self.target(state,item)
            if not file.is_file() or file.stat().st_size!=item['bytes'] or digest(file)!=item['sha256']:
                item.update(complete=False,bytes=0,sha256=None);changed=True
        if state['status']=='completed':
            root,_source,_stage=self.scope(state);archive=Path(state.get('zip_path',''))
            if archive.parent!=root or not re.fullmatch(re.escape(state['case_folder'])+r'(?: \([1-9][0-9]*\))?\.zip',archive.name) or not safe(archive).is_file() or not self.zip_valid(archive,state):changed=True
        if changed:state.update(status='collecting',message='Eksik/değişmiş evrak yeniden alınacak; diğer tamamlananlar korundu.')
        return changed

    def prepare(self,plan):
        if not isinstance(plan,dict) or not isinstance(plan.get('title'),str) or len(plan['title'])>400 or not isinstance(plan.get('items'),list) or not 1<=len(plan['items'])<=4000:raise ValueError('Toplu plan geçersiz veya 4.000 evrak sınırını aşıyor; klasik modu kullanın')
        if len(json.dumps(plan,ensure_ascii=False).encode('utf-8'))>3*1024*1024:raise ValueError('Toplu plan boyut sınırını aşıyor; klasik modu kullanın')
        case_key=hashlib.sha256(plan['title'].encode('utf-8')).hexdigest()
        if case_key!=plan.get('case_key'):raise ValueError('Dava kimliği uyuşmuyor')
        entries=[];seen=set();case_folder=None;archive_root=None
        for raw in plan['items']:
            key=raw.get('key');base=raw.get('base_name');parts=relative(raw.get('directory'))
            if not isinstance(key,str) or not re.fullmatch('[a-f0-9]{64}',key) or key in seen or not isinstance(base,str) or len(relative(base))!=1 or not base.endswith(' ['+key[:12]+']'):raise ValueError('Evrak kimliği/adı geçersiz')
            roots=[Path(p).resolve(strict=True) for p in self.config['allowed_roots'] if Path(p).name==parts[0]]
            if len(roots)!=1 or len(parts)<2 or not parts[1].endswith(' ['+case_key[:8]+']'):raise ValueError('İzinli dava kökü bulunamadı')
            if case_folder and (case_folder!=parts[1] or archive_root!=roots[0]):raise ValueError('Plan birden fazla dava kökü içeriyor')
            case_folder=parts[1];archive_root=roots[0]
            if len(str(archive_root.joinpath(*parts[1:],base+'.html')))>245:raise ValueError('Yerel arşiv yolu çok uzun; daha kısa bir indirme kökü seçin')
            seen.add(key);entries.append({'key':key,'directory':raw['directory'],'base_name':base,'label':str(raw.get('label',''))[:500],'receipt':raw.get('receipt') is True,'complete':False,'bytes':0,'existing':raw.get('existing')})
        identities=[(i['key'],i['directory'],i['base_name']) for i in entries]
        if len({(i['directory']+'/'+i['base_name']).casefold() for i in entries})!=len(entries):raise ValueError('Arşivde dosya adı çakışması')
        plan_hash=hashlib.sha256(json.dumps(identities,ensure_ascii=False).encode()).hexdigest();archive_id=hashlib.sha256((case_key+plan_hash).encode()).hexdigest();file=self.state_file(archive_id)
        with manager_lock(file.parent):
            if file.is_file():state=load(file);self.scope(state);self.verify(state)
            else:state={'archive_id':archive_id,'case_key':case_key,'case_folder':case_folder,'root':str(archive_root),'title':plan['title'],'plan_hash':plan_hash,'status':'collecting','created_at':time.time(),'items':entries}
            _root,_source,stage=self.scope(state);stage.mkdir(parents=True,exist_ok=True)
            # A newly added document changes the plan hash. Reuse only exact
            # opaque identities/paths with verified bytes; never guess by label.
            for old_file in self.state_root.glob('*/state.json'):
                if old_file==file:continue
                old_state=load(old_file)
                if old_state.get('case_key')!=case_key or old_state.get('root')!=str(archive_root):continue
                previous={i['key']:i for i in old_state['items'] if i.get('complete')}
                for item in state['items']:
                    old=previous.get(item['key'])
                    if item.get('complete') or not old or any(item[k]!=old[k] for k in ('directory','base_name')):continue
                    if old.get('extension') not in EXTENSIONS or old['extension'] in ('html','htm') and not item['receipt']:continue
                    original=self.blob(old_state,old)
                    if not original.is_file():original=self.target(old_state,old)
                    if not original.is_file() or original.stat().st_size!=old['bytes'] or digest(original)!=old['sha256']:continue
                    if old['bytes']+sum(i.get('bytes',0) for i in state['items'])>MAX_ARCHIVE:raise ValueError('Toplam arşiv 8 GiB sınırını aşıyor; klasik modu kullanın')
                    temporary=self.blob(state,item,True)
                    try:
                        shutil.copyfile(original,temporary)
                        if digest(temporary)!=old['sha256']:continue
                        temporary.replace(self.blob(state,item));item.update(complete=True,extension=old['extension'],bytes=old['bytes'],sha256=old['sha256'])
                    except FileNotFoundError:pass
            for item,raw in zip(state['items'],entries):
                old=raw.get('existing')
                if item.get('complete') or not old:continue
                old_parts=relative(old)
                expected=relative(item['directory'])
                if tuple(old_parts[:-1])!=tuple(expected):raise ValueError('Mevcut evrak yolu planla uyuşmuyor')
                name=old_parts[-1];match=re.fullmatch(re.escape(item['base_name'])+r'(?: \([1-9][0-9]*\))?\.([a-zA-Z0-9]{1,8})',name)
                if not match or match[1].lower() not in EXTENSIONS:continue
                original=safe(archive_root.joinpath(*old_parts[1:]))
                if not original.is_file() or not 0<original.stat().st_size<=MAX_FILE:continue
                if original.stat().st_size+sum(i.get('bytes',0) for i in state['items'])>MAX_ARCHIVE:raise ValueError('Toplam arşiv 8 GiB sınırını aşıyor; klasik modu kullanın')
                destination=self.blob(state,item);temporary=self.blob(state,item,True)
                shutil.copyfile(original,temporary)
                expected_hash=digest(original)
                if digest(temporary)!=expected_hash:raise ValueError('Mevcut evrak kopyası doğrulanamadı')
                item['extension']=match[1].lower();self.magic(temporary,item)
                temporary.replace(destination);item.update(complete=True,extension=match[1].lower(),bytes=destination.stat().st_size,sha256=expected_hash)
            save(file,state);return self.public(state)

    def magic(self,file,item):
        with file.open('rb') as stream:head=stream.read(2048)
        ext=item['extension'];plain=head.lstrip();zip_magic=head[:4] in (b'PK\x03\x04',b'PK\x05\x06',b'PK\x07\x08')
        valid={'pdf':b'%PDF-' in head[:1024],'tif':head[:4] in (b'II*\0',b'MM\0*'),'tiff':head[:4] in (b'II*\0',b'MM\0*'),'png':head.startswith(b'\x89PNG\r\n\x1a\n'),'jpg':head.startswith(b'\xff\xd8\xff'),'jpeg':head.startswith(b'\xff\xd8\xff'),'zip':zip_magic,'docx':zip_magic,'xlsx':zip_magic,'udf':zip_magic or plain.startswith((b'<?xml',b'<template')),'doc':head.startswith(bytes.fromhex('d0cf11e0a1b11ae1')),'xls':head.startswith(bytes.fromhex('d0cf11e0a1b11ae1')),'rtf':plain.startswith(b'{\\rtf'),'xml':plain.startswith(b'<')}
        if ext in valid and not valid[ext]:raise ValueError('Dosya imzası bildirilen biçimle uyuşmuyor')
        if ext in ('txt','csv') and (re.match(br'<(?:!doctype|html|form)',plain,re.I) or plain.startswith(b'MZ')):raise ValueError('Belge yerine HTML/çalıştırılabilir içerik döndü')
        if ext in ('html','htm'):
            if not item['receipt'] or file.stat().st_size>2*1024*1024:raise ValueError('HTML makbuz kapsam dışında')
            text=file.read_text(encoding='utf-8',errors='replace')
            if not all(re.search(pattern,text,re.I) for pattern in ('<table','makbuz','vekalet')) or re.search(r'<\s*(script|iframe|form|input|object|embed|link|img|svg)\b|\bon\w+\s*=|\b(src|href|action)\s*=|url\s*\(|@import|http-equiv\s*=\s*["\']?refresh',text,re.I):raise ValueError('HTML makbuz güvenli biçimle eşleşmiyor')

    def publish(self,state):
        if any(not i.get('complete') for i in state['items']):raise ValueError('Arşivde bekleyen evrak var')
        if self.verify(state):raise ValueError('Tamamlanan evrak değişmiş; yeniden devam edin')
        root,source,_stage=self.scope(state)
        for item in state['items']:
            target=self.target(state,item);target.parent.mkdir(parents=True,exist_ok=True)
            if target.exists():
                if digest(target)!=item['sha256']:raise ValueError('Hedefte farklı bir dosya var; özgün dosyanın üzerine yazılmadı')
            else:
                temporary=safe(target.parent/('p-'+uuid.uuid4().hex[:8]+'.tmp'))
                try:
                    with temporary.open('xb') as out,self.blob(state,item).open('rb') as inp:shutil.copyfileobj(inp,out);out.flush();os.fsync(out.fileno())
                    if digest(temporary)!=item['sha256']:raise ValueError('Yayın kopyası doğrulanamadı')
                    os.link(temporary,target)
                finally:temporary.unlink(missing_ok=True)
        archive=safe(root/(state['case_folder']+'.zip'));number=1
        while archive.exists():
            if self.zip_valid(archive,state):state.update(status='completed',zip_path=str(archive));return
            number+=1;archive=safe(root/(state['case_folder']+f' ({number}).zip'))
        temporary=safe(root/('paracci-'+state['archive_id'][:16]+'.zip.part'))
        if temporary.exists() and state.get('zip_temp')!=str(temporary):raise ValueError('Geçici ZIP yolu başka bir dosyaya ait; üzerine yazılmadı')
        state['zip_temp']=str(temporary);save(self.state_file(state['archive_id']),state)
        with zipfile.ZipFile(temporary,'w',compression=zipfile.ZIP_DEFLATED) as output:
            for item in state['items']:
                target=self.target(state,item);output.write(target,target.relative_to(root).as_posix())
        with temporary.open('r+b') as stream:stream.flush();os.fsync(stream.fileno())
        if not self.zip_valid(temporary,state):raise ValueError('ZIP bütünlük kontrolü geçmedi')
        os.link(temporary,archive);temporary.unlink();state.update(status='completed',zip_path=str(archive),message='Dosyalar ve tek ZIP doğrulandı.')

    def zip_valid(self,file,state):
        try:
            root,_source,_stage=self.scope(state)
            with zipfile.ZipFile(file) as z:
                expected={self.target(state,i).relative_to(root).as_posix():i for i in state['items']}
                if set(z.namelist())!=set(expected) or len(z.namelist())!=len(expected):return False
                for name,item in expected.items():
                    if z.getinfo(name).file_size!=item['bytes']:return False
                    with z.open(name) as stream:
                        if hashlib.file_digest(stream,'sha256').hexdigest()!=item['sha256']:return False
            return True
        except (OSError,zipfile.BadZipFile,ValueError):return False

    def handle(self,request):
        op=request.get('op')
        if op=='archive_prepare':return self.prepare(request.get('plan'))
        file=self.state_file(request.get('archive_id'))
        with manager_lock(file.parent):
            state=load(file);self.scope(state)
            if op=='archive_status':
                if request.get('verify') and self.verify(state):save(file,state)
                return self.public(state)
            if op=='archive_open':
                if state['status']!='completed':raise ValueError('Önce tek ZIP işlemini tamamlayın')
                _root,source,_stage=self.scope(state);target=Path(state['zip_path']) if request.get('kind')=='zip' else source
                if target!=source and (target.parent!=source.parent or not re.fullmatch(re.escape(state['case_folder'])+r'(?: \([1-9][0-9]*\))?\.zip',target.name)):raise ValueError('Arşiv açma yolu geçersiz')
                if not target.exists():raise ValueError('Arşiv bulunamadı. Tek ZIP ile yeniden devam edin.')
                safe(target);os.startfile(str(target));return {'message':'Yerel arşiv açıldı.'}
            if op=='archive_finalize':
                self.publish(state);save(file,state)
                for item in state['items']:
                    self.blob(state,item).unlink(missing_ok=True);self.blob(state,item,True).unlink(missing_ok=True)
                return self.public(state)
            item=next((i for i in state['items'] if i['key']==request.get('key')),None)
            if not item:raise ValueError('Evrak bu arşiv planına ait değil')
            if item.get('complete'):raise ValueError('Doğrulanmış evrak yeniden yazılamaz')
            partial=self.blob(state,item,True)
            if op=='archive_begin':
                extension=request.get('extension')
                if extension not in EXTENSIONS or extension in ('html','htm') and not item['receipt']:raise ValueError('Evrak biçimi desteklenmiyor')
                item['extension']=extension
                with partial.open('wb') as stream:stream.flush();os.fsync(stream.fileno())
                save(file,state);return {'offset':0}
            if op=='archive_chunk':
                offset=request.get('offset');data=request.get('data')
                if type(offset) is not int or not isinstance(data,str) or len(data)>132000 or not partial.is_file():raise ValueError('Evrak parçası geçersiz')
                data=base64.b64decode(data,validate=True)
                if not 0<len(data)<=96*1024 or partial.stat().st_size!=offset or offset+len(data)>MAX_FILE:raise ValueError('Parça sırası/boyutu geçersiz')
                with partial.open('ab') as stream:stream.write(data);stream.flush();os.fsync(stream.fileno())
                return {'offset':offset+len(data)}
            if op=='archive_finish_file':
                count=request.get('bytes')
                if type(count) is not int or not partial.is_file() or not 0<count==partial.stat().st_size<=MAX_FILE or count+sum(i.get('bytes',0) for i in state['items'])>MAX_ARCHIVE:raise ValueError('Tam evrak boyutu doğrulanamadı')
                if item['extension']=='zip':
                    try:
                        with zipfile.ZipFile(partial) as container:
                            member=container.getinfo('content.xml')
                            if member.file_size<=128*1024*1024 and not member.flag_bits&1:
                                with container.open(member) as xml:prefix=xml.read(8192).lstrip(b'\xef\xbb\xbf \t\r\n')
                                if re.match(br'(?:<\?xml[^>]*>\s*)?<template\b',prefix):item['extension']='udf'
                    except (OSError,KeyError,zipfile.BadZipFile,RuntimeError):pass
                self.magic(partial,item);checksum=digest(partial);partial.replace(self.blob(state,item));item.update(complete=True,bytes=count,sha256=checksum);save(file,state);return {'sha256':checksum,'bytes':count,'extension':item['extension']}
            raise ValueError('Desteklenmeyen toplu arşiv işlemi')
