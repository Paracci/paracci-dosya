"""Create a verified, readable copy; never rename the managed source archive."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import uuid


def safe_name(value, limit=150):
    value=re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', str(value))
    value=re.sub(r'\s+', ' ', value).strip(' .') or 'Adsiz'
    if re.match(r'^(con|prn|aux|nul|com\d|lpt\d)(\.|$)',value,re.I):value='_'+value
    if len(value)>limit:
        prefix=value[:max(1,limit-1)]
        value=(prefix.rsplit(' ',1)[0] if ' ' in prefix[len(prefix)//2:] else prefix).rstrip(' .')+'…'
    return value


def digest(file):
    with file.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def no_link(path):
    if path.is_symlink() or getattr(path,'is_junction',lambda:False)():raise ValueError('Okunabilir kopyada bağlantı klasörü kabul edilmez')


def create_copy(source, sources, callback=None):
    source=source.resolve(strict=True)
    entries=[s for s in sources if not s['container_source_id']]
    base=source.parent/'Okunabilir';no_link(base);base.mkdir(exist_ok=True)
    title=next((s.get('case_title') for s in entries if s.get('case_title')),None) or re.sub(r' \[[a-f0-9]{8}\]$','',source.name)
    # Resolve sibling collisions deterministically from logical tree identities.
    labels={():safe_name(title)};files={}
    for item in sorted(entries,key=lambda s:s['relative_path']):
        path=PurePosixPath(item['relative_path']);parts=path.parts
        if path.is_absolute() or '..' in parts:raise ValueError('Özgün dosya yolu geçersiz')
        folders=item.get('folders') or [re.sub(r' \[[a-f0-9]{6,16}\]$','',p) for p in parts[:-2]]
        parent=item.get('parent_label') or (parts[-2] if len(parts)>1 else '')
        readable=[*folders,*([parent] if len(parts)>1 else [])]
        if len(readable)!=len(parts)-1:
            readable=[re.sub(r' \[[a-f0-9]{6,16}\]$','',p) for p in parts[:-1]]
        for depth,name in enumerate(readable,1):labels.setdefault(parts[:depth],safe_name(name))
        label=item['label'] if item.get('is_attachment') else 'Ana evrak'
        labels[parts]=safe_name(label)+path.suffix.lower();files[parts]=item
    def assign():
        names={};used={}
        for key in sorted(labels,key=lambda k:(len(k),k)):
            parent=key[:-1] if key else None;name=labels[key];candidate=name;index=1
            while candidate.casefold() in used.setdefault(parent,set()):
                index+=1
                if key in files:
                    suffix=PurePosixPath(name).suffix;candidate=name[:-len(suffix)]+f' ({index})'+suffix if suffix else name+f' ({index})'
                else:candidate=name+f' ({index})'
            used[parent].add(candidate.casefold());names[key]=candidate
        return names
    # Reserve suffix room for a root folder collision and Windows temporary name.
    for _ in range(1000):
        names=assign()
        paths={key:base.joinpath(names[()],*(names[key[:d]] for d in range(1,len(key)+1))) for key in files}
        longest=max(paths,key=lambda k:len(str(paths[k])))
        overflow=len(str(paths[longest]))-228
        if overflow<=0:break
        candidates=[(),*(longest[:d] for d in range(1,len(longest))) ]
        target=max(candidates,key=lambda k:len(labels[k]))
        if len(labels[target])<=16:raise ValueError('Okunabilir arşiv yolu çok uzun; daha kısa bir indirme konumu gerekli')
        labels[target]=safe_name(labels[target],max(16,len(labels[target])-overflow))
    else:raise ValueError('Okunabilir yol planı tamamlanamadı')
    destination=base/names[()];number=1
    while destination.exists():
        no_link(destination);marker=destination/'okunabilir-arsiv.json';no_link(marker)
        if marker.is_file():
            previous=json.loads(marker.read_text(encoding='utf-8'))
            if previous.get('generator')=='uyap-readable' and previous.get('source')==str(source):break
        number+=1;destination=base/(names[()]+f' ({number})')
    destination.mkdir(exist_ok=True)
    marker=destination/'okunabilir-arsiv.json'
    previous=json.loads(marker.read_text(encoding='utf-8')) if marker.is_file() else {}
    owned={x['copy']:x['sha256'] for x in previous.get('files',[])}
    previous_records={x['copy']:x for x in previous.get('files',[])}
    records=[]
    for index,(key,item) in enumerate(sorted(files.items()),1):
        relative=Path(*(names[key[:d]] for d in range(1,len(key)+1)))
        original=(source/item['relative_path']).resolve(strict=True)
        if not original.is_relative_to(source) or digest(original)!=item['sha256']:raise ValueError('Özgün dosya değişti; okunabilir kopya durduruldu')
        target=destination/relative
        for parent in [*target.parents,target]:
            if parent==base.parent:break
            no_link(parent)
        target.parent.mkdir(parents=True,exist_ok=True)
        if target.exists():
            if relative.as_posix() not in owned or digest(target)!=item['sha256']:
                raise ValueError('Okunabilir kopyada kullanıcı dosyası var; üzerine yazılmadı')
        else:
            temp=target.parent/('c-'+uuid.uuid4().hex[:8]+'.tmp')
            try:
                with original.open('rb') as inp,temp.open('xb') as out:shutil.copyfileobj(inp,out)
                if digest(temp)!=item['sha256']:raise ValueError('Okunabilir kopya bütünlük kontrolü geçmedi')
                # A same-directory hard link publishes the verified temporary copy
                # atomically and fails if a destination appeared concurrently.
                # Unlinking temp leaves an independent copy of the source bytes.
                os.link(temp,target)
                if digest(target)!=item['sha256']:raise ValueError('Okunabilir kopya doğrulanamadı')
            finally:temp.unlink(missing_ok=True)
        records.append({'source':item['relative_path'],'copy':relative.as_posix(),'sha256':item['sha256'],'full_title':item['label']})
        # Each verified file is recorded, so an interrupted copy can resume.
        previous_records[relative.as_posix()]=records[-1]
        snapshot=records if index==len(files) else list(previous_records.values())
        marker_temp=marker.with_name('m-'+uuid.uuid4().hex[:8]+'.tmp')
        with marker_temp.open('x',encoding='utf-8') as stream:stream.write(json.dumps({'generator':'uyap-readable','source':str(source),'files':snapshot},ensure_ascii=False,indent=2))
        marker_temp.replace(marker)
        if callback:callback(index,len(files))
    return {'path':str(destination),'files':len(records),'hashes_verified':True}
