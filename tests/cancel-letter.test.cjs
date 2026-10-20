/* Synthetic cancellation-letter DOCX tests. No real student or passport details. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {TextEncoder,TextDecoder}=require('node:util');
const source=fs.readFileSync('cancel-letter.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
let captured;
const context={
 window:{ZipLite:{writeZip:async files=>{
   captured=files;
   return new Uint8Array([80,75,3,4]); // ZIP test double; validate XML payload before compression.
 }}},
 TextEncoder,TextDecoder,Blob,Date,Map,Uint8Array,
};
vm.runInNewContext(source,context);
const engine=context.window.BUICCancelLetter;
assert(engine&&typeof engine.create==='function');
assert.equal(engine.REASONS.length,7);
const reasons=['พ้นสภาพ','สำเร็จการศึกษา','ลาออก','จะใช้วีซ่าประเภทอื่น','ลาพัก','ได้สัญชาติไทย','others'];
assert.equal(Array.from(engine.REASONS).join('|'),reasons.join('|'));
const draft={
 documentNo:'0042/2569',
 issueDate:'2026-10-20',
 reason:'สำเร็จการศึกษา',
 fullName:'miss example student',
 nationalityThai:'เยอรมนี',
 passportNo:'ab1234567',
 cancelDate:'2026-10-28',
 signatory:{name:'ผู้ช่วยศาสตราจารย์ ดร. สมยศ วัฒนากมลชัย',
            role:'รองอธิการบดีสายนานาชาติ ปฏิบัติหน้าที่แทน'}
};
(async()=>{
 for(const reason of reasons){
  const blob=await engine.create({...draft,reason,otherReason:'ย้ายสถานศึกษา'});
  assert.equal(blob.type,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const xml=new TextDecoder().decode(captured.get('word/document.xml').data);
  const footer=new TextDecoder().decode(captured.get('word/footer1.xml').data);
  assert(xml.includes('มกท/ศนช. 0042/2569'));
  assert(xml.includes('20 ตุลาคม 2569'));
  assert(xml.includes('28 ตุลาคม 2569'));
  assert(xml.includes('MISS EXAMPLE STUDENT'));
  assert(xml.includes('AB1234567'));
  assert(xml.includes('เยอรมนี'));
  assert(xml.includes('เนื่องจากนักศึกษา'+(reason==='others'?'ย้ายสถานศึกษา':reason)));
  assert(xml.includes('w:line="435"'));
  assert(captured.has('word/settings.xml')&&captured.has('word/styles.xml'));
  assert(new TextDecoder().decode(captured.get('word/settings.xml').data).includes('compatibilityMode'));
  assert(new TextDecoder().decode(captured.get('word/styles.xml').data).includes('TH SarabunPSK'));
  assert(xml.includes('w:val="38"'));
  assert(xml.includes('w:trHeight w:val="420"'));
  assert(xml.includes('ผู้บัญชาการสำนักงานตรวจคนเข้าเมือง'));
  assert(xml.includes('มหาวิทยาลัยกรุงเทพจะไม่รับผิดชอบ')||
     xml.includes('มหาวิทยาลัยกรุงเทพจะไม่รับผิดชอบการกระทำ'));
  assert(xml.includes('อธิการบดี'));
  assert(xml.includes('ผู้ช่วยศาสตราจารย์ ดร. สมยศ วัฒนากมลชัย'));
  assert(footer.includes('ศูนย์นานาชาติ'));
  assert(footer.includes('โทร 0 2407 3888 ต่อ 2441'));
  assert(xml.includes('<w:sectPr>')&&xml.includes('w:h="16838"'));
  assert(captured.has('[Content_Types].xml'));
  assert(captured.has('_rels/.rels'));
  assert(captured.has('word/_rels/document.xml.rels'));
 }
 await engine.create({...draft,fullName:'ms example & student <demo>',
   passportNo:'xx&123<abc>'});
 const safeXml=new TextDecoder().decode(captured.get('word/document.xml').data);
 assert(safeXml.includes('MS EXAMPLE &amp; STUDENT &lt;DEMO&gt;'));
 assert(safeXml.includes('XX&amp;123&lt;ABC&gt;'));
 assert(!safeXml.includes('>MS EXAMPLE & STUDENT <DEMO><'));
 assert.equal(engine.validate({...draft,documentNo:'มกท/ศนช. 55/2569'}).documentNo,'มกท/ศนช. 55/2569');
 await assert.rejects(engine.create({...draft,reason:'อื่น ๆ'}),/Select a cancellation reason/);
 await assert.rejects(engine.create({...draft,reason:'others',otherReason:''}),/other cancellation reason/);
 await assert.rejects(engine.create({...draft,reason:'others',otherReason:'English only'}),/other cancellation reason/);
 const withPrefix=engine.validate({...draft,reason:'others',otherReason:'นักศึกษาย้ายสถานศึกษา'});
 assert.equal(withPrefix.reason,'ย้ายสถานศึกษา');
 await assert.rejects(engine.create({...draft,nationalityThai:'German'}),/nationality in Thai/);
 await assert.rejects(engine.create({...draft,fullName:''}),/full name/);
 await assert.rejects(engine.create({...draft,issueDate:'2026-02-30'}),/invalid/);
 for(const id of ['cancelView','cancelLetterForm','cancelDocumentNo','cancelIssueDate',
  'cancelReason','cancelFullName','cancelNationality','cancelPassportNo',
  'cancelExpectedDate','cancelSignatory','cancelGenerate','cancelPreview',
  'cancelNationalitySuggestions','cancelOtherReason','cancelOtherReasonWrap']){
   assert(html.includes('id="'+id+'"'),'Missing cancel form element: '+id);
 }
 assert(html.includes('data-view="cancel"'));
 assert(html.includes('cancel-letter.js?v='));
 assert(app.includes("cancel: ['cancelView'"));
 assert(app.includes("bindCancelLetter();"));
 assert(app.includes('bindCancelNationalityAutocomplete();'));
 assert(app.includes("function cancelNationalityMatches("));
 assert(app.includes('editDistance(t,q)<=1'));
 assert(app.includes("updateCancelReasonField();"));
 assert(app.includes("outputType:'cancel_letter'"));
 assert(sw.includes("'./cancel-letter.js'"),'Offline PWA must cache the Word engine');
 console.log('Visa cancellation letter tests passed: seven reasons including custom Thai text, autocomplete, enhanced A4 layout and UI.');
})().catch(e=>{console.error(e);process.exitCode=1});
