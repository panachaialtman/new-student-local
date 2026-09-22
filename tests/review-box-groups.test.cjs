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
const html=fs.readFileSync('index.html','utf8');
assert(/\.case-row\s*\{[^}]*grid-template-columns: 56px/.test(css),
  'Desktop row reserves a full 56px clickable selector rail');
assert(/\.case-row\s*\{[^}]*column-gap: 16px/.test(css),
  'Student text is separated from the colored selector by a 16px gap');
assert(/\.case-select-rail\s*\{[^}]*align-self:stretch/.test(css),
  'The numbered selector fills the row height');
assert(/\.case-select-rail\[aria-pressed="true"\]/.test(css),
  'Selection has visible pressed styling');
assert(!html.includes('type="checkbox" id="selectAll"'),
  'No select-all checkbox remains in the header');
assert(html.includes('id="editGroupAssignBtn"') && html.includes('id="groupAssignModal"') &&
  html.includes('id="saveGroupAssignBtn"'),
  'The dedicated batch group editor must be present');
console.log('Numbered rail spacing, select-all button, and dedicated group editor UI checks passed.');

const app=fs.readFileSync('app.js','utf8');
const needle="  boot();\n})();";
assert(app.endsWith(needle+'\n')||app.endsWith(needle));
const appContext={window:{},document:{},console,Date,Math,Set,Map,Intl,Number,String,Array,RegExp};
vm.runInNewContext(app.replace(needle,
  "  window.__groupTest={state,caseLabels,labelForCase,caseGroupNumber,caseGroupSelectLabel,filteredCases};\n})();"),appContext);
const {state,caseLabels,labelForCase,caseGroupNumber,caseGroupSelectLabel,filteredCases}=appContext.window.__groupTest;
state.settings.caseLabels=[
 {id:'label_blue_1234',name:'Waiting for document',color:'#2563eb'},
 {id:'label_red_1234',name:'Urgent',color:'#be3a46'}];
state.cases=[
 {id:'case_1',fullName:'Sample One',caseCategory:'normal',labelId:'label_blue_1234'},
 {id:'case_2',fullName:'Sample Two',caseCategory:'normal',labelId:''},
 {id:'case_3',fullName:'Sample Three',caseCategory:'exchange',labelId:'label_red_1234'}];
assert.equal(caseLabels().length,2);
assert.equal(labelForCase(state.cases[0]).name,'Waiting for document');
assert.equal(caseGroupNumber(state.cases[0]),'1');
assert.equal(caseGroupNumber(state.cases[2]),'2');
assert.equal(caseGroupNumber(state.cases[1]),'—');
state.selected.add('case_1');
assert(caseGroupSelectLabel(state.cases[0],true).startsWith('Deselect Sample One. Group 1'));
assert(app.includes('data-case-select aria-pressed=') &&
  !app.includes('class="case-check"') && !app.includes('data-case-group'),
  'Case rows must use a numbered selection button rather than checkbox and inline group picker');
assert(app.includes("editableSelect('Case group', 'labelId'") &&
  app.includes('groupAssignmentIds=[]') && app.includes('state.selected.clear();'),
  'Single-case Edit and bulk group reassignment must both be wired');

state.activeCategory='normal';state.activeLabelId='label_blue_1234';
assert.deepEqual(Array.from(filteredCases(),x=>x.id),['case_1']);
state.activeLabelId='unlabeled';assert.deepEqual(Array.from(filteredCases(),x=>x.id),['case_2']);
state.activeLabelId='all';assert.equal(filteredCases().length,2);
console.log('Case grouping tests passed (local labels, category isolation, color and Unlabeled filtering).');
