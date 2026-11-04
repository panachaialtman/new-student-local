/* Criminal Record letter — synthetic-data regression checks. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),zlib=require('node:zlib'),vm=require('node:vm');
const {TextEncoder,TextDecoder}=require('node:util');
const js=fs.readFileSync('criminal-record-letter.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('app.js','utf8');
const worker=fs.readFileSync('sw.js','utf8');
const source=fs.readFileSync('templates-data/criminal_record_master.txt','utf8').trim();
const template=JSON.parse(zlib.gunzipSync(Buffer.from(source,'base64')).toString('utf8'));
const original=template['word/document.xml'];
const layout=JSON.parse(fs.readFileSync('tests/fixtures/criminal-original-layout.json','utf8'));
const {createHash}=require('node:crypto');
assert.equal(Object.keys(template).length,11);
const tokens=['DOC_NUMBER','DOC_YEAR','ISSUE_DATE','POLICE_PLACE','FULL_NAME_1',
 'FULL_NAME_2','COUNTRY_FULL_TH','PASSPORT_NO','NATIONALITY_TH','DEGREE_TH',
 'MAJOR_TH','FACULTY_TH','SIGNER_NAME_TAIL','SIGNER_ROLE'];
for(const token of tokens){
 assert.equal(original.split('{{'+token+'}}').length,2,'Unique '+token+' in approved master');
}
assert.equal((original.match(/<w:highlight w:val="yellow"\/>/g)||[]).length,layout.highlight_run_count);
assert(original.includes('ศูนย์นานาชาติ')&&original.includes('0 2407 3888'));
assert(!original.includes('footerReference'),'Keep the original body contact block rather than an invented footer');
for(const [name,hash] of Object.entries(layout.unchanged_part_sha256)){
 const source=template[name];
 const bytes=source.startsWith('BASE64:')?Buffer.from(source.slice(7),'base64'):Buffer.from(source);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,'Original Word part '+name);
}
// Geometry captured from the original staff DOC conversion, before adding tokens.
const paragraphs=xml=>(xml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)||[]);
assert.equal(paragraphs(original).length,30,'Retain blank spacer paragraphs from the original');
assert.equal(layout.paragraph_properties.length,30);
let written,loads=0;
const context={window:{ZipLite:{writeZip:async files=>{
 written=files;
 return Uint8Array.from([80,75,3,4]);
}}},TextEncoder,TextDecoder,Blob,Map,Uint8Array,Date,Response,DecompressionStream,
 atob:s=>Buffer.from(s,'base64').toString('binary'),
 fetch:async url=>{
  assert.equal(url,'./templates-data/criminal_record_master.txt');
  loads++;
  return {ok:true,text:async()=>source};
 }};
vm.runInNewContext(js,context);
const gen=context.window.BUICCriminalRecord;
assert(gen&&gen.create&&gen.validate&&gen.thaiDate);
assert.equal(gen.thaiDate('2026-10-24'),'24 ตุลาคม 2569');
const base={documentNo:'5343',issueDate:'2026-10-24',
 policePlace:'ศูนย์พิสูจน์หลักฐาน 1',
 fullName:'mr. example student',countryFullThai:'สาธารณรัฐแห่งสหภาพเมียนมา',
 passportNo:'test123456',nationalityThai:'เมียนมา',degreeLevel:'master',
 majorThai:'สาขาวิชาการสื่อสารสากล (หลักสูตรนานาชาติ)',
 facultyThai:'คณะนิเทศศาสตร์',signatory:'somyot'};
(async()=>{
 for(const [degree,thai] of [['bachelor','ปริญญาตรี'],['master','ปริญญาโท'],
                             ['doctoral','ปริญญาเอก']]){
  const fields={...base,degreeLevel:degree};
  const valid=gen.validate(fields);
  assert.equal(valid.degreeThai,thai);
  assert.equal(valid.number,'5343');
  assert.equal(valid.year,'2569');
  assert.equal(valid.fullName,'MR. EXAMPLE STUDENT');
  const result=await gen.create(fields);
  assert.equal(result.type,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const xml=new TextDecoder().decode(written.get('word/document.xml').data);
  assert(xml.includes('24 ตุลาคม 2569'));
  assert(xml.includes('<w:t>/2569</w:t>'));
  assert.equal(xml.split('MR. EXAMPLE STUDENT').length-1,2,'The same name appears twice');
  for(const value of [valid.countryFullThai,valid.nationalityThai,valid.passportNo,
                      valid.policePlace,valid.majorThai,valid.facultyThai,thai])
   assert(xml.includes(value),'Field absent: '+value);
  assert(!xml.includes('{{'),'No unresolved placeholders');
  // Field substitution must leave the entire original layout untouched.
  const expected={DOC_NUMBER:valid.number,DOC_YEAR:valid.year,ISSUE_DATE:valid.issueDate,
   POLICE_PLACE:valid.policePlace,FULL_NAME_1:valid.fullName,FULL_NAME_2:valid.fullName,
   COUNTRY_FULL_TH:valid.countryFullThai,PASSPORT_NO:valid.passportNo,
   NATIONALITY_TH:valid.nationalityThai,DEGREE_TH:valid.degreeThai,
   MAJOR_TH:valid.majorThai,FACULTY_TH:valid.facultyThai,
   SIGNER_NAME_TAIL:gen.SIGNATORIES[valid.signatory].tail,
   SIGNER_ROLE:gen.SIGNATORIES[valid.signatory].role};
  const escape=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
   .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  let exact=original;
  for(const [key,value] of Object.entries(expected))exact=exact.replace('{{'+key+'}}',escape(value));
  assert.equal(xml,exact,'Generation must merge fields without reconstructing paragraph geometry');
  const parts=paragraphs(xml);
  assert.equal(parts.length,30);
  for(const [i,p] of parts.entries())
   assert.equal(p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0],layout.paragraph_properties[i],
    'Preserve original paragraph properties including spacer '+i);
  assert.equal(xml.match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/)?.[0],layout.section_properties);
  assert.equal((xml.match(/<w:tab(?:\s[^>]*)?\/>/g)||[]).length,layout.tab_count);
  assert.equal((xml.match(/<w:highlight w:val="yellow"\/>/g)||[]).length,layout.highlight_run_count);
  assert(xml.includes('<wp:positionH relativeFrom="page"><wp:posOffset>'+layout.letterhead.x+'</wp:posOffset>'));
  assert(xml.includes('<wp:positionV relativeFrom="page"><wp:posOffset>'+layout.letterhead.y+'</wp:posOffset>'));
  assert(xml.includes('<wp:extent cx="'+layout.letterhead.cx+'" cy="'+layout.letterhead.cy+'"/>'));
  assert.equal((xml.match(/<w:drawing(?:\s[^>]*)?>/g)||[]).length,1,'The original letterhead must remain visible');
  for(const [name,text] of Object.entries(template)){
   if(name==='word/document.xml')continue;
   const out=written.get(name).data;
   if(text.startsWith('BASE64:'))
    assert.equal(Buffer.compare(Buffer.from(out),Buffer.from(text.slice(7),'base64')),0,
     'Preserve binary image '+name);
   else assert.equal(new TextDecoder().decode(out),text,'Preserve Word part '+name);
  }
 }
 // Altering signer changes only the two approved signer placeholders.
 const alternate={...base,signatory:'duangthida'};
 await gen.create(alternate);
 const xmlAlt=new TextDecoder().decode(written.get('word/document.xml').data);
 assert(xmlAlt.includes('ดวงธิดา นันทาภิรัตน์'));
 assert(xmlAlt.includes('ผู้ช่วยอธิการบดีสายนานาชาติ'));
 assert(!xmlAlt.includes('สมยศ วัฒนากมลชัย'));
 assert.equal(xmlAlt.split('MR. EXAMPLE STUDENT').length-1,2);
 assert.equal(loads,1,'Load sanitized master once; no filled-student caching');
 // Different dates, independent country/nationality and robust input validation.
 assert.equal(gen.validate({...base,issueDate:'2027-01-02'}).year,'2570');
 assert.equal(gen.validate({...base,countryFullThai:'ราชอาณาจักรไทย',
                   nationalityThai:'ญี่ปุ่น'}).countryFullThai,'ราชอาณาจักรไทย');
 assert.throws(()=>gen.validate({...base,issueDate:'2026-02-30'}),/date/);
 assert.throws(()=>gen.validate({...base,signatory:'unknown'}),/signatory/);
 assert.throws(()=>gen.validate({...base,nationalityThai:'Myanmar'}),/Thai/);
 assert.throws(()=>gen.validate({...base,degreeLevel:'wrong'}),/degree/);
 assert.throws(()=>gen.validate({...base,policePlace:'office'}),/Thai/);
 assert(html.includes('id="criminalLetterForm"'));
 assert(html.includes('id="criminalFillTest"')&&html.includes('id="criminalSignatory"'));
 assert(html.includes('criminal-record-letter.js?v='));
 assert(app.includes('bindCriminalLetter();'));
 assert(app.includes('countryOfficialThai'));
 assert(app.includes('FULL_NAME_2')===false,'Name repetition is generated from single form field');
 assert(worker.includes("'./templates-data/criminal_record_master.txt'"));
 console.log('Criminal Record tests passed: original Word geometry, all highlighted fields, Thai fields, both names and signers, footer and isolation.');
})().catch(err=>{console.error(err);process.exitCode=1});
