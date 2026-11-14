(function(){
  'use strict';
  const E=window.CustomLetterEngine,KEY='custom_letters_v1',ROOT=document.getElementById('customLetterRoot');
  if(!E||!ROOT)return;
  const $=id=>document.getElementById(id),esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const clone=E.clone;
  const DEFAULT_SIGNERS=[
    {id:'somyot',label:'Somyot',nameEn:'Asst. Prof. Somyot Wattanakamolchai, Ph.D.',roleEn:'Vice President for International Affairs and Global Education',nameTh:'ผู้ช่วยศาสตราจารย์ ดร. สมยศ วัฒนากมลชัย',roleTh:'รองอธิการบดีสายนานาชาติ ปฏิบัติหน้าที่แทน'},
    {id:'duangthida',label:'Duangthida',nameEn:'',roleEn:'',nameTh:'ผู้ช่วยศาสตราจารย์ ดร. ดวงธิดา นันทาภิรัตน์',roleTh:'ผู้ช่วยอธิการบดีสายนานาชาติ ปฏิบัติหน้าที่แทน'}
  ];
  const FIELDTYPES={text:'Text',textarea:'Long text',number:'Number',date:'Date',select:'Your dropdown',nationality:'Nationality / country',faculty:'Faculty',major:'Major',signatory:'Signatory',calculated:'Calculation',block:'Reusable text block',fixed:'Fixed replacement'};
  const FORMATS={plain:'As entered',title:'Capitalize each word',upper:'UPPERCASE',lower:'lowercase',enShort:'Nov 5, 2026',enLong:'November 5, 2026',enDayMonth:'5 November',thaiDate:'5 พฤศจิกายน 2569',iso:'2026-11-05',yearBE:'Buddhist year',yearCE:'Gregorian year',nationalityEnglish:'Nationality · English',nationalityThai:'Nationality · Thai',countryEnglish:'Country · English',countryThai:'Country · Thai',facultyEnglish:'Faculty · English',facultyThai:'Faculty · Thai',programEnglish:'Major · English',programThai:'Major · Thai',nameEn:'Signatory name · English',nameTh:'Signatory name · Thai',roleEn:'Signatory position · English',roleTh:'Signatory position · Thai'};
  const SOURCES={fullName:'Student name with title',title:'Title',studentId:'Student ID',passportNo:'Passport number',passportExpiry:'Passport expiry',birthDate:'Birth date',visaExpiry:'Visa expiry',signDate:'Today / sign date',totalCredits:'Total credits',registeredCredits:'Registered credits',studyYear:'Study year override',graduationYear:'Graduation year override',nationality:'Nationality record',faculty:'Faculty record',major:'Major record',signatory:'Signatory',documentNo:'Document number',currentStudent:'Current student',exchangeUniversity:'Partner university',programDuration:'Program duration'};
  const CALCS={age:'Age on a date',addMonths:'Add months to a date',addDays:'Add days to a date',idYear:'Year from student ID',studyYear:'Study year from ID',majorCredits:'Credits from selected major',add:'Add numbers',subtract:'Subtract numbers',multiply:'Multiply numbers',minimum:'Smaller number',maximum:'Larger number'};
  const state={db:{schema:1,templates:[],cases:[],blocks:[],signatories:clone(DEFAULT_SIGNERS)},ready:false,loading:null,mode:'list',activeTemplate:null,draft:null,loaded:null,selectedField:null,selection:null,paragraph:null,caseDraft:null,testValues:{},testOverrides:{},selectedCases:new Set(),busy:false,showArchived:false,dirty:false,returnFocus:null};
  function context(){const ctx=window.BUICCustomLetterBridge?.getContext()||{},fallback=window.CustomLetterReferences||[];return {...ctx,nationalities:(ctx.nationalities?.length?ctx.nationalities:fallback).map(row=>{const saved=fallback.find(n=>n.countryEnglish===(row.countryEnglish||row.english))||{};return {...saved,...row,nationalityEnglish:row.nationalityEnglish||saved.nationalityEnglish||''};}),blocks:state.db.blocks,signatories:state.db.signatories,academicYear:String(new Date().getFullYear())};}
  function option(value,label,selected){return '<option value="'+esc(value)+'"'+(String(value)===String(selected)?' selected':'')+'>'+esc(label)+'</option>';}
  function options(object,selected,empty=''){return (empty!==null?option('',empty||'Choose',selected):'')+Object.entries(object).map(([v,l])=>option(v,l,selected)).join('');}
  function button(action,label,kind='',extra=''){return '<button type="button" class="btn '+kind+'" data-cl-action="'+action+'" '+extra+'>'+label+'</button>';}
  function label(text,control){return '<label class="cl-label"><span>'+esc(text)+'</span>'+control+'</label>';}
  function input(id,value='',type='text',extra=''){return '<input id="'+id+'" type="'+type+'" value="'+esc(value)+'" '+extra+'>';}
  function announce(message,error=false){const node=$('clStatus');if(node){node.textContent=message;node.className='cl-status'+(error?' error':'');}else window.alert(message);}
  function status(message,error=false){const node=$('clSaveStatus');if(node){node.textContent=message;node.className='cl-save-status'+(error?' error':'');}}
  function dateStamp(value){return value?new Date(value).toLocaleString():'Never';}
  function activeTemplate(){return state.db.templates.find(t=>t.id===state.activeTemplate);}
  function activeVersion(template=activeTemplate()){return template?.versions.find(v=>v.id===template.activeVersionId)||template?.versions.at(-1);}
  function versionFor(row){return state.db.templates.find(t=>t.id===row.templateId)?.versions.find(v=>v.id===row.versionId);}
  async function load(){
    if(state.ready)return;if(state.loading)return state.loading;
    state.loading=(async()=>{const saved=await VisaDB.getState(KEY);if(saved){if(saved.schema!==1||!Array.isArray(saved.templates)||!Array.isArray(saved.cases))throw Error('Custom letter data could not be opened. Keep a backup and retry.');state.db=saved;state.db.blocks||=[];state.db.signatories||=clone(DEFAULT_SIGNERS);}state.ready=true;state.activeTemplate=state.db.templates.find(t=>!t.archived)?.id||null;})();
    try{await state.loading;}catch(error){state.loading=null;throw error;}
  }
  async function commit(next){await VisaDB.setState(KEY,next);state.db=next;}
  async function open(){try{await load();render();}catch(error){ROOT.innerHTML='<div class="cl-empty"><h2>Custom letters could not open</h2><p>'+esc(error.message)+'</p>'+button('retryLoad','Retry','primary')+'</div>';}}
  function shell(content){ROOT.innerHTML='<div class="cl-shell"><div id="clSaveStatus" class="cl-save-status" role="status"></div>'+content+'<p id="clStatus" class="cl-status" role="status" aria-live="polite"></p><input id="clImportFile" type="file" accept=".buletter,.json,application/json" hidden><input id="clRestoreFile" type="file" accept=".buletters,.json,application/json" hidden></div>';}
  function render(){if(state.mode==='builder'||state.mode==='test')renderBuilder();else if(state.mode==='case')renderCase();else if(state.mode==='library')renderLibrary();else renderList();}
  function renderList(){
    state.mode='list';const templates=state.db.templates.filter(t=>Boolean(t.archived)===state.showArchived);
    if(!templates.some(t=>t.id===state.activeTemplate))state.activeTemplate=templates[0]?.id||null;
    const template=activeTemplate(),version=activeVersion(template),cases=state.db.cases.filter(c=>c.templateId===template?.id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
    shell('<div class="cl-page-head"><div><h2>Custom letters</h2><p>Turn a Word letter into a reusable form.</p></div><div class="cl-actions">'+button('newTemplate','Create template','primary')+button('importTemplate','Import setup','subtle')+button('library','Text blocks &amp; signatories','subtle')+button('backup','Backup letters','subtle')+button('restore','Restore backup','subtle')+'</div></div>'+
      '<div class="cl-workspace"><aside class="cl-template-list"><div class="cl-template-head"><strong>Your templates</strong><label><input id="clShowArchived" type="checkbox" '+(state.showArchived?'checked':'')+'> Archived</label></div>'+
      (templates.length?templates.map(t=>'<button class="cl-template-item '+(state.activeTemplate===t.id?'active':'')+'" data-cl-action="chooseTemplate" data-id="'+esc(t.id)+'"><strong>'+esc(t.name)+'</strong><span>Version '+activeVersion(t).number+' · '+state.db.cases.filter(c=>c.templateId===t.id).length+' cases</span></button>').join(''):'<p class="cl-muted">No '+(state.showArchived?'archived ':'')+'templates yet.</p>')+'</aside><section class="cl-case-area">'+
      (template?'<div class="cl-section-head"><div><h3>'+esc(template.name)+'</h3><p>'+version.fields.length+' fields · '+version.bindings.length+' text selections · Version '+version.number+'</p><label class="cl-label cl-version-choice"><span>Edit from version</span><select id="clVersionChoice">'+[...template.versions].reverse().map(v=>option(v.id,'Version '+v.number+' · '+dateStamp(v.createdAt),template.activeVersionId)).join('')+'</select></label></div><div class="cl-actions">'+button('newCase','Add student','primary')+button('editTemplate','Edit template','subtle')+button('duplicateTemplate','Duplicate','subtle')+button('exportTemplate','Export setup','subtle')+button('archiveTemplate',template.archived?'Restore template':'Archive','subtle')+'</div></div><div class="cl-case-toolbar">'+button('batchWord','Download selected Word files','subtle')+button('caseTable','Selected rows for Excel','subtle')+'<span>'+state.selectedCases.size+' selected</span></div>'+
      '<div class="cl-table-scroll"><table class="cl-cases"><thead><tr><th><input type="checkbox" id="clSelectAllCases" aria-label="Select all custom letter cases" '+(cases.length&&cases.every(c=>state.selectedCases.has(c.id))?'checked':'')+'></th><th>Student / case</th><th>Template</th><th>Last download</th><th>Actions</th></tr></thead><tbody>'+cases.map(c=>'<tr><td><input type="checkbox" data-cl-select="'+esc(c.id)+'" '+(state.selectedCases.has(c.id)?'checked':'')+' aria-label="Select '+esc(c.label)+'"></td><td><strong>'+esc(c.label)+'</strong><small>'+esc(c.studentId||'')+'</small></td><td>Version '+(versionFor(c)?.number||'?')+'</td><td>'+esc(dateStamp(c.prints?.at(-1)?.at))+'</td><td><div class="cl-actions">'+button('openCase','Open','subtle','data-id="'+esc(c.id)+'"')+(c.prints?.length?button('downloadSnapshot','Last saved Word','subtle','data-id="'+esc(c.id)+'"'):'')+'</div></td></tr>').join('')+'</tbody></table></div>'+
      (!cases.length?'<div class="cl-empty-small">No student cases yet. Choose Add student to fill this letter.</div>':''):
      '<div class="cl-empty"><h3>Build your first letter form</h3><p>Upload a Word template, or write a new letter. Select words or phrases to make them editable.</p>'+button('newTemplate','Create template','primary')+button('example','Try the example','subtle')+'</div>')+'</section></div><details class="cl-export-settings"><summary>How to build a letter</summary><ol><li>Create a template from a .docx file or write your letter.</li><li>Select a phrase, choose Make a field, then choose its input type and output language. Link repeated text to the same field.</li><li>Use Test template and Fill sample data to check the form. Download a test Word file to check layout and page breaks.</li><li>Save the template, then choose Add student. Fill or import student details, review the preview, and download Word.</li></ol><p>Each template save creates a version. Existing cases keep their version, and saved downloads keep their original values. Edit from an earlier version to make a new version from it.</p><p>Templates and cases are saved in this browser. Use Export setup to reuse a template elsewhere, and Backup letters to keep a copy of your templates, cases, and download history.</p></details>');
    if($('clSelectAllCases'))$('clSelectAllCases').indeterminate=cases.some(c=>state.selectedCases.has(c.id))&&!cases.every(c=>state.selectedCases.has(c.id));
  }
  async function beginTemplate(template=null,versionId=null){
    state.mode='builder';state.selectedField=null;state.selection=null;state.paragraph=null;state.dirty=false;state.sourceEdit=false;state.testValues={};state.testOverrides={};
    if(template){state.draft={...clone(template.versions.find(v=>v.id===versionId)||activeVersion(template)),templateId:template.id,name:template.name};state.loaded=await E.loadDocx(E.base64ToBytes(state.draft.sourceBase64));}
    else{state.draft={templateId:null,name:'Untitled letter',sourceBase64:'',sourceName:'',fields:[],bindings:[],conditions:[],tableColumns:[],blankText:'',blankSettings:{font:'Times New Roman',size:12}};state.loaded=null;}
    render();
  }
  function renderBuilder(){
    const draft=state.draft,testing=state.mode==='test';
    shell('<div class="cl-editor-head"><div><span class="cl-eyebrow">TEMPLATE BUILDER'+(testing?' · TEST FORM':'')+'</span><h2>'+esc(draft.name)+'</h2><p>'+esc(draft.sourceName||'Choose a starting document')+'</p></div><div class="cl-actions">'+button(testing?'mapMode':'testMode',testing?'Back to mapping':'Test template','subtle')+button('saveTemplate','Save template','primary')+button('closeEditor','Close','subtle')+'</div></div>'+
      '<div class="cl-builder-meta">'+label('Template name',input('clTemplateName',draft.name))+(draft.sourceBase64?'<span class="cl-muted">The Word file keeps the original formatting. Check page breaks in the downloaded file.</span>'+(!testing?button(state.sourceEdit?'cancelSource':'editSource',state.sourceEdit?'Return to mapping':'Edit wording / replace Word','subtle'):''):'')+'</div>'+
      (!state.loaded||state.sourceEdit?'<section class="cl-source-panel">'+(state.sourceEdit?'<p class="cl-muted">Apply a new Word file or edit the text below. Your form fields are kept; text mappings and paragraph conditions need to be selected again. Earlier saved versions and student cases are kept.</p>':'')+'<div class="cl-source-options"><label class="btn primary cl-file-button">Upload Word template<input id="clSourceFile" type="file" accept=".docx" hidden></label><span>or write a new letter below</span>'+(!state.sourceEdit?button('example','Use example','subtle'):'')+'</div>'+label('Letter text','<textarea id="clBlankText" rows="10" placeholder="Write or paste your letter here. Each new line becomes a paragraph.">'+esc(state.sourceEdit?state.sourceText:draft.blankText)+'</textarea>')+'<div class="cl-actions">'+label('Font','<select id="clBlankFont">'+['Times New Roman','Arial','TH Sarabun New'].map(v=>option(v,v,draft.blankSettings?.font)).join('')+'</select>')+label('Size',input('clBlankSize',draft.blankSettings?.size||12,'number','min="8" max="30"'))+button('useBlank','Use this letter','primary')+'</div></section>':
      '<div class="cl-builder-grid"><section class="cl-document-panel"><div class="cl-document-toolbar"><strong>'+(testing?'Letter preview':'Select words or a phrase in the letter')+'</strong>'+(testing?button('fillTest','Fill sample data','subtle'):'<span>'+draft.bindings.length+' mapped selections</span>')+'</div><div id="clDocument" class="cl-document" tabindex="0"></div></section><aside id="clBuilderSidebar" class="cl-builder-sidebar"></aside></div>')+
      (state.loaded&&!state.sourceEdit?'<details class="cl-export-settings"><summary>Excel column order</summary><p>Choose the fields to copy or export for selected cases. Add blank columns where your spreadsheet needs them.</p><div id="clColumns"></div><div class="cl-actions">'+button('addColumn','Add field column','subtle')+button('addBlankColumn','Add blank column','subtle')+'</div></details>':''));
    if(state.loaded&&!state.sourceEdit){renderDocument($('clDocument'),draft,testing?E.resolve(draft,state.testValues,state.testOverrides,context()):null);if(testing)renderForm($('clBuilderSidebar'),draft,state.testValues,state.testOverrides,true);else renderMappingSidebar();renderColumns();}
  }
  function renderColumns(){
    const host=$('clColumns');if(!host)return;const draft=state.draft;
    host.innerHTML=draft.tableColumns.map((fieldId,i)=>'<div class="cl-column-row"><select data-cl-column="'+i+'">'+option('','(blank)',fieldId)+draft.fields.map(f=>option(f.id,f.label,fieldId)).join('')+'</select>'+button('columnUp','↑','subtle','data-index="'+i+'" aria-label="Move column up"')+button('columnDown','↓','subtle','data-index="'+i+'" aria-label="Move column down"')+button('removeColumn','×','subtle','data-index="'+i+'" aria-label="Remove column"')+'</div>').join('')||'<p class="cl-muted">No columns yet. Field columns are added when you create fields.</p>';
  }
  function renderMappingSidebar(){
    const draft=state.draft,host=$('clBuilderSidebar'),selection=state.selection,selected=draft.fields.find(f=>f.id===state.selectedField);
    host.innerHTML='<section class="cl-map-selection"><h3>Selected text</h3><p id="clSelectionText">'+(selection?esc(selection.sample):'Select a word or phrase in the document.')+'</p><div class="cl-actions">'+button('makeField','Make a field','primary',selection?'':'disabled')+button('addField','Add form field','subtle')+'</div>'+
      (selection&&draft.fields.length?label('Use an existing field','<select id="clLinkField">'+options(Object.fromEntries(draft.fields.map(f=>[f.id,f.label])),state.selectedField,'Choose field')+'</select>')+label('Output here','<select id="clLinkFormat">'+options(FORMATS,'','Use field setting')+'</select>')+button('linkField','Link selected text','subtle')+button('linkAll','Link all matching text','subtle'):'')+'</section>'+
      '<section class="cl-field-list"><div class="cl-section-head"><h3>Form fields</h3><span>'+draft.fields.length+'</span></div>'+draft.fields.map(f=>'<div class="cl-field-list-row"><button data-cl-action="selectField" data-id="'+f.id+'" class="'+(f.id===state.selectedField?'active':'')+'"><strong>'+esc(f.label)+'</strong><small>'+esc(FIELDTYPES[f.type])+' · '+draft.bindings.filter(b=>b.fieldId===f.id).length+' places</small></button>'+button('fieldUp','↑','subtle','data-id="'+f.id+'" aria-label="Move field up"')+button('fieldDown','↓','subtle','data-id="'+f.id+'" aria-label="Move field down"')+'</div>').join('')+'</section>'+
      (selected?'<section class="cl-field-settings" id="clFieldSettings">'+fieldSettings(selected)+'</section>':'')+
      (state.paragraph?conditionSettings():'')+
      '<details class="cl-bindings"><summary>Mapped text ('+draft.bindings.length+')</summary>'+draft.bindings.map(b=>'<div><span>'+esc(b.sample)+' → '+esc(draft.fields.find(f=>f.id===b.fieldId)?.label||'Missing field')+'</span><select data-cl-binding-format="'+b.id+'" aria-label="Output format for '+esc(b.sample)+'">'+options(FORMATS,b.format,'Use field setting')+'</select>'+button('unlink','Remove','subtle','data-id="'+b.id+'"')+'</div>').join('')+'</details>';
  }
  function fieldSettings(f){
    const fieldOptions=(selected,empty='Choose field')=>option('',empty,selected)+state.draft.fields.filter(x=>x.id!==f.id).map(x=>option(x.id,x.label,selected)).join('');
    let html='<div class="cl-section-head"><h3>Field settings</h3>'+button('deleteField','Delete','subtle','data-id="'+f.id+'"')+'</div>'+
      label('Field name','<input data-cl-field="label" value="'+esc(f.label)+'">')+
      label('Field type','<select data-cl-field="type">'+options(FIELDTYPES,f.type,null)+'</select>')+
      label('Fill from student data','<select data-cl-field="autofill">'+options(SOURCES,f.autofill,'Manual entry')+'</select>')+
      label('Output format / language','<select data-cl-field="format">'+options(FORMATS,f.format,null)+'</select>')+
      '<label class="cl-check"><input type="checkbox" data-cl-field="required" '+(f.required?'checked':'')+'> Required before Word download</label>'+
      label(f.type==='fixed'?'Replacement text':'Default value','<textarea rows="2" data-cl-field="defaultValue">'+esc(f.defaultValue)+'</textarea>');
    if(f.type==='select')html+=label('Choices · one per line','<textarea rows="5" data-cl-field="options">'+esc(f.options.map(o=>o.value===o.label?o.value:o.value+' | '+o.label).join('\n'))+'</textarea>');
    if(f.type==='major')html+=label('Filter by faculty field','<select data-cl-field="parentId">'+option('','All faculties',f.parentId)+state.draft.fields.filter(x=>x.type==='faculty'&&x.id!==f.id).map(x=>option(x.id,x.label,f.parentId)).join('')+'</select>');
    if(f.type==='block')html+=label('Reusable text block','<select data-cl-field="blockId">'+option('','Choose block',f.blockId)+state.db.blocks.map(b=>option(b.id,b.name,f.blockId)).join('')+'</select>');
    if(f.type==='calculated'){
      const q=f.formula||{};html+=label('Calculation','<select data-cl-formula="op">'+options(CALCS,q.op,null)+'</select>')+label(q.op==='age'?'Birth date field':q.op==='idYear'||q.op==='studyYear'?'Student ID field':q.op==='majorCredits'?'Major field':'First / date field','<select data-cl-formula="a">'+fieldOptions(q.a)+'</select>');
      if(['age','studyYear','add','subtract','multiply','minimum','maximum'].includes(q.op))html+=label(q.op==='age'?'Age on this date':q.op==='studyYear'?'Current academic year field':'Second field (optional)','<select data-cl-formula="b">'+fieldOptions(q.b,q.op==='age'||q.op==='studyYear'?'Choose field':'Use number below')+'</select>');
      if(q.op==='majorCredits')html+=label('Curriculum year field (optional)','<select data-cl-formula="b">'+fieldOptions(q.b,'Use available reference year')+'</select>');
      if(['addMonths','addDays','add','subtract','multiply','minimum','maximum'].includes(q.op))html+=label(q.op==='addMonths'?'Months':q.op==='addDays'?'Days':'Number','<input type="number" data-cl-formula="amount" value="'+esc(q.amount??6)+'">');
      if(['addMonths','addDays'].includes(q.op))html+=label('Limit to this date field (optional)','<select data-cl-formula="cap">'+fieldOptions(q.cap,'No limit')+'</select>');
      if(['idYear','studyYear'].includes(q.op))html+='<p class="cl-muted">Student ID character positions start at 0. Example: 1690123456 → start 1, length 2 → 69.</p>'+label('Start position','<input type="number" min="0" max="30" data-cl-formula="idStart" value="'+esc(q.idStart??1)+'">')+label('Number of characters','<input type="number" min="1" max="4" data-cl-formula="idLength" value="'+esc(q.idLength??2)+'">')+label('Base year','<input type="number" data-cl-formula="baseYear" value="'+esc(q.baseYear??2500)+'">')+(q.op==='idYear'?label('Add program years','<input type="number" data-cl-formula="duration" value="'+esc(q.duration??4)+'">'):'');
    }
    return html+'<p class="cl-muted">Fields without a text selection can supply inputs to calculations.</p>';
  }
  function conditionSettings(){
    const p=state.paragraph,c=state.draft.conditions.find(c=>c.part===p.part&&c.paragraph===p.index)||{};
    return '<details class="cl-condition"><summary>Show selected paragraph only when…</summary><p>'+esc(p.text.slice(0,150)||'Empty paragraph')+'</p>'+label('Field','<select id="clConditionField">'+option('','Choose field',c.fieldId)+state.draft.fields.map(f=>option(f.id,f.label,c.fieldId)).join('')+'</select>')+label('Condition','<select id="clConditionOp">'+options({filled:'Has a value',empty:'Is empty',equals:'Equals',notEquals:'Does not equal'},c.op||'filled',null)+'</select>')+label('Compare with',input('clConditionValue',c.value||''))+'<div class="cl-actions">'+button('saveCondition','Apply condition','subtle')+button('removeCondition','Remove condition','subtle')+'</div></details>';
  }
  function renderDocument(host,version,resolved=null){
    if(!host||!state.loaded)return;host.replaceChildren();
    for(const url of state.imageUrls||[])URL.revokeObjectURL(url);state.imageUrls=[];
    const config=version,ctx=context(),mapped=new Map();for(const b of config.bindings){const key=b.part+'#'+b.paragraph;(mapped.get(key)||mapped.set(key,[]).get(key)).push(b);}
    for(const list of mapped.values())list.sort((a,b)=>a.start-b.start);
    for(const [part,entry] of state.loaded.parts){
      const section=document.createElement('section');section.className='cl-word-part';
      const heading=document.createElement('div');heading.className='cl-part-label';heading.textContent=part.includes('header')?'Header':part.includes('footer')?'Footer':part.includes('footnote')?'Footnotes':part.includes('endnote')?'Endnotes':'Letter';section.appendChild(heading);
      const byNode=new Map(entry.paragraphs.map(p=>[p.node,p])),rendered=new Set();
      function styleSpan(span,run){if(!run)return;if(run.bold)span.style.fontWeight='700';if(run.italic)span.style.fontStyle='italic';if(run.underline)span.style.textDecoration='underline';if(run.size)span.style.fontSize=Math.max(8,Math.min(40,run.size))+'pt';if(run.color)span.style.color=run.color;}
      function para(p){
        const condition=config.conditions.find(c=>c.part===p.part&&c.paragraph===p.index);
        if(resolved&&condition&&!E.conditionShown(condition,resolved))return document.createDocumentFragment();
        rendered.add(p.node);const wrap=document.createElement('div');wrap.className='cl-word-paragraph'+(condition?' has-condition':'');wrap.dataset.clp='1';wrap.dataset.part=p.part;wrap.dataset.index=p.index;wrap.style.textAlign=p.align==='both'?'justify':p.align;
        function plain(start,end){if(end<=start)return;for(const run of p.runs){const a=Math.max(start,run.start),b=Math.min(end,run.end);if(b>a){const span=document.createElement('span');span.textContent=p.text.slice(a,b);styleSpan(span,run);wrap.appendChild(span);}}}
        const bindings=mapped.get(p.part+'#'+p.index)||[];let cursor=0;
        for(const b of bindings){plain(cursor,b.start);const mark=document.createElement('mark'),field=config.fields.find(f=>f.id===b.fieldId);mark.dataset.clBinding=b.id;mark.title=field?.label||'Field';mark.className='cl-word-field'+(b.fieldId===state.selectedField?' selected':'');mark.textContent=resolved?E.formatField(field,resolved.raw[field.id],ctx,b.format):b.sample;styleSpan(mark,p.runs.find(r=>r.end>b.start));if(resolved&&!mark.textContent)mark.textContent='';wrap.appendChild(mark);cursor=b.end;}plain(cursor,p.text.length);
        if(!p.text)wrap.appendChild(document.createElement('br'));
        const relPath=p.part.slice(0,p.part.lastIndexOf('/')+1)+'_rels/'+p.part.split('/').at(-1)+'.rels',relFile=state.loaded.files.get(relPath);
        if(relFile){
          let rels;try{rels=E.parseXml(new TextDecoder().decode(relFile.data));}catch{}
          for(const blip of p.node.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main','blip')){
            const embed=blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','embed');const rel=rels&&[...rels.documentElement.children].find(r=>r.getAttribute('Id')===embed&&r.getAttribute('TargetMode')!=='External');if(!rel)continue;
            const path=new URL(rel.getAttribute('Target'),'https://local.invalid/'+p.part).pathname.slice(1),file=state.loaded.files.get(path);if(!file||!/\.(png|jpe?g|gif)$/i.test(path))continue;
            const mime=/\.png$/i.test(path)?'image/png':/\.gif$/i.test(path)?'image/gif':'image/jpeg';const url=URL.createObjectURL(new Blob([file.data],{type:mime}));state.imageUrls.push(url);const img=document.createElement('img');img.src=url;img.alt='Template image';img.className='cl-template-image';wrap.appendChild(img);
          }
        }
        return wrap;
      }
      function walk(node){
        if(node.namespaceURI!==E.W)return document.createDocumentFragment();
        if(node.localName==='p')return para(byNode.get(node));
        const tags={tbl:'table',tr:'tr',tc:'td'};const element=tags[node.localName]?document.createElement(tags[node.localName]):document.createDocumentFragment();if(node.localName==='tbl')element.className='cl-word-table';for(const child of node.children||[])element.appendChild(walk(child));return element;
      }
      for(const child of entry.doc.documentElement.children)section.appendChild(walk(child));
      for(const p of entry.paragraphs)if(!rendered.has(p.node))section.appendChild(para(p));
      host.appendChild(section);
    }
  }
  function captureSelection(){
    if(state.mode!=='builder')return;const selection=window.getSelection();if(!selection||selection.rangeCount!==1||selection.isCollapsed)return;
    const range=selection.getRangeAt(0),element=node=>node.nodeType===1?node:node.parentElement;
    const start=element(range.startContainer)?.closest('[data-clp]'),end=element(range.endContainer)?.closest('[data-clp]');
    if(!start||start!==end||!$('clDocument')?.contains(start)){announce('Select text within one paragraph. You can link the same field to other paragraphs afterward.',true);return;}
    const part=start.dataset.part,index=Number(start.dataset.index),p=state.loaded.parts.get(part)?.paragraphs[index];if(!p)return;
    const before=document.createRange();before.selectNodeContents(start);before.setEnd(range.startContainer,range.startOffset);const offset=before.toString().length,sample=range.toString();
    if(!sample.trim()||p.text.slice(offset,offset+sample.length)!==sample)return;
    state.selection={part,paragraph:index,start:offset,end:offset+sample.length,sample};state.paragraph=p;renderMappingSidebar();
  }
  function makeField(withSelection){
    const sample=withSelection?state.selection:null,ctx=context(),national=sample?E.nationality(ctx,sample.sample):null;
    const field={id:E.id('field'),label:sample?sample.sample.slice(0,80):'New field',type:national?'nationality':'text',required:false,defaultValue:'',autofill:national?'nationality':'',format:national?'nationalityEnglish':'plain',parentId:'',options:[],formula:null,blockId:''};
    state.draft.fields.push(field);state.draft.tableColumns.push(field.id);state.selectedField=field.id;
    if(sample){try{addBinding(field.id,sample,'');}catch(error){state.draft.fields.pop();state.draft.tableColumns.pop();announce(error.message,true);return;}}
    state.dirty=true;renderMappingSidebar();renderColumns();renderDocument($('clDocument'),state.draft);
    $('clFieldSettings')?.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function addBinding(fieldId,selection,format=''){
    if(!selection)throw Error('Select text in the letter first.');
    if(state.draft.bindings.some(b=>b.part===selection.part&&b.paragraph===selection.paragraph&&selection.start<b.end&&selection.end>b.start))throw Error('This selection overlaps a mapped field. Remove its old mapping first.');
    state.draft.bindings.push({...selection,id:E.id('binding'),fieldId,format});state.dirty=true;
  }
  function linkSelection(all=false){
    const fieldId=$('clLinkField')?.value,format=$('clLinkFormat')?.value||'';if(!fieldId)throw Error('Choose an existing field.');
    if(!all)addBinding(fieldId,state.selection,format);
    else{
      const sample=state.selection?.sample;if(!sample)throw Error('Select text first.');let count=0;
      for(const p of state.loaded.paragraphs){let offset=0;while((offset=p.text.indexOf(sample,offset))!==-1){const b={part:p.part,paragraph:p.index,start:offset,end:offset+sample.length,sample};if(!state.draft.bindings.some(old=>old.part===b.part&&old.paragraph===b.paragraph&&b.start<old.end&&b.end>old.start)){addBinding(fieldId,b,format);count++;}offset+=sample.length;}}
      if(!count)throw Error('All matching text is already mapped.');
    }
    state.selectedField=fieldId;renderMappingSidebar();renderDocument($('clDocument'),state.draft);announce('Selected text linked to the field.');
  }
  function updateFieldControl(target){
    const field=state.draft.fields.find(f=>f.id===state.selectedField);if(!field)return;
    if(target.dataset.clField){
      const key=target.dataset.clField;
      if(key==='required')field.required=target.checked;
      else if(key==='options')field.options=target.value.split('\n').filter(v=>v.trim()).map(v=>{const [value,...parts]=v.split('|');return {value:value.trim(),label:parts.length?parts.join('|').trim():value.trim()};});
      else field[key]=target.value;
      if(key==='type'){
        const defaults={date:'enShort',nationality:'nationalityEnglish',faculty:'facultyEnglish',major:'programEnglish',signatory:'nameTh'};
        field.format=defaults[field.type]||'plain';field.autofill=['nationality','faculty','major','signatory'].includes(field.type)?field.type:field.autofill;
        if(field.type==='calculated')field.formula={op:'age',a:'',b:'',cap:'',amount:6,idStart:1,idLength:2,baseYear:2500,duration:4};
        renderMappingSidebar();
      }
    }else if(target.dataset.clFormula){
      const key=target.dataset.clFormula;field.formula||={};field.formula[key]=['amount','idStart','idLength','baseYear','duration'].includes(key)?Number(target.value):target.value;
      if(key==='op'){if(!['age','studyYear','majorCredits','add','subtract','multiply','minimum','maximum'].includes(field.formula.op))field.formula.b='';if(!['addMonths','addDays'].includes(field.formula.op))field.formula.cap='';renderMappingSidebar();}
    }
    state.dirty=true;
  }
  function formOptions(field,raw){
    const ctx=context();let list=[];
    if(field.type==='select')list=field.options;
    if(field.type==='nationality')list=(ctx.nationalities||[]).map(r=>({value:r.recordId||r.countryEnglish||r.english,label:[r.nationalityEnglish||r.english,r.nationalityThai||r.thai].filter(Boolean).join(' / ')}));
    if(field.type==='faculty')list=[...new Map((ctx.programs||[]).map(r=>[r.facultyEnglish,{value:r.facultyEnglish,label:r.facultyEnglish+' / '+r.facultyThai}])).values()];
    if(field.type==='major'){const faculty=field.parentId?raw[field.parentId]:'';list=(ctx.programs||[]).filter(r=>!faculty||[r.facultyEnglish,r.facultyThai,r.facultyCode].includes(faculty)).map(r=>({value:r.key,label:r.programEnglish+' · '+r.facultyEnglish}));}
    if(field.type==='signatory')list=ctx.signatories.map(r=>({value:r.id,label:r.label||r.nameEn||r.nameTh}));
    return list;
  }
  function renderForm(host,version,values,overrides,testing=false){
    const resolved=E.resolve(version,values,overrides,context());
    host.innerHTML='<div class="cl-section-head"><h3>'+(testing?'Test form':'Student information')+'</h3>'+button('nextMissing','Next missing','subtle')+'</div><p class="cl-muted">Choose a value once to update every linked place.</p><div class="cl-generated-form">'+version.fields.map(f=>{
      const value=E.own(values,f.id)?values[f.id]:f.defaultValue,computed=['calculated','fixed','block'].includes(f.type),override=E.own(overrides,f.id),dateType=f.type==='date'||(f.type==='calculated'&&['addMonths','addDays'].includes(f.formula?.op));
      let control;
      if(computed&&!override)control='<output data-cl-computed="'+f.id+'">'+esc(resolved.outputs[f.id]||'—')+'</output>';
      else if(['select','nationality','faculty','major','signatory'].includes(f.type)){
        const list=formOptions(f,resolved.raw),missing=value&&!list.some(o=>o.value===value)?option(value,'Saved value: '+value,value):'';
        control='<select data-cl-value="'+f.id+'">'+option('','Choose '+f.label,value)+list.map(o=>option(o.value,o.label,value)).join('')+missing+'</select>';
      }else{
        const val=override?overrides[f.id]:value;control=f.type==='textarea'||(override&&f.type==='block')?'<textarea rows="3" data-cl-value="'+f.id+'">'+esc(val)+'</textarea>':'<input type="'+(dateType?'date':f.type==='number'?'number':'text')+'" data-cl-value="'+f.id+'" value="'+esc(val)+'"'+(f.type==='number'?' step="any"':'')+'>';
      }
      return '<div class="cl-form-field" data-cl-form-field="'+f.id+'"><label><span>'+esc(f.label)+(f.required?' <b aria-label="required">*</b>':'')+'</span>'+control+'</label>'+
        (computed&&f.type!=='fixed'?'<label class="cl-check"><input type="checkbox" data-cl-override="'+f.id+'" '+(override?'checked':'')+'> Override '+(override?button('resetOverride','Reset to automatic','subtle','data-id="'+f.id+'"'):'')+'</label>':'')+
        '<small data-cl-error="'+f.id+'">'+esc(resolved.errors[f.id]||'')+'</small></div>';
    }).join('')+'</div><p id="clFormStatus" class="cl-status" role="status"></p>'+(testing?button('testDownload','Download test Word','primary'):'');
    updateFormStatus(resolved);
  }
  function formState(){return state.mode==='test'?{version:state.draft,values:state.testValues,overrides:state.testOverrides}:{version:versionFor(state.caseDraft),values:state.caseDraft.values,overrides:state.caseDraft.overrides};}
  function updateFormStatus(resolved){
    if($('clFormStatus'))$('clFormStatus').textContent=Object.keys(resolved.errors).length?Object.keys(resolved.errors).length+' fields need attention before download.':'Ready to preview and download.';
    for(const [key,value] of Object.entries(resolved.outputs)){const out=ROOT.querySelector('[data-cl-computed="'+CSS.escape(key)+'"]');if(out)out.textContent=value||'—';}
    for(const f of formState().version?.fields||[]){const error=ROOT.querySelector('[data-cl-error="'+CSS.escape(f.id)+'"]');if(error)error.textContent=resolved.errors[f.id]||'';}
  }
  function updateFormValue(target,change=false){
    const current=formState();if(!current.version)return;
    const key=target.dataset.clValue;if(!key)return;
    if(E.own(current.overrides,key))current.overrides[key]=target.value;else current.values[key]=target.value;
    state.dirty=true;
    if(change){
      for(const f of current.version.fields.filter(f=>f.type==='major'&&f.parentId===key)){
        const resolved=E.resolve(current.version,current.values,current.overrides,context()),list=formOptions(f,resolved.raw);
        if(current.values[f.id]&&!list.some(o=>o.value===current.values[f.id]))current.values[f.id]='';
      }
      if(target.tagName==='SELECT'){renderForm($(state.mode==='test'?'clBuilderSidebar':'clCaseForm'),current.version,current.values,current.overrides,state.mode==='test');ROOT.querySelector('[data-cl-value="'+CSS.escape(key)+'"]')?.focus();}
    }
    const resolved=E.resolve(current.version,current.values,current.overrides,context());updateFormStatus(resolved);
    clearTimeout(state.previewTimer);state.previewTimer=setTimeout(()=>renderDocument($('clDocument'),current.version,resolved),100);
  }
  function sampleValues(version){
    const ctx=context(),national=(ctx.nationalities||[]).find(r=>r.countryEnglish==='China'||r.english==='China')||ctx.nationalities?.[0],p=ctx.programs?.[0];
    const student={title:'MR',fullName:'EXAMPLE STUDENT',studentId:'1690000000',passportNo:'TEST123456',passportExpiry:'2032-09-08',birthDate:'2001-10-25',currentStayUntil:'2027-01-31',programKey:p?.key,nationalityKey:national?.recordId||national?.english,registeredCredits:18,totalCredits:129,programDurationYears:4};
    const values=E.prefill(version,student,ctx);
    for(const f of version.fields){
      if(f.type==='calculated'||f.type==='fixed'||f.type==='block')continue;
      if(f.type==='date'&&!values[f.id])values[f.id]=f.autofill==='birthDate'?'2001-10-25':E.today();
      if(f.type==='number'&&!values[f.id])values[f.id]=f.label.toLowerCase().includes('year')?String(new Date().getFullYear()+543):'4';
      if(f.type==='select'&&!values[f.id])values[f.id]=f.options[0]?.value||'';
      if(f.type==='signatory')values[f.id]=ctx.signatories[0]?.id||'';
      if(['text','textarea'].includes(f.type)&&!values[f.id])values[f.id]=version.bindings.find(b=>b.fieldId===f.id)?.sample||'Sample';
    }
    return values;
  }
  async function setSource(bytes,name,blankText=null){
    const loaded=await E.loadDocx(bytes);if(state.sourceEdit&&state.draft.bindings.length&&!confirm('Replace the source and clear its text mappings and paragraph conditions? Your form fields and earlier saved versions are kept.'))return;
    const fields=state.sourceEdit?state.draft.fields:[],tableColumns=state.sourceEdit?state.draft.tableColumns:[];
    state.loaded=loaded;Object.assign(state.draft,{sourceBase64:E.bytesToBase64(bytes),sourceName:name,fields,bindings:[],conditions:[],tableColumns,blankText:blankText??''});
    state.sourceEdit=false;if(state.draft.name==='Untitled letter')state.draft.name=name.replace(/\.docx$/i,'');state.dirty=true;state.selection=null;state.paragraph=null;state.selectedField=null;render();
  }
  async function example(){
    await beginTemplate();const text='I want to be a Chinese child, and eat rice on 18 November.\nStudent: EXAMPLE STUDENT.';
    const bytes=await E.blankDocx(text);await setSource(bytes,'Example letter.docx',text);state.draft.name='Example custom letter';
    const choices=[
      ['Chinese','Nationality','nationality','nationality','nationalityEnglish',[]],
      ['child','Description','text','','plain',[]],
      ['eat','Activity','select','','plain',['eat','study','travel']],
      ['rice','Food','select','','plain',['rice','noodles','bread']],
      ['18 November','Date','date','signDate','enDayMonth',[]],
      ['EXAMPLE STUDENT','Full name','text','fullName','title',[]]
    ];
    for(const [sample,name,type,autofill,format,opts] of choices){const field={id:E.id('field'),label:name,type,autofill,format,required:true,defaultValue:'',options:opts.map(value=>({value,label:value})),parentId:'',formula:null,blockId:''};state.draft.fields.push(field);state.draft.tableColumns.push(field.id);const p=state.loaded.paragraphs.find(p=>p.text.includes(sample));addBinding(field.id,{part:p.part,paragraph:p.index,start:p.text.indexOf(sample),end:p.text.indexOf(sample)+sample.length,sample});}
    state.selectedField=state.draft.fields[0].id;render();
  }
  async function saveTemplate(){
    const draft=state.draft;if(!draft.sourceBase64)throw Error('Upload a Word template or write the letter first.');
    if(state.sourceEdit)throw Error('Apply the new source or return to mapping before saving.');
    const name=String(draft.name||'').trim();if(!name||name.length>150)throw Error('Give the template a name of up to 150 characters.');
    const config=E.validateConfig(draft);E.validateAnchors(state.loaded,config);
    const columns=draft.tableColumns.map(key=>key||'');if(columns.length>200||columns.some(key=>key&&!config.fields.some(f=>f.id===key)))throw Error('Check the Excel columns.');
    const next=clone(state.db);let template=next.templates.find(t=>t.id===draft.templateId);
    if(!template){template={id:E.id('template'),name,createdAt:new Date().toISOString(),archived:false,versions:[],activeVersionId:''};next.templates.push(template);}
    const version={...config,id:E.id('version'),number:(template.versions.at(-1)?.number||0)+1,createdAt:new Date().toISOString(),sourceBase64:draft.sourceBase64,sourceName:draft.sourceName,tableColumns:columns,blankText:draft.blankText||'',blankSettings:draft.blankSettings||{}};
    template.name=name;template.versions.push(version);template.activeVersionId=version.id;
    await commit(next);state.activeTemplate=template.id;state.dirty=false;state.mode='list';render();announce('Template saved as version '+version.number+'.');
  }
  async function openCase(id=null){
    if(state.dirty&&!confirm('Leave without saving these changes?'))return;
    const existing=id?state.db.cases.find(c=>c.id===id):null,template=existing?state.db.templates.find(t=>t.id===existing.templateId):activeTemplate();
    if(!template)throw Error('Create or choose a template first.');if(!existing&&template.archived)throw Error('Restore this template before adding a student.');
    const version=existing?versionFor(existing):activeVersion(template);if(!version)throw Error('The template version for this case is missing.');
    state.caseDraft=existing?clone(existing):{id:E.id('case'),templateId:template.id,versionId:version.id,label:'',studentId:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),values:E.prefill(version,{},context()),overrides:{},prints:[]};
    state.loaded=await E.loadDocx(E.base64ToBytes(version.sourceBase64));state.mode='case';state.dirty=false;render();
  }
  function renderCase(){
    const row=state.caseDraft,version=versionFor(row),template=state.db.templates.find(t=>t.id===row.templateId),ctx=context();
    shell('<div class="cl-editor-head"><div><span class="cl-eyebrow">CUSTOM LETTER · VERSION '+version.number+'</span><h2>'+esc(template.name)+'</h2><p>Fill the form and review the letter.</p></div><div class="cl-actions">'+button('saveCase','Save case','subtle')+button('generateCase','Download Word','primary')+button('closeEditor','Back to cases','subtle')+'</div></div>'+
      '<div class="cl-case-meta">'+label('Case name',input('clCaseLabel',row.label,'text','placeholder="Student name or case description"'))+
      label('Fill from a local student','<select id="clLocalStudent">'+option('','Choose saved student','')+(ctx.students||[]).map(s=>option(s.id,(s.fullName||'Student')+' · '+(s.studentId||''),'')).join('')+'</select>')+button('studentDb','Find in Student DB','subtle')+'</div>'+
      '<div class="cl-builder-grid"><section class="cl-document-panel"><div class="cl-document-toolbar"><strong>Letter preview</strong><span>Check page breaks in Word before printing.</span></div><div id="clDocument" class="cl-document"></div></section><aside id="clCaseForm" class="cl-builder-sidebar"></aside></div>'+
      (row.prints.length?'<details class="cl-print-history"><summary>Saved downloads ('+row.prints.length+')</summary>'+[...row.prints].reverse().map(p=>'<div><span>'+esc(dateStamp(p.at))+'</span>'+button('casePrintSnapshot','Download this saved Word','subtle','data-id="'+p.id+'"')+'</div>').join('')+'</details>':''));
    renderForm($('clCaseForm'),version,row.values,row.overrides);renderDocument($('clDocument'),version,E.resolve(version,row.values,row.overrides,ctx));
  }
  function populateStudent(student){
    if(state.mode!=='case')return;const current=state.caseDraft,version=versionFor(current);
    current.values=E.prefill(version,student,context());current.overrides={};current.label=student.fullName||current.label;current.studentId=student.studentId||'';state.dirty=true;renderCase();announce('Student details filled. Review missing information before downloading.');
  }
  function useRemembered(record){
    if(state.mode!=='case'){announce('Choose Add student for a custom template first.',true);return;}
    const s=record?.student||{},p=record?.passport||{},a=record?.academic||{},v=record?.latest_visa||record?.visa||{},extra=s.extra_data||{},ax=a.extra_data||{},ctx=context();
    const same=(x,y)=>x&&y&&String(x).trim().toLocaleLowerCase()===String(y).trim().toLocaleLowerCase();
    const program=E.program(ctx,ax.programKey)||(ctx.programs||[]).find(r=>(same(r.programEnglish,a.major_en)||same(r.programThai,a.major_th))&&(!a.faculty_en&&!a.faculty_th||same(r.facultyEnglish,a.faculty_en)||same(r.facultyThai,a.faculty_th)));
    populateStudent({title:s.title||'',fullName:s.full_name||'',studentId:s.student_id||'',nationalityThai:s.nationality_th||'',nationalityEnglish:s.nationality_en||'',countryEnglish:s.country_en||'',birthDate:s.birth_date||extra.birthDate||'',passportNo:p.passport_number||'',passportExpiry:p.expiry_date||'',currentStayUntil:v.visa_expiry_date||'',programKey:program?.key||'',facultyEnglish:a.faculty_en||'',totalCredits:a.required_credits??a.total_credits??'',registeredCredits:a.achieved_credits??a.registered_credits??'',studyYearOverride:ax.studyYearOverride||'',graduationYearOverride:ax.graduationYearOverride||'',documentNo:v.document_number||'',currentStudent:Boolean(extra.currentStudent),exchangeUniversity:extra.exchangeUniversity||ax.exchangeUniversity||'',programDurationYears:extra.programDurationYears||''});
  }
  function caseIdentity(row){
    const version=versionFor(row),resolved=E.resolve(version,row.values,row.overrides,context());
    const nameField=version.fields.find(f=>f.autofill==='fullName'),idField=version.fields.find(f=>f.autofill==='studentId');
    row.label=String(row.label||resolved.outputs[nameField?.id]||state.db.templates.find(t=>t.id===row.templateId)?.name||'Custom letter').trim();
    row.studentId=String(resolved.raw[idField?.id]||row.studentId||'');row.updatedAt=new Date().toISOString();return row;
  }
  function upsertCase(next,row){const index=next.cases.findIndex(c=>c.id===row.id);if(index<0)next.cases.push(row);else next.cases[index]=row;}
  async function saveCase(){
    const row=caseIdentity(clone(state.caseDraft)),next=clone(state.db);upsertCase(next,row);await commit(next);state.caseDraft=row;state.dirty=false;announce('Case saved in this browser.');
  }
  function safeName(value){return String(value||'Letter').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,140);}
  function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  async function generateCase(){
    const row=caseIdentity(clone(state.caseDraft)),version=versionFor(row),result=await E.generate(version,row.values,row.overrides,context());
    row.prints.push({id:E.id('print'),at:new Date().toISOString(),snapshot:result.snapshot});const next=clone(state.db);upsertCase(next,row);await commit(next);state.caseDraft=row;state.dirty=false;
    download(result.bytes,safeName(row.label)+'_'+safeName(row.studentId||row.id)+'.docx',DOCX);renderCase();announce('Word file downloaded and a snapshot saved.');
  }
  async function downloadSnapshot(row,print){
    const version=versionFor(row);if(!version||!print)throw Error('The saved letter is not available.');
    const result=await E.generate(version,row.values,row.overrides,context(),print.snapshot);
    download(result.bytes,safeName(row.label)+'_saved_'+print.at.slice(0,10)+'.docx',DOCX);
  }
  async function batchWord(){
    const rows=state.db.cases.filter(c=>state.selectedCases.has(c.id));if(!rows.length)throw Error('Select one or more cases first.');
    const files=new Map(),next=clone(state.db);let serial=0;
    for(const row of rows){const version=versionFor(row);let result;try{result=await E.generate(version,row.values,row.overrides,context());}catch(error){throw Error(row.label+': '+error.message);}const name=String(++serial).padStart(3,'0')+'_'+safeName(row.label)+'.docx';files.set(name,{name,data:result.bytes});const record=next.cases.find(c=>c.id===row.id);record.prints.push({id:E.id('print'),at:new Date().toISOString(),snapshot:result.snapshot});}
    const bytes=await ZipLite.writeZip(files);await commit(next);download(bytes,'Custom_letters_'+E.today()+'.zip','application/zip');renderList();announce(rows.length+' Word files downloaded.');
  }
  async function duplicateTemplate(){
    const template=activeTemplate();if(!template)return;const next=clone(state.db),copy=clone(template);copy.id=E.id('template');copy.name=template.name+' copy';copy.createdAt=new Date().toISOString();copy.archived=false;
    const version=clone(activeVersion(template));version.id=E.id('version');version.number=1;copy.versions=[version];copy.activeVersionId=version.id;next.templates.push(copy);await commit(next);state.activeTemplate=copy.id;renderList();
  }
  async function archiveTemplate(){const template=activeTemplate(),next=clone(state.db),target=next.templates.find(t=>t.id===template.id);target.archived=!target.archived;await commit(next);state.selectedCases.clear();renderList();announce(target.archived?'Template archived. Existing cases and versions are kept.':'Template restored.');}
  async function validateVersion(v){
    if(!v||typeof v.sourceBase64!=='string')throw Error('A template version is missing its Word source.');const config=E.validateConfig(v),bytes=E.base64ToBytes(v.sourceBase64),loaded=await E.loadDocx(bytes);E.validateAnchors(loaded,config);
    if(!/^[a-zA-Z][a-zA-Z0-9_-]{0,89}$/.test(v.id)||!Number.isSafeInteger(v.number)||v.number<1)throw Error('A template version has an invalid identity.');
    const tableColumns=Array.isArray(v.tableColumns)?v.tableColumns.map(x=>String(x||'')):config.fields.map(f=>f.id);
    if(tableColumns.length>200||tableColumns.some(key=>key&&!config.fields.some(f=>f.id===key)))throw Error('A template has invalid Excel columns.');
    return {...config,id:v.id,number:v.number,createdAt:String(v.createdAt||''),sourceBase64:v.sourceBase64,sourceName:String(v.sourceName||'Template.docx').slice(0,200),tableColumns,blankText:String(v.blankText||'').slice(0,200000),blankSettings:v.blankSettings&&typeof v.blankSettings==='object'?{font:String(v.blankSettings.font||''),size:Number(v.blankSettings.size)||12}:{}};
  }
  async function validateWorkspace(raw){
    if(!raw||raw.schema!==1||!Array.isArray(raw.templates)||!Array.isArray(raw.cases)||raw.templates.length>300||raw.cases.length>10000)throw Error('This custom letter backup is not supported.');
    const out={schema:1,templates:[],cases:[],blocks:[],signatories:[]},templateIds=new Set(),versionIds=new Set();
    for(const t of raw.templates){
      if(!/^[a-zA-Z][a-zA-Z0-9_-]{0,89}$/.test(t.id)||templateIds.has(t.id)||!t.name||!Array.isArray(t.versions)||!t.versions.length||t.versions.length>300)throw Error('A template in the backup is invalid.');templateIds.add(t.id);const versions=[];
      for(const v of t.versions){if(versionIds.has(v.id))throw Error('Template version IDs must be unique.');versionIds.add(v.id);versions.push(await validateVersion(v));}
      if(!versions.some(v=>v.id===t.activeVersionId))throw Error('The active template version is missing.');out.templates.push({id:t.id,name:String(t.name).slice(0,150),createdAt:String(t.createdAt||''),archived:Boolean(t.archived),activeVersionId:t.activeVersionId,versions});
    }
    const ids=new Set();for(const c of raw.cases){const version=out.templates.find(t=>t.id===c.templateId)?.versions.find(v=>v.id===c.versionId);if(!version||!/^case_[a-zA-Z0-9_-]+$/.test(c.id)||ids.has(c.id))throw Error('A saved custom letter case is invalid.');ids.add(c.id);
      const values={},overrides={};for(const f of version.fields){if(E.own(c.values,f.id))values[f.id]=String(c.values[f.id]).slice(0,20000);if(E.own(c.overrides,f.id))overrides[f.id]=String(c.overrides[f.id]).slice(0,20000);}
      const prints=[];if(!Array.isArray(c.prints)||c.prints.length>3000)throw Error('A case has invalid download history.');
      for(const p of c.prints){if(!p.snapshot?.resolved||!p.snapshot?.bindingOutputs)throw Error('A saved Word snapshot is invalid.');const snapshot={resolved:{raw:{},outputs:{},errors:{}},bindingOutputs:{},visibility:{}};for(const f of version.fields){snapshot.resolved.raw[f.id]=String(p.snapshot.resolved.raw?.[f.id]||'').slice(0,20000);snapshot.resolved.outputs[f.id]=String(p.snapshot.resolved.outputs?.[f.id]||'').slice(0,20000);}for(const b of version.bindings){if(!E.own(p.snapshot.bindingOutputs,b.id))throw Error('A saved Word snapshot is incomplete.');snapshot.bindingOutputs[b.id]=String(p.snapshot.bindingOutputs[b.id]).slice(0,20000);}for(const condition of version.conditions){const key=condition.part+'#'+condition.paragraph;snapshot.visibility[key]=Boolean(p.snapshot.visibility?.[key]);}prints.push({id:String(p.id),at:String(p.at),snapshot});}
      out.cases.push({id:c.id,templateId:c.templateId,versionId:c.versionId,label:String(c.label||'Custom letter').slice(0,250),studentId:String(c.studentId||'').slice(0,100),createdAt:String(c.createdAt||''),updatedAt:String(c.updatedAt||''),values,overrides,prints});
    }
    if((raw.blocks||[]).length>1000||(raw.signatories||[]).length>200)throw Error('The template library is too large.');
    for(const b of raw.blocks||[]){if(!/^block_[a-zA-Z0-9_-]+$/.test(b.id)||!String(b.name||'').trim())throw Error('A reusable block is invalid.');out.blocks.push({id:b.id,name:String(b.name).slice(0,100),text:String(b.text||'').slice(0,20000)});}
    for(const s of raw.signatories||DEFAULT_SIGNERS){if(!/^[a-zA-Z][a-zA-Z0-9_-]{0,89}$/.test(s.id))throw Error('A signatory record is invalid.');out.signatories.push(Object.fromEntries(['id','label','nameEn','roleEn','nameTh','roleTh'].map(k=>[k,String(s[k]||'').slice(0,1000)])));}
    if(new Set(out.blocks.map(b=>b.id)).size!==out.blocks.length||new Set(out.signatories.map(s=>s.id)).size!==out.signatories.length)throw Error('Library IDs must be unique.');
    return out;
  }
  function exportTemplate(){
    const template=activeTemplate();if(!template)return;
    const pack={format:'buic-custom-letter-template',schema:1,template,blocks:state.db.blocks,signatories:state.db.signatories};
    download(JSON.stringify(pack,null,2),safeName(template.name)+'.buletter','application/json');
  }
  async function importTemplate(file){
    if(file.size>70*1024*1024)throw Error('This setup file is too large.');const pack=JSON.parse(await file.text());if(pack.format!=='buic-custom-letter-template'||pack.schema!==1)throw Error('Choose a custom letter setup (.buletter) file.');
    const valid=await validateWorkspace({schema:1,templates:[pack.template],cases:[],blocks:pack.blocks||[],signatories:pack.signatories||DEFAULT_SIGNERS});
    const next=clone(state.db),template=valid.templates[0],blockMap=new Map(),signerMap=new Map();
    for(const b of valid.blocks){const match=next.blocks.find(x=>x.name===b.name&&x.text===b.text);const target=match||{...b,id:E.id('block')};if(!match)next.blocks.push(target);blockMap.set(b.id,target.id);}
    for(const s of valid.signatories){const match=next.signatories.find(x=>JSON.stringify({...x,id:''})===JSON.stringify({...s,id:''}));const target=match||{...s,id:E.id('signer')};if(!match)next.signatories.push(target);signerMap.set(s.id,target.id);}
    const active=template.activeVersionId;template.id=E.id('template');for(const v of template.versions){const old=v.id;v.id=E.id('version');if(old===active)template.activeVersionId=v.id;for(const f of v.fields){if(f.type==='block')f.blockId=blockMap.get(f.blockId)||f.blockId;if(f.type==='signatory')f.defaultValue=signerMap.get(f.defaultValue)||f.defaultValue;}}template.archived=false;next.templates.push(template);
    await commit(next);state.activeTemplate=template.id;state.mode='list';state.showArchived=false;renderList();announce('Template setup imported. Student cases were not included in this setup file.');
  }
  async function exportWorkspace(){await load();return clone(state.db);}
  async function importWorkspace(raw){const valid=await validateWorkspace(raw);await commit(valid);state.activeTemplate=valid.templates.find(t=>t.id===state.activeTemplate&&!t.archived)?.id||valid.templates.find(t=>!t.archived)?.id||null;state.mode='list';state.dirty=false;state.draft=null;state.caseDraft=null;state.libraryDraft=null;state.sourceEdit=false;state.selectedCases.clear();renderList();}
  async function backup(){download(JSON.stringify({format:'buic-custom-letters-backup',data:await exportWorkspace()},null,2),'Custom_letters_'+E.today()+'.buletters','application/json');}
  async function restore(file){if(file.size>120*1024*1024)throw Error('This backup is too large.');const pack=JSON.parse(await file.text());if(pack.format!=='buic-custom-letters-backup')throw Error('Choose a custom letters backup (.buletters).');const valid=await validateWorkspace(pack.data);if(!confirm('Restore '+valid.templates.length+' templates and '+valid.cases.length+' cases? This replaces the custom letters in this browser.'))return;await importWorkspace(valid);announce('Custom letter backup restored.');}
  function renderLibrary(){
    if(!state.libraryDraft)state.libraryDraft={blocks:clone(state.db.blocks),signatories:clone(state.db.signatories)};
    const draft=state.libraryDraft;state.mode='library';
    shell('<div class="cl-editor-head"><div><h2>Text blocks and signatories</h2><p>Reuse approved wording and signer details across your custom letters.</p></div><div class="cl-actions">'+button('saveLibrary','Save library','primary')+button('closeEditor','Back','subtle')+'</div></div><div class="cl-library-grid"><section class="cl-library-card"><div class="cl-section-head"><h3>Reusable text blocks</h3>'+button('addBlock','Add block','subtle')+'</div>'+draft.blocks.map(b=>'<article class="cl-library-item">'+label('Block name','<input data-cl-library="blocks" data-id="'+b.id+'" data-key="name" value="'+esc(b.name)+'">')+label('Text','<textarea rows="5" data-cl-library="blocks" data-id="'+b.id+'" data-key="text">'+esc(b.text)+'</textarea>')+button('removeBlock','Remove block','subtle','data-id="'+b.id+'"')+'</article>').join('')+'</section><section class="cl-library-card"><div class="cl-section-head"><h3>Signatories</h3>'+button('addSigner','Add signatory','subtle')+'</div>'+draft.signatories.map(s=>'<article class="cl-library-item">'+[['label','Display name'],['nameEn','Name · English'],['roleEn','Position · English'],['nameTh','Name · Thai'],['roleTh','Position · Thai']].map(([key,name])=>label(name,'<input data-cl-library="signatories" data-id="'+s.id+'" data-key="'+key+'" value="'+esc(s[key])+'">')).join('')+button('removeSigner','Remove signatory','subtle','data-id="'+s.id+'"')+'</article>').join('')+'</section></div>');
  }
  async function saveLibrary(){
    const draft=state.libraryDraft;if(draft.blocks.some(b=>!b.name.trim())||draft.signatories.some(s=>!s.label.trim()))throw Error('Give every block and signatory a display name.');
    const next={...clone(state.db),...clone(draft)};await commit(next);state.libraryDraft=null;state.dirty=false;state.mode='list';renderList();announce('Library saved.');
  }
  function openTable(){
    const rows=state.db.cases.filter(c=>state.selectedCases.has(c.id));if(!rows.length)throw Error('Select cases first.');
    const version=activeVersion(),columns=version.tableColumns,headers=columns.map(key=>key?version.fields.find(f=>f.id===key)?.label||'Field':'(blank)');
    if(!columns.length)throw Error('Open Edit template and choose the Excel columns first.');
    const data=rows.map(row=>{const actual=versionFor(row),resolved=E.resolve(actual,row.values,row.overrides,context());return columns.map(key=>key?String(resolved.outputs[key]||''):'');});
    state.table={columns,headers,rows:data};
    let modal=$('clTableModal');if(modal)modal.remove();modal=document.createElement('dialog');modal.id='clTableModal';modal.className='cl-table-dialog';
    modal.innerHTML='<div class="cl-section-head"><div><h3>Custom letter rows</h3><p>Review the current template column order. Fields from a newer template version may be blank in older cases.</p></div>'+button('closeTable','×','subtle','aria-label="Close table"')+'</div><div class="cl-table-scroll"><table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+data.map((row,r)=>'<tr>'+row.map((cell,c)=>'<td>'+(columns[c]?'<input data-cl-table-row="'+r+'" data-cl-table-col="'+c+'" aria-label="'+esc(headers[c])+' row '+(r+1)+'" value="'+esc(cell)+'">':'')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div><label class="cl-check"><input type="checkbox" id="clTableHeadings"> Include headings when copying</label><p id="clTableStatus" role="status"></p><textarea id="clTableFallback" class="hidden" readonly aria-label="Rows to copy"></textarea><div class="cl-actions">'+button('copyTable','Copy rows for Excel','subtle')+button('downloadTable','Download Excel','primary')+'</div>';
    ROOT.appendChild(modal);modal.showModal();
  }
  function tableTsv(){
    const data=$('clTableHeadings')?.checked?[state.table.headers,...state.table.rows]:state.table.rows;
    return data.map(row=>row.map(value=>{const cell=String(value||'').replace(/[\t\r\n]+/g,' ').trim();return /^[=+@-]/.test(cell)?"'"+cell:cell;}).join('\t')).join('\n');
  }
  async function copyTable(){
    const text=tableTsv();try{await navigator.clipboard.writeText(text);$('clTableStatus').textContent='Rows copied. Paste them into Excel.';}
    catch{const field=$('clTableFallback');field.classList.remove('hidden');field.value=text;state.focusAfter={node:field,select:true};$('clTableStatus').textContent='Copy the selected rows below.';}
  }
  async function tableWorkbook(){
    const xml=value=>String(value??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
    const col=index=>{let n=index+1,out='';while(n){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26);}return out;};
    const rows=[state.table.headers,...state.table.rows],sheet='<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><sheetData>'+rows.map((row,r)=>'<row r="'+(r+1)+'">'+row.map((v,c)=>'<c r="'+col(c)+(r+1)+'" t="inlineStr"><is><t xml:space="preserve">'+xml(v)+'</t></is></c>').join('')+'</row>').join('')+'</sheetData></worksheet>';
    const parts={
      '[Content_Types].xml':'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      '_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml':'<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Custom letters" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml':sheet
    };
    const files=new Map(Object.entries(parts).map(([name,text])=>[name,{name,data:new TextEncoder().encode(text)}]));download(await ZipLite.writeZip(files),'Custom_letter_rows_'+E.today()+'.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
  async function closeEditor(){
    if(state.dirty&&!confirm('Leave without saving these changes?'))return;
    state.dirty=false;state.libraryDraft=null;state.caseDraft=null;state.draft=null;state.selectedField=null;state.mode='list';renderList();
  }
  function chosenCase(){return state.db.cases.filter(c=>state.selectedCases.has(c.id));}
  const actions={
    retryLoad:open,newTemplate:()=>beginTemplate(),example,chooseTemplate:target=>{state.activeTemplate=target.dataset.id;state.selectedCases.clear();renderList();},
    editTemplate:()=>beginTemplate(activeTemplate(),$('clVersionChoice')?.value),saveTemplate,duplicateTemplate,archiveTemplate,exportTemplate,
    editSource:()=>{state.sourceEdit=true;state.sourceText=state.draft.blankText||'';state.sourceDirtyBefore=state.dirty;renderBuilder();},
    cancelSource:()=>{state.sourceEdit=false;state.dirty=state.sourceDirtyBefore;renderBuilder();},
    importTemplate:()=>$('clImportFile').click(),backup,restore:()=>$('clRestoreFile').click(),
    library:()=>{state.libraryDraft=null;state.dirty=false;renderLibrary();},saveLibrary,
    addBlock:()=>{state.libraryDraft.blocks.push({id:E.id('block'),name:'New block',text:''});state.dirty=true;renderLibrary();},
    addSigner:()=>{state.libraryDraft.signatories.push({id:E.id('signer'),label:'New signatory',nameEn:'',nameTh:'',roleEn:'',roleTh:''});state.dirty=true;renderLibrary();},
    removeBlock:target=>{if(confirm('Remove this reusable text block? Templates using it will need another block.')){state.libraryDraft.blocks=state.libraryDraft.blocks.filter(b=>b.id!==target.dataset.id);state.dirty=true;renderLibrary();}},
    removeSigner:target=>{if(confirm('Remove this signatory from future custom letters?')){state.libraryDraft.signatories=state.libraryDraft.signatories.filter(s=>s.id!==target.dataset.id);state.dirty=true;renderLibrary();}},
    useBlank:async()=>{const text=$('clBlankText').value;if(!text.trim())throw Error('Write the letter text first.');const settings={font:$('clBlankFont').value,size:Number($('clBlankSize').value)};state.draft.blankSettings=settings;await setSource(await E.blankDocx(text,settings),'New letter.docx',text);},
    makeField:()=>makeField(true),addField:()=>makeField(false),linkField:()=>linkSelection(),linkAll:()=>linkSelection(true),
    selectField:target=>{state.selectedField=target.dataset.id;renderMappingSidebar();renderDocument($('clDocument'),state.draft);},
    fieldUp:target=>moveField(target.dataset.id,-1),fieldDown:target=>moveField(target.dataset.id,1),
    deleteField:target=>{const field=state.draft.fields.find(f=>f.id===target.dataset.id);if(!confirm('Remove '+field.label+' and its text mappings?'))return;state.draft.fields=state.draft.fields.filter(f=>f.id!==field.id);state.draft.bindings=state.draft.bindings.filter(b=>b.fieldId!==field.id);state.draft.conditions=state.draft.conditions.filter(c=>c.fieldId!==field.id);state.draft.tableColumns=state.draft.tableColumns.filter(key=>key!==field.id);state.selectedField=null;state.dirty=true;render();},
    unlink:target=>{state.draft.bindings=state.draft.bindings.filter(b=>b.id!==target.dataset.id);state.dirty=true;renderMappingSidebar();renderDocument($('clDocument'),state.draft);},
    saveCondition:()=>{const p=state.paragraph,fieldId=$('clConditionField').value;if(!fieldId)throw Error('Choose a field for the condition.');state.draft.conditions=state.draft.conditions.filter(c=>!(c.part===p.part&&c.paragraph===p.index));state.draft.conditions.push({part:p.part,paragraph:p.index,fieldId,op:$('clConditionOp').value,value:$('clConditionValue').value});state.dirty=true;renderMappingSidebar();renderDocument($('clDocument'),state.draft);},
    removeCondition:()=>{const p=state.paragraph;state.draft.conditions=state.draft.conditions.filter(c=>!(c.part===p.part&&c.paragraph===p.index));state.dirty=true;renderMappingSidebar();renderDocument($('clDocument'),state.draft);},
    testMode:()=>{if(!state.loaded||state.sourceEdit)throw Error('Apply the starting document first, or return to mapping.');E.validateConfig(state.draft);state.mode='test';renderBuilder();},mapMode:()=>{state.mode='builder';renderBuilder();},
    fillTest:()=>{state.testValues=sampleValues(state.draft);state.testOverrides={};renderBuilder();announce('Fictional sample details filled for testing.');},
    testDownload:async()=>{const result=await E.generate(state.draft,state.testValues,state.testOverrides,context());download(result.bytes,'TEST_'+safeName(state.draft.name)+'.docx',DOCX);announce('Test Word file downloaded.');},
    newCase:()=>openCase(),openCase:target=>openCase(target.dataset.id),saveCase,generateCase,closeEditor,
    studentDb:()=>{if(!window.BUICStudentMemory)throw Error('Student DB is not available.');window.BUICStudentMemory.open();},
    downloadSnapshot:target=>{const row=state.db.cases.find(c=>c.id===target.dataset.id);return downloadSnapshot(row,row.prints.at(-1));},
    casePrintSnapshot:target=>downloadSnapshot(state.caseDraft,state.caseDraft.prints.find(p=>p.id===target.dataset.id)),
    batchWord,caseTable:openTable,closeTable:()=>$('clTableModal').close(),copyTable,downloadTable:tableWorkbook,
    addColumn:()=>{state.draft.tableColumns.push(state.draft.fields[0]?.id||'');state.dirty=true;renderColumns();},
    addBlankColumn:()=>{state.draft.tableColumns.push('');state.dirty=true;renderColumns();},
    columnUp:target=>moveColumn(Number(target.dataset.index),-1),columnDown:target=>moveColumn(Number(target.dataset.index),1),
    removeColumn:target=>{state.draft.tableColumns.splice(Number(target.dataset.index),1);state.dirty=true;renderColumns();},
    resetOverride:target=>{const current=formState();delete current.overrides[target.dataset.id];state.dirty=true;refreshForm();},
    nextMissing:()=>{const current=formState(),resolved=E.resolve(current.version,current.values,current.overrides,context()),key=Object.keys(resolved.errors)[0]||current.version.fields.find(f=>!resolved.raw[f.id])?.id;const control=key?ROOT.querySelector('[data-cl-form-field="'+CSS.escape(key)+'"] input,[data-cl-form-field="'+CSS.escape(key)+'"] select,[data-cl-form-field="'+CSS.escape(key)+'"] textarea'):null;if(control){state.focusAfter={node:control};control.scrollIntoView({block:'nearest'});}else announce('All fields are filled.');}
  };
  function moveField(id,direction){const list=state.draft.fields,i=list.findIndex(f=>f.id===id),j=i+direction;if(i<0||j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];state.dirty=true;renderMappingSidebar();}
  function moveColumn(i,direction){const list=state.draft.tableColumns,j=i+direction;if(j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];state.dirty=true;renderColumns();}
  function refreshForm(){const current=formState();renderForm($(state.mode==='test'?'clBuilderSidebar':'clCaseForm'),current.version,current.values,current.overrides,state.mode==='test');renderDocument($('clDocument'),current.version,E.resolve(current.version,current.values,current.overrides,context()));}
  async function run(task){
    if(state.busy)return;state.busy=true;const previousFocus=document.activeElement;ROOT.setAttribute('aria-busy','true');const controls=[...ROOT.querySelectorAll('input:not([type="file"]),select,textarea,button')].map(node=>[node,node.disabled]);for(const [node]of controls)node.disabled=true;
    try{await task();}catch(error){announce(error.message||String(error),true);}finally{state.busy=false;ROOT.removeAttribute('aria-busy');for(const [node,disabled]of controls)if(node.isConnected)node.disabled=disabled;const focus=state.focusAfter;state.focusAfter=null;if(focus?.node?.isConnected){focus.node.focus();if(focus.select)focus.node.select();}else if(document.activeElement===document.body&&previousFocus?.isConnected&&!previousFocus.disabled)previousFocus.focus();}
  }
  ROOT.addEventListener('click',event=>{
    const target=event.target.closest('[data-cl-action]');if(target&&ROOT.contains(target)){const action=actions[target.dataset.clAction];if(action){event.preventDefault();void run(()=>action(target));}return;}
    const p=event.target.closest('[data-clp]');if(p&&state.mode==='builder'&&state.loaded){state.paragraph=state.loaded.parts.get(p.dataset.part)?.paragraphs[Number(p.dataset.index)];renderMappingSidebar();}
  });
  ROOT.addEventListener('mouseup',event=>{if(state.mode==='builder'&&event.target.closest('#clDocument'))captureSelection();});
  ROOT.addEventListener('keyup',event=>{if(state.mode==='builder'&&event.shiftKey)captureSelection();if(event.key==='Enter'&&event.target.matches('select[data-cl-value]')){const controls=[...ROOT.querySelectorAll('.cl-generated-form input:not([type="checkbox"]),.cl-generated-form select,.cl-generated-form textarea')],i=controls.indexOf(event.target);controls[i+1]?.focus();}});
  ROOT.addEventListener('input',event=>{
    if(state.busy)return;const t=event.target;
    if(t.id==='clTemplateName'){state.draft.name=t.value;state.dirty=true;}
    if(t.id==='clBlankText'){if(state.sourceEdit)state.sourceText=t.value;else state.draft.blankText=t.value;state.dirty=true;}
    if(t.dataset.clField||t.dataset.clFormula)updateFieldControl(t);
    if(t.dataset.clValue)updateFormValue(t);
    if(t.id==='clCaseLabel'){state.caseDraft.label=t.value;state.dirty=true;}
    if(t.dataset.clLibrary){const row=state.libraryDraft[t.dataset.clLibrary].find(r=>r.id===t.dataset.id);if(row){row[t.dataset.key]=t.value;state.dirty=true;}}
    if(t.dataset.clTableRow!==undefined)state.table.rows[Number(t.dataset.clTableRow)][Number(t.dataset.clTableCol)]=t.value;
  });
  ROOT.addEventListener('change',event=>{
    if(state.busy)return;const t=event.target;
    if(t.id==='clShowArchived'){state.showArchived=t.checked;state.selectedCases.clear();renderList();}
    if(t.id==='clSourceFile'){const file=t.files?.[0];if(file)void run(async()=>{if(!/\.docx$/i.test(file.name))throw Error('Choose a Word .docx template.');await setSource(new Uint8Array(await file.arrayBuffer()),file.name);});}
    if(t.id==='clImportFile'){const file=t.files?.[0];if(file)void run(()=>importTemplate(file));}
    if(t.id==='clRestoreFile'){const file=t.files?.[0];if(file)void run(()=>restore(file));}
    if(t.dataset.clField||t.dataset.clFormula){if(t.tagName==='SELECT'||t.type==='checkbox')updateFieldControl(t);}
    if(t.dataset.clBindingFormat){const b=state.draft.bindings.find(b=>b.id===t.dataset.clBindingFormat);if(b){b.format=t.value;state.dirty=true;}}
    if(t.dataset.clColumn!==undefined){state.draft.tableColumns[Number(t.dataset.clColumn)]=t.value;state.dirty=true;}
    if(t.dataset.clValue)updateFormValue(t,true);
    if(t.dataset.clOverride){const current=formState(),key=t.dataset.clOverride;if(t.checked)current.overrides[key]=E.resolve(current.version,current.values,current.overrides,context()).raw[key]||'';else delete current.overrides[key];state.dirty=true;refreshForm();}
    if(t.id==='clLocalStudent'){const student=context().students?.find(s=>String(s.id)===t.value);if(student)populateStudent(student);}
    if(t.dataset.clSelect){if(t.checked)state.selectedCases.add(t.dataset.clSelect);else state.selectedCases.delete(t.dataset.clSelect);renderList();}
    if(t.id==='clSelectAllCases'){const cases=state.db.cases.filter(c=>c.templateId===state.activeTemplate);cases.forEach(c=>t.checked?state.selectedCases.add(c.id):state.selectedCases.delete(c.id));renderList();}
  });
  window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue='';}});
  window.BUICCustomLetters=Object.freeze({open,newCase:()=>run(async()=>{await load();await openCase();}),useRemembered,exportWorkspace,validateWorkspace,importWorkspace});
})();
