/* Regression coverage for BUIC Thai visa cancellation DOCX and template. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),zlib=require('node:zlib'),vm=require('node:vm');
const {TextEncoder,TextDecoder}=require('node:util');
const source=fs.readFileSync('cancel-letter.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const bundleText=fs.readFileSync('templates-data/cancel_template_part1.txt','utf8');
const reference=JSON.parse(zlib.gunzipSync(Buffer.from(bundleText.trim(),'base64')).toString('utf8'));
let captured,loadCount=0;
const context={
 window:{ZipLite:{writeZip:async files=>{
    captured=files;return Uint8Array.from([80,75,3,4]);
 }}},
 fetch:async url=>{
   assert.equal(url,'templates-data/cancel_template_part1.txt');
   loadCount++;
   return {ok:true,text:async()=>bundleText};
 },
 atob:value=>Buffer.from(value,'base64').toString('binary'),
 DecompressionStream,Response,Blob,TextEncoder,TextDecoder,Date,Map,Uint8Array
};
vm.runInNewContext(source,context);
const engine=context.window.BUICCancelLetter;
assert(engine&&typeof engine.create==='function');
assert.equal(engine.REASONS.length,7);
const reasons=['พ้นสภาพ','สำเร็จการศึกษา','ลาออก','จะใช้วีซ่าประเภทอื่น','ลาพัก','ได้สัญชาติไทย','others'];
assert.equal(Array.from(engine.REASONS).join('|'),reasons.join('|'));
const example={
 documentNo:'0042/2569',issueDate:'2026-10-20',cancelDate:'2026-10-28',
 reason:'สำเร็จการศึกษา',otherReason:'',
 fullName:'miss example student',nationalityThai:'เมียนมา',passportNo:'ab1234567',
 signatory:{name:'ผู้ช่วยศาสตราจารย์ ดร. สมยศ วัฒนากมลชัย',role:'รองอธิการบดีสายนานาชาติ ปฏิบัติหน้าที่แทน'}
};
(async()=>{
 assert.equal(Object.keys(reference).length,9,'Template parts must be complete');
 assert(reference['word/document.xml'].includes('{{DOCUMENT_NO}}'));
 assert(!reference['word/document.xml'].includes('MISS EXAMPLE STUDENT'),'Do not ship personal data in template');
 for(const reason of reasons){
   const blob=await engine.create({...example,reason,otherReason:'ย้ายสถานศึกษา'});
   assert.equal(blob.type,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
   const doc=new TextDecoder().decode(captured.get('word/document.xml').data);
   const footer=new TextDecoder().decode(captured.get('word/footer1.xml').data);
   assert(doc.includes('มกท/ศนช. '));
   assert(doc.includes('0042/2569'));
   assert(doc.includes('20 ตุลาคม 2569'));
   assert(doc.includes('28 ตุลาคม 2569'));
   assert(doc.includes('MISS EXAMPLE STUDENT'));
   assert(doc.includes('AB1234567'));
   assert(doc.includes('เมียนมา'));
   assert(doc.includes('เนื่องจากนักศึกษา'+(reason==='others'?'ย้ายสถานศึกษา':reason)));
   assert(doc.includes('ผู้บัญชาการสำนักงานตรวจคนเข้าเมือง'));
   assert(doc.includes('มหาวิทยาลัยกรุงเทพ'));
   assert(doc.includes('อธิการบดี'));
   assert(doc.includes('ผู้ช่วยศาสตราจารย์ ดร. สมยศ วัฒนากมลชัย'));
   assert(!doc.includes('{{DOCUMENT_NO}}'),'Template placeholder must be resolved');
   assert(footer.includes('ศูนย์นานาชาติ'));
   assert(footer.includes('โทร 0 2407 3888 ต่อ 2441'));
   assert(doc.includes('w:w="11906"')&&doc.includes('w:h="16838"'),'A4 pages');
   assert((doc.match(/<w:tbl>/g)||[]).length>=2,'Details and right-side signature blocks');
   for(const name of ['[Content_Types].xml','_rels/.rels','word/document.xml',
       'word/footer1.xml','word/settings.xml','word/styles.xml'])
     assert(captured.has(name),'Missing DOCX part: '+name);
 }
 assert.equal(loadCount,1,'Cache only the non-personal template, not populated letters');
 const word=new TextDecoder().decode(captured.get('word/document.xml').data);
 assert(word.includes('w:jc w:val="center"'),'Signature content must be aligned');
 await engine.create({...example,fullName:'ms example & student <demo>',passportNo:'xx&123<abc>'});
 const safe=new TextDecoder().decode(captured.get('word/document.xml').data);
 assert(safe.includes('MS EXAMPLE &amp; STUDENT &lt;DEMO&gt;'));
 assert(safe.includes('XX&amp;123&lt;ABC&gt;'));
 assert.equal(engine.validate({...example,documentNo:'มกท/ศนช. 55/2569'}).rawNumber,'55/2569');
 await assert.rejects(engine.create({...example,reason:'อื่น ๆ'}),/Select a cancellation reason/);
 await assert.rejects(engine.create({...example,reason:'others',otherReason:''}),/other cancellation reason/);
 await assert.rejects(engine.create({...example,nationalityThai:'German'}),/nationality in Thai/);
 await assert.rejects(engine.create({...example,fullName:''}),/full name/);
 await assert.rejects(engine.create({...example,issueDate:'2026-02-30'}),/invalid/);
 const ids=['cancelView','cancelLetterForm','cancelDocumentNo','cancelIssueDate','cancelReason',
  'cancelFullName','cancelNationality','cancelPassportNo','cancelExpectedDate',
  'cancelSignatory','cancelGenerate','cancelPreview','cancelNationalitySuggestions',
  'cancelOtherReason','cancelOtherReasonWrap'];
 for(const id of ids) assert(html.includes('id="'+id+'"'),'Missing form input '+id);
 assert(html.includes('data-view="cancel"'));
 assert(html.includes('cancel-letter.js?v='));
 assert(app.includes("cancel: ['cancelView'"));
 assert(app.includes('bindCancelLetter();'));
 assert(app.includes('bindCancelNationalityAutocomplete();'));
 assert(app.includes('function cancelNationalityMatches('));
 assert(app.includes("updateCancelReasonField();"));
 assert(app.includes("outputType:'cancel_letter'"));
 assert(sw.includes("'./cancel-letter.js'"));
 assert(sw.includes("'./templates-data/cancel_template_part1.txt'"));
 console.log('Cancellation DOCX regression tests passed: verified A4 layout, six reasons + Others, XML escaping, Thai suggestions, letter output and PWA.');
})().catch(e=>{console.error(e);process.exitCode=1});
