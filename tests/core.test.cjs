const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHTML } = require('linkedom');
const C = require('../extension/core.js');
test('Chrome danger verdicts fail closed and user-accepted warnings cannot calibrate silent routes',()=>{
  for(const value of ['safe','deepScannedSafe','allowlistedByPolicy'])assert.equal(C.canLearnRoute(value),true);
  assert.equal(C.isSafeDanger('accepted'),true);assert.equal(C.canLearnRoute('accepted'),false);
  for(const value of ['file','url','content','uncommon','host','unwanted','asyncScanning','sensitiveContentBlock','accountCompromise','unknown',undefined])assert.equal(C.isSafeDanger(value),false);
});
const { scanUyapDocument } = require('../extension/adapter.js');
const { fixture, token } = require('./fixtures.cjs');
function scan(options) {
  const { document } = parseHTML(fixture(options));
  global.document = document;
  // Layout is not implemented by linkedom. Visibility is separately tested via this stub.
  document.querySelector('.modal-content').getClientRects = () => options?.hide ? [] : [{}];
  return scanUyapDocument();
}
test('reads hidden folders, excludes Last 20, and preserves two different Ek 1 parents', () => {
  const snapshot = scan();
  assert.equal(snapshot.records.length, 5);
  assert.equal(snapshot.records.filter(r=>r.isAttachment).length, 2);
  assert.equal(snapshot.records[1].parentToken, token(1));
  assert.equal(snapshot.records[3].parentToken, token(3));
  assert.equal(snapshot.groups.length, 2);
  assert.deepEqual(snapshot.warnings, []);
});
test('unknown pagination and missing records block automatic acceptance', () => {
  assert.match(scan({pages:2}).warnings.join(), /2 sayfa/);
  assert.match(scan({expected:3}).warnings.join(), /2 ana evrak/);
  assert.throws(()=>scan({hide:true}), /açık olmalı/);
});
test('Windows names cannot traverse paths or use reserved device names', () => {
  for (const name of ['../CON', 'LPT1.txt', 'NUL', '..', 'con.', ' /\\?*\u0000']) {
    const safe = C.safePart(name);
    assert.ok(!/[<>:"/\\|?*\u0000-\u001f]/.test(safe));
    assert.ok(!/^(con|nul|lpt1)(?:\.|$)/i.test(safe));
    assert.ok(!/[. ]$/.test(safe));
  }
});
test('same-label mains are distinct and each attachment shares its own main directory', async () => {
  const {items} = await C.makePlan(scan());
  assert.equal(new Set(items.map(i=>i.directory+'/'+i.baseName)).size, 5);
  assert.equal(items[0].directory, items[1].directory);
  assert.equal(items[2].directory, items[3].directory);
  assert.notEqual(items[0].directory, items[2].directory);
  assert.ok(items.every(i=>i.directory.length+i.baseName.length+1 <= 205));
  const again = await C.makePlan(scan());
  assert.deepEqual(items, again.items);
});
test('long Turkish folders stay bounded and do not merge distinct truncated folders', async () => {
  const snapshot = scan(); snapshot.title = 'Çok uzun bir mahkeme adı '.repeat(10);
  snapshot.records.forEach((r,i)=>r.folders = ['2026/123 (Hukuk Dava Dosyası)', 'Bilirkişi Teslim Tutanağı '.repeat(10)+(i<2?'A':'B')]);
  const {items} = await C.makePlan(snapshot, 'Arşiv adı '.repeat(10));
  assert.equal(items[0].directory, items[1].directory);
  assert.equal(items[2].directory, items[3].directory);
  assert.notEqual(items[0].directory, items[2].directory);
  assert.ok(items.every(i=>(i.directory+'/'+i.baseName).length<=205));
});
test('orphaned attachments and cyclic parent graphs fail closed', async () => {
  let snapshot = scan(); snapshot.records[1].parentToken='missing'; snapshot.records[1].parentRef='missing';
  await assert.rejects(C.makePlan(snapshot), /ana evrakı/);
  snapshot = scan(); snapshot.records[0].parentToken=snapshot.records[1].token; snapshot.records[0].parentRef=snapshot.records[1].ref;
  await assert.rejects(C.makePlan(snapshot), /döngü/);
});
test('same token keeps all distinct tree placements, while identical occurrences are deduplicated', async () => {
  const snapshot = scan();
  const duplicate = { ...snapshot.records[0], folders:['other','other'],ref:'different-placement' };
  snapshot.records.push(duplicate, {...snapshot.records[0]});
  const plan = await C.makePlan(snapshot);
  assert.equal(plan.items.length, 6);
  assert.notEqual(plan.items[0].directory,plan.items[5].directory);
  assert.notEqual(plan.items[0].key,plan.items[5].key);
});
test('download routing requires exact token, origin, and decoded query parameter', () => {
  const expected = {token:token(1)};
  const url = 'https://vatandas.uyap.gov.tr/save?evrakId='+encodeURIComponent(token(1));
  assert.equal(C.matchesDownload({url},expected),true);
  assert.equal(C.matchesDownload({url:url.replace('gov.tr','gov.tr.attacker.test')},expected),false);
  assert.equal(C.matchesDownload({url:url+'more'},expected),false);
  assert.equal(C.matchesDownload({url:url.replace(encodeURIComponent(token(1)),encodeURIComponent('x'+token(1)))},expected),false);
  assert.equal(C.matchesDownload({url:'https://vatandas.uyap.gov.tr/?e='+encodeURIComponent(encodeURIComponent(token(1)))},expected),true);
  assert.equal(C.matchesDownload({url:'https://vatandas.uyap.gov.tr/?e='+encodeURIComponent(token(3))},expected),false);
});
test('HTML login responses and executable files cannot count as documents; original extension is retained', () => {
  assert.throws(()=>C.extensionFor({mime:'text/html',filename:'evrak.pdf'}),/giriş/);
  assert.throws(()=>C.extensionFor({mime:'application/json',filename:'evrak.udf'}),/giriş/);
  assert.throws(()=>C.extensionFor({filename:'evrak.exe'}),/Beklenmeyen/);
  assert.equal(C.extensionFor({mime:'application/octet-stream',filename:'C:\\Downloads\\native.UDF'}),'.udf');
  assert.equal(C.extensionFor({mime:'application/pdf',filename:'belge'}),'.pdf');
});
test('unique filenames retain the exact planned directory, extension, and document base name', () => {
  const expected = 'UYAP/Dava [123]/Beyan [abc]/Dosya [def].udf';
  assert.equal(C.resolveOutputPath(expected,'C:/Downloads/'+expected),expected);
  assert.equal(C.resolveOutputPath(expected,'C:/Downloads/'+expected.replace('.udf',' (2).udf')),expected.replace('.udf',' (2).udf'));
  for(const wrong of [expected.replace('Beyan','Başka'),expected.replace('.udf','.pdf'),expected.replace('Dosya','Başka'),expected.replace('.udf',' (0).udf')]){
    assert.equal(C.resolveOutputPath(expected,'C:/Downloads/'+wrong),null);
  }
});
test('unknown file size may use actual received bytes; zero and expected bytes cannot pass', () => {
  assert.equal(C.receivedSize({fileSize:-1,bytesReceived:2864}),2864);
  assert.equal(C.receivedSize({fileSize:0,bytesReceived:2864}),0);
  assert.equal(C.receivedSize({fileSize:-1,totalBytes:2864}),null);
  assert.equal(C.receivedSize({fileSize:-1,bytesReceived:NaN}),null);
});
test('validated static receipt retains its HTML extension; unvalidated HTML still fails', () => {
  const download={filename:'evrak.html',mime:'text/html'};
  assert.equal(C.extensionFor(download, true),'.html');
  assert.throws(()=>C.extensionFor(download),/HTML|giriş/);
  assert.throws(()=>C.extensionFor({filename:'evrak.exe',mime:'text/html'},true),/Beklenmeyen/);
});
