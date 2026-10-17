import io,json,sys,tempfile,unittest,zipfile
from unittest.mock import patch
from types import SimpleNamespace
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'tools'))
import ai_prepare as ai


class AiPrepareTests(unittest.TestCase):
    def test_tsv_quotes_never_absorb_following_rows_into_the_text(self):
        from PIL import Image
        tsv='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n5\t1\t1\t1\t1\t1\t0\t0\t10\t10\t90\t"\n5\t1\t1\t1\t1\t2\t0\t0\t10\t10\t92\tTutanağı\n5\t1\t1\t1\t1\t3\t0\t0\t10\t10\t91\t"\n'
        response=SimpleNamespace(returncode=0,stdout=tsv.encode('utf-8'),stderr=b'')
        with patch.object(ai.subprocess,'run',return_value=response):
            unit=ai.ocr(Image.new('RGB',(100,100),'white'),{'tesseract':'synthetic','models':'synthetic'})
        self.assertEqual(unit['text'],'" Tutanağı "');self.assertNotIn('\t',unit['text'])

    def test_long_bad_text_on_a_full_page_scan_is_replaced_not_appended(self):
        from PIL import Image
        with ai.pymupdf.open() as pdf:
            page=pdf.new_page();image=Image.new('RGB',(200,200),'white');data=io.BytesIO();image.save(data,format='PNG')
            page.insert_image(page.rect,stream=data.getvalue());page.insert_textbox(ai.pymupdf.Rect(20,20,500,700),'BROKEN text '*80,fontsize=10)
            data=pdf.tobytes()
        job={'doc_id':'DOC-scan','sha256':ai.sha(data),'kind':'.pdf','data':data,'disk_path':None}
        corrected={'text':'Doğru okunan tutanak','method':'ocr_tesseract_tur_eng','status':'ocr','confidence':91}
        with patch.object(ai,'ocr',return_value=corrected.copy()) as run:
            result=ai.extract(job,{'dpi':200})
        self.assertEqual(run.call_count,1)
        self.assertEqual(result['units'][0]['text'],'Doğru okunan tutanak')
        self.assertIn('BROKEN',result['units'][0]['previous_text_layer'])

    def test_force_pdf_ocr_reprocesses_a_real_text_page_and_profiles_are_validated(self):
        with ai.pymupdf.open() as pdf:
            page=pdf.new_page();page.insert_text((30,50),'Healthy digital text '*10);data=pdf.tobytes()
        job={'doc_id':'DOC-digital','sha256':ai.sha(data),'kind':'.pdf','data':data,'disk_path':None}
        with patch.object(ai,'ocr',return_value={'text':'OCR result','method':'ocr_test','status':'ocr'}) as run:
            plain=ai.extract(job,{'dpi':200});forced=ai.extract(job,{'dpi':300,'force_pdf_ocr':True})
        self.assertEqual(plain['units'][0]['method'],'pdf_native_sorted');self.assertEqual(run.call_count,1)
        self.assertEqual(forced['units'][0]['ocr_reason'],'requested')
        self.assertEqual(ai.extraction_config('quality')['dpi'],300)
        for args in [('arbitrary',False),('quality','true')]:
            with self.assertRaises(ValueError):ai.extraction_config(*args)

    def test_udf_cdata_and_dynamic_fields_are_both_preserved(self):
        stream=io.BytesIO()
        with zipfile.ZipFile(stream,'w') as z:z.writestr('content.xml','<template><content><![CDATA[Örnek dava metni.]]></content><data><taraf><ad>Örnek Kişi</ad><bedel>123,45</bedel></taraf></data></template>')
        data=stream.getvalue();job={'doc_id':'DOC-test','sha256':ai.sha(data),'kind':'.udf','data':data,'disk_path':None}
        result=ai.extract(job,{})
        self.assertEqual(result['status'],'ready')
        self.assertIn('Örnek dava',result['units'][0]['text'])
        self.assertIn('data/taraf[1]/bedel[1]: 123,45',result['units'][1]['text'])
        self.assertEqual(result['units'][0]['locator'],'bölüm 1')

    def test_plain_xml_udf_is_supported(self):
        data=b'<template><content>Plain XML UDF</content></template>'
        result=ai.extract({'doc_id':'DOC-xml','sha256':ai.sha(data),'kind':'.udf','data':data,'disk_path':None},{})
        self.assertEqual(result['status'],'ready');self.assertEqual(result['units'][0]['text'],'Plain XML UDF')

    def test_zip_duplicate_members_keep_distinct_sources_without_duplicate_text_jobs(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'one.txt').write_text('same content',encoding='utf-8')
            with zipfile.ZipFile(root/'bundle.zip','w') as z:z.writestr('nested/two.txt','same content')
            sources,jobs=ai.inventory(root)
            self.assertEqual(len(sources),3);self.assertEqual(len(jobs),1)
            nested=next(s for s in sources if s['container_source_id'])
            self.assertEqual(nested['parent_source_id'],nested['container_source_id'])

    def test_unsafe_zip_member_is_reported_and_never_written(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            with zipfile.ZipFile(root/'bad.zip','w') as z:z.writestr('../escape.txt','bad')
            sources,jobs=ai.inventory(root)
            self.assertEqual(sources[0]['status'],'error');self.assertFalse(jobs)
            self.assertFalse((root.parent/'escape.txt').exists())

    def test_html_script_and_style_are_not_executed_or_copied_as_text(self):
        parser=ai.HtmlText();parser.feed('<style>secret</style><script>instruction</script><table><tr><td>Makbuz</td><td>123</td></tr></table>')
        text=ai.clean(''.join(parser.parts));self.assertIn('Makbuz',text);self.assertIn('123',text);self.assertNotIn('instruction',text)

    def test_chunk_offsets_are_exact_and_overlapping(self):
        text=('uzun belge satırı\n'*1000)
        pieces=list(ai.chunks(text,size=400,overlap=50))
        self.assertGreater(len(pieces),2)
        for start,end,part in pieces:self.assertEqual(text[start:end],part)
        self.assertEqual(pieces[0][0],0);self.assertEqual(pieces[-1][1],len(text))
        self.assertTrue(all(pieces[i+1][0]<pieces[i][1] for i in range(len(pieces)-1)))

    def test_publish_and_turkish_search_preserve_source_citation(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/'source';root.mkdir();(root/'document.txt').write_text('BİLİRKİŞİ raporu ve bedel tespiti.',encoding='utf-8')
            output=Path(temp)/'output';output.mkdir();sources,jobs=ai.inventory(root)
            documents={k:ai.extract(job,{}) for k,job in jobs.items()}
            stats=ai.publish(output,root,sources,documents,{'dpi':200})
            rows=ai.search(output,'bilirkişi raporu')
            self.assertEqual(stats['unique_documents'],1);self.assertEqual(len(rows),1)
            self.assertEqual(rows[0]['locator'],'bölüm 1');self.assertIn('DOC-',rows[0]['doc_id'])
            manifest=json.loads((output/'manifest.json').read_text(encoding='utf-8'))
            self.assertEqual(manifest['sources'][0]['relative_path'],'document.txt')

    def test_wrong_ocr_output_cannot_silently_be_accepted_as_empty(self):
        from PIL import Image
        result=SimpleNamespace(returncode=0,stdout=b'not a TSV response',stderr=b'')
        with patch.object(ai.subprocess,'run',return_value=result):
            with self.assertRaisesRegex(ValueError,'TSV'):
                ai.ocr(Image.new('RGB',(100,100),'white'),{'tesseract':'synthetic','models':'synthetic'})

    @unittest.skipUnless(Path(r'C:\Program Files\Tesseract-OCR\tesseract.exe').is_file() and (ai.PROJECT/'tools/ocr-data/tur.traineddata').is_file(),'local OCR engine/models unavailable')
    def test_real_local_ocr_reads_synthetic_image(self):
        from PIL import Image,ImageDraw,ImageFont
        image=Image.new('RGB',(1800,400),'white')
        ImageDraw.Draw(image).text((60,60),'BILIRKISI RAPORU 2026 - Bedel 12345 TL',font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',64),fill='black')
        result=ai.ocr(image,{'tesseract':r'C:\Program Files\Tesseract-OCR\tesseract.exe','models':str(ai.PROJECT/'tools/ocr-data')})
        self.assertIn('12345',result['text']);self.assertGreater(result['confidence'],60)

    def test_output_inside_original_archive_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            with self.assertRaisesRegex(ValueError,'dışında'):
                ai.build(root,root/'output')

    def test_matching_report_enriches_labels_without_trusting_old_status(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/'case';root.mkdir();(root/'short [123456abcdef].txt').write_text('content',encoding='utf-8')
            sources,_jobs=ai.inventory(root)
            report=Path(temp)/'report.json';report.write_text(json.dumps({'items':[{'preview':'UYAP/case/short [123456abcdef].*','label':'Complete original label','folders':['case','Full document type'],'state':'error'}]}),encoding='utf-8')
            self.assertEqual(ai.enrich_from_report(sources,root,report),1)
            self.assertEqual(sources[0]['label'],'Complete original label')
            self.assertNotEqual(sources[0].get('status'),'error')


if __name__=='__main__':unittest.main()
