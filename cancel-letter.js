/* BUIC Current Letter — browser-only Thai cancellation letters.
   The A4 template was rendered and inspected against the original BU form.
   No student or passport data is uploaded: values are merged locally into OOXML. */
(() => {
  'use strict';
  const MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const BUNDLE='templates-data/cancel_template_part1.txt';
  const MONTHS=['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const REASONS=Object.freeze(['พ้นสภาพ','สำเร็จการศึกษา','ลาออก','จะใช้วีซ่าประเภทอื่น','ลาพัก','ได้สัญชาติไทย','others']);
  const enc=new TextEncoder(),dec=new TextDecoder('utf-8');
  let bundlePromise=null;
  const clean=v=>String(v==null?'':v).trim();
  const xml=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');

  function thaiDate(raw){
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(raw));
    if(!m)throw Error('Choose a valid document date and cancellation date.');
    const y=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
    const date=new Date(y,month-1,day);
    if(y<1900||y>2200||date.getFullYear()!==y||date.getMonth()!==month-1||date.getDate()!==day)
      throw Error('One of the selected dates is invalid.');
    return day+' '+MONTHS[month]+' '+(y+543);
  }
  function validate(raw){
    const v=raw||{},number=clean(v.documentNo);
    const fullName=clean(v.fullName).toUpperCase(),passportNo=clean(v.passportNo).toUpperCase();
    const nationalityThai=clean(v.nationalityThai),reason=clean(v.reason),signer=v.signatory||{};
    if(!number||number.length>100)throw Error('Enter a document number (maximum 100 characters).');
    if(!REASONS.includes(reason))throw Error('Select a cancellation reason.');
    const custom=clean(v.otherReason).replace(/^นักศึกษา\s*/,'');
    if(reason==='others'&&(!custom||custom.length>300||!/[ก-๙]/.test(custom)))
      throw Error('Please enter an other cancellation reason in Thai (maximum 300 characters).');
    if(!fullName||fullName.length>180)throw Error('Enter the student’s full name.');
    if(!passportNo||passportNo.length>70)throw Error('Enter a passport number.');
    if(!nationalityThai||nationalityThai.length>100||!/[ก-๙]/.test(nationalityThai)||/[A-Za-z]/.test(nationalityThai))
      throw Error('Enter the nationality in Thai.');
    const name=clean(signer.name),role=clean(signer.role);
    if(!name||!role)throw Error('Select a valid signatory.');
    const rawNumber=number.replace(/^(?:ที่\s*)?มกท\/ศนช\.\s*/,'').trim();
    if(!rawNumber)throw Error('Enter the document number after มกท/ศนช.');
    return {
      documentNo:'มกท/ศนช. '+rawNumber,
      rawNumber,issueDate:thaiDate(v.issueDate),cancelDate:thaiDate(v.cancelDate),
      reason:reason==='others'?custom:reason,reasonCode:reason,
      fullName,passportNo,nationalityThai,signerName:name,signerRole:role
    };
  }

  async function loadBundle(){
    if(!bundlePromise){
      bundlePromise=(async()=>{
        const response=await fetch(BUNDLE,{cache:'no-store'});
        if(!response.ok)throw Error('The cancellation Word template could not be loaded. Refresh and try again.');
        const base64=(await response.text()).trim();
        const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
        const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        const data=JSON.parse(await new Response(stream).text());
        if(!data['word/document.xml']||!data['word/footer1.xml']||!data['word/styles.xml'])
          throw Error('The cancellation Word template is incomplete.');
        return data;
      })().catch(err=>{bundlePromise=null;throw err});
    }
    return bundlePromise;
  }

  function fillDocument(template,valid){
    const reps={
      DOCUMENT_NO:valid.rawNumber,
      ISSUE_DATE_TH:valid.issueDate,
      REASON:valid.reason,
      FULL_NAME:valid.fullName,
      NATIONALITY_TH:valid.nationalityThai,
      PASSPORT_NO:valid.passportNo,
      CANCEL_DATE_TH:valid.cancelDate,
      SIGNER_NAME:valid.signerName,
      SIGNER_ROLE:valid.signerRole
    };
    let word=template;
    for(const [key,value] of Object.entries(reps)){
      const token='{{'+key+'}}',pieces=word.split(token);
      if(pieces.length!==2)throw Error('The Word template is missing its '+key+' field.');
      word=pieces[0]+xml(value)+pieces[1];
    }
    return word;
  }
  async function create(raw){
    if(!window.ZipLite?.writeZip)throw Error('The document engine is unavailable. Refresh the page.');
    const valid=validate(raw),bundle=await loadBundle();
    const files=new Map(Object.entries(bundle).map(([name,text])=>
      [name,{name,data:enc.encode(name==='word/document.xml'?fillDocument(text,valid):text)}]));
    return new Blob([await window.ZipLite.writeZip(files)],{type:MIME});
  }
  window.BUICCancelLetter=Object.freeze({create,validate,thaiDate,REASONS});
})();