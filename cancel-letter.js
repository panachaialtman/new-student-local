/* BUIC Current Letter — exact staff-approved cancellation letter master.
   All content is merged locally. No student/passport information is uploaded.
   The template is sanitized and retains Word's actual tabs, indents, spacing,
   paragraph styles, footer and signature positioning from the staff DOC. */
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
function splitHighlightedTabs(source){
 // In the original DOC two tab stops share a run with the student value.
 // Keep the tab stops in an unhighlighted run and highlight only the value,
 // without changing their positions or paragraph formatting.
 return source.replace(
  /<w:r>(<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*?<w:highlight w:val="yellow"\/>(?:(?!<\/w:rPr>)[\s\S])*?<\/w:rPr>)((?:<w:tab\/>)+)(<w:t[^>]*>\{\{(?:FULL_NAME|PASSPORT_NO)\}\}<\/w:t>)<\/w:r>/g,
  (all,properties,tabs,word)=>{
   const neutral=properties.replace('<w:highlight w:val="yellow"/>','');
   return '<w:r>'+neutral+tabs+'</w:r><w:r>'+properties+word+'</w:r>';
  }
 );
}
function merge(template,valid){
 const fields={
  DOC_NUMBER:valid.rawNumber,ISSUE_DATE:valid.issueDate,REASON:valid.reason,
  FULL_NAME:valid.fullName,NATIONALITY_TH:valid.nationalityThai,
  PASSPORT_NO:valid.passportNo,CANCEL_DATE:valid.cancelDate,
  SIGNER_NAME:valid.signerName,SIGNER_ROLE:valid.signerRole
 };
 let xml=splitHighlightedTabs(template);
 for(const [field,value] of Object.entries(fields)){
  const token='{{'+field+'}}';
  if(xml.split(token).length!==2)throw Error('Template contains a missing or duplicate '+field+' field.');
  xml=xml.replace(token,escapeXml(value));
 }
 return xml;
}
// The converted .doc master inherited an English/Chinese/Hindi default
// proofing profile even though every visible paragraph uses Thai typography.
// Word therefore underlines Thai text and can wrap long Thai syllables as
// English "words". Explicit Thai script language fixes both behaviors.
const THAI_LANG='<w:lang w:val="th-TH" w:eastAsia="th-TH" w:bidi="th-TH"/>';
function documentThaiProofing(xml, valid){
 let introCount=0;
 xml=xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g,p=>{
  if(!p.includes('มหาวิทยาลัยกรุงเทพ ใคร่ขอความอนุเคราะห์ สำนักงานตรวจคนเข้าเมือง'))return p;
  introCount++;
  // Preserve the first-line indentation, but remove the converted DOC's
  // leading tab. A tab is a positioning command, not a paragraph indent.
  const withoutTab=p.replace(/<w:r><w:rPr>[\s\S]*?<\/w:rPr><w:tab\/><\/w:r>/,'');
  if(!withoutTab.includes('<w:ind w:right="-180"')){
   throw Error('Cancellation master has changed its introductory paragraph.');
  }
  return withoutTab.replace('<w:ind w:right="-180"/>',
    '<w:ind w:right="-180" w:firstLine="720"/>');
 });
 if(introCount!==1)throw Error('The introductory paragraph was not found uniquely.');
 // Leave the original Word character settings on other paragraphs untouched.
 // Plain run text in the intro will inherit the corrected TH SarabunPSK and
 // Thai language defaults, just as Word's "Keep Text Only" paste does.
 const proofed=xml.replace(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g,run=>{
  run=run.replace(/<w:lang\b[^>]*\/>/g,'');
  const rpr=run.match(/<w:rPr(?:\s[^>]*)?>/);
  if(!rpr)return run.replace(/^(<w:r(?:\s[^>]*)?>)/,
    '$1<w:rPr><w:noProof/>'+THAI_LANG+'</w:rPr>');
  if(!run.includes('<w:noProof/>'))run=run.replace(rpr[0],rpr[0]+'<w:noProof/>');
  return run.replace('</w:rPr>',THAI_LANG+'</w:rPr>');
 });
 let cleaned=0;
 const output=proofed.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g,p=>{
  if(!p.includes('มหาวิทยาลัยกรุงเทพ ใคร่ขอความอนุเคราะห์ สำนักงานตรวจคนเข้าเมือง'))return p;
  cleaned++;
  const before='มหาวิทยาลัยกรุงเทพ ใคร่ขอความอนุเคราะห์ สำนักงานตรวจคนเข้าเมืองในการยกเลิกการตรวจลงตราวีซ่านักศึกษา เนื่องจากนักศึกษา';
  const after=' ดังรายละเอียดต่อไปนี้';
  if(!p.includes(before)||!p.includes(valid.reason)){
   throw Error('The introductory cancellation wording differs from the approved master.');
  }
  const plain=text=>'<w:r><w:t xml:space="preserve">'+escapeXml(text)+'</w:t></w:r>';
  const highlighted='<w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr>'+
    '<w:t xml:space="preserve">'+escapeXml(valid.reason)+'</w:t></w:r>';
  const cleanedRuns=plain(before)+highlighted+plain(after);
  const updated=p.replace(/(<\/w:pPr>)[\s\S]*?(<\/w:p>)$/,
    (_,properties,closing)=>properties+cleanedRuns+closing);
  if(updated===p)throw Error('The introductory paragraph could not be normalized.');
  return updated;
 });
 if(cleaned!==1)throw Error('Introductory paragraph normalization did not complete.');
 return output;
}
function styleThaiProofing(xml){
 // Repair language inheritance, not the approved TH SarabunPSK typography.
 return xml.replace(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/,defaults=>{
  let fixed=defaults.replace(/<w:lang\b[^>]*\/>/g,THAI_LANG);
  fixed=fixed.replace(/<w:rFonts\b[^>]*\/>/,
   '<w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:eastAsia="TH SarabunPSK" w:cs="TH SarabunPSK"/>');
  if(!fixed.includes('<w:noProof/>'))
   fixed=fixed.replace(/<w:rPr>/,'<w:rPr><w:noProof/>');
  return fixed;
 });
}
function settingsThaiProofing(xml){
 return xml.replace(/<w:autoHyphenation\b[^>]*\/>/,
  '<w:autoHyphenation w:val="false"/>');
}
async function create(raw){
 if(!window.ZipLite?.writeZip)throw Error('The Word engine is unavailable. Refresh the page.');
 const valid=validate(raw),bundle=await loadBundle();
 const entries=new Map(Object.entries(bundle).map(([name,source])=>[name,{
  name,data:encoder.encode(name==='word/document.xml'
    ?documentThaiProofing(merge(source,valid),valid)
    :name==='word/styles.xml'?styleThaiProofing(source)
    :name==='word/settings.xml'?settingsThaiProofing(source):source)
 }]));
 return new Blob([await window.ZipLite.writeZip(entries)],{type:MIME});
}
window.BUICCancelLetter=Object.freeze({create,validate,filename,thaiDate,REASONS});
})();