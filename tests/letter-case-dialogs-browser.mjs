import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

// Isolated local workspace with real IndexedDB and Word generation. Every Hub
// request is intercepted; no credentials or real student writes leave this test.
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const kinds=['cancel','graduated','criminal'];
const forms={cancel:'cancelLetterForm',graduated:'graduatedLetterForm',criminal:'criminalLetterForm'};
const fill={cancel:'cancelTestCase',graduated:'gradFillTest',criminal:'criminalFillTest'};
const generate={cancel:'cancelGenerate',graduated:'gradGenerate',criminal:'criminalGenerate'};
const errors=[],hubWrites=[];
await fs.mkdir('test-results',{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,serviceWorkers:'block'});
 await context.route('https://buic-central-hub.vercel.app/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(!['GET','HEAD','OPTIONS'].includes(request.method()))hubWrites.push(path);
  if(path==='/api/staff/session')return route.fulfill({json:{ok:true,staff:{id:'case-dialog-qa',username:'case-dialog-qa'}}});
  return route.fulfill({status:503,json:{detail:'Isolated QA uses the local reference snapshot'}});
 });
 await context.addInitScript(()=>{
  sessionStorage.setItem('buic-student-memory-staff-token-v1','isolated-case-dialog-token');
  const native=URL.createObjectURL.bind(URL);window.__qaDownloads=[];
  URL.createObjectURL=blob=>{window.__qaDownloads.push(blob);return native(blob);};
 });
 const page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:8124/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.BUICWorkspaceAuth?.isAuthenticated()&&document.getElementById('cancelSaveCase'));
 await page.locator('#emptyState').waitFor({state:'visible'});
 const openView=async kind=>{
  await page.locator(`.nav-item[data-view="${kind}"]`).click();
  await page.locator(`#${kind}View.active`).waitFor();
 };
 const rows=kind=>page.locator(`#${kind}CaseList .letter-case-row`);
 const stored=()=>page.evaluate(()=>VisaDB.getState('workspace_v02'));
 for(const kind of kinds){
  await openView(kind);
  assert.equal(await page.locator(`#${kind}View form`).count(),0);
  assert.equal(await page.locator(`#${kind}View .cancel-workspace`).count(),0);
  assert.equal(await rows(kind).count(),0);
  assert.equal(await page.locator('#addStudentBtn').isVisible(),true);
  assert.equal(await page.locator(`#${kind}LetterModal`).isVisible(),false);
 }
 console.log('PASS all three sections open on empty case lists with Add student');

 // Preserve an existing record created by the preceding version of the app.
 await page.evaluate(async()=>{
  await VisaDB.setState('workspace_v02',{cases:[],batches:[],drafts:[],settings:{},letterCases:[{
   id:'letter_legacy_cancel',kind:'cancel',createdAt:'2026-10-20T08:00:00Z',updatedAt:'2026-10-20T08:00:00Z',lastGeneratedAt:'2026-10-20T08:00:00Z',printCount:2,
   values:{documentNo:'LEGACY01',issueDate:'2026-10-20',fullName:'MR. LEGACY QA STUDENT',passportNo:'LEGACYQA01',nationalityThai:'จีน',reason:'ลาออก',otherReason:'',studentId:'',cancelDate:'2026-10-30',signatory:'somyot'}
  }]});
 });
 await page.reload();await page.waitForFunction(()=>window.BUICWorkspaceAuth?.isAuthenticated());
 await page.locator('#emptyState').waitFor({state:'visible'});
 await openView('cancel');assert.equal(await rows('cancel').count(),1);
 assert.match(await rows('cancel').textContent(),/LEGACY QA STUDENT/);
 assert.equal((await stored()).letterCases[0].printCount,2);
 console.log('PASS an existing saved case and its download history survive the new list page');

 for(const [index,kind] of kinds.entries()){
  const count=kind==='cancel'?2:1;
  await openView(kind);await page.locator('#addStudentBtn').click();
  const modal=page.locator(`#${kind}LetterModal`),form=page.locator('#'+forms[kind]);
  await modal.waitFor({state:'visible'});
  assert.equal(await page.locator('#studentModal').isVisible(),false);
  for(const other of kinds.filter(value=>value!==kind))assert.equal(await page.locator(`#${other}LetterModal`).isVisible(),false);
  await page.locator(`#${kind}SaveCase`).click();
  assert.equal(await modal.isVisible(),true,'incomplete form stays open');
  await page.locator('#'+fill[kind]).click();
  const name=`MR. ${kind.toUpperCase()} QA STUDENT`;
  await form.locator('[name="fullName"]').fill(name);
  await form.locator('[name="passportNo"]').fill('DIALOGQA'+index);
  await page.locator(`#${kind}SaveCase`).click();
  await modal.waitFor({state:'hidden'});assert.equal(await rows(kind).count(),count);
  assert.equal(await page.locator('#modalBackdrop').isVisible(),false);
  const row=rows(kind).filter({hasText:name});
  await row.locator('[data-letter-open]').click();await modal.waitFor({state:'visible'});
  assert.equal(await form.locator('[name="fullName"]').inputValue(),name);
  assert.equal(await page.locator(`#${kind}SaveCase`).textContent(),'Save changes');
  await form.locator('[name="fullName"]').fill(name+' EDITED');
  await page.locator(`#${kind}SaveCase`).click();await modal.waitFor({state:'hidden'});
  assert.equal(await rows(kind).count(),count,'editing must not duplicate the case');
  await rows(kind).filter({hasText:name+' EDITED'}).locator('[data-letter-open]').click();
  await page.evaluate(kind=>{
   const key={cancel:'BUICCancelLetter',graduated:'BUICGraduatedLetter',criminal:'BUICCriminalRecord'}[kind];
   const original=window[key];
   window[key]={...original,create:async fields=>{
    await new Promise(resolve=>{window.__finishWordGeneration=resolve;});
    return original.create(fields);
   }};
  },kind);
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#'+generate[kind]).click();
  await page.waitForFunction(kind=>document.getElementById(kind+'LetterModal').getAttribute('aria-busy')==='true'&&Boolean(window.__finishWordGeneration),kind);
  assert.equal(await form.locator('[name="fullName"]').isDisabled(),true);
  assert.equal(await page.locator(`#${kind}SaveCase`).isDisabled(),true);
  assert.equal(await page.evaluate(()=>document.activeElement.id),kind+'LetterModal');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),kind+'LetterModal','busy dialog keeps focus away from background student controls');
  await page.keyboard.press('Escape');
  assert.equal(await modal.isVisible(),true,'the student cannot change while Word generation is pending');
  await page.evaluate(()=>{window.__finishWordGeneration();delete window.__finishWordGeneration;});
  const download=await downloadPromise;assert(download.suggestedFilename().endsWith('.docx'));
  await modal.waitFor({state:'hidden'});
  await page.waitForFunction(async kind=>{
   const record=await VisaDB.getState('workspace_v02');return record?.letterCases.some(item=>item.kind===kind&&item.values.fullName.endsWith('EDITED')&&item.printCount===1)&&record.batches.length>0;
  },kind);
  if(kind==='criminal'){
   const xml=await page.evaluate(async()=>{
    const doc=window.__qaDownloads.at(-1);const files=await ZipLite.readZip(await doc.arrayBuffer());return new TextDecoder().decode(files.get('word/document.xml').data);
   });
   assert.equal((xml.match(/<w:p(?:\s[^>]*)?>/g)||[]).length,30);
   assert(xml.includes('ศูนย์นานาชาติ')&&!xml.includes('footerReference'));
   assert(xml.includes('MR. CRIMINAL QA STUDENT EDITED'));
  }
  await page.screenshot({path:`test-results/${kind}-case-list.png`,fullPage:true});
  console.log(`PASS ${kind}: add, edit, Word download, local persistence and return to the list`);
 }
 const before=await stored();assert.equal(before.letterCases.length,4);
 await page.locator('#addStudentBtn').click();
 assert.equal(await page.locator('#criminalLetterForm [name="fullName"]').inputValue(),'');
 await page.locator('#criminalName').fill('UNSAVED QA');await page.keyboard.press('Escape');
 assert.equal(await page.locator('#criminalLetterModal').isVisible(),false);
 assert.equal((await stored()).letterCases.length,4,'dismissing a new form must not create a saved case');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'addStudentBtn');

 // A failed local write must keep the populated form available for retry.
 await page.locator('#addStudentBtn').click();await page.locator('#criminalFillTest').click();
 await page.locator('#criminalName').fill('MR. RETRY QA STUDENT');
 await page.evaluate(()=>{const native=VisaDB.setState;VisaDB.setState=async(...args)=>{VisaDB.setState=native;throw Error('Isolated storage failure');};});
 await page.locator('#criminalSaveCase').click();
 await page.locator('#workspacePersistentSaveStatus').waitFor();
 assert.equal(await page.locator('#criminalLetterModal').isVisible(),true);
 await page.locator('#criminalSaveCase').click();await page.locator('#criminalLetterModal').waitFor({state:'hidden'});
 assert.equal((await stored()).letterCases.filter(item=>item.values.fullName==='MR. RETRY QA STUDENT').length,1);
 console.log('PASS failed local saves retain the form and retry without duplicate cases');

 await page.reload();await page.waitForFunction(()=>window.BUICWorkspaceAuth?.isAuthenticated());
 await page.locator('#emptyState').waitFor({state:'visible'});
 await openView('criminal');assert.equal(await rows('criminal').count(),2);
 await page.setViewportSize({width:390,height:844});await page.locator('#addStudentBtn').click();
 const bounds=await page.locator('#criminalLetterModal').boundingBox();
 assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=390&&bounds.y+bounds.height<=844);
 assert.equal(await page.locator('#criminalSaveCase').isVisible(),true);
 assert.equal(await page.locator('#criminalLetterModal').evaluate(node=>node.scrollWidth<=node.clientWidth),true);
 await page.screenshot({path:'test-results/criminal-add-student-mobile.png'});
 await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:1000});

 // Existing Normal and Exchange entry behavior remains separate.
 for(const category of ['normal','exchange']){
  await page.locator(`.nav-item[data-case-category="${category}"]`).click();
  await page.locator('#addStudentBtn').click();
  assert.equal(await page.locator('#studentModal').isVisible(),true);
  await page.locator('#studentModal [data-close="studentModal"]').first().click();
 }
 assert.deepEqual(hubWrites,[],'dedicated letter forms must not upload cases to the Hub');
 assert.deepEqual(errors,[]);
 console.log('PASS mobile dialogs, reload recovery and unchanged Normal/Exchange entry');
 await context.close();
}finally{await browser.close();}
