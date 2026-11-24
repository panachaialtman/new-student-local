/* Generate real DOCX files from the bundled templates, using fictional cases. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const ADMISSION='สำเนาหลักฐานการศึกษาที่ใช้ในการสมัครเรียน';
const TRANSCRIPT='สำเนาหลักฐานการศึกษา (Transcript)';

function engine(){
  const scope={TextEncoder,TextDecoder,Blob,Response,CompressionStream,
    DecompressionStream,Uint8Array,Uint32Array,DataView,Map,Date,console,atob,
    VisaDB:{getTemplate:async()=>null},
    fetch:async file=>({ok:true,text:async()=>fs.readFileSync(path.join(root,file),'utf8')})};
  scope.window=scope;
  vm.createContext(scope);
  for(const file of ['zip.js','builtin-templates.js','docx-engine.js'])
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),scope,{filename:file});
  return scope;
}
const example={documentNo:'TEST-ATTACHMENT',title:'Miss',fullName:'EXAMPLE STUDENT',
  nationalityThai:'ไทย',studentId:'7670000000',passportNo:'TEST-ONLY',
  passportExpiry:'2030-11-24',currentStayUntil:'2026-12-24',
  facultyThai:'คณะบริหารธุรกิจ',programThai:'สาขาวิชาบริหารธุรกิจ',
  totalCredits:42,registeredCredits:18,academicCohortYear:69,
  requestRuleOverride:'six_months'};
const plain=xml=>[...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]).join('');
async function documentXml(scope,blob){
  const files=await scope.ZipLite.readZip(await blob.arrayBuffer());
  return new TextDecoder().decode(files.get('word/document.xml').data);
}

for(const programType of ['undergraduate','graduate']){
  test(programType+' attachment 4.3 follows Current student, including older case flags',async()=>{
    const scope=engine();
    for(const [flags,current] of [
      [{currentStudent:true,attachment43:'transcript'},true],
      [{currentStudent:false,attachment43:'application'},false],
      [{currentStudent:true,attachment43:'application'},true],
      [{currentStudent:false,attachment43:'transcript'},false],
      [{attachment43:'transcript'},true]
    ]){
      const xml=await documentXml(scope,await scope.BrowserDocx.generateIndividual(
        {...example,programType,...flags},'2026-11-24','somyot'));
      const text=plain(xml);
      assert.equal(text.split(TRANSCRIPT).length-1,current?1:0,JSON.stringify(flags));
      assert.equal(text.split(ADMISSION).length-1,current?0:1,JSON.stringify(flags));
      assert(text.includes('MISS EXAMPLE STUDENT'));
      assert(text.includes('TEST-ONLY'));
      assert(!xml.includes('<w:highlight'),'All sample highlighted fields are filled');
    }
  });
}

test('a mixed batch uses the right attachment for every student and degree',async()=>{
  const scope=engine();
  const students=['graduate','undergraduate'].flatMap(programType=>[true,false].map(currentStudent=>
    ({...example,programType,currentStudent,attachment43:currentStudent?'transcript':'application',
      fullName:(currentStudent?'CURRENT ':'NEW ')+programType.toUpperCase()+' EXAMPLE'})));
  const text=plain(await documentXml(scope,await scope.BrowserDocx.generateBatch(students,'2026-11-24','somyot')));
  assert.equal(text.split(TRANSCRIPT).length-1,2);
  assert.equal(text.split(ADMISSION).length-1,2);
  const starts=students.map(st=>text.indexOf('MISS '+st.fullName));
  assert(starts.every((start,index)=>start>=0&&(index===0||start>starts[index-1])));
  for(let i=0;i<students.length;i++){
    const letter=text.slice(starts[i],starts[i+1]??text.length);
    assert(letter.includes(students[i].currentStudent?TRANSCRIPT:ADMISSION));
    assert(!letter.includes(students[i].currentStudent?ADMISSION:TRANSCRIPT));
  }
});
