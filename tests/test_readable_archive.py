import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'tools'))
import ai_prepare as ai
from readable_archive import create_copy


class ReadableTests(unittest.TestCase):
    def fixture(self,temp):
        root=Path(temp)/'UYAP'/'2099_123 - Short [abcdef12]';folder=root/'Group [123456]'/'Type [123456]'/'Main [123456abcdef]';folder.mkdir(parents=True)
        (folder/'Main [123456abcdef].txt').write_text('original text',encoding='utf-8')
        (folder/'Ek 1 [abcdef123456].txt').write_text('attachment text',encoding='utf-8')
        sources,_=ai.inventory(root)
        report={'title':'2099/123 - Örnek Mahkemesi','items':[{'state':'complete','path':'UYAP/'+root.name+'/'+s['relative_path'],'label':'Ek 1' if s['is_attachment'] else 'Hazırlık Dosyası Gelen Evrak 05/04/2099','folders':['2099/456 (CBS Soruşturma Dosyası)','Hazırlık Dosyası Gelen Evrak'],'parentLabel':'Hazırlık Dosyası Gelen Evrak 05/04/2099' if s['is_attachment'] else None} for s in sources]}
        p=Path(temp)/'report.json';p.write_text(json.dumps(report),encoding='utf-8');ai.enrich_from_report(sources,root,p)
        return root,sources

    def test_readable_copy_uses_full_report_names_and_preserves_original_hashes(self):
        with tempfile.TemporaryDirectory() as temp:
            root,sources=self.fixture(temp);result=create_copy(root,sources);destination=Path(result['path'])
            self.assertNotIn('[abcdef12]',destination.name)
            names=[p.name for p in destination.rglob('*')]
            self.assertIn('Hazırlık Dosyası Gelen Evrak',names);self.assertIn('Ana evrak.txt',names);self.assertIn('Ek 1.txt',names)
            marker=json.loads((destination/'okunabilir-arsiv.json').read_text(encoding='utf-8'))
            for entry in marker['files']:
                self.assertEqual(ai.sha((root/entry['source']).read_bytes()),entry['sha256']);self.assertEqual(ai.sha((destination/entry['copy']).read_bytes()),entry['sha256'])
            self.assertEqual(create_copy(root,sources)['files'],2)
            for source in sources:self.assertNotIn('[123456',ai.display_path(source))

    def test_modified_copy_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as temp:
            root,sources=self.fixture(temp);result=create_copy(root,sources);destination=Path(result['path'])
            file=next(destination.rglob('Ana evrak.txt'));file.write_text('user edit',encoding='utf-8')
            with self.assertRaisesRegex(ValueError,'üzerine yazılmadı'):create_copy(root,sources)
            self.assertEqual(file.read_text(encoding='utf-8'),'user edit')
            original=next(s for s in sources if not s['is_attachment'])
            self.assertEqual(ai.sha((root/original['relative_path']).read_bytes()),original['sha256'])

    def test_interrupted_verification_keeps_ownership_of_later_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root,sources=self.fixture(temp);create_copy(root,sources)
            def stop(done,total):raise RuntimeError('interrupted')
            with self.assertRaises(RuntimeError):create_copy(root,sources,stop)
            self.assertEqual(create_copy(root,sources)['files'],2)

    def test_long_readable_names_stay_bounded_without_windows_trailing_dots(self):
        with tempfile.TemporaryDirectory() as temp:
            root,sources=self.fixture(temp)
            for source in sources:
                source['folders']=['Very long source group '*10,'Very long document type '*10]
                source['parent_label']='Very long main document label '*10
            result=create_copy(root,sources);paths=list(Path(result['path']).rglob('*'))
            self.assertTrue(all(not p.name.endswith('.') for p in paths));self.assertLessEqual(max(len(str(p)) for p in paths),228)
            self.assertEqual(create_copy(root,sources)['files'],2)

    def test_same_labels_are_numbered_and_unknown_existing_folder_is_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            root,sources=self.fixture(temp)
            existing=root.parent/'Okunabilir'/'2099_123 - Örnek Mahkemesi';existing.mkdir(parents=True);(existing/'keep.txt').write_text('user file')
            sources[1]['label']=sources[0]['label']='Same'
            sources[1]['is_attachment']=sources[0]['is_attachment']=True
            result=create_copy(root,sources);names=[p.name for p in Path(result['path']).rglob('*.txt')]
            self.assertEqual(sorted(names),['Same (2).txt','Same.txt'])
            self.assertTrue(Path(result['path']).name.endswith('(2)'));self.assertEqual((existing/'keep.txt').read_text(),'user file')


if __name__=='__main__':unittest.main()
