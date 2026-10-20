
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {TextEncoder,TextDecoder}=require('node:util');
const source=fs.readFileSync('cancel-letter.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const worker=fs.readFileSync('sw.js','utf8');
let captured,builds=0;
const ctx={window:{ZipLite:{writeZip:async m=>{captured=m;builds++;return Uint8Array.from([80,75,3,4]);}}},TextEncoder,TextDecoder,Blob,Date,Map,Uint8Array};
vm.runInNewContext(source,ctx);
const generator=ctx.window.BUICCancelLetter;
const reasons=['พ้นสภาพ','สำเร็จการศึกษา','ลาออก','จะใช้วีซ่าประเภทอื่น','ลาพัก','ได้สัญชาติไทย','others'];
assert.deepEqual(Array.from(generator.REASONS),reasons);
const sample={documentNo:'0020/2569',issueDate:'2026-10-20',cancelDate:'2026-10-29',
  reason:'พ้นสภาพ',otherReason:'',fullName:'miss qa student',nationalityThai:'เมียนมา',passportNo:'qa1234567',
  signatory:{name:'ผู้ช่วยศาสตราจารย์ ดร. สมยศ วัฒนากมลชัย',role:'รองอธิการบดีสายนานาชาติ ปฏิบัติหน้าที่แทน'}};
(async()=>{
  assert.equal(generator.thaiDate('2026-10-20'),'20 ตุลาคม 2569');
  assert.equal(generator.thaiDate('2026-05-20'),'20 พฤษภาคม 2569');
  assert.equal(generator.thaiDate('2026-12-20'),'20 ธันวาคม 2569');
  for(const reason of reasons){
    const blob=await generator.create({...sample,reason,otherReason:'ย้ายสถานศึกษา'});
    assert.equal(blob.type,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    assert.equal(captured.size,7);
    const doc=new TextDecoder().decode(captured.get('word/document.xml').data);
    const footer=new TextDecoder().decode(captured.get('word/footer1.xml').data);
    assert(doc.includes('0020/2569'));
    assert(doc.includes('20 ตุลาคม 2569'));
    assert(doc.includes('29 ตุลาคม 2569'));
    assert(doc.includes('MISS QA STUDENT')&&doc.includes('QA1234567')&&doc.includes('เมียนมา'));
    assert(doc.includes(reason==='others'?'ย้ายสถานศึกษา':reason));
    assert.equal((doc.match(/<w:highlight w:val="yellow"\/>/g)||[]).length,7);
    assert.equal((doc.match(/<w:tbl>/g)||[]).length,1,'Only the invisible student-details table is allowed');
    assert(!doc.includes('<w:tab'),'No legacy tab characters or manual aligning tabs');
    assert(doc.includes('w:w="11906" w:h="16838"'),'A4 paper size');
    assert(doc.includes('w:pgMar w:top="1050"'),'Compact predictable page margins');
    assert(doc.includes('TH SarabunPSK'));
    assert(doc.includes('ขอแสดงความนับถือ')&&doc.includes('อธิการบดี'));
    assert(footer.includes('ศูนย์นานาชาติ')&&footer.includes('0 2407 3888 ต่อ 2441'));
    for(const part of ['[Content_Types].xml','_rels/.rels','word/document.xml',
      'word/_rels/document.xml.rels','word/footer1.xml','word/styles.xml','word/settings.xml']){
      assert(captured.has(part),'Missing DOCX part '+part);
    }
  }
  await generator.create({...sample,fullName:'ms example & student <qa>',passportNo:'ab&12<3>'});
  const escaped=new TextDecoder().decode(captured.get('word/document.xml').data);
  assert(escaped.includes('MS EXAMPLE &amp; STUDENT &lt;QA&gt;'));
  assert(escaped.includes('AB&amp;12&lt;3&gt;'));
  assert(!escaped.includes('{{'),'No unresolved fields');
  assert.equal(generator.validate({...sample,documentNo:'มกท/ศนช. 42/2569'}).rawNumber,'42/2569');
  await assert.rejects(generator.create({...sample,reason:'unrecognized'}),/cancellation reason/);
  await assert.rejects(generator.create({...sample,reason:'others',otherReason:''}),/other cancellation reason/);
  await assert.rejects(generator.create({...sample,nationalityThai:'Myanmar'}),/nationality in Thai/);
  await assert.rejects(generator.create({...sample,issueDate:'2026-02-30'}),/invalid/);
  assert(html.includes('data-view="cancel"')&&html.includes('cancel-letter.js?v='));
  assert(app.includes('bindCancelLetter();')&&app.includes('bindCancelNationalityAutocomplete();')&&app.includes('updateCancelReasonField();'));
  assert(worker.includes("'./cancel-letter.js'"));
  assert(!worker.includes("'./templates-data/cancel_template_part1.txt'"),'Do not keep deprecated generated template cached');
  console.log('Cancellation DOCX from-scratch tests passed: reason options, Thai dates, 7 highlights, A4 layout, XML safety and UI.');
})().catch(e=>{console.error(e);process.exitCode=1;});
