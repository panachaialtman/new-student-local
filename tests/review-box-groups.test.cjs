/* Regression checks use synthetic identifiers only; never load real student data. */
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {TextEncoder,TextDecoder}=require('node:util');
const word=fs.readFileSync('docx-engine.js','utf8');
const ending="  window.BrowserDocx = { generateIndividual, generateBatch, generateList, formattedTitle };";
assert(word.includes(ending));
const wordContext={window:{},TextEncoder,TextDecoder,Blob,Date,Map,Uint8Array,console};
vm.runInNewContext(word.replace(ending,ending+
  "\n  window.__reviewTest={reviewerBoxDrawing,insertReviewerBox,pageBreakBeforeFirstParagraph,addReviewerBoxToFiles};"),
  wordContext);
const fn=wordContext.window.__reviewTest;
const paragraph='<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:t>Example letter</w:t></w:r></w:p>';
const xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+
  paragraph+'<w:sectPr/></w:body></w:document>';
const withBox=fn.insertReviewerBox(xml,['หน.บน.','ผศ.ดร.ธรรญธร','อ.เนาวกานต์']);
assert(withBox.includes('id="BUIC_review_box"'));
assert(withBox.includes('margin-left:393pt;margin-top:19pt'));
assert.equal((withBox.match(/<w:tr>/g)||[]).length,3);
assert.equal((withBox.match(/<w:tc>/g)||[]).length,6);
assert.equal((withBox.match(/<w:t>หน.บน.<\/w:t>/g)||[]).length,1);
assert.equal((withBox.match(/<w:sz w:val="32"\/><w:szCs w:val="32"\/>/g)||[]).length,6,
  'All six cells must use 16 pt for both Western and Thai text');
assert.equal((withBox.match(/<w:vAlign w:val="center"\/>/g)||[]).length,6,
  'Every reviewer cell must be vertically centered');
assert.equal((withBox.match(/<w:jc w:val="left"\/>/g)||[]).length -
  (xml.match(/<w:jc w:val="left"\/>/g)||[]).length,6,
  'Every reviewer paragraph must be left aligned');
assert.equal((withBox.match(/w:lineRule="auto"/g)||[]).length,6,
  'Automatic line spacing avoids clipping 16 pt text');

assert.equal(fn.insertReviewerBox(withBox,['หน.บน.']),withBox,'No duplicate anchor');
assert.throws(()=>fn.insertReviewerBox(xml,['Too long reviewer label more than twenty eight chars']),/shorten/i);
const firstPara=withBox.slice(withBox.indexOf('<w:p>'),withBox.indexOf('<w:sectPr/>'));
const next=fn.pageBreakBeforeFirstParagraph(firstPara);
assert(next.indexOf('<w:pageBreakBefore/>')<next.indexOf('BUIC_review_box'),'New page break must stay OUTSIDE the anchored review table');
const example=new Map([['word/document.xml',{name:'word/document.xml',data:new TextEncoder().encode(xml)}]]);
fn.addReviewerBoxToFiles(example,{reviewBox:true,columnNames:['First','Second','Third']});
const updated=new TextDecoder().decode(example.get('word/document.xml').data);
assert(updated.includes('<w:t>First</w:t>')&&updated.includes('<w:t>Third</w:t>'));
const disabled=new Map([['word/document.xml',{name:'word/document.xml',data:new TextEncoder().encode(xml)}]]);
fn.addReviewerBoxToFiles(disabled,{reviewBox:false,columnNames:['First']});
assert.equal(new TextDecoder().decode(disabled.get('word/document.xml').data),xml);
console.log('Word reviewer-box tests passed (position, rows, labels, page break, opt-out).');

const css=fs.readFileSync('styles.css','utf8');
assert(/\.case-row\.has-case-label::before\s*\{[^}]*width:54px;/.test(css),
  'Desktop color rail must fill the checkbox column');
assert(/\.case-row\.has-case-label::before\s*\{[^}]*linear-gradient\(to right,[\s\S]*?\s10%,#fff\)/.test(css),
  'Checkbox-area rail must use a subtle 10% group color tint, not a solid block');
assert(/\.case-row\.has-case-label::before\s*\{[^}]*var\(--case-label-color,#94a3b8\) 0 4px/.test(css),
  'Slim saturated 4px accent must still identify the group');
assert(/\.case-row\.has-case-label > :first-child\s*\{[^}]*z-index:1;/.test(css),
  'Checkbox column must sit above the full-width colored band');
assert(/\.case-row\.has-case-label \.case-check\s*\{[^}]*z-index:2;/.test(css),
  'Checkbox remains visible and clickable');
console.log('Case label band geometry and interactive checkbox CSS checks passed.');

const app=fs.readFileSync('app.js','utf8');
const needle="  boot();\n})();";
assert(app.endsWith(needle+'\n')||app.endsWith(needle));
const appContext={window:{},document:{},console,Date,Math,Set,Map,Intl,Number,String,Array,RegExp};
vm.runInNewContext(app.replace(needle,
  "  window.__groupTest={state,caseLabels,labelForCase,filteredCases};\n})();"),appContext);
const {state,caseLabels,labelForCase,filteredCases}=appContext.window.__groupTest;
state.settings.caseLabels=[
 {id:'label_blue_1234',name:'Waiting for document',color:'#2563eb'},
 {id:'label_red_1234',name:'Urgent',color:'#be3a46'}];
state.cases=[
 {id:'case_1',fullName:'Sample One',caseCategory:'normal',labelId:'label_blue_1234'},
 {id:'case_2',fullName:'Sample Two',caseCategory:'normal',labelId:''},
 {id:'case_3',fullName:'Sample Three',caseCategory:'exchange',labelId:'label_red_1234'}];
assert.equal(caseLabels().length,2);
assert.equal(labelForCase(state.cases[0]).name,'Waiting for document');
state.activeCategory='normal';state.activeLabelId='label_blue_1234';
assert.deepEqual(Array.from(filteredCases(),x=>x.id),['case_1']);
state.activeLabelId='unlabeled';assert.deepEqual(Array.from(filteredCases(),x=>x.id),['case_2']);
state.activeLabelId='all';assert.equal(filteredCases().length,2);
console.log('Case grouping tests passed (local labels, category isolation, color and Unlabeled filtering).');
