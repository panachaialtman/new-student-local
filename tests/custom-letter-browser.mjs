import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

await fs.mkdir('test-results',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[],hubWrites=[];
try{
  const ctx=await browser.newContext({viewport:{width:1600,height:1050},acceptDownloads:true,serviceWorkers:'block'});
  await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:'http://127.0.0.1:8124'});
  await ctx.route('https://buic-central-hub.vercel.app/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(!['GET','HEAD','OPTIONS'].includes(req.method()))hubWrites.push(path);
    if(path==='/api/staff/session')return route.fulfill({json:{ok:true,staff:{id:'custom-letter-qa',username:'qa'}}});
    return route.fulfill({status:503,json:{detail:'Synthetic QA uses bundled references'}});
  });
  await ctx.addInitScript(()=>{
    sessionStorage.setItem('buic-student-memory-staff-token-v1','custom-letter-qa-token');
    const create=URL.createObjectURL.bind(URL);window.__qaDownloads=[];
    URL.createObjectURL=blob=>{window.__qaDownloads.push(blob);return create(blob);};
  });
  const page=await ctx.newPage();page.on('pageerror',err=>errors.push(err.message));
  const idle=()=>page.waitForFunction(()=>!document.getElementById('customLetterRoot')?.hasAttribute('aria-busy'));
  const act=async name=>{
    if(['backup','restore','library','importTemplate'].includes(name)&&await page.locator('.cl-tools').count()&&!await page.locator('.cl-tools').evaluate(el=>el.open))await page.locator('.cl-tools>summary').click();
    await page.locator('[data-cl-action="'+name+'"]').first().click();await idle();
  };
  const stored=()=>page.evaluate(()=>VisaDB.getState('custom_letters_v1'));
  const capture=async action=>{
    const event=page.waitForEvent('download');await action();const download=await event;return {name:download.suggestedFilename(),bytes:await fs.readFile(await download.path())};
  };
  const parseDoc=async bytes=>page.evaluate(async base64=>{
    const E=CustomLetterEngine,loaded=await E.loadDocx(E.base64ToBytes(base64));
    return {texts:loaded.paragraphs.map(p=>p.text),parts:Object.fromEntries([...loaded.files].filter(([n])=>n.endsWith('.xml')).map(([n,f])=>[n,new TextDecoder().decode(f.data)])),image:[...loaded.files.get('word/media/emblem.png')?.data||[]]};
  },bytes.toString('base64'));
  await page.goto('http://127.0.0.1:8124/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.BUICWorkspaceAuth?.isAuthenticated()&&window.BUICCustomLetters);
  await page.locator('#emptyState').waitFor({state:'visible'});
  let ready=false;
  for(let i=0;i<120;i++){ready=await page.evaluate(async()=>Boolean((await VisaDB.getState('workspace_v02'))?.savedAt));if(ready)break;await page.waitForTimeout(50);}
  assert(ready,'initial workspace save must complete before adding the synthetic student');
  const student=await page.evaluate(async()=>{
    const programs=BUICCustomLetterBridge.getContext().programs,p=programs[0];
    const student={id:'custom-local-student',caseCategory:'normal',title:'',fullName:'MISS EXAMPLE STUDENT',studentId:'1690123456',passportNo:'QA123456',passportExpiry:'2027-05-20',birthDate:'2000-11-15',currentStayUntil:'2027-01-31',nationalityThai:'จีน',programKey:p.key,createdAt:'2026-10-01T00:00:00Z',documentNo:'QA100'};
    const state=await VisaDB.getState('workspace_v02');state.cases=[student];await VisaDB.setState('workspace_v02',state);return {...student,program:p};
  });
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-case-id="custom-local-student"]').waitFor();
  await page.locator('[data-view="custom"]').click();
  await page.getByText('Build your first letter form',{exact:true}).waitFor();
  assert.equal(await page.locator('#draftsBtn').isVisible(),false);
  console.log('PASS Current Letter navigation and isolated empty custom workspace');

  const fixture=await page.evaluate(async()=>{
    const E=CustomLetterEngine,W=E.W,bytes=await E.blankDocx('Fixture'),loaded=await E.loadDocx(bytes),files=loaded.files;
    const text=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    const para=(value,props='')=>'<w:p>'+props+'<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">'+text(value)+'</w:t></w:r></w:p>';
    const picture='<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="381000" cy="381000"/><wp:docPr id="1" name="Fixture emblem"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="emblem.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="img1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="381000" cy="381000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
    const split='<w:p><w:pPr><w:spacing w:after="200"/></w:pPr><w:r><w:t xml:space="preserve">Student </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>EXAMPLE STUDENT</w:t></w:r><w:r><w:t xml:space="preserve"> has </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>Chi</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>nese</w:t></w:r><w:r><w:t xml:space="preserve"> nationality. Thai nationality: Chinese.</w:t></w:r></w:p>';
    const body=para('Custom student letter','<w:pPr><w:jc w:val="center"/></w:pPr>')+split+
      '<w:p><w:r><w:t xml:space="preserve">Signed </w:t></w:r><w:fldSimple w:instr=" DATE "><w:r><w:t>SIGN_DATE</w:t></w:r></w:fldSimple><w:r><w:t xml:space="preserve">. Birth BIRTH_DATE. Age AGE.</w:t></w:r></w:p>'+
      para('Faculty FACULTY. Major MAJOR. Credits CREDITS.')+
      para('Visa until VISA_DATE. Extend until EXTEND_DATE. Passport expiry PASSPORT_DATE.')+
      para('Expected graduation GRAD_YEAR. Student ID STUDENT_ID.')+
      para('Signer SIGNER_NAME. Position SIGNER_ROLE.')+
      para('Conditional note OPTIONAL_VALUE.')+para('BLOCK_TEXT')+
      '<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr>'+para('Passport PASSPORT_NUMBER')+'</w:tc><w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr>'+para('Unchanged table note')+'</w:tc></w:tr></w:tbl>'+picture;
    const document='<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="'+W+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>'+body+'<w:sectPr><w:headerReference w:type="default" r:id="header1"/><w:footerReference w:type="default" r:id="footer1"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567"/></w:sectPr></w:body></w:document>';
    const put=(name,value)=>files.set(name,{name,data:typeof value==='string'?new TextEncoder().encode(value):value});
    put('word/document.xml',document);
    put('word/header1.xml','<?xml version="1.0"?><w:hdr xmlns:w="'+W+'">'+para('Custom letter EXAMPLE STUDENT')+'</w:hdr>');
    put('word/footer1.xml','<?xml version="1.0"?><w:ftr xmlns:w="'+W+'">'+'<w:p><w:r><w:t xml:space="preserve">Approved </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> MERGEFIELD Signer </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>SIGNER_NAME</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>'+'</w:ftr>');
    put('word/_rels/document.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="header1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="footer1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="img1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/emblem.png"/></Relationships>');
    const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+bCrkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));put('word/media/emblem.png',png);
    const content=new TextDecoder().decode(files.get('[Content_Types].xml').data).replace('</Types>','<Default Extension="png" ContentType="image/png"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>');
    put('[Content_Types].xml',content);return E.bytesToBase64(await ZipLite.writeZip(files));
  });
  await act('newTemplate');
  assert.match(await page.locator('.cl-steps [aria-current="step"]').innerText(),/Choose a letter/);
  const accept=await page.locator('#clSourceFile').getAttribute('accept');
  assert(accept.split(',').includes('.doc')&&accept.split(',').includes('.docx'),'picker must show both Word formats');
  const binary=Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1,0,0,0,0]);
  await page.locator('#clSourceFile').setInputFiles({name:'Older template.DOC',mimeType:'application/msword',buffer:binary});
  await page.locator('#clSourceNotice').waitFor();await idle();
  assert.match(await page.locator('#clSourceNotice').innerText(),/File → Save As → Word Document/);
  assert.match(await page.locator('#clSourceNotice').innerText(),/Changing the filename.*does not convert/);
  assert.equal(await page.locator('#clSourceNotice').evaluate(el=>el===document.activeElement),true);
  await page.screenshot({path:'test-results/custom-letter-old-doc-guide.png',fullPage:true});
  await act('pasteSource');assert.equal(await page.locator('#clWriteSource').evaluate(el=>el.open),true);
  assert.equal(await page.locator('#clBlankText').evaluate(el=>el===document.activeElement),true);
  await page.locator('#clSourceFile').setInputFiles({name:'Renamed-not-converted.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:binary});
  await page.waitForFunction(()=>document.getElementById('clSourceNotice')?.textContent.includes('Renamed-not-converted.docx'));
  console.log('PASS old .doc files are visible in the picker and get clear conversion guidance, including renamed binary files');
  await page.locator('#clSourceFile').setInputFiles({name:'Custom template.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from(fixture,'base64')});
  await page.locator('#clDocument mark').waitFor({state:'hidden'});
  await page.locator('#clDocument').getByText('Chinese',{exact:false}).first().waitFor();
  await idle();
  const select=async(sample,occurrence=0,part='word/document.xml')=>{
    await page.evaluate(({sample,occurrence,part})=>{
      const paragraphs=[...document.querySelectorAll('#clDocument [data-clp]')].filter(p=>p.dataset.part===part);
      let target,start=-1,remaining=occurrence;
      for(const p of paragraphs){let from=0,at;while((at=p.textContent.indexOf(sample,from))>=0){if(remaining--===0){target=p;start=at;break;}from=at+sample.length;}if(target)break;}
      if(!target)throw Error('Cannot find selected phrase '+sample);
      const walker=document.createTreeWalker(target,NodeFilter.SHOW_TEXT),nodes=[];let node,offset=0;
      while((node=walker.nextNode())){nodes.push({node,start:offset,end:offset+node.textContent.length});offset+=node.textContent.length;}
      const a=nodes.find(n=>start<n.end),end=start+sample.length,b=nodes.find(n=>end<=n.end&&end>n.start),range=document.createRange();
      range.setStart(a.node,start-a.start);range.setEnd(b.node,end-b.start);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
      target.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    },{sample,occurrence,part});
    assert.equal(await page.locator('#clSelectionText').innerText(),sample);
    const existing=page.locator('.cl-link-existing');if(await existing.count()&&!await existing.evaluate(el=>el.open))await existing.locator('summary').click();
  };
  const fieldControl=key=>page.locator('#clFieldSettings [data-cl-field="'+key+'"]');
  const make=async(sample,label,type='text',extra={})=>{
    await select(sample);await act('makeField');
    await fieldControl('label').fill(label);if(type!=='text')await fieldControl('type').selectOption(type);
    for(const [key,value] of Object.entries(extra)){if(key==='required')await fieldControl(key).setChecked(value);else await fieldControl(key).fill(value);}
  };
  await make('Chinese','Nationality','nationality',{required:true});
  await select('Chinese',1);await page.locator('#clLinkField').selectOption({label:'Nationality'});await page.locator('#clLinkFormat').selectOption('nationalityThai');await act('linkField');
  await make('EXAMPLE STUDENT','Full name');
  await fieldControl('autofill').selectOption('fullName');await fieldControl('format').selectOption('title');await fieldControl('required').check();
  await select('EXAMPLE STUDENT',0,'word/header1.xml');await page.locator('#clLinkField').selectOption({label:'Full name'});await act('linkField');
  await make('SIGN_DATE','Sign date','date',{required:true});await fieldControl('autofill').selectOption('signDate');
  await page.locator('#clTemplateName').fill('Student custom letter');
  await act('testMode');await act('fillTest');
  assert.match(await page.locator('#clDocument').innerText(),/Chinese nationality\. Thai nationality: จีน/);
  assert.match(await page.locator('#clDocument').innerText(),/Mr\. Example Student/);
  const testWord=await capture(()=>act('testDownload'));assert(testWord.name.endsWith('.docx'));
  const sample=await parseDoc(testWord.bytes);assert(sample.texts.some(t=>t.includes('Chinese nationality. Thai nationality: จีน')));
  assert(sample.parts['word/document.xml'].includes('<w:b'));
  assert.equal(sample.parts['word/document.xml'].includes('<w:tblBorders>'),true);
  assert.equal(sample.image.length>0,true);
  await act('saveTemplate');
  const initial=await stored();assert.equal(initial.templates.length,1);assert.equal(initial.templates[0].versions[0].fields.length,3);
  const setupDownload=await capture(()=>act('exportTemplate')),setup=JSON.parse(setupDownload.bytes);
  assert.equal(setup.format,'buic-custom-letter-template');assert.equal('cases' in setup,false);
  console.log('PASS Word upload, selections across styled runs, bilingual repeated field, test download, version save, setup export');

  // Extend the exported setup as a portable template, then use the real import UI.
  const advanced=await page.evaluate(async pack=>{
    const E=CustomLetterEngine,v=pack.template.versions[0],loaded=await E.loadDocx(E.base64ToBytes(v.sourceBase64));
    const add=(id,type,label,settings={})=>{const f={id,type,label,required:true,defaultValue:'',format:'plain',autofill:'',options:[],parentId:'',blockId:'',formula:null,...settings};v.fields.push(f);return f;};
    const bind=(fieldId,sample,format='',part='word/document.xml')=>{const p=loaded.paragraphs.find(p=>p.part===part&&p.text.includes(sample));v.bindings.push({id:E.id('binding'),fieldId,part,paragraph:p.index,start:p.text.indexOf(sample),end:p.text.indexOf(sample)+sample.length,sample,format});return p;};
    const date=v.fields.find(f=>f.label==='Sign date'),name=v.fields.find(f=>f.label==='Full name');
    add('birth','date','Birth date',{autofill:'birthDate',format:'enShort'});bind('birth','BIRTH_DATE');
    add('age','calculated','Age',{formula:{op:'age',a:'birth',b:date.id}});bind('age','AGE');
    add('faculty','faculty','Faculty',{autofill:'faculty',format:'facultyEnglish'});bind('faculty','FACULTY');
    add('major','major','Major',{autofill:'major',parentId:'faculty',format:'programEnglish'});bind('major','MAJOR');
    add('credits','calculated','Total credits',{formula:{op:'majorCredits',a:'major'}});bind('credits','CREDITS');
    add('visa','date','Visa expiry',{autofill:'visaExpiry',format:'enShort'});bind('visa','VISA_DATE');
    add('passportDate','date','Passport expiry',{autofill:'passportExpiry',format:'enShort'});bind('passportDate','PASSPORT_DATE');
    add('extend','calculated','Extend until',{formula:{op:'addMonths',a:'visa',amount:6,cap:'passportDate'},format:'enShort'});bind('extend','EXTEND_DATE');
    add('studentId','text','Student ID',{autofill:'studentId'});bind('studentId','STUDENT_ID');
    add('requiredCredits','number','Student total credits',{autofill:'totalCredits'});add('achievedCredits','number','Student completed credits',{autofill:'registeredCredits'});
    add('gradYear','calculated','Graduate year',{formula:{op:'idYear',a:'studentId',idStart:1,idLength:2,baseYear:2500,duration:4},format:'yearCE'});bind('gradYear','GRAD_YEAR');
    add('signer','signatory','Signature',{defaultValue:'somyot',format:'nameEn'});bind('signer','SIGNER_NAME');bind('signer','SIGNER_ROLE','roleEn');bind('signer','SIGNER_NAME','','word/footer1.xml');
    add('include','select','Include note',{defaultValue:'no',options:[{value:'no',label:'No'},{value:'yes',label:'Yes'}]});
    add('extra','text','Optional note');const conditional=bind('extra','OPTIONAL_VALUE');v.conditions.push({part:conditional.part,paragraph:conditional.index,fieldId:'include',op:'equals',value:'yes'});
    add('block','block','Approved text',{blockId:'block_approved'});bind('block','BLOCK_TEXT');
    add('passport','text','Passport number',{autofill:'passportNo'});bind('passport','PASSPORT_NUMBER');
    v.tableColumns=[date.id,'studentId',name.id,'','passport','passportDate','','visa','extend'];
    pack.blocks=[{id:'block_approved',name:'Approved paragraph',text:'Approved reusable wording.\nSecond line of approved wording.'}];
    pack.template.name='Advanced student letter';E.validateConfig(v);return pack;
  },setup);
  const importFile={name:'Advanced.buletter',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(advanced))};
  await page.locator('#clImportFile').setInputFiles(importFile);await page.getByRole('heading',{name:'Advanced student letter',exact:true}).waitFor();await idle();
  await act('newCase');await page.locator('#clLocalStudent').selectOption('custom-local-student');
  const value=id=>page.locator('[data-cl-value="'+id+'"]');
  const savedAdvanced=await stored(),template=savedAdvanced.templates.at(-1),version=template.versions[0],sign=version.fields.find(f=>f.label==='Sign date'),nameField=version.fields.find(f=>f.label==='Full name');
  await page.evaluate(student=>window.dispatchEvent(new CustomEvent('buic-student-memory-selected',{detail:{
    student:{full_name:'MISS EXAMPLE STUDENT',student_id:'1690123456',nationality_th:'จีน',extra_data:{birthDate:'2000-11-15'}},
    passport:{passport_number:'QA123456',expiry_date:'2027-05-20'},
    academic:{major_en:student.program.programEnglish.toLowerCase(),faculty_en:student.program.facultyEnglish,required_credits:129,achieved_credits:18},
    visa:{visa_expiry_date:'2027-01-31'}
  }})),student);
  assert.equal(await page.locator('#studentModal').isVisible(),false,'Student DB selection must stay in the custom form');
  await value(sign.id).fill('2026-11-14');
  assert.equal(await value(nameField.id).inputValue(),'Miss EXAMPLE STUDENT');
  assert.equal(await page.locator('[data-cl-computed="age"]').innerText(),'25');
  assert.equal(await page.locator('[data-cl-computed="extend"]').innerText(),'May 20, 2027');
  assert.equal(await page.locator('[data-cl-computed="gradYear"]').innerText(),'2030');
  assert.equal(await value('major').inputValue(),student.program.key);
  assert.equal(await value('requiredCredits').inputValue(),'129');assert.equal(await value('achievedCredits').inputValue(),'18');
  assert.match(await page.locator('#clFormStatus').innerText(),/Ready to preview/);
  await page.waitForFunction(()=>!document.querySelector('#clDocument').textContent.includes('Conditional note'));
  await value('include').selectOption('yes');assert.match(await page.locator('[data-cl-error="extra"]').innerText(),/Fill in/);
  await act('nextMissing');assert.equal(await value('extra').evaluate(el=>el===document.activeElement),true);
  await value('extra').fill('Only included when requested.');await value('include').selectOption('no');
  await page.locator('[data-cl-override="age"]').check();await value('age').fill('30');
  assert.match(await page.locator('#clDocument').innerText(),/Age/);await act('resetOverride');assert.equal(await page.locator('[data-cl-computed="age"]').innerText(),'25');
  const originalFaculty=student.program.facultyEnglish,otherFaculty=await value('faculty').locator('option').evaluateAll(options=>options.find(o=>o.value&&o.value!==options.find(o=>o.selected)?.value)?.value);
  if(otherFaculty){await value('faculty').selectOption(otherFaculty);assert.equal(await value('major').inputValue(),'');await value('faculty').selectOption(originalFaculty);await value('major').selectOption(student.program.key);}
  await page.screenshot({path:'test-results/custom-letter-form-desktop.png',fullPage:true});
  const generated=await capture(()=>act('generateCase'));await fs.writeFile('test-results/custom-letter-generated.docx',generated.bytes);
  const output=await parseDoc(generated.bytes);
  assert(output.texts.some(t=>t.includes('Miss Example Student has Chinese nationality. Thai nationality: จีน.')));
  assert(output.texts.some(t=>t.includes('Birth Nov 15, 2000. Age 25.')));
  assert(output.texts.some(t=>t.includes('Extend until May 20, 2027')));
  assert(output.texts.some(t=>t.includes('Expected graduation 2030.')));
  assert(output.texts.some(t=>t==='Passport QA123456'));
  assert(output.texts.some(t=>t==='Unchanged table note'));
  assert(output.texts.some(t=>t==='Custom letter Miss Example Student'));
  assert(output.texts.some(t=>t==='Approved Asst. Prof. Somyot Wattanakamolchai, Ph.D.'));
  assert.equal(output.texts.some(t=>t.includes('Conditional note')),false);
  assert(output.parts['word/document.xml'].includes('<w:br'));
  assert(output.parts['word/document.xml'].includes('<w:tblBorders>'));
  assert.equal(output.parts['word/document.xml'].includes('<w:fldSimple'),false,'mapped Word fields must not recalculate over the filled value');
  assert.equal(output.parts['word/footer1.xml'].includes('MERGEFIELD'),false,'mapped complex fields become static output');
  assert.equal(output.parts['word/_rels/document.xml.rels'],sample.parts['word/_rels/document.xml.rels']);
  assert.deepEqual(output.image,sample.image);
  const afterGeneration=await stored();assert.equal(afterGeneration.cases.length,1);assert.equal(afterGeneration.cases[0].prints.length,1);
  console.log('PASS student autofill, honorifics, calculations, passport cap, faculty filtering, overrides, conditional paragraph, block and signatory output');

  const firstCaseId=afterGeneration.cases[0].id;
  await act('closeEditor');
  await act('editTemplate');
  await page.locator('[data-cl-action="selectField"]').filter({hasText:'Full name'}).click();await fieldControl('format').selectOption('upper');
  await act('saveTemplate');
  const updated=await stored();assert.equal(updated.templates.at(-1).versions.length,2);assert.equal(updated.cases[0].versionId,version.id);
  const historical=await capture(()=>act('downloadSnapshot'));
  const historicalOutput=await parseDoc(historical.bytes);assert.deepEqual(historicalOutput.texts,output.texts);
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-view="custom"]').click();await page.locator('.cl-template-item').filter({hasText:'Advanced student letter'}).click();
  await page.locator('[data-cl-action="openCase"][data-id="'+firstCaseId+'"]').click();await value(nameField.id).waitFor();assert.equal(await value(nameField.id).inputValue(),'Miss EXAMPLE STUDENT');
  await act('closeEditor');
  const last=await capture(()=>act('downloadSnapshot'));assert.deepEqual((await parseDoc(last.bytes)).texts,output.texts);
  console.log('PASS immutable template versions, exact saved Word reproduction, and IndexedDB reload');

  await page.locator('#clSelectAllCases').check();await act('caseTable');await page.locator('#clTableModal[open]').waitFor();
  const headers=['Sign date','Student ID','Full name','(blank)','Passport number','Passport expiry','(blank)','Visa expiry','Extend until'];
  assert.deepEqual(await page.locator('#clTableModal th').allTextContents(),headers);
  assert.equal(await page.locator('[data-cl-table-col="0"]').inputValue(),'Nov 14, 2026');
  assert.equal(await page.locator('[data-cl-table-col="2"]').inputValue(),'Miss Example Student');
  await page.locator('[data-cl-table-col="4"]').fill('TABLE-ONLY');
  await act('copyTable');
  const expected=['Nov 14, 2026','1690123456','Miss Example Student','','TABLE-ONLY','May 20, 2027','','Jan 31, 2027','May 20, 2027'];
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),expected.join('\t'));
  await page.evaluate(()=>{window.__realClipboard=navigator.clipboard;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('Clipboard blocked');}}});});
  await act('copyTable');assert.equal(await page.locator('#clTableFallback').inputValue(),expected.join('\t'));
  assert.equal(await page.locator('#clTableFallback').evaluate(el=>el===document.activeElement&&el.selectionEnd-el.selectionStart===el.value.length),true);
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:window.__realClipboard}));
  const workbook=await capture(()=>act('downloadTable'));
  const matrix=await page.evaluate(async base64=>{const files=await ZipLite.readZip(CustomLetterEngine.base64ToBytes(base64)),doc=CustomLetterEngine.parseXml(new TextDecoder().decode(files.get('xl/worksheets/sheet1.xml').data));return [...doc.getElementsByTagNameNS('*','row')].map(row=>[...row.getElementsByTagNameNS('*','c')].map(cell=>cell.textContent));},workbook.bytes.toString('base64'));
  assert.deepEqual(matrix,[headers,expected]);assert.equal((await stored()).cases[0].values.passport,'QA123456');
  await act('closeTable');const batch=await capture(()=>act('batchWord'));
  const batchCount=await page.evaluate(async base64=>(await ZipLite.readZip(CustomLetterEngine.base64ToBytes(base64))).size,batch.bytes.toString('base64'));assert.equal(batchCount,1);
  console.log('PASS configurable blank Excel columns, editable rows, clipboard, XLSX and batch Word ZIP');

  // A failed local save must retain the current form and must not duplicate a case on retry.
  await act('newCase');await page.locator('#clCaseLabel').fill('Retry case');await value('passport').fill('RETRY123');
  await page.evaluate(()=>{const original=VisaDB.setState;VisaDB.setState=async(key,value)=>{if(key==='custom_letters_v1'){VisaDB.setState=original;throw Error('Synthetic storage failure');}return original(key,value);};});
  await act('saveCase');assert.match(await page.locator('#clStatus').innerText(),/Synthetic storage failure/);assert.equal(await value('passport').inputValue(),'RETRY123');
  assert.equal((await stored()).cases.length,1);await act('saveCase');assert.equal((await stored()).cases.length,2);
  await act('closeEditor');
  const backup=await capture(()=>act('backup')),backupData=JSON.parse(backup.bytes);assert.equal(backupData.data.cases.length,2);
  const beforeBadImport=await stored();await page.locator('#clImportFile').setInputFiles({name:'bad.buletter',mimeType:'application/json',buffer:Buffer.from('{"format":"wrong"}')});
  await page.waitForFunction(()=>document.getElementById('clStatus').textContent.includes('Choose a custom letter setup'));assert.deepEqual(await stored(),beforeBadImport);
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#clRestoreFile').setInputFiles({name:'backup.buletters',mimeType:'application/json',buffer:backup.bytes});
  await page.waitForFunction(()=>document.getElementById('clStatus').textContent.includes('backup restored'));
  assert.deepEqual((await stored()).cases,backupData.data.cases);
  console.log('PASS storage failure recovery, no duplicate cases, validated import and full backup restore');

  // Wording can be changed without discarding the reusable field definitions.
  await act('editTemplate');await act('editSource');
  await page.locator('#clBlankText').fill('New wording for EXAMPLE STUDENT.');
  page.once('dialog',dialog=>dialog.accept());await act('useBlank');
  assert.equal(await page.locator('[data-cl-action="selectField"]').count(),version.fields.length);
  assert.match(await page.locator('#clDocument').innerText(),/New wording for EXAMPLE STUDENT/);
  await act('saveTemplate');assert.equal((await stored()).templates.at(-1).versions.length,3);
  const earlier=await capture(()=>act('downloadSnapshot'));assert.deepEqual((await parseDoc(earlier.bytes)).texts,output.texts);
  await page.locator('#clVersionChoice').selectOption(version.id);await act('editTemplate');
  assert.match(await page.locator('#clDocument').innerText(),/Custom student letter/);
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.getElementById('sidebar').getBoundingClientRect().right<=0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.screenshot({path:'test-results/custom-letter-builder-mobile.png',fullPage:true});
  await page.setViewportSize({width:1600,height:1050});await page.screenshot({path:'test-results/custom-letter-builder-desktop.png',fullPage:true});
  await act('closeEditor');
  await act('newTemplate');await page.locator('#clWriteSource>summary').click();
  await page.locator('#clBlankText').fill('Student EXAMPLE STUDENT. Copy EXAMPLE STUDENT. Passport PASS_NO. Date SIGN_DATE.');
  await act('useBlank');
  assert.match(await page.locator('.cl-steps [aria-current="step"]').innerText(),/Add your fields/);
  await select('EXAMPLE STUDENT');await page.locator('[data-cl-action="quickField"][data-preset="name"]').click();await idle();
  assert.equal(await fieldControl('label').inputValue(),'Full name');
  assert.equal(await fieldControl('autofill').inputValue(),'fullName');
  assert.equal(await fieldControl('format').inputValue(),'title');
  await select('EXAMPLE STUDENT',1);await page.locator('[data-cl-action="quickField"][data-preset="name"]').click();await idle();
  assert.equal(await page.locator('[data-cl-action="selectField"]').count(),1,'repeated shortcuts must reuse one field');
  assert.equal(await page.locator('#clDocument mark').count(),2);
  await page.evaluate(()=>window.getSelection().removeAllRanges());
  await page.locator('#clDocument mark').first().click();
  assert.equal(await fieldControl('label').isVisible(),true);
  const order=await page.evaluate(()=>document.getElementById('clFieldSettings').compareDocumentPosition(document.getElementById('clAllFields'))&Node.DOCUMENT_POSITION_FOLLOWING);
  assert(order,'selected field settings come before the all-fields list');
  await select('SIGN_DATE');await page.locator('[data-cl-action="quickField"][data-preset="date"]').click();await idle();
  assert.equal(await fieldControl('type').inputValue(),'date');
  assert.equal(await fieldControl('autofill').inputValue(),'signDate');
  assert((await fieldControl('format').locator('option').count())<=7,'only relevant date formats are shown');
  assert.equal(await fieldControl('format').locator('option[value="nationalityThai"]').count(),0);
  await select('PASS_NO');await page.locator('[data-cl-action="quickField"][data-preset="passport"]').click();await idle();
  assert.match(await page.locator('#clMappingCount').innerText(),/3 fields · 4 linked places/);
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:'test-results/custom-letter-guided-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.getElementById('sidebar').getBoundingClientRect().right<=0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:'test-results/custom-letter-guided-mobile.png',fullPage:true});
  page.once('dialog',dialog=>dialog.accept());await act('closeEditor');
  console.log('PASS guided steps, one-click field shortcuts, repeated-field reuse, click-to-edit, focused settings and mobile layout');
  assert.deepEqual(hubWrites,[],'custom letter work does not upload student information');
  assert.deepEqual(errors,[]);
  console.log('PASS editable source, earlier-version selection, responsive layout, and browser-local operation');
  await ctx.close();
}finally{await browser.close();}
