const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../custom-letter-engine.js');
const field=(id,type='text',extra={})=>({id,label:id,type,required:false,defaultValue:'',autofill:'',format:'plain',options:[],...extra});
const config=fields=>E.validateConfig({fields,bindings:[],conditions:[]});
test('date and age calculations follow calendar dates and the existing month rule',()=>{
  assert.equal(E.ageAt('2000-11-15','2026-11-14'),'25');
  assert.equal(E.ageAt('2000-11-15','2026-11-15'),'26');
  assert.equal(E.ageAt('2028-01-01','2026-01-01'),'');
  assert.equal(E.addMonths('2026-10-31',6),'2027-05-01');
  assert.equal(E.formatDate('2026-11-05','enShort'),'Nov 5, 2026');
  assert.equal(E.formatDate('2026-11-05','thaiDate'),'5 พฤศจิกายน 2569');
  assert.equal(E.dateParts('2026-02-29'),null);
});
test('formulas use dependencies, passport caps, and explicit overrides',()=>{
  const c=config([field('birth','date'),field('sign','date'),field('age','calculated',{formula:{op:'age',a:'birth',b:'sign'}}),field('visa','date'),field('passport','date'),field('extension','calculated',{formula:{op:'addMonths',a:'visa',amount:6,cap:'passport'},format:'enShort'}),field('id'),field('graduation','calculated',{formula:{op:'idYear',a:'id',idStart:1,idLength:2,baseYear:2500,duration:4}})]);
  const values={birth:'2000-11-15',sign:'2026-11-14',visa:'2027-01-31',passport:'2027-05-20',id:'1691234567'};
  const result=E.resolve(c,values);
  assert.equal(result.raw.age,'25');assert.equal(result.raw.extension,'2027-05-20');assert.equal(result.outputs.extension,'May 20, 2027');assert.equal(result.raw.graduation,'2573');
  assert.equal(E.resolve(c,values,{age:'30'}).raw.age,'30');
  assert.equal(E.resolve(c,{...values,visa:''}).raw.extension,'');
});
test('database fields produce English and Thai output from one selected record',()=>{
  const ctx={nationalities:[{recordId:'CN',countryEnglish:'China',countryThai:'จีน',nationalityEnglish:'Chinese',nationalityThai:'จีน'}],programs:[{key:'business',facultyEnglish:'BU International',facultyThai:'วิทยาลัยนานาชาติ',programEnglish:'Business Administration',programThai:'บริหารธุรกิจ',credits:{2026:129}}],signatories:[{id:'signer',nameEn:'Asst. Prof. Somyot',nameTh:'สมยศ'}]};
  const f=field('nation','nationality',{format:'nationalityEnglish'});
  assert.equal(E.formatField(f,'CN',ctx),'Chinese');
  assert.equal(E.formatField(f,'CN',ctx,'countryThai'),'จีน');
  const c=config([field('major','major'),field('credits','calculated',{formula:{op:'majorCredits',a:'major'}})]);
  assert.equal(E.resolve(c,{major:'business'},{},ctx).raw.credits,'129');
});
test('selected phrases spanning styled runs replace only the mapped occurrence',()=>{
  const parts=['I am Chi','nese and Chinese.'];
  const out=E.applyTextRanges(parts,[{start:5,end:12,sample:'Chinese',value:'Thai'}]);
  assert.equal(out.join(''),'I am Thai and Chinese.');
  const twice=E.applyTextRanges(['Chinese Chinese'],[{start:0,end:7,sample:'Chinese',value:'A longer nationality'},{start:8,end:15,sample:'Chinese',value:'Thai'}]);
  assert.equal(twice.join(''),'A longer nationality Thai');
  assert.throws(()=>E.applyTextRanges(['Chinese'],[{start:0,end:7,sample:'changed',value:'x'}]),/changed/);
});
test('invalid imports, overlapping selections, and calculation loops are rejected',()=>{
  assert.throws(()=>config([field('a','calculated',{formula:{op:'eval',a:'a'}})]),/supported calculation/);
  assert.throws(()=>config([field('a','calculated',{formula:{op:'add',a:'b'}}),field('b','calculated',{formula:{op:'add',a:'a'}})]),/loop/);
  assert.throws(()=>config([field('b','date'),field('a','calculated',{formula:{op:'age',a:'missing',b:'b'}})]),/missing/);
  assert.throws(()=>config([field('a','calculated',{formula:{op:'age',a:'',b:''}})]),/input fields/);
  assert.throws(()=>config([field('b','date'),field('a','calculated',{formula:{op:'addMonths',a:'b',amount:1.5}})]),/whole number/);
  const b={id:'binding1',fieldId:'a',part:'word/document.xml',paragraph:0,start:0,end:3,sample:'abc'};
  assert.throws(()=>E.validateConfig({fields:[field('a')],bindings:[b,{...b,id:'binding2',start:1,end:4,sample:'bcd'}]}),/overlap/);
  assert.throws(()=>E.validateConfig({fields:[field('__proto__')],bindings:[]}),/name/);
});
test('conditional paragraphs use actual form values',()=>{
  const r={raw:{current:'yes'}};
  assert.equal(E.conditionShown({fieldId:'current',op:'equals',value:'yes'},r),true);
  assert.equal(E.conditionShown({fieldId:'current',op:'equals',value:'no'},r),false);
  assert.equal(E.conditionShown({fieldId:'unknown',op:'empty'},r),true);
});
test('autofill keeps Mr and Miss exactly once when the separate title is absent',()=>{
  const c=config([field('name','text',{autofill:'fullName',format:'title'})]);
  for(const [student,expected] of [
    [{title:'MR',fullName:'MR. sAMPLE STUDENT'},'Mr. Sample Student'],
    [{title:'MISS',fullName:'sAMPLE STUDENT'},'Miss Sample Student'],
    [{fullName:'MISS sAMPLE STUDENT'},'Miss Sample Student'],
    [{fullName:'Mr. sAMPLE STUDENT'},'Mr. Sample Student']
  ])assert.equal(E.resolve(c,E.prefill(c,student)).outputs.name,expected);
});
test('reference calculations handle missing credits, selected curriculum years, and year calendars',()=>{
  const c=config([field('major','major'),field('year','number'),field('credits','calculated',{formula:{op:'majorCredits',a:'major',b:'year'}})]);
  assert.equal(E.resolve(c,{major:'m',year:'2026'},{},{programs:[{key:'m',credits:null}]}).raw.credits,'');
  assert.equal(E.resolve(c,{major:'m',year:'2026'},{},{programs:[{key:'m',credits:{2026:129,2027:132}}]}).raw.credits,'129');
  assert.equal(E.resolve(c,{major:'m',year:'2028'},{},{programs:[{key:'m',credits:{2026:129}}]}).raw.credits,'');
  assert.equal(E.formatField(field('year','calculated',{format:'yearCE'}),'2573'),'2030');
  assert.equal(E.formatField(field('year','calculated',{format:'yearBE'}),'2030'),'2573');
  assert.equal(E.formatField(field('nation','nationality',{format:'nationalityEnglish'}),'China',{nationalities:[{english:'China'}]}),'','a country name must not silently replace a missing demonym');
});
test('hidden paragraph fields do not block generation and visible calculated dependencies still do',()=>{
  const c=E.validateConfig({fields:[field('choice'),field('extra','text',{required:true})],bindings:[{id:'binding',fieldId:'extra',part:'word/document.xml',paragraph:0,start:0,end:5,sample:'extra'}],conditions:[{part:'word/document.xml',paragraph:0,fieldId:'choice',op:'equals',value:'yes'}]});
  assert.deepEqual(E.resolve(c,{choice:'no'}).errors,{});
  assert.match(E.resolve(c,{choice:'yes'}).errors.extra,/Fill in/);
});
