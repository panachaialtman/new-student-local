import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const errors=[],hubWrites=[];
await fs.mkdir('test-results',{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,serviceWorkers:'block'});
 await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:'http://127.0.0.1:8124'});
 await context.route('https://buic-central-hub.vercel.app/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(!['GET','HEAD','OPTIONS'].includes(req.method()))hubWrites.push(path);
  if(path==='/api/staff/session')return route.fulfill({json:{ok:true,staff:{id:'department-test',username:'department-test'}}});
  return route.fulfill({status:503,json:{detail:'Isolated test'}});
 });
 await context.addInitScript(()=>{
  sessionStorage.setItem('buic-student-memory-staff-token-v1','department-qa-token');
  const native=URL.createObjectURL.bind(URL);window.__qaDownloads=[];
  URL.createObjectURL=blob=>{window.__qaDownloads.push(blob);return native(blob);};
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8124/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.BUICWorkspaceAuth?.isAuthenticated()&&window.VisaDB);
 await page.evaluate(async()=>{
  await VisaDB.setState('workspace_v02',{cases:[
   {id:'dept-first',caseCategory:'normal',createdAt:'2026-10-01T00:00:00Z',documentNo:'1001',studentId:'1690123456',title:'MR',fullName:'MR. Sample Student',passportNo:'AA1234',passportExpiry:'2029-09-08',currentStayUntil:'2027-01-01',programType:'international'},
   {id:'dept-second',caseCategory:'normal',createdAt:'2026-10-02T00:00:00Z',documentNo:'1002',studentId:'1690234567',title:'MS',fullName:'Second Student',passportNo:'BB5678',passportExpiry:'2030-01-03',currentStayUntil:'2027-02-01',programType:'international',recipientLocation:'Not an embassy city'}
  ],drafts:[],letterCases:[],settings:{},batches:[
   {outputType:'letters',category:'normal',issueDate:'2026-11-05',createdAt:'2026-11-05T08:00:00Z',students:[{studentId:'1690123456',documentNo:'1001',fullName:'Sample Student'}]},
   {outputType:'student_list',category:'normal',issueDate:'2026-11-06',createdAt:'2026-11-06T08:00:00Z',students:[{studentId:'1690123456',documentNo:'1001'}]},
   {outputType:'letters',category:'normal',issueDate:'2026-12-30',createdAt:'2026-12-30T08:00:00Z',students:[{studentId:'someone else',documentNo:'1002'}]}
  ]});
 });
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-case-id="dept-first"]').waitFor();
 await page.locator('#selectAll').click();await page.locator('#departmentTableBtn').click();
 await page.locator('#departmentModal').waitFor({state:'visible'});
 const expectedHeaders=['Document date','Student ID','Full name (first + last)','(blank)','Passport number','Passport Expiry','Embassy place'];
 assert.deepEqual(await page.locator('.department-table th').allTextContents(),expectedHeaders);
 const field=(id,name)=>page.locator(`[data-department-id="${id}"][data-department-field="${name}"]`);
 assert.equal(await field('dept-first','documentDate').inputValue(),'2026-11-05','date comes from the latest matching letter');
 assert.equal(await field('dept-first','fullName').inputValue(),'Sample Student');
 assert.equal(await field('dept-second','embassyPlace').inputValue(),'','student location is not an embassy city');
 const today=await page.evaluate(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;});
 assert.equal(await field('dept-second','documentDate').inputValue(),today,'unknown letter dates default to today');
 assert.equal(await page.locator('.department-table tbody tr').count(),2);
 assert.equal(await page.locator('.department-table tbody tr').first().locator('td').nth(3).innerText(),'');
 await field('dept-first','embassyPlace').fill('Ho Chi Minh City');
 await field('dept-second','documentDate').fill('2026-11-06');
 await field('dept-second','passportExpiry').fill('');
 await field('dept-second','fullName').fill('=Sample Student B');
 const expected='Nov 5, 2026\t1690123456\tSample Student\t\tAA1234\tSep 8, 2029\tHo Chi Minh City\nNov 6, 2026\t1690234567\t\'=Sample Student B\t\tBB5678\t\t';
 await page.locator('#copyDepartmentBtn').click();
 await page.waitForFunction(()=>document.querySelector('#departmentCopyStatus')?.textContent.startsWith('Rows copied'));
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),expected);
 await page.screenshot({path:'test-results/department-table-desktop.png',fullPage:true});
 const downloadPromise=page.waitForEvent('download');await page.locator('#downloadDepartmentBtn').click();
 const download=await downloadPromise;assert(download.suggestedFilename().endsWith('.xlsx'));
 const matrix=await page.evaluate(async()=>{
  const blob=window.__qaDownloads.at(-1),files=await ZipLite.readZip(await blob.arrayBuffer());
  const xml=new DOMParser().parseFromString(new TextDecoder().decode(files.get('xl/worksheets/sheet1.xml').data),'application/xml');
  return [...xml.getElementsByTagNameNS('*','row')].map(row=>[...row.getElementsByTagNameNS('*','c')].map(cell=>cell.textContent));
 });
 assert.deepEqual(matrix,[expectedHeaders,['Nov 5, 2026','1690123456','Sample Student','','AA1234','Sep 8, 2029','Ho Chi Minh City'],['Nov 6, 2026','1690234567','=Sample Student B','','BB5678','','']]);
 const stored=await page.evaluate(()=>VisaDB.getState('workspace_v02'));
 assert.equal(stored.cases.find(c=>c.id==='dept-second').fullName,'Second Student','table edits must not alter case records');
 assert.equal(stored.cases.find(c=>c.id==='dept-second').passportExpiry,'2030-01-03');
 console.log('PASS seven columns, editable rows, safe clipboard, and matching Excel workbook');
 await page.evaluate(()=>{
  window.__originalClipboard=navigator.clipboard;window.__originalCopy=document.execCommand;
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('blocked');}}});document.execCommand=()=>false;
 });
 await page.locator('#copyDepartmentBtn').click();
 assert.equal(await page.locator('#departmentCopyFallback').isVisible(),true);
 assert.equal(await page.locator('#departmentCopyText').inputValue(),expected);
 assert.equal(await page.locator('#departmentCopyText').evaluate(el=>el.selectionEnd-el.selectionStart),expected.length);
 await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:window.__originalClipboard});document.execCommand=window.__originalCopy;});
 await page.locator('#departmentModal [data-close="departmentModal"]').first().click();
 await page.locator('#departmentTableBtn').click();assert.equal(await field('dept-first','embassyPlace').inputValue(),'Ho Chi Minh City');
 console.log('PASS clipboard fallback and table-only edits survive reopening');
 await page.setViewportSize({width:390,height:844});
 const mobile=await page.locator('.department-table-wrap').evaluate(el=>({scroll:el.scrollWidth>el.clientWidth,fit:document.documentElement.scrollWidth<=innerWidth+1}));
 assert.deepEqual(mobile,{scroll:true,fit:true});
 await page.screenshot({path:'test-results/department-table-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('#departmentModal [data-close="departmentModal"]').first().click();
 await page.evaluate(()=>{const iframe=document.createElement('iframe');iframe.id='qaEmbedded';iframe.src='/?embedded-qa=1';iframe.allow='clipboard-read; clipboard-write';iframe.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:100000';document.body.appendChild(iframe);});
 const frame=page.frameLocator('#qaEmbedded');
 await frame.locator('[data-case-id="dept-first"]').waitFor();await frame.locator('#selectAll').click();await frame.locator('#departmentTableBtn').click();
 assert.deepEqual(await frame.locator('.department-table th').allTextContents(),expectedHeaders);
 assert.equal(await frame.locator('[data-department-id="dept-first"][data-department-field="documentDate"]').inputValue(),'2026-11-05');
 await frame.locator('[data-department-id="dept-first"][data-department-field="embassyPlace"]').fill('Yangon');
 await frame.locator('#copyDepartmentBtn').click();
 await frame.locator('#departmentCopyStatus').waitFor({state:'visible'});
 assert((await page.evaluate(()=>navigator.clipboard.readText())).startsWith('Nov 5, 2026\t1690123456\tSample Student\t\tAA1234\tSep 8, 2029\tYangon'));
 assert.deepEqual(hubWrites,[],'test must not send student writes to the Hub');assert.deepEqual(errors,[]);
 console.log('PASS mobile layout and embedded Current Letter workspace');
 await context.close();
}finally{await browser.close();}
