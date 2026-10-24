/* Staff-approved manual cancellation letter: layout-preservation regression. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),zlib=require('node:zlib'),vm=require('node:vm');
const {TextEncoder,TextDecoder}=require('node:util');
const src=fs.readFileSync('cancel-letter.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const worker=fs.readFileSync('sw.js','utf8');
const templateText=fs.readFileSync('templates-data/cancel_manual_master.txt','utf8').trim();
const template=JSON.parse(zlib.gunzipSync(Buffer.from(templateText,'base64')).toString('utf8'));
const docMaster=template['word/document.xml'];
let written,fetchCount=0;
const context={window:{ZipLite:{writeZip:async files=>{written=files;return Uint8Array.from([80,75,3,4]);}}},
 TextEncoder,TextDecoder,Blob,Map,Uint8Array,Date,
 atob:s=>Buffer.from(s,'base64').toString('binary'),DecompressionStream,Response,
 fetch:async url=>{
   assert.equal(url,'./templates-data/cancel_manual_master.txt');
   fetchCount++;return {ok:true,text:async()=>templateText};
 }};
vm.runInNewContext(src,context);
const generator=context.window.BUICCancelLetter;
assert(generator&&typeof generator.create==='function');
assert.equal(Object.keys(template).length,8);
assert(!docMaster.includes('MR. TANGGUANG HAN'),'Private student name must not ship in template');
assert(!docMaster.includes('HJ2331449'),'Private passport must not ship in template');
assert(!docMaster.includes('1670228350'),'Private student ID must not ship in template');
assert.equal((docMaster.match(/<w:highlight w:val="yellow"\/>/g)||[]).length,7);
assert(!docMaster.includes('<w:tbl>'),'Staff template uses tab-aligned paragraphs, not generated tables');
assert((docMaster.match(/<w:tab\s*\/>/g)||[]).length>=20);
assert(docMaster.includes('w:top="1440"')&&docMaster.includes('w:left="1440"'),
  'Preserve original one-inch margins');
assert(Object.keys(template).every(name=>!name.includes('docProps')),'Sanitize metadata');
const base={documentNo:'5343',issueDate:'2026-10-28',cancelDate:'2025-07-02',
 reason:'ลาออก',fullName:'mr. tangguang han',nationalityThai:'จีน',passportNo:'hj2331449',
 studentId:'1670228350',otherReason:'',
 signatory:{name:'ผู้ช่วยศาสตราจารย์ ดร. ดวงธิดา นันทาภิรัตน์',
 role:'ผู้ช่วยอธิการบดีสายนานาชาติ ปฏิบัติหน้าที่แทน'}};
(async()=>{
 assert.equal(generator.validate(base).documentNo,'มกท/ศนช. 5343/2569');
 assert.equal(generator.filename(base),
   'จดหมายยกเลิกวีซ่า Mr. Tangguang Han_HJ2331449_1670228350.docx');
 assert.equal(generator.filename({...base,studentId:''}),
   'จดหมายยกเลิกวีซ่า Mr. Tangguang Han_HJ2331449.docx');
 assert.equal(generator.thaiDate('2026-05-20'),'20 พฤษภาคม 2569');
 assert.equal(generator.thaiDate('2026-12-20'),'20 ธันวาคม 2569');
 const reasons=['พ้นสภาพ','สำเร็จการศึกษา','ลาออก','จะใช้วีซ่าประเภทอื่น','ลาพัก','ได้สัญชาติไทย','others'];
 assert.equal(Array.from(generator.REASONS).join('|'),reasons.join('|'));
 for(const reason of reasons){
  const output=await generator.create({...base,reason,otherReason:'ย้ายสถานศึกษา'});
  assert.equal(output.type,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(written.size,8,'Keep every Word template part');
  const doc=new TextDecoder().decode(written.get('word/document.xml').data);
  assert(doc.includes('5343/2569'));
  assert(doc.includes('28 ตุลาคม 2569')&&doc.includes('2 กรกฎาคม 2568'));
  assert(doc.includes('MR. TANGGUANG HAN')&&doc.includes('HJ2331449'));
  assert(doc.includes('เนื่องจากนักศึกษา')&&doc.includes(reason==='others'?'ย้ายสถานศึกษา':reason));
  assert(doc.includes('ผู้ช่วยศาสตราจารย์ ดร. ดวงธิดา นันทาภิรัตน์'));
  assert(doc.includes('ผู้ช่วยอธิการบดีสายนานาชาติ ปฏิบัติหน้าที่แทน'));
  assert(!doc.includes('{{'),'No unresolved placeholders');
  assert.equal((doc.match(/<w:highlight w:val="yellow"\/>/g)||[]).length,7,
    'Maintain all seven Word yellow highlights');
  assert(!doc.includes('<w:tbl>'),'No reconstructed fixed-width tables');
  assert.equal((doc.match(/<w:tab\s*\/>/g)||[]).length,
               (docMaster.match(/<w:tab\s*\/>/g)||[]).length,'Retain every original tab without alteration');
  assert(doc.includes('w:top="1440"')&&doc.includes('w:left="1440"'),
    'Original margin positions preserved');
  // Only the original cancellation introduction may change run segmentation.
  // Its visible wording, first tab, paragraph properties, highlight and trailing
  // unhighlighted space match the staff-supplied legacy Word reference.
  const expectedFields={
   DOC_NUMBER:'5343/2569',ISSUE_DATE:'28 ตุลาคม 2569',
   REASON:reason==='others'?'ย้ายสถานศึกษา':reason,
   FULL_NAME:'MR. TANGGUANG HAN',NATIONALITY_TH:'จีน',
   PASSPORT_NO:'HJ2331449',CANCEL_DATE:'2 กรกฎาคม 2568',
   SIGNER_NAME:'ผู้ช่วยศาสตราจารย์ ดร. ดวงธิดา นันทาภิรัตน์',
   SIGNER_ROLE:'ผู้ช่วยอธิการบดีสายนานาชาติ ปฏิบัติหน้าที่แทน'
  };
  const escapeXml=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  let placeholderMerged=docMaster;
  for(const [key,value] of Object.entries(expectedFields)){
   const token='{{'+key+'}}';
   assert.equal(placeholderMerged.split(token).length,2,'Exactly one approved token '+key);
   placeholderMerged=placeholderMerged.replace(token,escapeXml(value));
  }
  const getIntro=source=>{
   const ps=source.match(/<w:p(?:\\s[^>]*)?>[\\s\\S]*?<\\/w:p>/g)||[];
   const found=ps.filter(p=>p.includes('มหาวิทยาลัยกรุงเทพ ใคร่ขอความอนุเคราะห์'));
   assert.equal(found.length,1,'Exactly one introduction');
   return found[0];
  };
  const oldIntro=getIntro(placeholderMerged),newIntro=getIntro(doc);
  const oldRuns=oldIntro.match(/<w:r(?:\\s[^>]*)?>[\\s\\S]*?<\\/w:r>/g)||[];
  const newRuns=newIntro.match(/<w:r(?:\\s[^>]*)?>[\\s\\S]*?<\\/w:r>/g)||[];
  assert.equal(oldRuns.length,4,'Current sanitized master has four converted runs');
  assert.equal(newRuns.length,7,'Restore exact seven original runs');
  assert(newRuns[0].includes('<w:tab/>'),'Retain approved first-line tab');
  assert(newRuns[1].includes('มหาวิทยาลัยกรุงเทพ ใคร่ขอความอนุเคราะห์ สำนักงานตรวจคนเข้าเมืองในการยกเลิกการตรวจลงตร'));
  assert(newRuns[2].includes('<w:t>า</w:t>'));
  assert(newRuns[3].includes('<w:t>วีซ่านักศึกษา เนื่องจากนักศึกษา</w:t>'));
  assert(newRuns[4].includes('<w:highlight w:val="yellow"/>') &&
    newRuns[4].includes('<w:t>'+escapeXml(expectedFields.REASON)+'</w:t>'));
  assert(newRuns[5].includes('<w:t xml:space="preserve"> </w:t>') &&
    !newRuns[5].includes('w:highlight'));
  assert(newRuns[6].includes('<w:t>ดังรายละเอียดต่อไปนี้</w:t>'));
  const originalVisible=oldIntro.match(/<w:t(?:\\s[^>]*)?>([\\s\\S]*?)<\\/w:t>/g)||[];
  const rebuiltVisible=newIntro.match(/<w:t(?:\\s[^>]*)?>([\\s\\S]*?)<\\/w:t>/g)||[];
  const textOnly=items=>items.map(x=>x.replace(/<[^>]*>/g,'')).join('');
  assert.equal(textOnly(rebuiltVisible),textOnly(originalVisible),
    'Intro wording and spaces must remain exactly the same');
  assert.equal(newIntro.slice(0,newIntro.indexOf('</w:pPr>')),
    oldIntro.slice(0,oldIntro.indexOf('</w:pPr>')),
    'Paragraph indent/style/geometry must remain identical');
  assert.equal(doc.replace(newIntro,'__ONLY_INTRO_CHANGED__'),
    placeholderMerged.replace(oldIntro,'__ONLY_INTRO_CHANGED__'),
    'Never modify any text or layout outside the introduction');
  const styles=new TextDecoder().decode(written.get('word/styles.xml').data);
  const oldDefault='<w:lang w:val="en-US" w:eastAsia="zh-CN" w:bidi="hi-IN"/>';
  const newDefault='<w:noProof/><w:lang w:val="th-TH" w:eastAsia="th-TH" w:bidi="th-TH"/>';
  const oldNormal='<w:lang w:val="en-US" w:bidi="th-TH" w:eastAsia="zh-CN"/>';
  const newNormal='<w:lang w:val="th-TH" w:bidi="th-TH" w:eastAsia="th-TH"/>';
  assert.equal(styles,template['word/styles.xml'].replace(oldDefault,newDefault)
    .replace(oldNormal,newNormal),'Only Thai proofing defaults may change');
  for(const [part,originalXml] of Object.entries(template)){
   if(part==='word/document.xml'||part==='word/styles.xml')continue;
   assert.equal(new TextDecoder().decode(written.get(part).data),originalXml,
     'Word part '+part+' must remain byte-for-byte unchanged');
  }
  for(const p of ['word/document.xml','word/styles.xml','word/settings.xml','word/fontTable.xml',
    'word/theme/theme1.xml','word/_rels/document.xml.rels','[Content_Types].xml','_rels/.rels'])
    assert(written.has(p),'Missing Word component '+p);
 }
 assert.equal(fetchCount,1,'Load sanitized template once; never cache filled student records');
 await generator.create({...base,fullName:'mr & example <student>',passportNo:'ab&123'});
 const xml=new TextDecoder().decode(written.get('word/document.xml').data);
 assert(xml.includes('MR &amp; EXAMPLE &lt;STUDENT&gt;')&&xml.includes('AB&amp;123'));
 assert.equal(generator.validate({...base,documentNo:'มกท/ศนช. 5343/2569'}).rawNumber,'5343/2569');
 assert(html.includes('id="cancelOtherReason" name="otherReason" maxlength="300"'),
   'The Other reason form limit must match the generator’s 300-character limit');
 assert.equal(generator.validate({...base,reason:'others',otherReason:'ก'.repeat(300)}).reason.length,300);
 assert.throws(()=>generator.validate({...base,reason:'others',otherReason:'ก'.repeat(301)}),
   /other cancellation reason/);
 await assert.rejects(generator.create({...base,reason:'unknown'}),/cancellation reason/);
 await assert.rejects(generator.create({...base,reason:'others',otherReason:''}),/other cancellation reason/);
 await assert.rejects(generator.create({...base,nationalityThai:'China'}),/nationality in Thai/);
 await assert.rejects(generator.create({...base,studentId:'../../'}),/Student ID/);
 assert(html.includes('id="cancelStudentId"')&&html.includes('cancel-letter.js?v='));
 assert(app.includes('BUICCancelLetter.filename(fields)'));
 assert(app.includes('bindCancelNationalityAutocomplete();')&&app.includes('updateCancelReasonField();'));
 assert(worker.includes("'./templates-data/cancel_manual_master.txt'"));
 console.log('Cancel Letter tests passed: original 7-run intro, Thai proofing, unchanged body/layout, seven highlights, all reasons and safety.');
})().catch(err=>{console.error(err);process.exitCode=1});
