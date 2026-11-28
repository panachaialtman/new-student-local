/* Exercise the actual Word template, ZIP reader and export paths with fictional cases. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function workspace() {
  const root = path.resolve(__dirname, '..');
  const scope = { TextEncoder, TextDecoder, Blob, Response, CompressionStream, DecompressionStream,
    Uint8Array, Uint32Array, DataView, atob, Map, Date, VisaDB: { getTemplate: async () => null },
    fetch: async file => new Response(fs.readFileSync(path.join(root, file))) };
  scope.window = scope;
  vm.createContext(scope);
  for (const file of ['zip.js', 'builtin-templates.js', 'docx-engine.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), scope, { filename: file });
  }
  return scope;
}

const student = {
  caseCategory: 'transfer', programType: 'international', currentStudent: false,
  documentNo: '0042', title: 'Mr', fullName: 'Robin Example', studentId: '1680000001',
  nationalityThai: 'เมียนมา', passportNo: 'QA-X123', passportExpiry: '2031-03-10',
  currentStayUntil: '2027-07-31', requestRuleOverride: 'six_months', academicCohortYear: 69,
  facultyThai: 'วิทยาลัยนานาชาติ', programThai: 'สาขาวิชาทดสอบ', totalCredits: 132,
  registeredCredits: 21, transferSchool: 'Sample Academy A & B', transferProvince: 'ภูเก็ต',
};
async function documentXml(scope, blob) {
  const files = await scope.ZipLite.readZip(await blob.arrayBuffer());
  return new TextDecoder().decode(files.get('word/document.xml').data);
}
const plain = xml => Array.from(xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g), m => m[1]).join('');
const compact = s => plain(s).replace(/\s+/g, ' ').trim();
const application = '4.3 สำเนาหลักฐานการศึกษาที่ใช้สมัครเรียน';
const transcript = '4.3 สำเนาหลักฐานการศึกษา (Transcript)';

test('Transfer fills the original letter and removes sample years and highlights', async () => {
  const scope = workspace();
  const xml = await documentXml(scope, await scope.BrowserDocx.generateIndividual(student, '2027-11-05', 'duangthida'));
  const text = compact(xml);
  for (const value of [
    'ที่ มกท/ศนช. 0042/2570', '5 พฤศจิกายน 2570', 'MR. ROBIN EXAMPLE', 'เมียนมา',
    '1680000001', 'QA-X123', '10 มีนาคม 2574', '31 กรกฎาคม 2570', 'หลักสูตรปริญญาตรี',
    'วิทยาลัยนานาชาติ', 'สาขาวิชาทดสอบ', 'ระยะเวลาหลักสูตร 4 ปี', 'จำนวนหน่วยกิตรวม 132 หน่วยกิต',
    'สำเร็จการศึกษาในปีการศึกษา 2572', 'เริ่มศึกษาชั้นปีที่ 1 ลงทะเบียนจำนวน 21 หน่วยกิต',
    'จำนวน 294 ชั่วโมง', 'จาก Sample Academy A &amp; B จังหวัดภูเก็ต',
    'ขออยู่ต่อเพื่อการศึกษาถึง 31 มกราคม 2571', application,
    'ผู้ช่วยศาสตราจารย์ ดร. ดวงธิดา นันทาภิรัตน์', 'ผู้ช่วยอธิการบดีสายนานาชาติ ปฏิบัติหน้าที่แทน',
  ]) assert(text.includes(value), value);
  assert.doesNotMatch(xml, /<w:highlight\b|MISS NAME|PASSPORTNUM|IDNUMBER|Their school/);
  assert.match(xml, /<w:t xml:space="preserve"> Sample Academy A &amp; B<\/w:t>/);
  assert(!text.includes('2569'));
  assert(!text.includes(transcript));
});

test('current Transfer, graduate ID year, passport cap and manual academic overrides', async () => {
  const scope = workspace();
  const graduate = {...student, programType:'graduate', currentStudent:true, attachment43:'transcript',
    studentId:'7670000001', documentNo:'ที่ มกท/ศนช. 0079/2569', transferSchool:'โรงเรียนตัวอย่าง',
    transferProvince:'จังหวัดกรุงเทพมหานคร', registeredCredits:12, passportExpiry:'2027-12-01'};
  const xml = await documentXml(scope, await scope.BrowserDocx.generateIndividual(graduate, '2028-01-03', 'somyot'));
  const text = compact(xml);
  for (const value of ['ที่ มกท/ศนช. 0079/2571', '3 มกราคม 2571', 'หลักสูตรปริญญาโท',
    'ระยะเวลาหลักสูตร 2 ปี','สำเร็จการศึกษาในปีการศึกษา 2571',
    'ศึกษาอยู่ชั้นปีที่ 3 ลงทะเบียนจำนวน 12 หน่วยกิต', 'จำนวน 168 ชั่วโมง',
    'จากโรงเรียนตัวอย่าง กรุงเทพมหานคร', 'ขออยู่ต่อเพื่อการศึกษาถึง 1 ธันวาคม 2570',
    application, 'ผู้ช่วยศาสตราจารย์ ดร. สมยศ วัฒนากมลชัย']) assert(text.includes(value), value);
  assert(!text.includes('2569') && !text.includes(transcript));
  const override = {...graduate, transferProvince:'จ. ปทุมธานี', graduationYearOverride:2577, studyYearOverride:2,
    requestRuleOverride:'manual', manualRequestUntil:'2027-09-07'};
  const edited = compact(await documentXml(scope, await scope.BrowserDocx.generateIndividual(override, '2027-05-01', 'somyot')));
  for (const value of ['สำเร็จการศึกษาในปีการศึกษา 2577','ศึกษาอยู่ชั้นปีที่ 2',
    'จังหวัดปทุมธานี','ขออยู่ต่อเพื่อการศึกษาถึง 7 กันยายน 2570']) assert(edited.includes(value), value);
});

test('Transfer batch keeps each student and institution on the corresponding letter', async () => {
  const scope = workspace();
  const second = {...student, studentId:'1690000002', fullName:'Morgan Example', transferSchool:'Second School',
    transferProvince:'เชียงใหม่', requestRuleOverride:'one_year', currentStudent:true, attachment43:'transcript'};
  const xml = await documentXml(scope, await scope.BrowserDocx.generateBatch([student, second], '2027-07-01', 'somyot',
    {reviewBox:true, columnNames:['Reviewer']}));
  const parts = xml.split(/<w:pageBreakBefore\s*\/>/);
  assert.equal(parts.length,2);
  for (const [i,values] of [[0,['ROBIN EXAMPLE','Sample Academy A &amp; B จังหวัดภูเก็ต','31 มกราคม 2571']],
    [1,['MORGAN EXAMPLE','Second School จังหวัดเชียงใหม่','31 กรกฎาคม 2571','สำเร็จการศึกษาในปีการศึกษา 2573']]]) {
    const text = compact(parts[i]);
    for (const value of values) assert(text.includes(value), value);
    assert(text.includes('Reviewer'));
    assert.equal(text.split(application).length - 1, 1);
    assert(!text.includes(transcript));
  }
});

test('an imported Transfer template with older attachment wording is corrected', async () => {
  const scope = workspace();
  const template = await scope.BuiltinTemplates.getTemplate('transfer');
  const files = await scope.ZipLite.readZip(template);
  const part = files.get('word/document.xml');
  const original = new TextDecoder().decode(part.data);
  for (const ending of [' (Transcript)', 'ที่ใช้ในการสมัครเรียน']) {
    const xml = original.replace('>ที่ใช้สมัครเรียน<', '>' + ending + '<');
    assert.notEqual(xml, original);
    part.data = new TextEncoder().encode(xml);
    const buffer = await scope.ZipLite.writeZip(files);
    scope.VisaDB.getTemplate = async () => ({buffer});
    for (const currentStudent of [false, true]) {
      const blob = await scope.BrowserDocx.generateIndividual({...student, currentStudent}, '2027-07-05', 'somyot');
      const text = compact(await documentXml(scope, blob));
      assert.equal(text.split(application).length - 1, 1);
      assert(!text.includes(transcript));
    }
  }
});

test('Transfer cannot generate with missing school, province or graduation inputs', async () => {
  const scope = workspace();
  for (const [patch, message] of [[{transferSchool:' '},/previous school/],[{transferProvince:'จังหวัด '},/province/],
    [{studentId:'X'},/graduation year/]]) {
    await assert.rejects(() => scope.BrowserDocx.generateIndividual({...student,...patch},'2027-01-03','somyot'),message);
  }
});
