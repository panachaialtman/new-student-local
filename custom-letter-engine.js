(function (root) {
  'use strict';
  const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const XML='http://www.w3.org/XML/1998/namespace';
  const TYPES=['text','textarea','number','date','select','nationality','faculty','major','signatory','calculated','block','fixed'];
  const OPS=['age','addMonths','addDays','idYear','studyYear','add','subtract','multiply','minimum','maximum','majorCredits'];
  const FORMATS=['plain','title','upper','lower','enShort','enLong','enDayMonth','thaiDate','iso','yearBE','yearCE','nationalityEnglish','nationalityThai','countryEnglish','countryThai','facultyEnglish','facultyThai','programEnglish','programThai','nameEn','nameTh','roleEn','roleTh'];
  const AUTOFILL=['','fullName','title','studentId','passportNo','passportExpiry','birthDate','visaExpiry','signDate','totalCredits','registeredCredits','studyYear','graduationYear','nationality','faculty','major','signatory','documentNo','currentStudent','exchangeUniversity','programDuration'];
  const clone=value=>JSON.parse(JSON.stringify(value));
  const str=value=>String(value??'');
  const id=prefix=>prefix+'_'+(root?.crypto?.randomUUID?.()||Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9)).replaceAll('-','');
  const own=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);
  const safeId=value=>typeof value==='string'&&/^[a-zA-Z][a-zA-Z0-9_-]{0,89}$/.test(value);
  const EN=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const TH=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  function dateParts(value){
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(str(value));if(!m)return null;
    const y=+m[1],month=+m[2],d=+m[3],date=new Date(0);date.setUTCHours(0,0,0,0);date.setUTCFullYear(y,month-1,d);
    return date.getUTCFullYear()===y&&date.getUTCMonth()===month-1&&date.getUTCDate()===d?{y,m:month,d,date}:null;
  }
  function iso(date){return String(date.getUTCFullYear()).padStart(4,'0')+'-'+String(date.getUTCMonth()+1).padStart(2,'0')+'-'+String(date.getUTCDate()).padStart(2,'0');}
  function today(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function addMonths(value,amount){const p=dateParts(value);if(!p||!Number.isInteger(+amount)||Math.abs(+amount)>1200)return '';const date=new Date(p.date);date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+(+amount));const m=date.getUTCMonth();date.setUTCDate(p.d);if(date.getUTCMonth()!==m)date.setUTCDate(1);return iso(date);}
  function ageAt(birth,on){const a=dateParts(birth),b=dateParts(on);if(!a||!b||b.date<a.date)return '';return String(b.y-a.y-((b.m<a.m||(b.m===a.m&&b.d<a.d))?1:0));}
  function title(value){return str(value).toLocaleLowerCase('en-US').replace(/(^|[^\p{L}\p{M}])(\p{L})/gu,(_,before,letter)=>before+letter.toLocaleUpperCase('en-US'));}
  function formatDate(value,format){const p=dateParts(value);if(!p)return '';switch(format){case 'enLong':return EN[p.m-1]+' '+p.d+', '+p.y;case 'enDayMonth':return p.d+' '+EN[p.m-1];case 'thaiDate':return p.d+' '+TH[p.m-1]+' '+(p.y+543);case 'yearBE':return String(p.y+543);case 'yearCE':return String(p.y);case 'iso':return str(value);default:return EN[p.m-1].slice(0,3)+' '+p.d+', '+p.y;}}
  function nationality(context,value){return (context.nationalities||[]).find(r=>[r.recordId,r.english,r.thai,r.countryEnglish,r.countryThai,r.nationalityEnglish,r.nationalityThai].some(v=>v&&str(v)===str(value)));}
  function program(context,value){return (context.programs||[]).find(r=>r.key===value||r.recordId===value);}
  function number(value){if(str(value).trim()==='')return null;const n=Number(value);return Number.isFinite(n)?n:null;}
  function dependencies(field){if(field.type!=='calculated')return field.type==='major'&&field.parentId?[field.parentId]:[];return [field.formula?.a,field.formula?.b,field.formula?.cap].filter(Boolean);}
  function validateConfig(raw){
    if(!raw||typeof raw!=='object'||!Array.isArray(raw.fields)||!Array.isArray(raw.bindings))throw Error('This template setup is not valid.');
    if(raw.fields.length>200||raw.bindings.length>3000)throw Error('This template has too many fields or text selections.');
    const fields=raw.fields.map(f=>{
      if(!safeId(f?.id)||!TYPES.includes(f.type)||!str(f.label).trim()||str(f.label).length>150)throw Error('Each field needs a name and a supported type.');
      const out={id:f.id,label:str(f.label).trim(),type:f.type,required:Boolean(f.required),defaultValue:str(f.defaultValue).slice(0,20000),autofill:AUTOFILL.includes(f.autofill)?f.autofill:'',format:FORMATS.includes(f.format)?f.format:'plain',parentId:str(f.parentId||''),options:[],formula:null,blockId:str(f.blockId||'')};
      if(f.type==='select'){if(!Array.isArray(f.options)||f.options.length>500)throw Error('A dropdown can have up to 500 options.');out.options=f.options.map(o=>({value:str(o?.value??o).slice(0,1000),label:str(o?.label??o?.value??o).slice(0,1000)}));}
      if(f.type==='calculated'){
        if(!OPS.includes(f.formula?.op))throw Error('Choose a supported calculation for '+out.label+'.');const q=f.formula;
        out.formula={op:q.op,a:str(q.a||''),b:str(q.b||''),cap:str(q.cap||''),amount:q.amount===undefined?6:Number(q.amount),idStart:q.idStart===undefined?1:Number(q.idStart),idLength:q.idLength===undefined?2:Number(q.idLength),baseYear:q.baseYear===undefined?2500:Number(q.baseYear),duration:q.duration===undefined?4:Number(q.duration)};
        if(!out.formula.a||(['age','studyYear'].includes(q.op)&&!out.formula.b))throw Error('Choose the input fields for '+out.label+'.');
        if(['addMonths','addDays'].includes(q.op)&&!Number.isInteger(out.formula.amount))throw Error('Use a whole number of months or days for '+out.label+'.');
        if(!Number.isFinite(out.formula.amount)||Math.abs(out.formula.amount)>100000||!Number.isInteger(out.formula.idStart)||out.formula.idStart<0||out.formula.idStart>30||!Number.isInteger(out.formula.idLength)||out.formula.idLength<1||out.formula.idLength>4||!Number.isInteger(out.formula.baseYear)||out.formula.baseYear<0||out.formula.baseYear>9999||!Number.isFinite(out.formula.duration)||Math.abs(out.formula.duration)>100)throw Error('Check the calculation settings for '+out.label+'.');
      }
      return out;
    });
    const byId=new Map(fields.map(f=>[f.id,f]));if(byId.size!==fields.length)throw Error('Field IDs must be unique.');
    const visit=(key,path=new Set())=>{if(path.has(key))throw Error('Calculation loop found at '+byId.get(key).label+'.');const next=new Set(path);next.add(key);for(const dep of dependencies(byId.get(key))){if(!byId.has(dep))throw Error('A field used by '+byId.get(key).label+' is missing.');visit(dep,next);}};for(const f of fields)visit(f.id);
    const bindings=raw.bindings.map(b=>{
      if(!safeId(b?.id)||!byId.has(b.fieldId)||!/^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(b.part)||!Number.isSafeInteger(b.paragraph)||b.paragraph<0||!Number.isSafeInteger(b.start)||!Number.isSafeInteger(b.end)||b.start<0||b.end<=b.start||str(b.sample).length!==b.end-b.start)throw Error('A text selection is not valid.');
      return {id:b.id,fieldId:b.fieldId,part:b.part,paragraph:b.paragraph,start:b.start,end:b.end,sample:str(b.sample),format:FORMATS.includes(b.format)?b.format:''};
    });
    const groups=new Map();const bindingIds=new Set();for(const b of bindings){if(bindingIds.has(b.id))throw Error('Text selection IDs must be unique.');bindingIds.add(b.id);const key=b.part+'#'+b.paragraph;(groups.get(key)||groups.set(key,[]).get(key)).push(b);}
    for(const list of groups.values()){list.sort((a,b)=>a.start-b.start);for(let i=1;i<list.length;i++)if(list[i].start<list[i-1].end)throw Error('Text selections overlap. Map each part of the text once.');}
    const conditions=(raw.conditions||[]).map(c=>{if(!byId.has(c.fieldId)||!['filled','empty','equals','notEquals'].includes(c.op)||!/^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(c.part)||!Number.isSafeInteger(c.paragraph)||c.paragraph<0)throw Error('A paragraph condition is not valid.');return {part:c.part,paragraph:c.paragraph,fieldId:c.fieldId,op:c.op,value:str(c.value||'').slice(0,1000)};});
    if(conditions.length>1000)throw Error('This template has too many paragraph conditions.');
    return {fields,bindings,conditions};
  }
  function calculate(field,get,context){
    const q=field.formula||{},a=get(q.a),b=q.b?get(q.b):'',amount=q.amount;let out='';
    if(q.op==='age')out=ageAt(a,b);
    else if(q.op==='addMonths')out=addMonths(a,amount);
    else if(q.op==='addDays'){const p=dateParts(a);if(p&&Number.isInteger(amount)){p.date.setUTCDate(p.d+amount);out=iso(p.date);}}
    else if(q.op==='idYear'||q.op==='studyYear'){
      const digits=str(a).slice(q.idStart,q.idStart+q.idLength);
      if(digits.length===q.idLength&&/^\d+$/.test(digits)){const year=q.baseYear+Number(digits);if(q.op==='idYear')out=String(year+q.duration);else{const current=number(b);if(current!==null&&current>=year)out=String(current-year+1);}}
    }else if(q.op==='majorCredits'){const p=program(context,a),credits=p?.credits;out=credits&&typeof credits==='object'?str(credits[b||context.academicYear]??(q.b?'':Object.values(credits).find(v=>v!==null&&v!==''&&v!=='-'))??''):str(credits??'');}
    else{const x=number(a),y=q.b?number(b):number(amount);if(x!==null&&y!==null){const operations={add:(x,y)=>x+y,subtract:(x,y)=>x-y,multiply:(x,y)=>x*y,minimum:Math.min,maximum:Math.max};if(operations[q.op])out=str(operations[q.op](x,y));}}
    if(q.cap&&out){const cap=get(q.cap);if(dateParts(out)&&dateParts(cap)&&cap<out)out=cap;}return out;
  }
  function resolve(config,values={},overrides={},context={}){
    const byId=new Map(config.fields.map(f=>[f.id,f])),raw={},errors={},active=new Set();
    const get=key=>{
      if(!key)return '';if(own(raw,key))return raw[key];const f=byId.get(key);if(!f)return '';
      if(active.has(key)){errors[key]='Calculation loop';return '';}active.add(key);let value='';
      if(own(overrides,key))value=str(overrides[key]);
      else if(f.type==='fixed')value=f.defaultValue;
      else if(f.type==='block')value=(context.blocks||[]).find(b=>b.id===f.blockId)?.text||'';
      else if(f.type==='calculated')value=calculate(f,get,context);
      else value=own(values,key)?str(values[key]):f.defaultValue;
      active.delete(key);raw[key]=value;return value;
    };
    for(const f of config.fields)get(f.id);
    const shown=new Set(config.fields.filter(f=>!config.bindings.some(b=>b.fieldId===f.id)||config.bindings.some(b=>b.fieldId===f.id&&!(config.conditions||[]).some(c=>c.part===b.part&&c.paragraph===b.paragraph&&!conditionShown(c,{raw})))).map(f=>f.id));
    for(const c of config.conditions||[])shown.add(c.fieldId);
    const need=key=>{for(const dep of dependencies(byId.get(key))){if(!shown.has(dep)){shown.add(dep);need(dep);}}};for(const key of [...shown])need(key);
    const outputs={};for(const f of config.fields){
      outputs[f.id]=formatField(f,raw[f.id],context);if(!shown.has(f.id))continue;
      if(f.required&&!str(raw[f.id]).trim())errors[f.id]='Fill in '+f.label+'.';
      if(raw[f.id]&&f.type==='date'&&!dateParts(raw[f.id]))errors[f.id]='Choose a valid date for '+f.label+'.';
      if(raw[f.id]&&f.type==='number'&&number(raw[f.id])===null)errors[f.id]='Enter a number for '+f.label+'.';
      if(raw[f.id]&&['date','calculated','nationality','faculty','major','signatory','block'].includes(f.type)&&!outputs[f.id])errors[f.id]='The output for '+f.label+' is unavailable. Check its value, language, or calculation.';
      if(raw[f.id]&&f.type==='select'&&!f.options.some(o=>o.value===raw[f.id]))errors[f.id]='Choose a listed option for '+f.label+'.';
    }
    return {raw,outputs,errors};
  }
  function formatField(field,value,context={},override=''){
    const format=override||field.format||'plain';let out=str(value);
    if(field.type==='nationality'){const row=nationality(context,out);if(['nationalityEnglish','nationalityThai','countryEnglish','countryThai'].includes(format))return row?str(row[format]||(format==='countryEnglish'?row.english:format==='countryThai'||format==='nationalityThai'?row.thai:'')||''):'';if(format==='plain')return row?str(row.nationalityEnglish||row.english||''):'';}
    if(field.type==='faculty'&&['facultyEnglish','facultyThai'].includes(format)){const row=(context.programs||[]).find(p=>[p.facultyEnglish,p.facultyThai,p.facultyCode].includes(out));return row?str(row[format]||''):'';}
    if(field.type==='major'&&['programEnglish','programThai','plain'].includes(format))return str(program(context,out)?.[format==='plain'?'programEnglish':format]||'');
    if(field.type==='signatory'&&['nameEn','nameTh','roleEn','roleTh'].includes(format))return str((context.signatories||[]).find(s=>s.id===out)?.[format]||'');
    if(field.type==='signatory'&&format==='plain'){const row=(context.signatories||[]).find(s=>s.id===out);return str(row?.nameEn||row?.nameTh||'');}
    if(['yearBE','yearCE'].includes(format)&&/^\d{4}$/.test(out)){const year=Number(out);return String(format==='yearBE'?(year>=2400?year:year+543):(year>=2400?year-543:year));}
    if(['enShort','enLong','enDayMonth','thaiDate','iso','yearBE','yearCE'].includes(format))return formatDate(out,format);
    if(format==='title')return title(out);if(format==='upper')return out.toLocaleUpperCase();if(format==='lower')return out.toLocaleLowerCase();return out;
  }
  function conditionShown(condition,resolved){const v=str(resolved.raw[condition.fieldId]);switch(condition.op){case 'filled':return Boolean(v.trim());case 'empty':return !v.trim();case 'equals':return v===condition.value;case 'notEquals':return v!==condition.value;default:return true;}}
  function prefill(config,student={},context={}){
    const values={};const national=nationality(context,student.nationalityKey||student.nationalityThai||student.nationalityEnglish||student.countryEnglish||'');const p=program(context,student.programKey||'');
    const name=str(student.fullName||'').trim(),prefix=/^(Mr\.?|Ms\.?|Mrs\.?|Miss)\s+/i.exec(name),honorific=str(student.title||prefix?.[1]||'').replace(/\.$/,'');
    const displayTitle=honorific?title(honorific)+(honorific.toUpperCase()==='MISS'?'':'.'):'';
    const data={...student,fullName:[displayTitle,name.replace(/^(Mr\.?|Ms\.?|Mrs\.?|Miss)\s+/i,'')].filter(Boolean).join(' '),signDate:today(),visaExpiry:student.currentStayUntil||student.visaExpiry||'',nationality:national?.recordId||national?.countryEnglish||national?.english||'',faculty:p?.facultyEnglish||student.facultyEnglish||'',major:p?.key||student.programKey||'',studyYear:student.studyYearOverride||'',graduationYear:student.graduationYearOverride||'',programDuration:student.programDurationYears||''};
    for(const f of config.fields){if(f.type==='calculated'||f.type==='fixed'||f.type==='block')continue;values[f.id]=f.autofill&&data[f.autofill]!==undefined?str(data[f.autofill]):f.defaultValue;}return values;
  }
  function bytesToBase64(bytes){let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(binary);}
  function base64ToBytes(value){if(typeof value!=='string'||value.length>30*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('The template file data is invalid or too large.');try{return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}catch{throw Error('The template file data is invalid.');}}
  function preflightZip(bytes){
    if(bytes.length>20*1024*1024)throw Error('Choose a Word file smaller than 20 MB.');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let eocd=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}
    if(eocd<0)throw Error('This file is not a readable .docx file.');const count=view.getUint16(eocd+10,true);if(count>2000)throw Error('This Word file contains too many components.');
    let at=view.getUint32(eocd+16,true),total=0;
    for(let i=0;i<count;i++){if(at+46>bytes.length||view.getUint32(at,true)!==0x02014b50)throw Error('The Word file is damaged.');const size=view.getUint32(at+24,true);total+=size;if(size>24*1024*1024||total>80*1024*1024)throw Error('The expanded Word file is too large.');at+=46+view.getUint16(at+28,true)+view.getUint16(at+30,true)+view.getUint16(at+32,true);}
  }
  function parseXml(text){if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('This template contains unsupported XML declarations.');const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error('A Word document component is damaged.');return doc;}
  function nearest(node,local){for(let p=node.parentNode;p;p=p.parentNode)if(p.namespaceURI===W&&p.localName===local)return p;return null;}
  function textNodes(paragraph){return [...paragraph.getElementsByTagNameNS(W,'t')].filter(n=>nearest(n,'p')===paragraph);}
  function partNames(files){return [...files.keys()].filter(key=>/^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(key)).sort((a,b)=>a==='word/document.xml'?-1:b==='word/document.xml'?1:a.localeCompare(b));}
  function readParagraphs(doc,part){return [...doc.getElementsByTagNameNS(W,'p')].map((node,index)=>{
    let offset=0;const runs=textNodes(node).map(text=>{const run=nearest(text,'r'),prop=run&&[...run.children].find(x=>x.localName==='rPr');const has=name=>Boolean(prop?.getElementsByTagNameNS(W,name).length);const sz=prop?.getElementsByTagNameNS(W,'sz')[0]?.getAttributeNS(W,'val');const color=prop?.getElementsByTagNameNS(W,'color')[0]?.getAttributeNS(W,'val');const value=text.textContent,start=offset;offset+=value.length;return {text:value,start,end:offset,bold:has('b'),italic:has('i'),underline:has('u'),size:sz?Number(sz)/2:null,color:/^[0-9a-f]{6}$/i.test(color||'')?'#'+color:''};});
    const pPr=[...node.children].find(n=>n.localName==='pPr'),align=pPr?.getElementsByTagNameNS(W,'jc')[0]?.getAttributeNS(W,'val')||'left';
    return {part,index,text:runs.map(r=>r.text).join(''),runs,align:['left','right','center','both'].includes(align)?align:'left',inTable:Boolean(nearest(node,'tc')),node};
  });}
  async function loadDocx(bytes){preflightZip(bytes);const files=await root.ZipLite.readZip(bytes);if(!files.has('word/document.xml')||!files.has('[Content_Types].xml'))throw Error('Choose a Word .docx template.');if([...files.keys()].some(name=>/vbaProject\.bin$/i.test(name)))throw Error('Use a .docx template without macros.');if([...files.keys()].some(name=>/^_xmlsignatures\//i.test(name)))throw Error('Use an unsigned Word template. Editing would invalidate its digital signature.');const parts=new Map(),paragraphs=[];for(const part of partNames(files)){const doc=parseXml(new TextDecoder().decode(files.get(part).data));const rows=readParagraphs(doc,part);parts.set(part,{doc,paragraphs:rows});paragraphs.push(...rows);}if(!parts.get('word/document.xml').doc.getElementsByTagNameNS(W,'body').length)throw Error('This Word file has no readable document body.');return {files,parts,paragraphs};}
  function applyTextRanges(texts,ranges){
    const starts=[];let cursor=0;for(const t of texts){starts.push(cursor);cursor+=t.length;}const source=texts.join(''),out=[...texts];
    for(const r of [...ranges].sort((a,b)=>b.start-a.start)){
      if(r.start<0||r.end>source.length||r.start>=r.end||source.slice(r.start,r.end)!==r.sample)throw Error('The selected template text has changed. Open the builder and map that field again.');
      let first=-1,last=-1;for(let i=0;i<texts.length;i++){if(first<0&&r.start<starts[i]+texts[i].length)first=i;if(r.end>starts[i])last=i;}
      if(first<0||last<first)throw Error('A text selection could not be located.');
      const from=r.start-starts[first],to=r.end-starts[last];
      if(first===last)out[first]=out[first].slice(0,from)+str(r.value)+out[first].slice(to);
      else {out[first]=out[first].slice(0,from)+str(r.value);for(let i=first+1;i<last;i++)out[i]='';out[last]=out[last].slice(to);}
    }
    return out;
  }
  function setNodeText(node,value){const doc=node.ownerDocument,parts=str(value).split(/([\n\t])/);node.textContent=parts[0];node.setAttributeNS(XML,'xml:space','preserve');let previous=node;for(let i=1;i<parts.length;i++){let next;if(parts[i]==='\n'||parts[i]==='\t')next=doc.createElementNS(W,parts[i]==='\n'?'w:br':'w:tab');else{next=doc.createElementNS(W,'w:t');next.setAttributeNS(XML,'xml:space','preserve');next.textContent=parts[i];}previous.parentNode.insertBefore(next,previous.nextSibling);previous=next;}}
  function validateAnchors(loaded,config){for(const b of config.bindings){const p=loaded.parts.get(b.part)?.paragraphs[b.paragraph];if(!p||p.text.slice(b.start,b.end)!==b.sample)throw Error('The source text for a selected field is missing. Remap it in the template.');}for(const c of config.conditions)if(!loaded.parts.get(c.part)?.paragraphs[c.paragraph])throw Error('A conditional paragraph could not be found.');}
  async function generate(version,values={},overrides={},context={},snapshot=null){
    const config=validateConfig(version),loaded=await loadDocx(base64ToBytes(version.sourceBase64));validateAnchors(loaded,config);
    const resolved=snapshot?.resolved||resolve(config,values,overrides,context);
    if(!snapshot&&Object.keys(resolved.errors).length)throw Error(Object.values(resolved.errors)[0]);
    const bindingOutputs={};for(const b of config.bindings){const f=config.fields.find(f=>f.id===b.fieldId);bindingOutputs[b.id]=snapshot?.bindingOutputs&&own(snapshot.bindingOutputs,b.id)?snapshot.bindingOutputs[b.id]:formatField(f,resolved.raw[f.id],context,b.format);const condition=config.conditions.find(c=>c.part===b.part&&c.paragraph===b.paragraph),visible=!condition||(snapshot?.visibility&&own(snapshot.visibility,b.part+'#'+b.paragraph)?snapshot.visibility[b.part+'#'+b.paragraph]:conditionShown(condition,resolved));if(visible&&(f.required||resolved.raw[f.id])&&!str(bindingOutputs[b.id]).trim())throw Error('The output for '+f.label+' is missing. Check its language or format.');}
    const groups=new Map();for(const b of config.bindings){const key=b.part+'#'+b.paragraph;(groups.get(key)||groups.set(key,[]).get(key)).push({...b,value:bindingOutputs[b.id]});}
    for(const [part,entry] of loaded.parts){let changed=false;for(const p of entry.paragraphs){const condition=config.conditions.find(c=>c.part===part&&c.paragraph===p.index);const show=condition?(snapshot?.visibility&&own(snapshot.visibility,part+'#'+p.index)?snapshot.visibility[part+'#'+p.index]:conditionShown(condition,resolved)):true;if(!show){if(nearest(p.node,'tc')){for(const child of [...p.node.children])if(child.localName!=='pPr')child.remove();}else p.node.remove();changed=true;continue;}const ranges=groups.get(part+'#'+p.index);if(ranges){const nodes=textNodes(p.node),next=applyTextRanges(nodes.map(n=>n.textContent),ranges);nodes.forEach((n,i)=>setNodeText(n,next[i]));changed=true;}}
      if(changed)loaded.files.set(part,{name:part,data:new TextEncoder().encode(new XMLSerializer().serializeToString(entry.doc))});
    }
    const visibility={};for(const c of config.conditions)visibility[c.part+'#'+c.paragraph]=conditionShown(c,resolved);
    return {bytes:await root.ZipLite.writeZip(loaded.files),snapshot:{resolved:clone(resolved),bindingOutputs:clone(bindingOutputs),visibility:snapshot?.visibility||visibility}};
  }
  function escapeXml(value){return str(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
  async function blankDocx(text,settings={}){
    if(str(text).length>200000)throw Error('The letter text is too long.');
    const font=str(settings.font||'Times New Roman'),size=Math.max(8,Math.min(30,Number(settings.size)||12));
    const xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="'+W+'"><w:body>'+str(text).split('\n').map(line=>'<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="'+escapeXml(font)+'" w:hAnsi="'+escapeXml(font)+'" w:cs="'+escapeXml(font)+'"/><w:sz w:val="'+(size*2)+'"/><w:szCs w:val="'+(size*2)+'"/></w:rPr><w:t xml:space="preserve">'+escapeXml(line)+'</w:t></w:r></w:p>').join('')+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>';
    const content='<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
    const rels='<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    const files=new Map();for(const [name,value] of [['[Content_Types].xml',content],['_rels/.rels',rels],['word/document.xml',xml]])files.set(name,{name,data:new TextEncoder().encode(value)});return root.ZipLite.writeZip(files);
  }
  const api={W,TYPES,OPS,FORMATS,AUTOFILL,clone,id,own,dateParts,today,addMonths,ageAt,title,formatDate,validateConfig,resolve,formatField,prefill,nationality,program,conditionShown,bytesToBase64,base64ToBytes,preflightZip,parseXml,readParagraphs,loadDocx,applyTextRanges,validateAnchors,generate,blankDocx};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.CustomLetterEngine=Object.freeze(api);
})(typeof window==='undefined'?globalThis:window);
