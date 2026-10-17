const token = n => `"synthetic-document-token-${n}"`;
function fixture({ pages = 1, expected = 2, hide = false } = {}) {
  return `<!doctype html><html><body><div class="modal-content" ${hide ? 'hidden' : ''}>
    <h4 id="dosyaTitle">2026/123 - Örnek Mahkeme - Hukuk Dava Dosyası</h4>
    <div id="dosya_evrak_bilgileri_result">Toplam ${pages} sayfadan 1. sayfa gösteriliyor.
    <ul id="browser"><li><span class="folder">Örnek Mahkeme 2026/123</span><ul>
      <li><span class="folder">Dosyaya Eklenen Son 20 Evrak</span><ul><li><span class="file" evrak_id='${token(1)}'>Beyan Dilekçesi 08/04/2026</span></li></ul></li>
      <li><span class="folder">Tüm Evraklar</span><ul>
        <li><span class="folder">2026/123 (Hukuk Dava Dosyası)</span><ul id="dosyaSiraNo1">
          <div><a>Sıralama kontrolü</a></div>
          <li><span class="folder">Beyan Dilekçesi (${expected})</span><ul style="display:none">
            <li><span class="file" evrak_id='${token(1)}'>Beyan Dilekçesi 08/04/2026</span><ul><li><span class="file" ana_evrak_id="111" evrak_id='${token(2)}'>Ek 1</span></li></ul></li>
            <li><span class="file" evrak_id='${token(3)}'>Beyan Dilekçesi 08/04/2026</span><ul><li><span class="file" ana_evrak_id="222" evrak_id='${token(4)}'>Ek 1</span></li></ul></li>
          </ul></li>
        </ul></li>
        <li><span class="folder">2025/321 (Hukuk Tevzi Dosyası)</span><ul><li><span class="folder">Tevzi Formu (1)</span><ul><li><span class="file" evrak_id='${token(5)}'>Tevzi Formu 01/01/2025</span></li></ul></li></ul></li>
      </ul></li>
    </ul></li></ul></div>
    <script>$('.file').dblclick(function(){downloadDoc('example','"case-example"','1')}); function evrakSolClickMenu(){ var dosyaId='"case-example"'; $('.file').contextMenu('1',dosyaId,_cmenu); }</script>
    </div></body></html>`;
}
module.exports = { fixture, token };
