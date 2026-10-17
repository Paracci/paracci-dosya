"""Background job spawned by the scoped Native Messaging host."""
import argparse
from pathlib import Path
import time
from native_host import Controller, load, save, source_path, validate_report, manager_lock


def run(config_path,task_id):
    controller=Controller(config_path);file=controller.task_file(task_id)
    # Wait until the parent has persisted the worker PID before updating state.
    with manager_lock(controller.state_root):initial=load(file)
    source,output=source_path(initial["source"],controller.config);report=file.parent/"report.json"
    validate_report(load(report),source)
    def update(**values):
        state=load(file);state.update(values,updated_at=time.time());save(file,state)
    update(status="running",message="Yerel metin ve OCR hazırlaması başladı.")
    try:
        from ai_prepare import build
        def progress(event):
            labels={"inventory":"Dosyalar ve ZIP üyeleri listeleniyor…","extracting":"Metin ve Türkçe OCR hazırlanıyor…","copying":"Okunabilir klasör kopyası oluşturuluyor ve doğrulanıyor…","publishing":"Ciltler ve arama dizini yazılıyor…","completed":"AI paketi hazır."}
            update(status="running",phase=event["phase"],done=event.get("done",0),total=event.get("total",0),message=labels.get(event["phase"],event["phase"]))
        stats=build(source,output,report=report,callback=progress,**initial.get('options',{}))
        update(status="completed",phase="completed",stats=stats,message="AI paketi hazır. İndirebilir veya bu ekranda arayabilirsiniz.")
    except Exception as error:update(status="error",message=str(error)[:400])


if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--config",type=Path,required=True);parser.add_argument("--task-id",required=True);args=parser.parse_args();run(args.config,args.task_id)
