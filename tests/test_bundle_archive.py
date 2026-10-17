import base64,hashlib,io,json,os,subprocess,sys,tempfile,unittest,zipfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'tools'))
from bundle_archive import ArchiveStore
from native_host import write_message,read_message


class BundleTests(unittest.TestCase):
    def fixture(self,temp,count=2):
        root=Path(temp)/'UYAP';root.mkdir();config={'allowed_roots':[str(root)],'state_root':str(Path(temp)/'state')}
        title='2099/123 - Örnek Mahkeme';case=hashlib.sha256(title.encode()).hexdigest();folder='2099_123 - Örnek Mahkeme ['+case[:8]+']'
        items=[]
        for n in range(count):
            key=hashlib.sha256(('synthetic-'+str(n)).encode()).hexdigest()
            items.append({'key':key,'directory':'UYAP/'+folder+'/Grup/Tür/Ana evrak','base_name':'Belge ['+key[:12]+']','receipt':False})
        return ArchiveStore(config),{'title':title,'case_key':case,'items':items},config

    def send(self,store,archive,key,data=b'%PDF-1.7\nsynthetic document\n%%EOF'):
        store.handle({'op':'archive_begin','archive_id':archive,'key':key,'extension':'pdf'})
        store.handle({'op':'archive_chunk','archive_id':archive,'key':key,'offset':0,'data':base64.b64encode(data).decode()})
        return store.handle({'op':'archive_finish_file','archive_id':archive,'key':key,'bytes':len(data)})

    def test_restart_preserves_finished_files_and_restarts_only_an_unfinished_file(self):
        with tempfile.TemporaryDirectory() as temp:
            store,plan,config=self.fixture(temp);state=store.prepare(plan);archive=state['archive_id'];a,b=[i['key'] for i in plan['items']]
            self.send(store,archive,a)
            store.handle({'op':'archive_begin','archive_id':archive,'key':b,'extension':'pdf'})
            store.handle({'op':'archive_chunk','archive_id':archive,'key':b,'offset':0,'data':base64.b64encode(b'partial').decode()})
            restored=ArchiveStore(config).prepare(plan);self.assertEqual([i['complete'] for i in restored['items']],[True,False])
            self.send(store,archive,b);finished=store.handle({'op':'archive_finalize','archive_id':archive})
            self.assertEqual(finished['status'],'completed')
            with zipfile.ZipFile(finished['zip']) as z:self.assertIsNone(z.testzip());self.assertEqual(len(z.namelist()),2)
            self.assertTrue(all(i['complete'] for i in store.handle({'op':'archive_status','archive_id':archive,'verify':True})['items']))

    def test_chunks_are_exact_order_and_missing_bytes_are_not_committed(self):
        with tempfile.TemporaryDirectory() as temp:
            store,plan,_=self.fixture(temp,1);archive=store.prepare(plan)['archive_id'];key=plan['items'][0]['key']
            store.handle({'op':'archive_begin','archive_id':archive,'key':key,'extension':'pdf'})
            for offset,data in [(3,b'bad'),(False,b'bad'),(0,b'x'*(96*1024+1))]:
                with self.assertRaises(ValueError):store.handle({'op':'archive_chunk','archive_id':archive,'key':key,'offset':offset,'data':base64.b64encode(data).decode()})
            with self.assertRaises(ValueError):store.handle({'op':'archive_finish_file','archive_id':archive,'key':key,'bytes':12})
            with self.assertRaises(ValueError):store.handle({'op':'archive_finalize','archive_id':archive})

    def test_adding_a_document_reuses_only_exact_verified_identities(self):
        with tempfile.TemporaryDirectory() as temp:
            store,plan,_=self.fixture(temp,2);archive=store.prepare(plan)['archive_id'];self.send(store,archive,plan['items'][0]['key'])
            extra=dict(plan['items'][1]);extra['key']=hashlib.sha256(b'new synthetic record').hexdigest();extra['base_name']='Belge ['+extra['key'][:12]+']'
            plan['items'].append(extra);state=store.prepare(plan)
            self.assertNotEqual(state['archive_id'],archive);self.assertEqual([i['complete'] for i in state['items']],[True,False,False])

    def test_terminated_native_process_keeps_only_acknowledged_complete_documents(self):
        with tempfile.TemporaryDirectory() as temp:
            store,plan,config=self.fixture(temp,2);archive=store.prepare(plan)['archive_id'];config['allowed_origins']=['chrome-extension://'+'a'*32+'/'];config_file=Path(temp)/'config.json';config_file.write_text(json.dumps(config),encoding='utf-8')
            code='import sys;from native_host import serve;serve(sys.stdin.buffer,sys.stdout.buffer,sys.argv[1],sys.argv[2])'
            process=subprocess.Popen([sys.executable,'-u','-c',code,str(config_file),config['allowed_origins'][0]],cwd=Path(__file__).resolve().parent.parent/'tools',stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
            def send(op,**values):
                write_message(process.stdin,{'id':'test', 'op':op,'archive_id':archive,**values});response=read_message(process.stdout);self.assertTrue(response['ok'],response)
            try:
                first,second=[i['key'] for i in plan['items']];data=b'%PDF-1.7\nsynthetic complete\n%%EOF'
                send('archive_begin',key=first,extension='pdf');send('archive_chunk',key=first,offset=0,data=base64.b64encode(data).decode());send('archive_finish_file',key=first,bytes=len(data))
                send('archive_begin',key=second,extension='pdf');send('archive_chunk',key=second,offset=0,data=base64.b64encode(b'partial').decode())
                process.kill();process.wait(timeout=5)
            finally:
                if process.poll() is None:process.kill();process.wait(timeout=5)
                process.stdin.close();process.stdout.close();process.stderr.close()
            restored=ArchiveStore(config).prepare(plan);self.assertEqual([i['complete'] for i in restored['items']],[True,False])

    def test_path_escape_foreign_keys_and_executable_formats_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            store,plan,_=self.fixture(temp,1);archive=store.prepare(plan)['archive_id'];key=plan['items'][0]['key']
            with self.assertRaises(ValueError):store.handle({'op':'archive_begin','archive_id':archive,'key':key,'extension':'exe'})
            with self.assertRaises(ValueError):store.handle({'op':'archive_begin','archive_id':archive,'key':'a'*64,'extension':'pdf'})
            for value in ('../outside','C:/outside','UYAP/../outside'):
                plan['items'][0]['directory']=value
                with self.assertRaises(ValueError):store.prepare(plan)

    def test_fake_pdf_html_and_different_destination_never_overwrite_original(self):
        with tempfile.TemporaryDirectory() as temp:
            store,plan,_=self.fixture(temp,1);archive=store.prepare(plan)['archive_id'];key=plan['items'][0]['key']
            with self.assertRaises(ValueError):self.send(store,archive,key,b'<html>login</html>')
            self.send(store,archive,key)
            state=json.loads(store.state_file(archive).read_text(encoding='utf-8'));item=state['items'][0];target=store.target(state,item);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b'user file')
            with self.assertRaisesRegex(ValueError,'üzerine yazılmadı'):store.handle({'op':'archive_finalize','archive_id':archive})
            self.assertEqual(target.read_bytes(),b'user file')

    def test_hash_changed_completed_file_is_not_silently_skipped(self):
        with tempfile.TemporaryDirectory() as temp:
            store,plan,_=self.fixture(temp,1);archive=store.prepare(plan)['archive_id'];key=plan['items'][0]['key'];self.send(store,archive,key)
            state=json.loads(store.state_file(archive).read_text(encoding='utf-8'));store.blob(state,state['items'][0]).write_bytes(b'corrupted')
            self.assertFalse(store.prepare(plan)['items'][0]['complete'])

    def test_missing_final_zip_is_rebuilt_without_downloading_documents_again(self):
        with tempfile.TemporaryDirectory() as temp:
            store,plan,_=self.fixture(temp,1);archive=store.prepare(plan)['archive_id'];self.send(store,archive,plan['items'][0]['key'])
            finished=store.handle({'op':'archive_finalize','archive_id':archive});Path(finished['zip']).unlink()
            state=store.prepare(plan);self.assertEqual(state['status'],'collecting');self.assertTrue(state['items'][0]['complete'])
            self.assertTrue(Path(store.handle({'op':'archive_finalize','archive_id':archive})['zip']).is_file())

    def test_old_browser_download_can_be_imported_without_chrome_downloading_again(self):
        with tempfile.TemporaryDirectory() as temp:
            store,plan,_=self.fixture(temp,1);item=plan['items'][0];path=item['directory']+'/'+item['base_name']+'.pdf';target=Path(temp)/path;target.parent.mkdir(parents=True);target.write_bytes(b'%PDF-1.7\nexisting\n%%EOF');item['existing']=path
            state=store.prepare(plan);self.assertTrue(state['items'][0]['complete'])
            done=store.handle({'op':'archive_finalize','archive_id':state['archive_id']});self.assertTrue(Path(done['zip']).is_file());self.assertEqual(target.read_bytes(),b'%PDF-1.7\nexisting\n%%EOF')

    def test_udf_container_is_kept_as_udf_when_the_header_only_says_zip(self):
        with tempfile.TemporaryDirectory() as temp:
            store,plan,_=self.fixture(temp,1);archive=store.prepare(plan)['archive_id'];key=plan['items'][0]['key'];stream=io.BytesIO()
            with zipfile.ZipFile(stream,'w') as z:z.writestr('content.xml','<template><content>Synthetic UDF</content></template>')
            data=stream.getvalue();store.handle({'op':'archive_begin','archive_id':archive,'key':key,'extension':'zip'});store.handle({'op':'archive_chunk','archive_id':archive,'key':key,'offset':0,'data':base64.b64encode(data).decode()})
            result=store.handle({'op':'archive_finish_file','archive_id':archive,'key':key,'bytes':len(data)});self.assertEqual(result['extension'],'udf')
            done=store.handle({'op':'archive_finalize','archive_id':archive})
            with zipfile.ZipFile(done['zip']) as z:self.assertTrue(z.namelist()[0].endswith('.udf'))

    def test_interrupted_zip_is_rebuilt_and_unrelated_zip_is_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            store,plan,_=self.fixture(temp,1);archive=store.prepare(plan)['archive_id'];self.send(store,archive,plan['items'][0]['key'])
            state=json.loads(store.state_file(archive).read_text(encoding='utf-8'));root,source,_=store.scope(state);original=root/(state['case_folder']+'.zip');original.write_bytes(b'user zip')
            with patch.object(store,'zip_valid',return_value=False):
                with self.assertRaises(ValueError):store.handle({'op':'archive_finalize','archive_id':archive})
            result=store.handle({'op':'archive_finalize','archive_id':archive});self.assertEqual(original.read_bytes(),b'user zip');self.assertIn('(2)',result['zip'])


if __name__=='__main__':unittest.main()
