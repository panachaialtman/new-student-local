/* BUIC Current Letter — staff-approved cancellation letter master.
   Only approved placeholders are replaced; all original OOXML layout, text
   runs, paragraph formatting, styles, proofing and tabs remain unchanged.
   Content is merged locally; student data is not uploaded. */
(()=>{'use strict';
const MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const BUNDLE='./templates-data/cancel_manual_master.txt';
const MONTHS=['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const REASONS=Object.freeze(['พ้นสภาพ','สำเร็จการศึกษา','ลาออก','จะใช้วีซ่าประเภทอื่น','ลาพัก','ได้สัญชาติไทย','others']);
const encoder=new TextEncoder();
let bundlePromise;
const clean=x=>String(x??'').trim();
const escapeXml=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
function thaiDate(value){
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(value));
 if(!m)throw Error('Choose a valid document date and cancellation date.');
 const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]),date=new Date(y,mo-1,d);
 if(y<1900||y>2200||date.getFullYear()!==y||date.getMonth()!==mo-1||date.getDate()!==d)
   throw Error('One of the selected dates is invalid.');
 return d+' '+MONTHS[mo]+' '+(y+543);
}
function validate(raw={}){
 const number=clean(raw.documentNo),reason=clean(raw.reason),custom=clean(raw.otherReason).replace(/^นักศึกษา\s*/,'');
 const name=clean(raw.fullName).toUpperCase(),passport=clean(raw.passportNo).toUpperCase();
 const nationalityThai=clean(raw.nationalityThai),signerName=clean(raw.signatory?.name),signerRole=clean(raw.signatory?.role);
 const studentId=clean(raw.studentId);
 if(!number||number.length>100)throw Error('Enter a document number (maximum 100 characters).');
 if(!REASONS.includes(reason))throw Error('Select a cancellation reason.');
 if(reason==='others'&&(!custom||custom.length>300||!/[ก-๙]/.test(custom)))
   throw Error('Please enter an other cancellation reason in Thai (maximum 300 characters).');
 if(!name||name.length>180)throw Error('Enter the student’s full name.');
 if(!passport||passport.length>70)throw Error('Enter a passport number.');
 if(!nationalityThai||nationalityThai.length>100||!/[ก-๙]/.test(nationalityThai)||/[A-Za-z]/.test(nationalityThai))
   throw Error('Enter the nationality in Thai.');
 if(studentId&&!/^[0-9A-Za-z-]{4,30}$/.test(studentId))throw Error('Student ID must contain 4–30 letters, digits or hyphens.');
 if(!signerName||!signerRole)throw Error('Select a valid signatory.');
 const base=number.replace(/^(?:ที่\s*)?มกท\/ศนช\.\s*/,'').trim();
 if(!base)throw Error('Enter the document number after มกท/ศนช.');
 const buddhistYear=Number(clean(raw.issueDate).slice(0,4))+543;
 const formatted=/\/\d{4}$/.test(base)?base:base+'/'+buddhistYear;
 return {documentNo:'มกท/ศนช. '+formatted,rawNumber:formatted,
  issueDate:thaiDate(raw.issueDate),cancelDate:thaiDate(raw.cancelDate),
  reason:reason==='others'?custom:reason,reasonCode:reason,
  fullName:name,passportNo:passport,nationalityThai,signerName,signerRole,studentId};
}
function properName(value){
 // Keep name formatting human-readable in the filename while the letter stays uppercase.
 return value.toLowerCase().replace(/(^|[\s.-])([a-z])/g,(_,prefix,char)=>prefix+char.toUpperCase());
}
function filename(raw){
 const v=validate(raw);
 const safeName=properName(v.fullName).replace(/[\\/:*?"<>|]/g,'').replace(/\s+/g,' ').trim();
 const safePassport=v.passportNo.replace(/[^A-Z0-9]/g,'');
 return 'จดหมายยกเลิกวีซ่า '+safeName+'_'+safePassport+
   (v.studentId?'_'+v.studentId:'')+'.docx';
}
async function loadBundle(){
 if(!bundlePromise){
  bundlePromise=(async()=>{
   const response=await fetch(BUNDLE,{cache:'no-store'});
   if(!response.ok)throw Error('Cannot load the approved cancellation letter master. Refresh the page.');
   const data=(await response.text()).trim();
   const gz=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
   const stream=new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'));
   const files=JSON.parse(await new Response(stream).text());
   const doc=files['word/document.xml'];
   if(!doc||!files['word/styles.xml']||!doc.includes('{{DOC_NUMBER}}')||!doc.includes('{{FULL_NAME}}'))
    throw Error('The approved cancellation letter master is incomplete.');
   return files;
  })().catch(err=>{bundlePromise=null;throw err});
 }
 return bundlePromise;
}
function merge(template,valid){
 const fields={
  DOC_NUMBER:valid.rawNumber,ISSUE_DATE:valid.issueDate,REASON:valid.reason,
  FULL_NAME:valid.fullName,NATIONALITY_TH:valid.nationalityThai,
  PASSPORT_NO:valid.passportNo,CANCEL_DATE:valid.cancelDate,
  SIGNER_NAME:valid.signerName,SIGNER_ROLE:valid.signerRole
 };
 let xml=template;
 for(const [field,value] of Object.entries(fields)){
  const token='{{'+field+'}}';
  if(xml.split(token).length!==2)throw Error('Template contains a missing or duplicate '+field+' field.');
  xml=xml.replace(token,escapeXml(value));
 }
 return xml;
}
async function create(raw){
 if(!window.ZipLite?.writeZip)throw Error('The Word engine is unavailable. Refresh the page.');
 const valid=validate(raw),bundle=await loadBundle();
 const entries=new Map(Object.entries(bundle).map(([name,source])=>[name,{
  name,data:encoder.encode(name==='word/document.xml'?merge(source,valid):source)
 }]));
 return new Blob([await window.ZipLite.writeZip(entries)],{type:MIME});
}
window.BUICCancelLetter=Object.freeze({create,validate,filename,thaiDate,REASONS});
})();