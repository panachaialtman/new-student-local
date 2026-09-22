/* Synthetic-only Hub nationality regression tests. Never use real student cases. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('hub-reference.js','utf8');
const localPrograms=[{recordId:'FM000',key:'demo',programType:'international',
  credits:{'2026':129},facultyEnglish:'Example',programEnglish:'Example program'}];
const remotePrograms=[{recordId:'FM000',credits:{'2026':129},
  facultyEnglish:'Example',programEnglish:'Example program',aliases:[]}];
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
async function run(rows) {
  const api={
    meta:{available:true,version:3},
    programs:{version:3,dataset:'programs',records:remotePrograms},
    nationalities:{version:3,dataset:'nationalities',records:rows}
  };
  const context={
    window:{},AbortController:class {constructor(){this.signal={}}abort(){}},
    setTimeout:()=>1,clearTimeout:()=>{},
    fetch:async url=>({
      ok:true,status:200,json:async()=>api[url.split('/').pop()]
    })
  };
  vm.runInNewContext(source,context);
  return context.window.BUICReferenceHub.update(localPrograms,localNationalities,true);
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
  console.log('Hub nationality and official Thai country-name tests passed (full names, short-name fallback, no student data).');
})().catch(err=>{console.error(err);process.exitCode=1;});
