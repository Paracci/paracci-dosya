"""Small local desktop companion. No network or AI-provider connection."""
import os
from pathlib import Path
import queue
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from ai_prepare import build, search


def main():
    window=tk.Tk();window.title("Paracci Dosya · Yerel AI Paketi");window.geometry("900x760")
    events=queue.Queue();source=tk.StringVar();output=tk.StringVar();report=tk.StringVar();status=tk.StringVar(value="Dava arşivinin ana klasörünü seçin.")
    notebook=ttk.Notebook(window);notebook.pack(fill="both",expand=True,padx=20,pady=20)
    prep=ttk.Frame(notebook,padding=20);find=ttk.Frame(notebook,padding=20);notebook.add(prep,text="Paket hazırla");notebook.add(find,text="Yerel arama")
    ttk.Label(prep,text="Belgeleriniz yapay zekâ için okunabilir olsun",font=("Segoe UI",17)).pack(anchor="w",pady=(0,12))
    ttk.Label(prep,text="UDF metni · PDF sayfaları · Türkçe OCR · ZIP içeriği · Kaynak referansları").pack(anchor="w",pady=(0,20))
    def choose_source():
        value=filedialog.askdirectory(title="Davanın arşiv klasörünü seçin")
        if value:source.set(value);output.set(str(Path(value).with_name(Path(value).name+"__AI")))
    ttk.Label(prep,text="Özgün dava arşivi").pack(anchor="w")
    row=ttk.Frame(prep);row.pack(fill="x",pady=(6,14));ttk.Entry(row,textvariable=source).pack(side="left",fill="x",expand=True);ttk.Button(row,text="Klasör seç",command=choose_source).pack(side="right",padx=(10,0))
    ttk.Label(prep,text="AI paketi çıktı klasörü").pack(anchor="w");ttk.Entry(prep,textvariable=output).pack(fill="x",pady=(6,20))
    def choose_report():
        value=filedialog.askopenfilename(title="Arşiv raporu (isteğe bağlı)",filetypes=[("JSON raporu","*.json")])
        if value:report.set(value)
    ttk.Label(prep,text="Arşiv raporu (isteğe bağlı; tam belge türü adları için)").pack(anchor="w")
    row=ttk.Frame(prep);row.pack(fill="x",pady=(6,12));ttk.Entry(row,textvariable=report).pack(side="left",fill="x",expand=True);ttk.Button(row,text="Rapor seç",command=choose_report).pack(side="right",padx=(10,0))
    ttk.Label(prep,textvariable=status,wraplength=770).pack(anchor="w",pady=10)
    bar=ttk.Progressbar(prep,mode="determinate");bar.pack(fill="x",pady=10)
    summary=tk.Text(prep,height=10,wrap="word",font=("Segoe UI",10));summary.pack(fill="both",expand=True,pady=10)
    ttk.Label(prep,text="Bağımsız bir Paracci projesi; resmî UYAP uygulaması değildir. Belgeler dış servise gönderilmez. OCR çıktısı hata içerebilir. README ve yasal bilgileri inceleyin.",wraplength=770).pack(anchor="w",pady=10)
    search_package=tk.StringVar();query=tk.StringVar()
    def worker(root,destination,report_path):
        try:events.put(("done",build(Path(root),Path(destination),report=Path(report_path) if report_path else None,callback=lambda e:events.put(("progress",e)))))
        except Exception as error:events.put(("error",str(error)))
    def start():
        if not source.get() or not output.get():messagebox.showerror("Klasör gerekli","Kaynak ve çıktı klasörünü seçin.");return
        start_button.configure(state="disabled");summary.delete("1.0","end");bar.configure(value=0)
        threading.Thread(target=worker,args=(source.get(),output.get(),report.get()),daemon=True).start()
    start_button=ttk.Button(prep,text="Yerel AI paketini hazırla",command=start);start_button.pack(anchor="e")
    ttk.Label(find,text="Hazır pakette kaynaklı metin arayın",font=("Segoe UI",17)).pack(anchor="w",pady=(0,16))
    def choose_package():
        value=filedialog.askdirectory(title="AI paketinin klasörünü seçin")
        if value:search_package.set(value)
    row=ttk.Frame(find);row.pack(fill="x",pady=8);ttk.Entry(row,textvariable=search_package).pack(side="left",fill="x",expand=True);ttk.Button(row,text="Paket seç",command=choose_package).pack(side="right",padx=10)
    result=tk.Text(find,wrap="word",font=("Segoe UI",10))
    def run_search():
        result.delete("1.0","end")
        try:
            rows=search(Path(search_package.get()),query.get())
            for item in rows:result.insert("end",f"[{item['doc_id']}, {item['locator']}] · {item['method']}\n{item['text']}\n\n{'─'*50}\n\n")
            if not rows:result.insert("end","Eşleşme bulunamadı. Daha az veya farklı anahtar sözcük deneyin.")
        except Exception as error:messagebox.showerror("Arama tamamlanamadı",str(error))
    row=ttk.Frame(find);row.pack(fill="x",pady=10);entry=ttk.Entry(row,textvariable=query);entry.pack(side="left",fill="x",expand=True);entry.bind("<Return>",lambda _e:run_search());ttk.Button(row,text="Ara",command=run_search).pack(side="right",padx=10)
    result.pack(fill="both",expand=True)
    def poll():
        try:
            while True:
                kind,value=events.get_nowait()
                if kind=="progress":
                    phase=value["phase"];done=value.get("done",0);total=value.get("total",0)
                    labels={"inventory":"Dosyalar ve ZIP üyeleri listeleniyor","extracting":"Metin ve OCR hazırlanıyor","publishing":"Ciltler, kaynak dizini ve arama paketi yazılıyor","completed":"Paket tamamlandı"}
                    status.set(labels.get(phase,phase)+(f" · {done} / {total}" if total else ""))
                    bar.configure(maximum=max(total,1),value=done)
                elif kind=="done":
                    start_button.configure(state="normal");search_package.set(output.get())
                    summary.insert("end",f"Paket hazır: {output.get()}\n\n{value['top_level_files']} özgün dosya, {value['zip_members']} ZIP üyesi\n{value['unique_documents']} tekil belge, {value['units']} sayfa/bölüm\n{value['ocr_units']} OCR birimi\n{value['review_entries']} kontrol kaydı, {value['errors']} çıkarım hatası\n\nÖnce BASLANGIC.md dosyasını okuyun. Yapay zekâya AI_OKUMA_*.md ciltleri ve katalog dosyaları verilebilir.")
                else:start_button.configure(state="normal");status.set("Hazırlama durdu; mevcut önbellek korunur.");messagebox.showerror("Paket hazırlanamadı",value)
        except queue.Empty:pass
        window.after(200,poll)
    window.protocol("WM_DELETE_WINDOW",lambda:window.destroy() if str(start_button["state"])!="disabled" or messagebox.askyesno("Çalışma sürüyor","Pencere kapansa da başlatılmış yerel OCR kısa süre devam edebilir. Kapatılsın mı?") else None)
    poll();window.mainloop()


if __name__=="__main__":main()
