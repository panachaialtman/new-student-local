/* BUIC Criminal Record letter. Uses staff-supplied Word text and highlights.
   Forms and Word generation are entirely local; no student data is uploaded. */
(()=>{'use strict';
const MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const BUNDLE='./templates-data/criminal_record_master.txt';
const MONTHS=['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const SIGNATORIES=Object.freeze({
 somyot:Object.freeze({name:'ผู้ช่วยศาสตราจารย์ ดร.สมยศ วัฒนากมลชัย',
  tail:'สมยศ วัฒนากมลชัย',role:'รองอธิการบดีสายนานาชาติ ปฏิบัติหน้าที่แทน'}),
 duangthida:Object.freeze({name:'ผู้ช่วยศาสตราจารย์ ดร.ดวงธิดา นันทาภิรัตน์',
  tail:'ดวงธิดา นันทาภิรัตน์',role:'ผู้ช่วยอธิการบดีสายนานาชาติ ปฏิบัติหน้าที่แทน'})
});
const encoder=new TextEncoder();
let bundlePromise;
const clean=v=>String(v??'').trim();
const escapeXml=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;')
 .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
function dateParts(date){
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(date));
 if(!m)throw Error('Choose a valid document date.');
 const [y,mo,d]=m.slice(1).map(Number);
 const check=new Date(Date.UTC(y,mo-1,d));
 if(y<1900||y>2200||check.getUTCFullYear()!==y||
   check.getUTCMonth()!==mo-1||check.getUTCDate()!==d)
  throw Error('Choose a valid document date.');
 return {year:y,month:mo,day:d};
}
function thaiDate(date){const p=dateParts(date);return p.day+' '+MONTHS[p.month]+' '+(p.year+543);}
function requireThai(value,label,max=180){
 const v=clean(value).replace(/\s+/g,' ');
 if(!v||v.length>max||!/[ก-๙]/.test(v)||/[A-Za-z]/.test(v))
  throw Error('Enter '+label+' in Thai.');
 return v;
}
function validate(raw={}){
 const d=dateParts(raw.issueDate);
 const year=String(d.year+543);
 const doc=clean(raw.documentNo).replace(/^(?:ที่\s*)?มกท\/ศนช\.\s*/,'');
 const number=doc.replace(/\/\d{4}$/,'');
 if(!number||number.length>30||!/^[0-9A-Za-z-]+$/.test(number))
  throw Error('Enter a valid document number.');
 const fullName=clean(raw.fullName).replace(/\s+/g,' ').toUpperCase();
 const passportNo=clean(raw.passportNo).toUpperCase();
 if(!fullName||fullName.length>180)throw Error('Enter the student’s full name.');
 if(!passportNo||passportNo.length>70||/[<>]/.test(passportNo))
  throw Error('Enter a valid passport number.');
 const policePlace=requireThai(raw.policePlace,'the police office');
 const countryFullThai=requireThai(raw.countryFullThai,'the full country name');
 const nationalityThai=requireThai(raw.nationalityThai,'nationality',100);
 const majorThai=requireThai(raw.majorThai,'major',200);
 const facultyThai=requireThai(raw.facultyThai,'faculty',180);
 const degreeLevel=clean(raw.degreeLevel);
 const levels={bachelor:'ปริญญาตรี',master:'ปริญญาโท',doctoral:'ปริญญาเอก'};
 if(!Object.hasOwn(levels,degreeLevel))throw Error('Choose a degree level.');
 const signatory=clean(raw.signatory)||'somyot';
 if(!Object.hasOwn(SIGNATORIES,signatory))throw Error('Choose an approved signatory.');
 return {number,year,issueDate:thaiDate(raw.issueDate),fullName,passportNo,
  policePlace,countryFullThai,nationalityThai,majorThai,facultyThai,
  degreeLevel,degreeThai:levels[degreeLevel],signatory};
}
function filename(raw){
 const v=validate(raw);
 const name=v.fullName.toLowerCase().replace(/(^|[\s.-])([a-z])/g,(_,a,b)=>a+b.toUpperCase())
  .replace(/[\\/:*?"<>|]/g,'');
 const passport=v.passportNo.replace(/[^A-Z0-9]/g,'');
 return 'จดหมายตรวจประวัติอาชญากร '+name+'_'+passport+'.docx';
}
async function loadBundle(){
 if(!bundlePromise)bundlePromise=(async()=>{
  const resp=await fetch(BUNDLE,{cache:'no-store'});
  if(!resp.ok)throw Error('Cannot load Criminal Record Word master. Refresh the page.');
  const source=(await resp.text()).trim();
  const compressed=Uint8Array.from(atob(source),char=>char.charCodeAt(0));
  const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const files=JSON.parse(await new Response(stream).text());
  if(!files['word/document.xml']||!files['word/footer1.xml']||
    !files['word/document.xml'].includes('{{FULL_NAME_2}}'))
   throw Error('Criminal Record master is incomplete.');
  return files;
 })().catch(e=>{bundlePromise=null;throw e});
 return bundlePromise;
}
function merge(documentXml,v){
 const sig=SIGNATORIES[v.signatory];
 const fields={DOC_NUMBER:v.number,DOC_YEAR:v.year,ISSUE_DATE:v.issueDate,
  POLICE_PLACE:v.policePlace,FULL_NAME_1:v.fullName,FULL_NAME_2:v.fullName,
  COUNTRY_FULL_TH:v.countryFullThai,PASSPORT_NO:v.passportNo,
  NATIONALITY_TH:v.nationalityThai,DEGREE_TH:v.degreeThai,
  MAJOR_TH:v.majorThai,FACULTY_TH:v.facultyThai,
  SIGNER_NAME_TAIL:sig.tail,SIGNER_ROLE:sig.role};
 let xml=documentXml;
 for(const [key,value] of Object.entries(fields)){
  const token='{{'+key+'}}';
  if(xml.split(token).length!==2)throw Error('Criminal Record template has missing or repeated '+key+'.');
  xml=xml.replace(token,escapeXml(value));
 }
 if(xml.includes('{{'))throw Error('Criminal Record template contains unresolved fields.');
 return xml;
}
// The earlier one-page conversion removed the intentional separation
// between letter sections. Restore measured Word paragraph spacing in twips
// (and natural line leading for the two body paragraphs), without inserting
// blank text, moving signatures, or changing any field highlights or footer.
function restoreLetterSpacing(xml){
 const after=[360,360,180,360,360,360,480,0,0,0];
 let index=0;
 const restored=xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g,paragraph=>{
  const i=index++;
  if(i>=after.length)throw Error('Criminal Record master paragraph count changed.');
  const pprEnd=paragraph.indexOf('</w:pPr>');
  if(pprEnd<0)throw Error('Criminal Record paragraph properties missing: '+i);
  const ppr=paragraph.slice(0,pprEnd);
  const match=ppr.match(/<w:spacing\b[^>]*\/>/);
  if(!match||!/w:before="\d+"/.test(match[0])||!/w:after="\d+"/.test(match[0]))
   throw Error('Criminal Record paragraph spacing differs from approved master: '+i);
  let spacing=match[0].replace(/w:before="\d+"/,'w:before="0"')
   .replace(/w:after="\d+"/,'w:after="'+after[i]+'"');
  if(i===4||i===5){
   if(/w:line=/.test(spacing))throw Error('Unexpected line height in body paragraph '+i);
   spacing=spacing.replace('<w:spacing','<w:spacing w:lineRule="auto" w:line="257"');
  }
  return ppr.replace(match[0],spacing)+paragraph.slice(pprEnd);
 });
 if(index!==after.length)throw Error('Criminal Record Word paragraphs missing.');
 return restored;
}
async function create(raw){
 if(!window.ZipLite?.writeZip)throw Error('Word generation engine unavailable. Refresh the page.');
 const v=validate(raw),files=await loadBundle();
 const entries=new Map(Object.entries(files).map(([name,source])=>{
  let data;
  if(name==='word/document.xml')data=encoder.encode(restoreLetterSpacing(merge(source,v)));
  else if(typeof source==='string'&&source.startsWith('BASE64:'))
   data=Uint8Array.from(atob(source.slice(7)),c=>c.charCodeAt(0));
  else data=encoder.encode(source);
  return [name,{name,data}];
 }));
 return new Blob([await window.ZipLite.writeZip(entries)],{type:MIME});
}
window.BUICCriminalRecord=Object.freeze({create,validate,filename,thaiDate,SIGNATORIES});
})();