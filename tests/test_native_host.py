import base64,io,json,os,shutil,struct,sys,tempfile,time,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'tools'))
import native_host as host


class NativeHostTests(unittest.TestCase):
    def test_atomic_status_save_retries_a_brief_windows_reader_lock(self):
        with tempfile.TemporaryDirectory() as temp:
            file=Path(temp)/'state.json';original=Path.replace;attempts=[]
            def replace(source,target):
                attempts.append(1)
                if len(attempts)<3:raise PermissionError('temporary reader lock')
                return original(source,target)
            with patch.object(Path,'replace',replace),patch.object(host.time,'sleep'):
                host.save(file,{'status':'completed'})
            self.assertEqual(host.load(file)['status'],'completed');self.assertEqual(len(attempts),3)
    def fixture(self,temp):
        base=Path(temp);archives=base/'archives';archives.mkdir();source=archives/'Dava [aaaaaaaa]';source.mkdir();(source/'file.txt').write_text('Bilirkişi raporu ve örnek bedel metni.',encoding='utf-8')
        config={'allowed_origins':['chrome-extension://'+'a'*32+'/'],'allowed_roots':[str(archives)],'state_root':str(base/'state')}
        config_path=base/'config.json';host.save(config_path,config)
        report={'items':[{'state':'complete','path':'UYAP/'+source.name+'/file.txt','label':'Örnek','folders':['Dava','Bilirkişi']} ]}
        return host.Controller(config_path),source,report,config_path

    def completed(self,controller,source):
        task='b'*32;output=source.with_name(source.name+'__AI');output.mkdir();(output/'AI_PAYLASIM.zip').write_bytes(b'package bytes')
        host.save(controller.task_file(task),{'task_id':task,'source':str(source),'output':str(output),'status':'completed'})
        return task,output

    def test_framing_uses_utf8_byte_length_and_supports_partial_reads(self):
        stream=io.BytesIO();value={'id':'x','text':'İçerik Türkçe'};host.write_message(stream,value)
        raw=stream.getvalue();self.assertEqual(struct.unpack('=I',raw[:4])[0],len(raw[4:]))
        class Partial(io.BytesIO):
            def read(self,size=-1):return super().read(min(1,size) if size>=0 else 1)
        self.assertEqual(host.read_message(Partial(raw)),value)
        with self.assertRaises(ValueError):host.read_message(io.BytesIO(struct.pack('=I',host.MAX_INPUT+1)))
        with self.assertRaises(EOFError):host.read_message(io.BytesIO(b'\x02\x00'))

    def test_origin_is_exactly_allowlisted_and_unknown_actions_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            controller,source,report,config=self.fixture(temp)
            with self.assertRaises(ValueError):host.serve(io.BytesIO(),io.BytesIO(),config,'https://vatandas.uyap.gov.tr')
            with self.assertRaises(ValueError):controller.handle({'op':'shell','command':'echo nope'})
            data=io.BytesIO();host.write_message(data,{'id':'x','op':'hello'});out=io.BytesIO()
            host.serve(io.BytesIO(data.getvalue()),out,config,'chrome-extension://'+'a'*32+'/')
            self.assertTrue(host.read_message(io.BytesIO(out.getvalue()))['ok'])

    def test_only_direct_case_children_of_the_archive_root_are_accepted(self):
        with tempfile.TemporaryDirectory() as temp:
            controller,source,report,config=self.fixture(temp)
            self.assertEqual(host.source_path(str(source),controller.config)[0],source)
            for path in [source.parent,Path(temp),source.parent/'missing [bbbbbbbb]']:
                with self.assertRaises((ValueError,FileNotFoundError)):host.source_path(str(path),controller.config)

    def test_missing_or_traversing_report_files_are_not_accepted(self):
        with tempfile.TemporaryDirectory() as temp:
            controller,source,report,config=self.fixture(temp);host.validate_report(report,source)
            for value in ['UYAP/'+source.name+'/../outside.txt','UYAP/Other [bbbbbbbb]/file.txt','UYAP/'+source.name+'/missing.txt']:
                bad={'items':[{'state':'complete','path':value}]}
                with self.assertRaises((ValueError,FileNotFoundError)):host.validate_report(bad,source)
            with self.assertRaises(ValueError):host.validate_report({'items':[{'state':'pending','path':'x'}]},source)

    def test_file_transfer_has_a_fixed_output_allowlist_and_exact_chunk_hash(self):
        with tempfile.TemporaryDirectory() as temp:
            controller,source,report,config=self.fixture(temp);task,output=self.completed(controller,source)
            info=controller.handle({'op':'file_info','task_id':task,'file':'zip'})
            data=controller.handle({'op':'file_chunk','task_id':task,'file':'zip','offset':0,'size':5})
            self.assertEqual(base64.b64decode(data['data']),b'packa');self.assertEqual(info['size'],13)
            for request in [{'file':'../../config.json'},{'file':'zip','offset':-1},{'file':'zip','size':300000}]:
                with self.assertRaises(ValueError):controller.handle({'op':'file_chunk','task_id':task,**request})

    def test_a_lost_worker_is_interrupted_instead_of_reported_complete(self):
        with tempfile.TemporaryDirectory() as temp:
            controller,source,report,config=self.fixture(temp);task,output=self.completed(controller,source)
            value=host.load(controller.task_file(task));value.update(status='running',pid=0);host.save(controller.task_file(task),value)
            self.assertEqual(controller.state(task)['status'],'interrupted')

    def test_repeated_prepare_does_not_start_duplicate_workers(self):
        with tempfile.TemporaryDirectory() as temp:
            controller,source,report,config=self.fixture(temp);task,output=self.completed(controller,source)
            value=host.load(controller.task_file(task));value.update(status='running',pid=123);host.save(controller.task_file(task),value)
            with patch.object(host,'process_alive',return_value=True),patch.object(host.subprocess,'Popen') as spawn:
                result=controller.prepare({'source':str(source),'report':report});self.assertEqual(result['task_id'],task);spawn.assert_not_called()

    def test_native_options_are_closed_and_copy_viewer_rejects_other_paths(self):
        with tempfile.TemporaryDirectory() as temp:
            controller,source,report,config=self.fixture(temp)
            for options in [{'profile':'shell'},{'force_pdf_ocr':'true'},{'readable_copy':1}]:
                with self.assertRaises(ValueError):controller.prepare({'source':str(source),'report':report,**options})
            task,output=self.completed(controller,source);state=host.load(controller.task_file(task))
            state['stats']={'readable_copy':{'path':str(source)}};host.save(controller.task_file(task),state)
            with patch.object(host.os,'startfile',create=True) as open_folder:
                with self.assertRaises(ValueError):controller.handle({'op':'open_readable','task_id':task})
                open_folder.assert_not_called()

    def test_latest_job_uses_the_requested_allowed_archive_and_creation_order(self):
        with tempfile.TemporaryDirectory() as temp:
            controller,source,report,config=self.fixture(temp)
            self.assertIsNone(controller.handle({'op':'latest','source':str(source)}))
            task,output=self.completed(controller,source);state=host.load(controller.task_file(task));state['created_at']=10;host.save(controller.task_file(task),state)
            newer='c'*32;host.save(controller.task_file(newer),dict(state,task_id=newer,created_at=20))
            latest=controller.handle({'op':'latest','source':str(source)})
            self.assertEqual(latest['task_id'],newer)
            with self.assertRaises(ValueError):controller.handle({'op':'latest','source':temp})

    @unittest.skipUnless((shutil.which('tesseract') or Path(r'C:\Program Files\Tesseract-OCR\tesseract.exe').is_file()) and all((host.PROJECT/'tools'/'ocr-data'/(lang+'.traineddata')).is_file() for lang in ('tur','eng','osd')),'local OCR runtime/models unavailable')
    def test_actual_background_job_builds_a_synthetic_archive_and_is_searchable(self):
        with tempfile.TemporaryDirectory() as temp:
            controller,source,report,config=self.fixture(temp)
            result=controller.prepare({'source':str(source),'report':report});task=result['task_id']
            deadline=time.monotonic()+30
            while time.monotonic()<deadline:
                result=controller.state(task)
                if result['status'] not in ['queued','running']:break
                time.sleep(.1)
            self.assertEqual(result['status'],'completed',result.get('message'))
            self.assertEqual(result['stats']['top_level_files'],1)
            hits=controller.handle({'op':'search','task_id':task,'query':'bilirkişi raporu'})
            self.assertTrue(hits['results'])
            info=controller.handle({'op':'file_info','task_id':task,'file':'zip'});self.assertGreater(info['size'],0)
            while host.process_alive(host.load(controller.task_file(task)).get('pid')) and time.monotonic()<deadline:time.sleep(.1)


if __name__=='__main__':unittest.main()
