/* Visa cancellation letter: non-personal DOCX template assembled entirely in the browser.
   Based on the approved Thai cancellation letter provided to the BU team.
   No personal data is uploaded. Signature requires a handwritten/approved signature. */
(() => {
  'use strict';
  const MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const MONTHS=['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const REASONS=Object.freeze(['พ้นสภาพ','สำเร็จการศึกษา','ลาออก','จะใช้วีซ่าประเภทอื่น','ลาพัก','ได้สัญชาติไทย','others']);
  const enc=new TextEncoder();
  function clean(v){return String(v==null?'':v).trim();}
  function xml(v){return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
  function thaiDate(value){
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(value));
    if(!m)throw Error('Choose a valid document date and cancellation date.');
    const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
    const d=new Date(year,month-1,day);
    if(year<1900||year>2200||d.getFullYear()!==year||d.getMonth()!==month-1||d.getDate()!==day)
      throw Error('One of the selected dates is invalid.');
    return day+' '+MONTHS[month]+' '+(year+543);
  }
  function validate(raw){
    const v=raw||{};
    const documentNo=clean(v.documentNo);
    const fullName=clean(v.fullName).toUpperCase();
    const passportNo=clean(v.passportNo).toUpperCase();
    const nationalityThai=clean(v.nationalityThai);
    const reason=clean(v.reason);
    const signatory=v.signatory||{};
    if(!documentNo||documentNo.length>100)throw Error('Enter a document number (maximum 100 characters).');
    if(!REASONS.includes(reason))throw Error('Select a cancellation reason.');
    const manualReason=clean(v.otherReason).replace(/^นักศึกษา\s*/,'');
    if(reason==='others'&&(!manualReason||manualReason.length>300||!/[ก-๙]/.test(manualReason)))
      throw Error('Please enter an other cancellation reason in Thai (maximum 300 characters).');
    const resolvedReason=reason==='others'?manualReason:reason;
    if(!fullName||fullName.length>180)throw Error('Enter the student’s full name.');
    if(!passportNo||passportNo.length>70)throw Error('Enter a passport number.');
    if(!nationalityThai||!/[ก-๙]/.test(nationalityThai)||/[A-Za-z]/.test(nationalityThai)||nationalityThai.length>100)
      throw Error('Enter the nationality in Thai.');
    const signerName=clean(signatory.name),signerRole=clean(signatory.role);
    if(!signerName||!signerRole)throw Error('Select a valid signatory.');
    return {
      documentNo:documentNo.startsWith('มกท/ศนช.')?documentNo:'มกท/ศนช. '+documentNo,
      issueDate:thaiDate(v.issueDate),
      cancelDate:thaiDate(v.cancelDate),
      reason:resolvedReason,reasonCode:reason,fullName,passportNo,nationalityThai,
      signerName,signerRole
    };
  }
  // Fixed A4 layout. TH SarabunPSK is the font of the uploaded official letter.
  const NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  function run(value,bold,small=false){
    return '<w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:eastAsia="TH SarabunPSK" w:cs="TH SarabunPSK"/>'+
      '<w:sz w:val="'+(small?30:38)+'"/><w:szCs w:val="'+(small?30:38)+'"/>'+(bold?'<w:b/>':'')+'</w:rPr>'+
      '<w:t xml:space="preserve">'+xml(value)+'</w:t></w:r>';
  }
  function para(value,opts){
    const o=opts||{},before=o.before||0,after=o.after==null?100:o.after;
    const align=o.align||'left',indent=o.indent||0;
    return '<w:p><w:pPr><w:jc w:val="'+align+'"/>'+
      '<w:spacing w:before="'+before+'" w:after="'+after+'" w:line="385" w:lineRule="atLeast"/>'+
      (indent?'<w:ind w:firstLine="'+indent+'"/>':'')+
      '<w:keepLines/></w:pPr>'+run(value,!!o.bold,!!o.small)+'</w:p>';
  }
  function tableRows(data){
    const widths=[3450,5450],rows=data.map(pair=>
      '<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="420" w:hRule="atLeast"/></w:trPr>'+pair.map((val,i)=>
      '<w:tc><w:tcPr><w:tcW w:w="'+widths[i]+'" w:type="dxa"/>'+
      '<w:tcMar><w:top w:w="10" w:type="dxa"/><w:bottom w:w="10" w:type="dxa"/>'+
      '<w:left w:w="50" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tcMar></w:tcPr>'+
      para(val,{after:0})+'</w:tc>').join('')+'</w:tr>').join('');
    return '<w:tbl><w:tblPr><w:tblW w:w="8900" w:type="dxa"/>'+
      '<w:tblInd w:w="250" w:type="dxa"/>'+
      '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/>'+
      '<w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>'+
      '</w:tblPr><w:tblGrid><w:gridCol w:w="3450"/><w:gridCol w:w="5450"/></w:tblGrid>'+
      rows+'</w:tbl>';
  }
  function parts(v){
    const body=[
      para('ที่ '+v.documentNo,{after:180}),
      para(v.issueDate,{align:'right',after:315}),
      para('เรื่อง ขอความอนุเคราะห์ยกเลิกการตรวจลงตราวีซ่านักศึกษา',{after:180}),
      para('เรียน ผู้บัญชาการสำนักงานตรวจคนเข้าเมือง',{after:180}),
      para('มหาวิทยาลัยกรุงเทพ ใคร่ขอความอนุเคราะห์ สำนักงานตรวจคนเข้าเมืองในการยกเลิกการตรวจลงตราวีซ่านักศึกษา เนื่องจากนักศึกษา'+v.reason+' ดังรายละเอียดต่อไปนี้',{indent:550,after:210}),
      tableRows([
        ['ชื่อ – นามสกุล',v.fullName],
        ['สัญชาติ',v.nationalityThai],
        ['หมายเลขหนังสือเดินทาง',v.passportNo],
        ['วันที่ขอยกเลิกวีซ่า',v.cancelDate]
      ]),
      para('ในการนี้เมื่อนักศึกษายกเลิกวีซ่านักศึกษามหาวิทยาลัยกรุงเทพแล้ว มหาวิทยาลัยกรุงเทพจะไม่รับผิดชอบการกระทำใด ๆ อันเนื่องด้วยตัวบุคคลดังได้กล่าวมาแล้วข้างต้น ทั้งนี้ รวมถึงการออกเอกสารรับรองทุกประเภท อาทิ การต่ออายุหนังสือเดินทาง การแจ้งรายงานตัว 90 วัน และการเดินทางเข้าออกราชอาณาจักรไทย',{indent:550,before:230,after:195}),
      para('จึงเรียนมาเพื่อโปรดพิจารณาอนุเคราะห์ยกเลิกการตรวจลงตราวีซ่าดังกล่าวด้วย จักเป็นพระคุณยิ่ง',{indent:550,after:270}),
      para('ขอแสดงความนับถือ',{align:'center',after:560}),
      para('('+v.signerName+')',{align:'center',after:40}),
      para(v.signerRole,{align:'center',after:0}),
      para('อธิการบดี',{align:'center',after:0}),
      '<w:sectPr><w:footerReference w:type="default" r:id="rId1"/>'+
      '<w:pgSz w:w="11906" w:h="16838"/>'+
      '<w:pgMar w:top="1230" w:right="1350" w:bottom="1310" w:left="1350" w:header="600" w:footer="620" w:gutter="0"/>'+
      '</w:sectPr>'
    ].join('');
    const document='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<w:document xmlns:w="'+NS+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
      '<w:body>'+body+'</w:body></w:document>';
    const footer='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<w:ftr xmlns:w="'+NS+'">'+para('ศูนย์นานาชาติ',{after:0,small:true})+
      para('โทร 0 2407 3888 ต่อ 2441',{after:0,small:true})+'</w:ftr>';
    const types='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
      '<Default Extension="xml" ContentType="application/xml"/>'+
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'+
      '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'+
      '</Types>';
    const mainRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'+
      '</Relationships>';
    const rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'+
      '</Relationships>';
    return new Map([
      ['[Content_Types].xml',types],
      ['_rels/.rels',rels],
      ['word/document.xml',document],
      ['word/_rels/document.xml.rels',mainRels],
      ['word/footer1.xml',footer]
    ].map(([name,data])=>[name,{name,data:enc.encode(data)}]));
  }
  async function create(raw){
    if(!window.ZipLite?.writeZip)throw Error('The document engine is unavailable. Refresh the page.');
    const valid=validate(raw);
    return new Blob([await window.ZipLite.writeZip(parts(valid))],{type:MIME});
  }
  window.BUICCancelLetter=Object.freeze({create,validate,thaiDate,REASONS});
})();
