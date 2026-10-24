/* BUIC Graduated (ED Plus) letter — source-derived Word template.
   All student data is merged locally into the staff-highlighted fields. */
(()=>{'use strict';
const MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const BUNDLE='./templates-data/graduated_edplus_master.txt';
const MONTHS=['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const encoder=new TextEncoder();
const SIGNATORIES=Object.freeze({
 somyot:Object.freeze({name:'ผู้ช่วยศาสตราจารย์ ดร. สมยศ วัฒนากมลชัย',
                       role:'รองอธิการบดีสายนานาชาติ ปฏิบัติหน้าที่แทน'}),
 duangthida:Object.freeze({name:'ผู้ช่วยศาสตราจารย์ ดร. ดวงธิดา นันทาภิรัตน์',
                           role:'ผู้ช่วยอธิการบดีสายนานาชาติ ปฏิบัติหน้าที่แทน'})
});
let bundlePromise;
const clean=x=>String(x??'').trim();
const escapeXml=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
function parseIso(value,label){
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(value));
 if(!m)throw Error('Choose a valid '+label+'.');
 const year=+m[1],month=+m[2],day=+m[3];
 if(year<1900||year>2200)throw Error('Invalid '+label+'.');
 const date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)
  throw Error('Invalid '+label+'.');
 return {year,month,day,iso:m[0]};
}
function thaiDate(date){
 const d=parseIso(date,'date');
 return d.day+' '+MONTHS[d.month]+' '+(d.year+543);
}
function ageAt(birthDate,issueDate){
 const b=parseIso(birthDate,'birthday'),i=parseIso(issueDate,'document date');
 const age=i.year-b.year-(i.month<b.month||(i.month===b.month&&i.day<b.day)?1:0);
 if(age<0||age>130)throw Error('The birthday must be before the document date (age up to 130).');
 return age;
}
function validate(raw={}){
 const documentNo=clean(raw.documentNo).replace(/^(?:ที่\s*)?มกท\/ศนช\.\s*/,'');
 const issueDate=clean(raw.issueDate),birthDate=clean(raw.birthDate);
 const d=parseIso(issueDate,'document date');
 const year=d.year+543;
 const number=documentNo.replace(/\/\d{4}$/,'').trim();
 if(!number||number.length>30||!/^[0-9A-Za-z-]+$/.test(number))throw Error('Enter a valid document number.');
 const fullName=clean(raw.fullName).replace(/\s+/g,' ').toUpperCase();
 const passportNo=clean(raw.passportNo).toUpperCase();
 const nationalityThai=clean(raw.nationalityThai);
 const majorThai=clean(raw.majorThai).replace(/^สาขาวิชา\s*/,'');
 const facultyThai=clean(raw.facultyThai);
 const degreeLevel=clean(raw.degreeLevel);
 // Older forms without a selection retain the original staff template signer.
 const signatory=clean(raw.signatory)||'somyot';
 if(!Object.hasOwn(SIGNATORIES,signatory))throw Error('Select an approved signatory.');
 if(!fullName||fullName.length>180)throw Error('Enter the student’s full name.');
 if(!passportNo||passportNo.length>70)throw Error('Enter the passport number.');
 if(!nationalityThai||nationalityThai.length>100||!/[ก-๙]/.test(nationalityThai)||/[a-z]/i.test(nationalityThai))
  throw Error('Enter a nationality in Thai.');
 if(!majorThai||majorThai.length>180||!/[ก-๙]/.test(majorThai)||/[a-z]/i.test(majorThai))
  throw Error('Enter a major in Thai.');
 if(!facultyThai||facultyThai.length>180||!/[ก-๙]/.test(facultyThai)||/[a-z]/i.test(facultyThai))
  throw Error('Enter a faculty or college in Thai.');
 if(!['bachelor','master'].includes(degreeLevel))throw Error('Choose Bachelor or Master.');
 const age=ageAt(birthDate,issueDate);
 return {rawNumber:number,issueYear:String(year),issueDate:thaiDate(issueDate),
  fullName,age:String(age),nationalityThai,passportNo,birthDate:thaiDate(birthDate),
  majorThai:'สาขาวิชา'+majorThai,facultyThai,
  degreeSuffix:degreeLevel==='bachelor'?'ตรี':'โท',
  duration:degreeLevel==='bachelor'?'4':'2',degreeLevel,signatory};
}
function filename(raw){
 const v=validate(raw);
 const name=v.fullName.toLowerCase().replace(/(^|[\s.-])([a-z])/g,(_,a,b)=>a+b.toUpperCase())
  .replace(/[\\/:*?"<>|]/g,'').trim();
 const passport=v.passportNo.replace(/[^A-Z0-9]/g,'');
 return 'หนังสือรับรอง ED Plus '+name+'_'+passport+'.docx';
}
async function loadBundle(){
 if(!bundlePromise)bundlePromise=(async()=>{
  const response=await fetch(BUNDLE,{cache:'no-store'});
  if(!response.ok)throw Error('Cannot load Graduated Word master. Refresh the website.');
  const source=(await response.text()).trim();
  const gz=Uint8Array.from(atob(source),c=>c.charCodeAt(0));
  const stream=new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'));
  const files=JSON.parse(await new Response(stream).text());
  if(!files['word/document.xml']||!files['word/styles.xml']||
    !files['word/document.xml'].includes('{{FULL_NAME}}'))throw Error('Graduated template is incomplete.');
  return files;
 })().catch(err=>{bundlePromise=null;throw err});
 return bundlePromise;
}
function merge(xml,data){
 const fields={DOC_NUMBER:data.rawNumber,ISSUE_YEAR:data.issueYear,ISSUE_DATE:data.issueDate,
  FULL_NAME:data.fullName,AGE:data.age,NATIONALITY_TH:data.nationalityThai,
  PASSPORT_NO:data.passportNo,BIRTH_DATE:data.birthDate,MAJOR_TH:data.majorThai,
  FACULTY_TH:data.facultyThai,DEGREE_SUFFIX:data.degreeSuffix,DURATION:data.duration};
 for(const [key,val] of Object.entries(fields)){
  const token='{{'+key+'}}';
  if(xml.split(token).length!==2)throw Error('Graduated Word master has missing or repeated '+key+'.');
  xml=xml.replace(token,escapeXml(val));
 }
 if(xml.includes('{{'))throw Error('Graduated letter has unresolved text fields.');
 return xml;
}
// Preserve the supplied signature paragraphs (and tabs) byte-for-byte for
// the original signatory. For the alternative, swap only three text values:
// the first and last name and the title in the position line.
function selectSignatory(xml,key){
 if(key==='somyot')return xml;
 if(key!=='duangthida')throw Error('Select an approved signatory.');
 for(const [previous,next] of [
  ['สมยศ','ดวงธิดา'],
  ['วัฒนากมลชัย','นันทาภิรัตน์'],
  ['รองอธิการบดีสายนานาชาติ','ผู้ช่วยอธิการบดีสายนานาชาติ']
 ]){
  const token='<w:t>'+previous+'</w:t>';
  if(xml.split(token).length!==2)
   throw Error('Graduated signatory differs from the approved master: '+previous);
  xml=xml.replace(token,'<w:t>'+escapeXml(next)+'</w:t>');
 }
 return xml;
}
async function create(raw){
 if(!window.ZipLite?.writeZip)throw Error('The Word engine is unavailable. Refresh the page.');
 const data=validate(raw),files=await loadBundle();
 const entries=new Map(Object.entries(files).map(([name,source])=>[name,{
  name,data:encoder.encode(name==='word/document.xml'
   ?selectSignatory(merge(source,data),data.signatory):source)
 }]));
 return new Blob([await window.ZipLite.writeZip(entries)],{type:MIME});
}
window.BUICGraduatedLetter=Object.freeze({create,validate,filename,thaiDate,ageAt,SIGNATORIES});
})();
