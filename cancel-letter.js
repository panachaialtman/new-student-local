/* BU International Center cancellation letter, rebuilt using a deterministic
   one-page A4 layout. No spacing tabs, blank spacer paragraphs, or source .doc compatibility. */
(()=>{'use strict';
const MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MONTHS=['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const REASONS=Object.freeze(['พ้นสภาพ','สำเร็จการศึกษา','ลาออก','จะใช้วีซ่าประเภทอื่น','ลาพัก','ได้สัญชาติไทย','others']);
const enc=new TextEncoder();
const clean=x=>String(x??'').trim();
const esc=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
function thaiDate(s){
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(s));
 if(!m)throw Error('Choose a valid document date and cancellation date.');
 const [y,month,day]=m.slice(1).map(Number),d=new Date(y,month-1,day);
 if(y<1900||y>2200||d.getFullYear()!==y||d.getMonth()!==month-1||d.getDate()!==day)throw Error('One of the selected dates is invalid.');
 return day+' '+MONTHS[month]+' '+(y+543);
}
function validate(v={}){
 const number=clean(v.documentNo),reason=clean(v.reason),custom=clean(v.otherReason).replace(/^นักศึกษา\s*/,'');
 const fullName=clean(v.fullName).toUpperCase(),passportNo=clean(v.passportNo).toUpperCase();
 const nationalityThai=clean(v.nationalityThai),signerName=clean(v.signatory?.name),signerRole=clean(v.signatory?.role);
 if(!number||number.length>100)throw Error('Enter a document number (maximum 100 characters).');
 if(!REASONS.includes(reason))throw Error('Select a cancellation reason.');
 if(reason==='others'&&(!custom||custom.length>300||!/[ก-๙]/.test(custom)))throw Error('Please enter an other cancellation reason in Thai (maximum 300 characters).');
 if(!fullName||fullName.length>180)throw Error('Enter the student’s full name.');
 if(!passportNo||passportNo.length>70)throw Error('Enter a passport number.');
 if(!nationalityThai||nationalityThai.length>100||!/[ก-๙]/.test(nationalityThai)||/[A-Za-z]/.test(nationalityThai))throw Error('Enter the nationality in Thai.');
 if(!signerName||!signerRole)throw Error('Select a valid signatory.');
 const rawNumber=number.replace(/^(?:ที่\s*)?มกท\/ศนช\.\s*/,'').trim();
 if(!rawNumber)throw Error('Enter the document number after มกท/ศนช.');
 return {rawNumber,documentNo:'มกท/ศนช. '+rawNumber,issueDate:thaiDate(v.issueDate),cancelDate:thaiDate(v.cancelDate),
 reason:reason==='others'?custom:reason,reasonCode:reason,fullName,passportNo,nationalityThai,signerName,signerRole};
}
function run(value,highlight=false){
 return '<w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:eastAsia="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:sz w:val="32"/><w:szCs w:val="32"/>'+
 (highlight?'<w:highlight w:val="yellow"/>':'')+'</w:rPr><w:t xml:space="preserve">'+esc(value)+'</w:t></w:r>';
}
function paragraph(parts,{before=0,after=0,left=0,right=0,first=0,align='left',line=360,keep=false}={}){
 const runs=Array.isArray(parts)?parts:[String(parts).startsWith('<w:r>')?parts:run(parts)];
 return '<w:p><w:pPr><w:spacing w:before="'+before+'" w:after="'+after+'" w:line="'+line+'" w:lineRule="atLeast"/>'+
 ((left||right||first)?'<w:ind w:left="'+left+'" w:right="'+right+'" w:firstLine="'+first+'"/>':'')+
 '<w:jc w:val="'+align+'"/>'+(keep?'<w:keepNext/>':'')+'</w:pPr>'+runs.join('')+'</w:p>';
}
function table(rows,widths,indent=0){
 const total=widths.reduce((n,w)=>n+w,0);
 const cell=(v,i)=>'<w:tc><w:tcPr><w:tcW w:w="'+widths[i]+'" w:type="dxa"/>'+
 '<w:tcMar><w:top w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/>'+
 '<w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tcMar></w:tcPr>'+v+'</w:tc>';
 return '<w:tbl><w:tblPr><w:tblW w:w="'+total+'" w:type="dxa"/><w:tblInd w:w="'+indent+'" w:type="dxa"/>'+
 '<w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/>'+
 '<w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr>'+
 '<w:tblGrid>'+widths.map(w=>'<w:gridCol w:w="'+w+'"/>').join('')+'</w:tblGrid>'+
 rows.map(row=>'<w:tr><w:trPr><w:cantSplit/></w:trPr>'+row.map((v,i)=>cell(v,i)).join('')+'</w:tr>').join('')+'</w:tbl>';
}
function documentXml(v){
 const data=[['ชื่อ – นามสกุล',v.fullName],['สัญชาติ',v.nationalityThai],['หมายเลขหนังสือเดินทาง',v.passportNo],['วันที่ขอยกเลิกวีซ่า',v.cancelDate]];
 const details=table(data.map(([label,value])=>[paragraph(run(label),{line:370}),paragraph(run(value,true),{line:370})]),[3450,3450],1500);
 const text=[
 paragraph([run('ที่ มกท/ศนช. '),run(v.rawNumber,true)],{after:145}),
 paragraph(run(v.issueDate,true),{align:'right',right:2400,after:310}),
 paragraph([run('เรื่อง  '),run('ขอความอนุเคราะห์ยกเลิกการตรวจลงตราวีซ่านักศึกษา')],{after:150}),
 paragraph([run('เรียน  '),run('ผู้บัญชาการสำนักงานตรวจคนเข้าเมือง')],{after:260}),
 paragraph([run('มหาวิทยาลัยกรุงเทพ ใคร่ขอความอนุเคราะห์ สำนักงานตรวจคนเข้าเมืองในการยกเลิกการตรวจลงตราวีซ่านักศึกษา เนื่องจากนักศึกษา'),run(v.reason,true),run(' ดังรายละเอียดต่อไปนี้')],{first:590,after:190,line:385}),
 details,
 paragraph('ในการนี้เมื่อนักศึกษายกเลิกวีซ่านักศึกษามหาวิทยาลัยกรุงเทพแล้ว มหาวิทยาลัยกรุงเทพจะไม่รับผิดชอบการกระทำใด ๆ อันเนื่องด้วยตัวบุคคลดังได้กล่าวมาแล้วข้างต้น ทั้งนี้ รวมถึงการออกเอกสารรับรองทุกประเภท อาทิ การต่ออายุหนังสือเดินทาง การแจ้งรายงานตัว 90 วัน และการเดินทางเข้าออกราชอาณาจักรไทย',{first:590,before:210,after:200,line:385}),
 paragraph('จึงเรียนมาเพื่อโปรดพิจารณาอนุเคราะห์ยกเลิกการตรวจลงตราวีซ่าดังกล่าวด้วย จักเป็นพระคุณยิ่ง',{first:590,after:230,line:385}),
 paragraph('ขอแสดงความนับถือ',{left:2300,align:'center',after:600}),
 paragraph('('+v.signerName+')',{left:2300,align:'center',keep:true}),
 paragraph(v.signerRole,{left:2300,align:'center',keep:true}),
 paragraph('อธิการบดี',{left:2300,align:'center'}),
 '<w:sectPr><w:footerReference w:type="default" r:id="rId1"/><w:pgSz w:w="11906" w:h="16838"/>'+
 '<w:pgMar w:top="1050" w:right="1150" w:bottom="1120" w:left="1950" w:header="450" w:footer="500" w:gutter="0"/></w:sectPr>'
 ].join('');
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="'+NS+
 '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>'+text+'</w:body></w:document>';
}
function parts(v){
 const document=documentXml(v);
 const footer='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="'+NS+'">'+
 paragraph('ศูนย์นานาชาติ',{line:320})+paragraph('โทร 0 2407 3888 ต่อ 2441',{line:320})+'</w:ftr>';
 const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="'+NS+'"><w:docDefaults><w:rPrDefault><w:rPr>'+
 '<w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:eastAsia="TH SarabunPSK" w:cs="TH SarabunPSK"/>'+
 '<w:sz w:val="32"/><w:szCs w:val="32"/><w:lang w:val="en-US" w:eastAsia="th-TH"/></w:rPr></w:rPrDefault>'+
 '<w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="360" w:lineRule="atLeast"/></w:pPr></w:pPrDefault></w:docDefaults>'+
 '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';
 const settings='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="'+NS+'"><w:compat>'+
 '<w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>'+
 '<w:themeFontLang w:val="en-US" w:eastAsia="th-TH"/></w:settings>';
 const types='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
 '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+
 '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'+
 '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'+
 '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'+
 '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>';
 const pkg='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
 const rel='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'+
 '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'+
 '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>';
 return new Map([['[Content_Types].xml',types],['_rels/.rels',pkg],['word/document.xml',document],
 ['word/_rels/document.xml.rels',rel],['word/footer1.xml',footer],['word/styles.xml',styles],
 ['word/settings.xml',settings]].map(([name,value])=>[name,{name,data:new TextEncoder().encode(value)}]));
}
async function create(raw){
 if(!window.ZipLite?.writeZip)throw Error('The Word document engine is unavailable. Refresh the page.');
 return new Blob([await window.ZipLite.writeZip(parts(validate(raw)))],{type:MIME});
}
window.BUICCancelLetter=Object.freeze({create,validate,thaiDate,REASONS});
})();