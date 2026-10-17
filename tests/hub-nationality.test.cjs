/* Synthetic-only Hub nationality regression tests. Never use real student cases. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('hub-reference.js','utf8');
const localPrograms=[{recordId:'FM000',key:'demo',programType:'international',
  credits:{'2026':129},facultyEnglish:'Example',programEnglish:'Example program'}];
const remotePrograms=[{recordId:'FM000',credits:{'2026':129},
  facultyEnglish:'Example',facultyThai:'คณะตัวอย่าง',programEnglish:'Example program',
  programThai:'ตัวอย่าง',programType:'international',degreeLevel:'bachelor',aliases:[]}];
const localNationalities=[
  {english:'Germany',thai:'เยอรมนี',aliases:[]},
  {english:'United Kingdom',thai:'อังกฤษ',aliases:[]},
  {english:'United States',thai:'อเมริกา',aliases:[]},
  {english:'Myanmar',thai:'เมียนมา',aliases:['Burma']}
];
const remoteNationalities=[
  {recordId:'C001',english:'Germany',thai:'เยอรมนี',nationalityThai:'เยอรมัน',
    nationalityEnglish:'German',aliases:['German','สหพันธ์สาธารณรัฐเยอรมนี','เบอร์ลิน']},
  {recordId:'C002',english:'United Kingdom',thai:'สหราชอาณาจักร',
    nationalityThai:'บริติช / อังกฤษ',nationalityEnglish:'British',aliases:['Briton','สหราชอาณาจักรบริเตนใหญ่และไอร์แลนด์เหนือ']},
  {recordId:'C003',english:'United States',thai:'สหรัฐอเมริกา',
    nationalityThai:'อเมริกัน',nationalityEnglish:'American',aliases:['USA']},
  {recordId:'C004',english:'Myanmar',thai:'เมียนมา',
    nationalityThai:'เมียนมา',nationalityEnglish:'Myanmar / Burmese',aliases:['พม่า','สาธารณรัฐแห่งสหภาพเมียนมา']}
];
async function run(rows, programs=remotePrograms, version=3, localP=localPrograms, localN=localNationalities) {
  const api={
    meta:{available:true,version},
    programs:{version,dataset:'programs',records:programs},
    nationalities:{version,dataset:'nationalities',records:rows}
  };
  const context={
    window:{},AbortController:class {constructor(){this.signal={}}abort(){}},
    setTimeout:()=>1,clearTimeout:()=>{},
    fetch:async url=>({
      ok:true,status:200,json:async()=>api[url.split('/').pop()]
    })
  };
  vm.runInNewContext(source,context);
  return context.window.BUICReferenceHub.update(localP,localN,true);
}
(async()=>{
  const result=await run(remoteNationalities);
  assert.equal(result.status,'updated');
  assert.equal(result.version,3);
  const find=name=>result.nationalities.find(row=>row.english===name);
  assert.equal(find('Germany').thai,'เยอรมัน');
  assert.equal(find('Germany').countryThai,'เยอรมนี');
  assert.equal(find('Germany').countryOfficialThai,'สหพันธ์สาธารณรัฐเยอรมนี',
    'Partner country must use the complete formal country name');
  assert.equal(find('United Kingdom').countryOfficialThai,'สหราชอาณาจักรบริเตนใหญ่และไอร์แลนด์เหนือ');
  assert.equal(find('Myanmar').countryOfficialThai,'สาธารณรัฐแห่งสหภาพเมียนมา');
  assert.equal(find('United States').countryOfficialThai,'สหรัฐอเมริกา',
    'When the source supplies no fuller name, use the published country name');

  assert.equal(find('Germany').nationalityEnglish,'German');
  assert.equal(find('United Kingdom').thai,'บริติช / อังกฤษ');
  assert.equal(find('United Kingdom').countryThai,'สหราชอาณาจักร');
  assert.equal(find('United States').thai,'อเมริกัน');
  assert.equal(find('United States').countryThai,'สหรัฐอเมริกา');
  assert.equal(find('Myanmar').thai,'เมียนมา');
  assert(find('Myanmar').aliases.includes('Burma')&&find('Myanmar').aliases.includes('พม่า'));
  assert.equal(localNationalities[0].thai,'เยอรมนี','Do not mutate bundled records');
  await assert.rejects(run(remoteNationalities.map(row=>
    row.english==='Germany'?{...row,nationalityThai:''}:row)),/Missing Thai nationality/);
  assert.equal(localNationalities[0].thai,'เยอรมนี',
    'Bad Hub nationality data must not rewrite existing references');
  // Published additions must appear in Current Letter without a bundled-file update.
  const addedProgram={recordId:'FM101',facultyEnglish:'New Faculty',facultyThai:'คณะใหม่',
    programEnglish:'Example Applied Science',programThai:'วิทยาศาสตร์ประยุกต์ตัวอย่าง',
    facultyCode:'NF',degreeLevel:'bachelor',programType:'international',
    credits:{'2026':null},creditStatus:'missing',aliases:[]};
  const addedNationality={recordId:'C101',english:'Example Republic',
    thai:'สาธารณรัฐตัวอย่าง',nationalityEnglish:'Example Republic citizen',
    nationalityThai:'ชาวตัวอย่าง',aliases:['ราชรัฐตัวอย่าง']};
  const expanded=await run([...remoteNationalities,addedNationality],
    [...remotePrograms,addedProgram],4);
  assert.equal(expanded.programs.length,2,'New academic programs must appear');
  assert.equal(expanded.nationalities.length,5,'New nationalities must appear');
  assert.equal(expanded.programs.find(row=>row.recordId==='FM101').programType,'international');
  assert.equal(expanded.programs.find(row=>row.recordId==='FM101').key,'Example Applied Science [NF]');
  assert.equal(expanded.nationalities.find(row=>row.recordId==='C101').thai,'ชาวตัวอย่าง');
  assert.equal(expanded.nationalities.find(row=>row.recordId==='C101').countryOfficialThai,'ราชรัฐตัวอย่าง');
  assert.equal(expanded.programs.find(row=>row.recordId==='FM000').key,'demo',
    'Existing program keys must remain stable for stored cases');

  // Deletions must remove the published reference from current lookup options
  // but never mutate the bundled fallback arrays.
  const reduced=await run(remoteNationalities.filter(row=>row.english!=='Germany'),
    remotePrograms,5);
  assert.equal(reduced.nationalities.length,3,'Removed nationality should disappear');
  assert.equal(reduced.nationalities.some(row=>row.english==='Germany'),false);
  assert.equal(localNationalities.length,4,'Existing bundled/local reference arrays remain untouched');
  assert.equal(localPrograms.length,1,'No existing program record is mutated or deleted');
  const withoutPrograms=await run(remoteNationalities,[addedProgram],6);
  assert.equal(withoutPrograms.programs.some(row=>row.recordId==='FM000'),false,
    'A removed program must no longer be an available published option');

  // Invalid releases must fail as a whole, with no partial changes applied.
  await assert.rejects(run([...remoteNationalities,{...remoteNationalities[0]}]),
    /duplicate record identifiers/);
  await assert.rejects(run([...remoteNationalities,{...remoteNationalities[0],recordId:'C500'}]),
    /duplicated/);
  await assert.rejects(run(remoteNationalities,[
    {...remotePrograms[0],credits:{'2026':700}}
  ]),/Invalid 2026 credits/);
  assert.equal(localNationalities[0].thai,'เยอรมนี');
  console.log('Hub nationality, dynamic record count and safe staged publication tests passed.');
})().catch(err=>{console.error(err);process.exitCode=1;});
