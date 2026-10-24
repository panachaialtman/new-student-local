/* Graduated ED Plus letter tests — use synthetic data only. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),zlib=require('node:zlib'),vm=require('node:vm');
const {TextEncoder,TextDecoder}=require('node:util');
const js=fs.readFileSync('graduated-letter.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('app.js','utf8');
const worker=fs.readFileSync('sw.js','utf8');
const source=fs.readFileSync('templates-data/graduated_edplus_master.txt','utf8').trim();
const template=JSON.parse(zlib.gunzipSync(Buffer.from(source,'base64')).toString('utf8'));
const original=template['word/document.xml'];
let written,fetchCount=0;
const context={window:{ZipLite:{writeZip:async files=>{
 written=files;return Uint8Array.from([80,75,3,4]);
}}},TextEncoder,TextDecoder,Blob,Map,Uint8Array,Date,Response,DecompressionStream,
 atob:s=>Buffer.from(s,'base64').toString('binary'),
 fetch:async url=>{
  assert.equal(url,'./templates-data/graduated_edplus_master.txt');
  fetchCount++;return {ok:true,text:async()=>source};
 }};
vm.runInNewContext(js,context);
const gen=context.window.BUICGraduatedLetter;
assert(gen&&typeof gen.validate==='function');
assert.equal(gen.ageAt('2000-10-25','2026-10-24'),25);
assert.equal(gen.ageAt('2000-10-25','2026-10-25'),26);
assert.equal(gen.ageAt('2004-02-29','2026-02-28'),21);
assert.equal(gen.ageAt('2004-02-29','2026-03-01'),22);
assert.throws(()=>gen.ageAt('2027-01-01','2026-10-24'),/birthday/);
assert.throws(()=>gen.ageAt('2000-02-30','2026-10-24'),/birthday/);
assert.equal(gen.thaiDate('2026-10-24'),'24 ตุลาคม 2569');
assert.equal((original.match(/<w:highlight w:val="yellow"\/>/g)||[]).length,11);
assert.equal(Object.keys(template).length,12);
const fields=['DOC_NUMBER','ISSUE_YEAR','ISSUE_DATE','FULL_NAME','AGE','NATIONALITY_TH',
 'PASSPORT_NO','BIRTH_DATE','MAJOR_TH','FACULTY_TH','DEGREE_SUFFIX','DURATION'];
for(const key of fields)assert.equal(original.split('{{'+key+'}}').length,2,'Unique '+key);
const base={documentNo:'5343',issueDate:'2026-10-24',birthDate:'2000-10-25',
 fullName:'mr. example student',passportNo:'ab1234567',nationalityThai:'เมียนมา',
 majorThai:'สาขาวิชาบริหารธุรกิจ',facultyThai:'วิทยาลัยนานาชาติ',
 degreeLevel:'bachelor',signatory:'somyot'};
(async()=>{
 for(const degree of ['bachelor','master']){
  const raw={...base,degreeLevel:degree};
  const value=gen.validate(raw);
  assert.equal(value.age,'25');
  assert.equal(value.issueYear,'2569');
  assert.equal(value.fullName,'MR. EXAMPLE STUDENT');
  assert.equal(value.majorThai,'สาขาวิชาบริหารธุรกิจ');
  assert.equal(value.degreeSuffix,degree==='bachelor'?'ตรี':'โท');
  assert.equal(value.duration,degree==='bachelor'?'4':'2');
  assert.equal(value.signatory,'somyot');
  const result=await gen.create(raw);
  assert.equal(result.type,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const xml=new TextDecoder().decode(written.get('word/document.xml').data);
  assert(xml.includes('24 ตุลาคม 2569')&&xml.includes('25 ตุลาคม 2543'));
  assert(xml.includes('MR. EXAMPLE STUDENT')&&xml.includes('AB1234567'));
  assert(xml.includes('สาขาวิชาบริหารธุรกิจ')&&xml.includes('วิทยาลัยนานาชาติ'));
  assert(xml.includes('<w:t>\u003c')===false);
  assert(!xml.includes('{{'),'No placeholders after merge');
  assert(xml.includes('<w:t>สมยศ</w:t>')&&xml.includes('<w:t>วัฒนากมลชัย</w:t>')&&
    xml.includes('<w:t>รองอธิการบดีสายนานาชาติ</w:t>'),
    'The default signatory must remain exactly as in the staff Word master');
  assert.equal((xml.match(/<w:highlight w:val="yellow"\/>/g)||[]).length,11,
   'Preserve every highlighted field group');
  for(const [name,text] of Object.entries(template)){
   if(name==='word/document.xml')continue;
   assert.equal(new TextDecoder().decode(written.get(name).data),text,
    'Other Word part must stay unchanged: '+name);
  }
 }
 // The second signature selection must change only the three approved
 // text nodes; do not rebuild paragraphs or alter bookmarks, tabs or styling.
 await gen.create({...base,signatory:'duangthida'});
 const alternate=new TextDecoder().decode(written.get('word/document.xml').data);
 assert(alternate.includes('<w:t>ดวงธิดา</w:t>')&&
   alternate.includes('<w:t>นันทาภิรัตน์</w:t>')&&
   alternate.includes('<w:t>ผู้ช่วยอธิการบดีสายนานาชาติ</w:t>'));
 let baseline=original;
 for(const [k,v] of Object.entries({
  DOC_NUMBER:'5343',ISSUE_YEAR:'2569',ISSUE_DATE:'24 ตุลาคม 2569',
  FULL_NAME:'MR. EXAMPLE STUDENT',AGE:'25',NATIONALITY_TH:'เมียนมา',
  PASSPORT_NO:'AB1234567',BIRTH_DATE:'25 ตุลาคม 2543',
  MAJOR_TH:'สาขาวิชาบริหารธุรกิจ',FACULTY_TH:'วิทยาลัยนานาชาติ',
  DEGREE_SUFFIX:'ตรี',DURATION:'4'
 })){
  const tok='{{'+k+'}}';
  assert.equal(baseline.split(tok).length,2);
  baseline=baseline.replace(tok,v);
 }
 for(const [before,after] of [
  ['สมยศ','ดวงธิดา'],['วัฒนากมลชัย','นันทาภิรัตน์'],
  ['รองอธิการบดีสายนานาชาติ','ผู้ช่วยอธิการบดีสายนานาชาติ']
 ]){
  const tok='<w:t>'+before+'</w:t>';
  assert.equal(baseline.split(tok).length,2);
  baseline=baseline.replace(tok,'<w:t>'+after+'</w:t>');
 }
 assert.equal(alternate,baseline,
   'Only field values and exactly three signature text nodes may change');
 assert.equal((alternate.match(/<w:highlight w:val="yellow"\\/>/g)||[]).length,11);
 for(const [part,sourceXml] of Object.entries(template)){
  if(part==='word/document.xml')continue;
  assert.equal(new TextDecoder().decode(written.get(part).data),sourceXml,
    'Non-document parts remain exactly as approved');
 }
 assert.equal(fetchCount,1,'Load template once, never cache filled student records');
 assert.equal(gen.validate({...base,issueDate:'2026-10-25'}).age,'26');
 assert.equal(gen.validate({...base,issueDate:'2027-01-01'}).issueYear,'2570');
 await assert.rejects(gen.create({...base,degreeLevel:'other'}),/Bachelor or Master/);
 await assert.rejects(gen.create({...base,signatory:'other'}),/approved signatory/);
 await assert.rejects(gen.create({...base,birthDate:'2027-01-01'}),/birthday/);
 await assert.rejects(gen.create({...base,majorThai:'Business'}),/major in Thai/);
 await assert.rejects(gen.create({...base,nationalityThai:'American'}),/nationality in Thai/);
 assert(html.includes('id="graduatedLetterForm"')&&html.includes('id="gradFillTest"'));
 assert(html.includes('graduated-letter.js?v=')&&
   html.includes('id="gradSignatory" name="signatory"')&&
   html.includes('id="gradSignaturePreview"'));
 assert(app.includes('bindGraduatedLetter();')&&app.includes('refreshGraduatedReferences();'));
 assert(app.includes('signatory:f.elements.signatory.value')&&
   app.includes('signatoryOptions(state.settings.signatory)')&&
   app.includes("el('gradSignaturePreview').innerHTML=signatoryPreview(f.signatory)"));
 assert(worker.includes("'./templates-data/graduated_edplus_master.txt'"));
 console.log('Graduated ED Plus tests passed: age, degree, both signatories, exact signature edits, highlights, source layout.');
})().catch(err=>{console.error(err);process.exitCode=1});
