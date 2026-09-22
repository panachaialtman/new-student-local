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
  "\n  window.__reviewTest={reviewerBoxDrawing,insertReviewerBox,pageBreakBeforeFirstParagraph,addReviewerBoxToFiles,listTableGrid,topLeftListCell,titleCase,formattedTitle,listCellWidth};"),
  wordContext);
const fn=wordContext.window.__reviewTest;
const paragraph='<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:t>Example letter</w:t></w:r></w:p>';
const xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+
  paragraph+'<w:sectPr/></w:body></w:document>';
const withBox=fn.insertReviewerBox(xml,['หน.บน.','ผศ.ดร.ธรรญธร','อ.เนาวกานต์']);
assert(withBox.includes('id="BUIC_review_box"'));
assert(withBox.includes('margin-left:393pt;margin-top:19pt'));
assert(withBox.includes('width:196pt;height:82pt'),
  'Floating textbox must allow extra room for its outer right/bottom table borders');
assert(withBox.includes('<w:tblW w:w="3600" w:type="dxa"/><w:tblLayout w:type="fixed"/>'),
  'Visible reviewer table stays 180 pt wide and uses fixed columns');
assert(!withBox.includes('width:180pt;height:66pt'),
  'Do not size the floating textbox exactly to its visible table');
assert.equal((withBox.match(/<w:tr>/g)||[]).length,3);
assert.equal((withBox.match(/<w:tc>/g)||[]).length,6);
assert.equal((withBox.match(/<w:t xml:space="preserve"> [^<]+<\/w:t>/g)||[]).length,3,
  'Only the three populated first-column cells receive one preserved leading space');
assert.equal((withBox.match(/<w:t xml:space="preserve"><\/w:t>/g)||[]).length,3,
  'All blank second-column cells stay blank');
assert(!withBox.includes('<w:t xml:space="preserve">  '),'No double leading spaces');

assert.equal((withBox.match(/<w:t xml:space="preserve"> หน.บน.<\/w:t>/g)||[]).length,1);
assert.equal((withBox.match(/<w:sz w:val="36"\/><w:szCs w:val="36"\/>/g)||[]).length,6,
  'All six cells must use 18 pt for both Western and Thai text');
assert.equal((withBox.match(/<w:vAlign w:val="center"\/>/g)||[]).length,6,
  'Every reviewer cell must be vertically centered');
assert.equal((withBox.match(/<w:jc w:val="left"\/>/g)||[]).length -
  (xml.match(/<w:jc w:val="left"\/>/g)||[]).length,6,
  'Every reviewer paragraph must be left aligned');
assert.equal((withBox.match(/w:lineRule="auto"/g)||[]).length,6,
  'Automatic line spacing avoids clipping 18 pt text');

assert.equal(fn.insertReviewerBox(withBox,['หน.บน.']),withBox,'No duplicate anchor');
assert.throws(()=>fn.insertReviewerBox(xml,['Too long reviewer label more than twenty eight chars']),/shorten/i);
const firstPara=withBox.slice(withBox.indexOf('<w:p>'),withBox.indexOf('<w:sectPr/>'));
const next=fn.pageBreakBeforeFirstParagraph(firstPara);
assert(next.indexOf('<w:pageBreakBefore/>')<next.indexOf('BUIC_review_box'),'New page break must stay OUTSIDE the anchored review table');
const example=new Map([['word/document.xml',{name:'word/document.xml',data:new TextEncoder().encode(xml)}]]);
fn.addReviewerBoxToFiles(example,{reviewBox:true,columnNames:['First','Second','Third']});
const updated=new TextDecoder().decode(example.get('word/document.xml').data);
assert(updated.includes('<w:t xml:space="preserve"> First</w:t>')&&updated.includes('<w:t xml:space="preserve"> Third</w:t>'));
const disabled=new Map([['word/document.xml',{name:'word/document.xml',data:new TextEncoder().encode(xml)}]]);
fn.addReviewerBoxToFiles(disabled,{reviewBox:false,columnNames:['First']});
assert.equal(new TextDecoder().decode(disabled.get('word/document.xml').data),xml);
console.log('Word reviewer-box tests passed (position, rows, labels, page break, opt-out).');

// Student List must reproduce the approved wide, centered Word-table layout.
// Use synthetic XML here; do not put the user's sample student data in GitHub.
const templateTable='<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/>'+
  '<w:jc w:val="left"/></w:tblPr>'+
  '<w:tblGrid><w:gridCol w:w="100"/><w:gridCol w:w="200"/>'+
  '<w:gridCol w:w="300"/><w:gridCol w:w="400"/>'+
  '<w:gridCol w:w="200"/><w:gridCol w:w="200"/></w:tblGrid></w:tbl>';
const layout=fn.listTableGrid(templateTable,3);
assert(layout.table.includes('<w:tblW w:w="10910" w:type="dxa"/>'),
  'Wide reference table uses the reviewed 10910-twip total width');
assert(layout.table.includes('<w:jc w:val="center"/>') &&
  layout.table.includes('<w:tblLayout w:type="fixed"/>'),
  'Wide table must remain centered and not auto-shrink inside page margins');
assert.deepEqual(Array.from(layout.fixed),[680,1375,634,3330],
  'First four student columns must match the supplied approved layout');
assert.equal(layout.extras.reduce((sum,w)=>sum+w,0),4891,
  'Remaining width must be reserved for longer letter-checker columns');
assert.equal(layout.extras.length,3);

// WordprocessingML requires the table/paragraph properties in schema order.
const tableWithoutCenter=templateTable.replace('<w:jc w:val="left"/>',
  '<w:tblLook w:val="04A0"/>');
const ordered=fn.listTableGrid(tableWithoutCenter,3).table;
assert(ordered.indexOf('<w:tblW w:w="10910" w:type="dxa"/>') <
  ordered.indexOf('<w:jc w:val="center"/>') &&
  ordered.indexOf('<w:jc w:val="center"/>') <
  ordered.indexOf('<w:tblLayout w:type="fixed"/>') &&
  ordered.indexOf('<w:tblLayout w:type="fixed"/>') <
  ordered.indexOf('<w:tblLook w:val="04A0"/>'),
  'Word table layout and centering properties must precede tblLook');

const layoutEmpty=fn.listTableGrid(templateTable,0);
assert.equal(layoutEmpty.extras.length,0);
assert(layoutEmpty.table.includes('<w:tblW w:w="6019" w:type="dxa"/>'));
assert.equal(fn.titleCase(fn.formattedTitle('Mr')),'Mr.');
assert.equal(fn.titleCase(fn.formattedTitle('MR.')),'Mr.');
assert.equal(fn.titleCase(fn.formattedTitle('Mrs')),'Mrs.');
const syntheticCell='<w:tc><w:tcPr><w:tcW w:w="100" w:type="dxa"/>'+
  '<w:vAlign w:val="center"/></w:tcPr>'+
  '<w:p><w:pPr><w:jc w:val="center"/></w:pPr>'+
  '<w:r><w:t>TESTER long enough to wrap to another line</w:t></w:r></w:p></w:tc>';
const aligned=fn.topLeftListCell(fn.listCellWidth(syntheticCell,3330));
assert(aligned.includes('<w:tcW w:w="3330" w:type="dxa"/>'));
assert(aligned.includes('<w:vAlign w:val="top"/>') &&
  !aligned.includes('<w:vAlign w:val="center"/>'));
const withRunProperties=syntheticCell.replace('<w:jc w:val="center"/>',
  '<w:rPr><w:sz w:val="32"/></w:rPr>');
const orderedCell=fn.topLeftListCell(withRunProperties);
assert(orderedCell.indexOf('<w:jc w:val="left"/>') <
  orderedCell.indexOf('<w:rPr>'),
  'Left paragraph alignment must precede paragraph run properties');
assert(aligned.includes('<w:jc w:val="left"/>') &&
  !aligned.includes('<w:jc w:val="center"/>'));
assert(aligned.includes('TESTER long enough to wrap to another line'));
console.log('Wide, centered Student List, title punctuation and top-left cell checks passed.');

const css=fs.readFileSync('styles.css','utf8');
const html=fs.readFileSync('index.html','utf8');
assert(/\.toast-stack\s*\{[^}]*top:18px;left:50%;right:auto;bottom:auto;[^}]*transform:translateX\(-50%\)/.test(css),
  'All in-app notifications must appear at viewport top center');
assert(/\.toast\s*\{[^}]*pointer-events:auto/.test(css),
  'Top-center notifications must still support their close button');

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

// Workspace settings are the sole home for administrative reference and backup controls.
const topbar=html.slice(html.indexOf('<header class="topbar">'),html.indexOf('</header>'));
const settings=html.slice(html.indexOf('<section class="view" id="settingsView">'),
  html.indexOf('</section>\n    </main>'));
const casesToolbar=html.slice(html.indexOf('<div class="cases-toolbar'),html.indexOf('<div class="list-header'));
for (const id of ['hubReferenceStatus','refreshHubReferencesBtn','backupBtn','restoreBtn']) {
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,
    id+' must occur once (within Settings, not a duplicate topbar control)');
  assert(settings.includes('id="'+id+'"'),'Moved control '+id+' must live in Settings');
  assert(!topbar.includes('id="'+id+'"'),'Moved control '+id+' must not appear in the topbar');
}
assert(!casesToolbar.includes('manageCaseLabelsBtn'),
  'Manage groups must not appear beside the case-list filters');
assert(settings.includes('<strong>Manage groups</strong>'),
  'Group management must be accessible in the left settings categories');
const categories=['general','groups','documents','data','tools'];
for (const category of categories) {
  assert(settings.includes('data-settings-tab="'+category+'"'));
  assert(settings.includes('data-settings-panel="'+category+'"'));
}
assert((settings.match(/data-settings-tab=/g)||[]).length===5,
  'All five settings categories must be present');
assert(settings.includes('id="addTesterBtn"'),
  'Add Tester is available under Tools & testing');
assert(/\.settings-shell\s*\{[^}]*grid-template-columns:220px/.test(css),
  'Settings should have a left sidebar on desktop');
assert(/\.settings-panel\[hidden\]\s*\{display:none!important/.test(css),
  'Inactive settings panels must be hidden');
console.log('Settings tab layout, control relocation, and Tester UI checks passed.');

const app=fs.readFileSync('app.js','utf8');
assert(app.includes("function switchSettingsTab(tab)")&&
  app.includes("function bindSettingsTabs()")&&app.includes("button.setAttribute('aria-selected'")&&
  app.includes('panel.hidden=!active'),
  'Setting tabs must update their ARIA state and visible panel');
const testerSource=app.slice(app.indexOf('  function addTesterCase() {'),
  app.indexOf('  function switchView(',app.indexOf('  function addTesterCase() {')));
assert(testerSource.includes("isTestCase:true")&&testerSource.includes('TESTER [SAMPLE CASE]')&&
  testerSource.includes('state.cases.push(item)')&&testerSource.includes("persist();")&&
  !testerSource.includes('fetch('),
  'Tester action must create a visibly fictional local case only');
const needle="  boot();\n})();";
assert(app.endsWith(needle+'\n')||app.endsWith(needle));
const appContext={window:{},document:{},console,Date,Math,Set,Map,Intl,Number,String,Array,RegExp};
vm.runInNewContext(app.replace(needle,
  "  window.__groupTest={state,caseLabels,labelForCase,caseGroupNumber,caseGroupSelectLabel,filteredCases,nationalityMatches,nationalityField,nationalitySelectionValid,normalizeDrafts,valuesForSwitchedCaseType,countryOptions};\n})();"),appContext);
const {state,caseLabels,labelForCase,caseGroupNumber,caseGroupSelectLabel,filteredCases,nationalityMatches,nationalityField,nationalitySelectionValid,normalizeDrafts,valuesForSwitchedCaseType,countryOptions}=appContext.window.__groupTest;
// Nationality: search can be English/Thai country or demonym, selected value Thai only.
state.nationalities=[
 {thai:'เมียนมา',english:'Myanmar',aliases:['Burma','พม่า']},
 {thai:'ไทย',english:'Thailand',aliases:[]},
 {thai:'จีน',english:'China',aliases:[]},
 {thai:'เยอรมัน',english:'Germany',countryThai:'เยอรมนี',
  countryOfficialThai:'สหพันธ์สาธารณรัฐเยอรมนี',
  nationalityEnglish:'German',aliases:['Federal Republic of Germany']},
 {thai:'บริติช / อังกฤษ',english:'United Kingdom',countryThai:'สหราชอาณาจักร',
  nationalityEnglish:'British',aliases:['Briton']}
];
for(const query of ['myanmar','Burma','Burmese','พม่า','เมียนมา']){
  assert(nationalityMatches(state.nationalities[0],query),
    query+' must find the Myanmar Thai-nationality option');
}
assert(nationalityMatches(state.nationalities[1],'Thai'));
assert(nationalityMatches(state.nationalities[2],'Chinese'));
for(const term of ['Germany','German','เยอรมนี','เยอรมัน','Federal Republic of Germany']){
 assert(nationalityMatches(state.nationalities[3],term),
  'German country/demonym query '+term+' must return Thai nationality เยอรมัน');
}
for(const term of ['United Kingdom','British','สหราชอาณาจักร','บริติช']){
 assert(nationalityMatches(state.nationalities[4],term),
  'British country/demonym query '+term+' must return Thai nationality บริติช / อังกฤษ');
}
const partnerOptions=countryOptions();
assert(partnerOptions.includes('value="สหพันธ์สาธารณรัฐเยอรมนี"'),
 'Partner country suggestions must use the formal full Thai country name');
assert(!partnerOptions.includes('value="เยอรมนี"') &&
 !partnerOptions.includes('value="เยอรมัน"'),
 'Short country names and nationalities must not become selectable alternatives');
assert(partnerOptions.includes('Germany · เยอรมนี'),
 'Both English and short Thai country names remain visible as search hints');
assert(partnerOptions.includes('value="ไทย"'),
 'Where no longer official Thai name is supplied, use the existing country name');
const bundledNationalities=[1,2,3,4].flatMap(i=>
 JSON.parse(fs.readFileSync('data/nationalities-'+i+'.json','utf8')));
assert.equal(bundledNationalities.length,250);
assert.equal(bundledNationalities.find(item=>item.english==='Germany').countryOfficialThai,
 'สหพันธ์สาธารณรัฐเยอรมนี',
 'The full Thai country label must also work without an online Hub connection');
assert(bundledNationalities.filter(item=>item.countryOfficialThai!==item.thai).length>=150,
 'Bundled official-country names must cover the source-backed formal names');
assert(app.includes("Germany:'เยอรมัน'")&&
  app.includes("'United States':'อเมริกัน'"),
  'Offline fallback must distinguish country names from nationality names');
assert(!nationalityMatches(state.nationalities[0],'Japan'));
const picker=nationalityField('',false);
const editPicker=nationalityField('เมียนมา',true);
assert(picker.includes('data-nationality-input')&&
  picker.includes('role="combobox"')&&picker.includes('name="nationalityThai"'));
assert(editPicker.includes('data-edit-field="nationalityThai"'));
assert(!picker.includes('list="nationalitySuggestions"') &&
  !editPicker.includes('list="nationalitySuggestions"'),
  'Native datalist must not expose selectable English aliases');
function validate(value,confirmed,{existing=false,originalThai=''}={}){
  const input={value,dataset:{confirmedThai:confirmed,originalThai},
    hasAttribute(name){return existing&&name==='data-edit-field';},
    setCustomValidity(message){this.error=message;},
    reportValidity(){this.reported=true;},focus(){this.focused=true;}};
  return {allowed:nationalitySelectionValid({querySelector:()=>input}),input};
}
assert.equal(validate('เมียนมา','เมียนมา').allowed,true);
assert.equal(validate('Burma','').allowed,false);
assert.equal(validate('Myanmar','').allowed,false);
assert.equal(validate('พม่า','').allowed,false,
  'A Thai-language alias must still be explicitly selected as the canonical Thai nationality');
assert.equal(validate('เมียนมา','').allowed,false,
  'Typing is a search action; user confirms a Thai value from suggestions');
assert.equal(validate('เยอรมัน','เยอรมัน').allowed,true);
assert.equal(validate('เยอรมนี','').allowed,false,
 'Thai country name must not be saved as a new nationality');
assert.equal(validate('บริติช / อังกฤษ','บริติช / อังกฤษ').allowed,true);
assert.equal(validate('อังกฤษ','อังกฤษ',{existing:true,originalThai:'อังกฤษ'}).allowed,true,
 'Unchanged Thai-language legacy student records must remain editable');
assert.equal(validate('England','England',{existing:true,originalThai:'England'}).allowed,false,
 'An English legacy value cannot be accepted as a new confirmed Thai nationality');
assert(app.includes('if(!nationalitySelectionValid(form))return;')&&
  app.includes("if(!nationalitySelectionValid(el('drawerContent')))return;"),
  'Both add and edit workflows must reject unconfirmed search text');
console.log('Thai-only nationality picker tests passed (Thai/English search, canonical selection, both forms).');

// Drafts are a distinct browser-local collection; incomplete entries never
// join active cases or document-generation flows without explicit promotion.
for(const id of ['draftsBtn','draftsCount','saveStudentDraftBtn','draftsModal',
 'draftsList','newFromDraftsBtn']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,
    id+' must occur once in the Drafts UI');
}
assert(html.indexOf('id="draftsBtn"')<html.indexOf('id="addStudentBtn"'),
  'Drafts button must appear beside and before Add student');
assert(html.includes('type="button">Save draft</button>')&&
  html.includes('type="submit" form="studentForm">Add student</button>'),
  'Save draft must bypass required-field validation while Add student keeps it');
assert(app.includes("drafts: state.drafts")&&
  app.includes("state.drafts = normalizeDrafts(stored.drafts)")&&
  app.includes("state.drafts = normalizeDrafts(payload.drafts)"),
  'Drafts must be saved, backed up and restored separately from active cases');
const sampleDraft={id:'draft_example',createdAt:'2026-09-22T08:00:00Z',
 updatedAt:'2026-09-22T08:01:00Z',
 values:{caseCategory:'normal',fullName:'EXAMPLE DRAFT',studentId:''}};
const drafts=normalizeDrafts([sampleDraft,sampleDraft,{id:'case_not_a_draft',values:{}}]);
assert.equal(drafts.length,1);
assert.equal(drafts[0].values.fullName,'EXAMPLE DRAFT');
state.drafts=drafts;
assert.equal(state.cases.length,0,
  'A restored draft must not appear as an active student case');
assert(app.includes("if(state.activeDraftId){")&&
  app.includes("state.drafts=state.drafts.filter(draft=>draft.id!==state.activeDraftId);")&&
  app.includes("renderDraftsButton();"),
  'Only an explicit Add student action promotes and removes the draft');
assert(app.includes("async function saveStudentDraft()")&&
  app.includes("const saved=await persist();")&&
  app.includes("if(!saved){"),
  'Draft-saving confirmation must wait for a successful local database write');
assert(app.includes("function restoreDraftValues(form,values)")&&
  app.includes("form.elements[name]")&&
  app.includes("nationality.dataset.confirmedThai="),
  'Draft reopening must restore partial form values and the Thai nationality picker');
console.log('Local Drafts tests passed (unfinished entry, reopen, isolated storage, backup, explicit promotion).');

// Switching case type must not discard halfway-completed data or show the
// old destructive confirmation. All tests use fictional fields only.
const enteredNormal={
 caseCategory:'normal',documentNo:'TEST-4504',nationalityThai:'อเมริกัน',
 passportNo:'TEST-PASSPORT',fullName:'TEST PERSON',studentId:'',
 registeredCredits:'15',programType:'international',facultyKey:'BU International',
 programKey:'EXAMPLE-MAJOR',totalCredits:'129',passportExpiry:'',currentStayUntil:'',
 requestRuleOverride:'manual',manualRequestUntil:'2027-04-07',
 studyYearOverride:'6',graduationYearOverride:'2568',
 enabledOverrides:{studyYearOverride:true,graduationYearOverride:true},
 currentStudent:true
};
const switchedToExchange=valuesForSwitchedCaseType(enteredNormal,'exchange',{});
assert.equal(switchedToExchange.caseCategory,'exchange');
for(const key of ['documentNo','nationalityThai','passportNo','fullName','studentId',
 'registeredCredits','programType','facultyKey','programKey','totalCredits',
 'manualRequestUntil','studyYearOverride','graduationYearOverride','currentStudent']){
 assert.equal(switchedToExchange[key],enteredNormal[key],
  'Preserve shared student field '+key);
}
const exchangeFilled={...switchedToExchange,exchangeUniversity:'EXAMPLE UNIVERSITY',
 exchangeCountryThai:'ญี่ปุ่น',exchangeAcademicYear:'2569',
 exchangeTerm:'3',exchangeDurationSemesters:'2'};
const snapshots={normal:enteredNormal,exchange:exchangeFilled};
const backToNormal=valuesForSwitchedCaseType(exchangeFilled,'normal',snapshots);
assert.equal(backToNormal.fullName,'TEST PERSON');
assert.equal(backToNormal.registeredCredits,'15');
assert.equal(backToNormal.caseCategory,'normal');
const changedNormal={...backToNormal,fullName:'EDITED TEST PERSON',passportNo:'UPDATED-PASSPORT'};
const returnToExchange=valuesForSwitchedCaseType(changedNormal,'exchange',snapshots);
assert.equal(returnToExchange.fullName,'EDITED TEST PERSON');
assert.equal(returnToExchange.passportNo,'UPDATED-PASSPORT');
for(const key of ['exchangeUniversity','exchangeCountryThai','exchangeAcademicYear',
 'exchangeTerm','exchangeDurationSemesters']){
 assert.equal(returnToExchange[key],exchangeFilled[key],
  'Restore category-specific Exchange detail '+key);
}
const nonO={...returnToExchange,nonOVisaPurpose:'ติดตามธุรกิจ',programDurationYears:'4'};
const backFromNonO=valuesForSwitchedCaseType(nonO,'exchange',
 {normal:changedNormal,exchange:exchangeFilled,non_o:nonO});
assert.equal(backFromNonO.nonOVisaPurpose,'ติดตามธุรกิจ');
assert.equal(backFromNonO.exchangeUniversity,'EXAMPLE UNIVERSITY');
assert(!app.includes('Switching case type will clear the information you entered in this form'),
 'The destructive switch confirmation must be removed');
assert(app.includes('switchEntryCaseType(form,button.dataset.entryCategory,category)'),
 'Case-type buttons must call the non-destructive switch handler');
assert(app.includes('resetEntryCategorySnapshots(draft.values.caseTypeSnapshots)') &&
 app.includes('values.caseTypeSnapshots={...entryCategorySnapshots,'),
 'The remembered type-specific inputs must survive saving and resuming drafts');
console.log('Non-destructive case-type switching tests passed (shared values, category details, draft persistence).');

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
