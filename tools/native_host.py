"""Restricted Chrome Native Messaging host. No network listener or shell commands."""
from __future__ import annotations
import base64
from contextlib import contextmanager
import ctypes
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import struct
import subprocess
import sys
import threading
import time
import uuid

HOST_NAME = "com.uyap.archive_ai"
VERSION = "0.8.1"
MAX_INPUT = 4 * 1024 * 1024
MAX_OUTPUT = 900 * 1024
PROJECT = Path(__file__).resolve().parent.parent


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def save(path, value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_name(path.name+"."+uuid.uuid4().hex+".tmp")
    with temp.open('w',encoding='utf-8') as stream:
        stream.write(json.dumps(value,ensure_ascii=False));stream.flush();os.fsync(stream.fileno())
    # Windows can briefly deny replacement while another process reads status.
    for attempt in range(10):
        try:temp.replace(path);return
        except PermissionError:
            if attempt==9:
                temp.unlink(missing_ok=True);raise
            time.sleep(.02*(attempt+1))


def read_exact(stream, size):
    data=bytearray()
    while len(data)<size:
        part=stream.read(size-len(data))
        if not part:raise EOFError("Eksik native mesaj")
        data.extend(part)
    return bytes(data)


def read_message(stream):
    header=stream.read(4)
    if not header:return None
    if len(header)<4:header+=read_exact(stream,4-len(header))
    size=struct.unpack("=I",header)[0]
    if not 0<size<=MAX_INPUT:raise ValueError("Native mesaj boyut sınırı")
    value=json.loads(read_exact(stream,size).decode("utf-8"))
    if not isinstance(value,dict):raise ValueError("Native mesaj nesne olmalı")
    return value


def write_message(stream, value):
    data=json.dumps(value,ensure_ascii=False).encode("utf-8")
    if len(data)>MAX_OUTPUT:raise ValueError("Native yanıt boyut sınırı")
    stream.write(struct.pack("=I",len(data))+data);stream.flush()


def source_path(value, config):
    if not isinstance(value,str) or len(value)>2048:raise ValueError("Arşiv yolu geçersiz")
    raw=Path(value)
    if raw.is_symlink() or getattr(raw,"is_junction",lambda:False)():raise ValueError("Bağlantı klasörü kabul edilmez")
    source=raw.resolve(strict=True)
    roots=[Path(root).resolve(strict=True) for root in config["allowed_roots"]]
    if not source.is_dir() or not any(source.parent==root for root in roots):raise ValueError("Arşiv izin verilen UYAP kökünün doğrudan altında olmalı")
    if not re.search(r" \[[a-f0-9]{8}\]$",source.name) or source.name.endswith("__AI"):raise ValueError("Dava arşivi klasörü tanınamadı")
    output=source.with_name(source.name+"__AI")
    if output.is_symlink() or getattr(output,"is_junction",lambda:False)() or output.resolve()!=output.absolute():raise ValueError("Çıktı klasörü bağlantı olamaz")
    return source,output


def validate_report(report, source):
    if not isinstance(report,dict) or not isinstance(report.get("items"),list) or not 0<len(report["items"])<=10000:raise ValueError("Arşiv raporu geçersiz")
    if len(json.dumps(report,ensure_ascii=False).encode("utf-8"))>3*1024*1024:raise ValueError("Arşiv raporu çok büyük")
    for item in report["items"]:
        if not isinstance(item,dict) or item.get("state") not in ("complete","skipped"):raise ValueError("Arşiv henüz tamamlanmadı")
        value=item.get("path")
        if not isinstance(value,str):raise ValueError("Doğrulanmış dosya yolu eksik")
        parts=PurePosixPath(value.replace("\\","/")).parts
        if parts.count(source.name)!=1 or ".." in parts:raise ValueError("Rapor başka bir arşive ait")
        relative=Path(*parts[parts.index(source.name)+1:])
        target=(source/relative).resolve(strict=True)
        if not target.is_relative_to(source) or not target.is_file() or target.stat().st_size<=0:raise ValueError("Arşivde eksik dosya var; önce yeniden tarayın")


def process_alive(pid):
    if not isinstance(pid,int) or pid<=0:return False
    if os.name=="nt":
        from ctypes import wintypes
        kernel=ctypes.WinDLL("kernel32",use_last_error=True)
        kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD];kernel.OpenProcess.restype=wintypes.HANDLE
        kernel.GetExitCodeProcess.argtypes=[wintypes.HANDLE,ctypes.POINTER(wintypes.DWORD)];kernel.CloseHandle.argtypes=[wintypes.HANDLE]
        handle=kernel.OpenProcess(0x1000,False,pid)
        if not handle:return False
        try:
            code=wintypes.DWORD();return bool(kernel.GetExitCodeProcess(handle,ctypes.byref(code))) and code.value==259
        finally:kernel.CloseHandle(handle)
    try:os.kill(pid,0);return True
    except OSError:return False


@contextmanager
def manager_lock(directory):
    directory.mkdir(parents=True,exist_ok=True)
    with (directory/"manager.lock").open("a+b") as stream:
        stream.seek(0,2)
        if stream.tell()==0:stream.write(b"0");stream.flush()
        stream.seek(0)
        if os.name=="nt":
            import msvcrt
            deadline=time.monotonic()+5
            while True:
                try:msvcrt.locking(stream.fileno(),msvcrt.LK_NBLCK,1);break
                except OSError:
                    if time.monotonic()>deadline:raise ValueError("Yerel motor meşgul; tekrar deneyin")
                    time.sleep(.05)
            try:yield
            finally:stream.seek(0);msvcrt.locking(stream.fileno(),msvcrt.LK_UNLCK,1)
        else:
            import fcntl
            fcntl.flock(stream,fcntl.LOCK_EX)
            try:yield
            finally:fcntl.flock(stream,fcntl.LOCK_UN)


class Controller:
    def __init__(self, config_path):
        self.config_path=Path(config_path).resolve();self.config=load(self.config_path)
        self.state_root=Path(self.config["state_root"]).resolve();self.state_root.mkdir(parents=True,exist_ok=True)

    def task_file(self, task_id):
        if not isinstance(task_id,str) or not re.fullmatch(r"[a-f0-9]{32}",task_id):raise ValueError("İş kimliği geçersiz")
        return self.state_root/"jobs"/task_id/"state.json"

    def state(self, task_id):
        file=self.task_file(task_id);value=load(file)
        source,output=source_path(value["source"],self.config)
        if str(output)!=value["output"]:raise ValueError("İş çıktı yolu uyuşmuyor")
        if value["status"] in ("queued","running") and not process_alive(value.get("pid")):
            value.update(status="interrupted",message="Yerel hazırlama kesildi. Aynı arşiv için yeniden başlatabilirsiniz.",updated_at=time.time());save(file,value)
        return value

    def public(self, value):
        return {k:value.get(k) for k in ("task_id","source","output","status","phase","done","total","message","stats","options","updated_at")}

    def prepare(self, request):
        options={"profile":request.get('profile','standard'),"force_pdf_ocr":request.get('force_pdf_ocr',False),"readable_copy":request.get('readable_copy',False)}
        if options['profile'] not in ('standard','quality') or any(type(options[k]) is not bool for k in ('force_pdf_ocr','readable_copy')):raise ValueError('Hazırlama seçenekleri geçersiz')
        source,output=source_path(request.get("source"),self.config)
        validate_report(request.get("report"),source)
        with manager_lock(self.state_root):
            for file in sorted((self.state_root/"jobs").glob("*/state.json")):
                active=self.state(file.parent.name)
                if active["status"] in ("queued","running"):
                    if active["source"]==str(source):return self.public(active)
                    raise ValueError("Başka bir arşivin AI hazırlaması sürüyor. Bitmesini bekleyin.")
            task_id=uuid.uuid4().hex;file=self.task_file(task_id);file.parent.mkdir(parents=True)
            report_path=file.parent/"report.json";save(report_path,request["report"])
            value={"task_id":task_id,"source":str(source),"output":str(output),"options":options,"status":"queued","phase":"inventory","done":0,"total":0,"pid":None,"created_at":time.time(),"updated_at":time.time(),"message":"Yerel hazırlayıcı başlatılıyor…"}
            save(file,value)
            with (file.parent/"worker.log").open("ab") as log:
                process=subprocess.Popen([sys.executable,"-u",str(PROJECT/"tools"/"native_job.py"),"--config",str(self.config_path),"--task-id",task_id],stdin=subprocess.DEVNULL,stdout=log,stderr=log,close_fds=True,
                    creationflags=(subprocess.CREATE_NO_WINDOW|subprocess.CREATE_NEW_PROCESS_GROUP) if os.name=="nt" else 0)
            threading.Thread(target=process.wait,daemon=True).start()
            value=load(file);value["pid"]=process.pid;save(file,value)
            return self.public(value)

    def output_file(self, request):
        state=self.state(request.get("task_id"))
        if state["status"]!="completed":raise ValueError("AI paketi henüz hazır değil")
        names={"zip":"AI_PAYLASIM.zip","guide":"BASLANGIC.md","review":"KONTROL_GEREKENLER.md","catalog":"DOSYA_KATALOGU.md"}
        name=names.get(request.get("file"))
        if not name:raise ValueError("Dosya seçimi geçersiz")
        output=Path(state["output"]).resolve();file=(output/name).resolve(strict=True)
        if file.parent!=output or not file.is_file():raise ValueError("Paket dosyası bulunamadı")
        if file.stat().st_size>128*1024*1024:raise ValueError("Dosya tarayıcı aktarım sınırını aşıyor")
        return file

    def handle(self, request):
        op=request.get("op")
        if isinstance(op,str) and op.startswith('archive_'):
            from bundle_archive import ArchiveStore
            return ArchiveStore(self.config).handle(request)
        if op=="hello":
            ready=importlib.util.find_spec("pymupdf") is not None and importlib.util.find_spec("PIL") is not None
            ready=ready and all((PROJECT/"tools"/"ocr-data"/(lang+".traineddata")).is_file() for lang in ("tur","eng","osd"))
            import shutil
            ready=ready and bool(shutil.which("tesseract") or Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe").is_file())
            quality=all((PROJECT/'tools'/'ocr-best'/(lang+'.traineddata')).is_file() for lang in ('tur','eng','osd'))
            return {"protocol":1,"version":VERSION,"ready":bool(ready),"quality_ready":quality}
        if op=="prepare":return self.prepare(request)
        if op=='latest':
            source,_output=source_path(request.get('source'),self.config)
            matches=[]
            for file in (self.state_root/'jobs').glob('*/state.json'):
                value=load(file)
                if value.get('source')==str(source):matches.append((value.get('created_at',file.parent.stat().st_ctime),file.parent.name))
            return self.public(self.state(max(matches)[1])) if matches else None
        if op=="status":return self.public(self.state(request.get("task_id")))
        if op=='open_readable':
            state=self.state(request.get('task_id'));copy=(state.get('stats') or {}).get('readable_copy')
            if state['status']!='completed' or not copy:raise ValueError('Önce okunabilir klasör kopyasını hazırlayın')
            source,_output=source_path(state['source'],self.config)
            destination=Path(copy['path'])
            if destination.is_symlink() or getattr(destination,'is_junction',lambda:False)() or destination.parent.is_symlink() or getattr(destination.parent,'is_junction',lambda:False)():raise ValueError('Kopya yolu bağlantı olamaz')
            destination=destination.resolve(strict=True)
            if destination.parent!=source.parent/'Okunabilir' or load(destination/'okunabilir-arsiv.json').get('source')!=str(source):raise ValueError('Okunabilir kopya yolu doğrulanamadı')
            os.startfile(str(destination))
            return {'message':'Okunabilir kopya klasörü açıldı.'}
        if op=="search":
            state=self.state(request.get("task_id"));query=request.get("query")
            if state["status"]!="completed":raise ValueError("Önce AI paketini tamamlayın")
            if not isinstance(query,str) or not 1<=len(query.strip())<=300:raise ValueError("Arama 1–300 karakter olmalı")
            from ai_prepare import search
            return {"results":search(Path(state["output"]),query,8)}
        if op=="file_info":
            file=self.output_file(request)
            return {"size":file.stat().st_size,"sha256":hashlib.sha256(file.read_bytes()).hexdigest(),"name":file.name}
        if op=="file_chunk":
            file=self.output_file(request);offset=request.get("offset",0);size=request.get("size",192*1024)
            if type(offset) is not int or type(size) is not int or not 0<=offset<=file.stat().st_size or not 1<=size<=192*1024:raise ValueError("Dosya parçası geçersiz")
            with file.open("rb") as stream:stream.seek(offset);data=stream.read(size)
            return {"offset":offset,"data":base64.b64encode(data).decode("ascii"),"bytes":len(data)}
        raise ValueError("Desteklenmeyen yerel işlem")


def serve(input_stream, output_stream, config_path, origin):
    controller=Controller(config_path)
    if origin not in controller.config["allowed_origins"]:raise ValueError("Eklenti origin'i yetkili değil")
    while True:
        request=read_message(input_stream)
        if request is None:return
        request_id=request.get("id")
        if not isinstance(request_id,str) or len(request_id)>80:raise ValueError("Mesaj kimliği geçersiz")
        try:response={"id":request_id,"ok":True,"value":controller.handle(request)}
        except Exception as error:response={"id":request_id,"ok":False,"error":str(error)[:400]}
        write_message(output_stream,response)


def main():
    if os.name=="nt":
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(),os.O_BINARY);msvcrt.setmode(sys.stdout.fileno(),os.O_BINARY)
    config_path=PROJECT/"tools"/"native-runtime"/"config.json"
    origin=sys.argv[1] if len(sys.argv)>1 else ""
    try:serve(sys.stdin.buffer,sys.stdout.buffer,config_path,origin)
    except Exception as error:print(str(error),file=sys.stderr);return 1
    return 0


if __name__=="__main__":raise SystemExit(main())
