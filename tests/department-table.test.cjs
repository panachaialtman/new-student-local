const test = require('node:test');
const assert = require('node:assert/strict');
const Excel = require('../excel-export.js');

const first = {signDate:'2026-11-05',studentId:'1690123456',fullName:"EXAMPLE o'CONNOR-jONES",passportNo:'AA01234',passportExpiry:'2029-09-08',visaExpiry:'2027-01-01',extendUntil:'2027-07-01'};
const second = {signDate:'2026-01-01',studentId:'009876',fullName:'SECOND STUDENT',passportNo:'P002',passportExpiry:'',visaExpiry:'2027-02-02',extendUntil:'2028-01-17'};
const headers=['Sign date','Student ID','Full name','(blank)','Passport number','Passport Expiry date','(blank)','Visa Expire date','Extend until'];

test('student title appears before the capitalized name without duplicates', () => {
  assert.equal(Excel.departmentFullName('MR', 'MR. sAMPLE o\'CONNOR-jONES'), "Mr. Sample O'Connor-Jones");
  assert.equal(Excel.departmentFullName('MISS', 'JANE DOE'), 'Miss Jane Doe');
  assert.equal(Excel.departmentFullName('MS', 'jane doe'), 'Ms. Jane Doe');
  assert.equal(Excel.departmentFullName('MRS', 'MRS. JANE DOE'), 'Mrs. Jane Doe');
  assert.equal(Excel.departmentFullName('', 'MR. JOHN DOE'), 'Mr. John Doe');
  assert.equal(Excel.departmentFullName('', 'JOHN DOE'), 'John Doe');
  assert.equal(Excel.departmentFullName('MISS', 'MR. JANE DOE'), 'Miss Jane Doe');
});

test('nine columns, capitalized names, and dates match the requested format', () => {
  assert.deepEqual(Excel.departmentHeaders,headers);
  assert.deepEqual(Excel.departmentCells(first),['Nov 5, 2026','1690123456',"Example O'Connor-Jones",'','AA01234','Sep 8, 2029','','Jan 1, 2027','Jul 1, 2027']);
  assert.equal(Excel.capitalizeDepartmentName('ÉMILIE วิน เซียว'), 'Émilie วิน เซียว');
  assert.equal(Excel.formatDepartmentDate('2026-02-29'),'');
  assert.equal(Excel.formatDepartmentDate('2028-02-29'),'Feb 29, 2028');
  assert.equal(Excel.formatDepartmentDate(''),'');
});

test('multiple rows copy without headings, with two blank columns and safe spreadsheet text', () => {
  const expected=[['Nov 5, 2026','1690123456',"Example O'Connor-Jones",'','AA01234','Sep 8, 2029','','Jan 1, 2027','Jul 1, 2027'],['Jan 1, 2026','009876','Second Student','','P002','','','Feb 2, 2027','Jan 17, 2028']].map(row=>row.join('\t')).join('\n');
  assert.equal(Excel.departmentTsv([first,second]),expected);
  const danger=Excel.departmentTsv([{...first,fullName:' =1+2\nnext',passportNo:'@passport'}]).split('\t');
  assert.equal(danger[2],"'=1+2 Next");assert.equal(danger[4],"'@passport");
  assert.equal(Excel.departmentTsv([{signDate:'',studentId:'',fullName:'',passportNo:'',passportExpiry:'',visaExpiry:'',extendUntil:''}]),'\t\t\t\t\t\t\t\t');
});

test('Excel workbook contains the same nine columns, dates, blank columns, and header row', async () => {
  let files;
  global.ZipLite={writeZip:async value=>{files=value;return new Uint8Array([80,75]);}};
  global.window={ZipLite:global.ZipLite};
  try {
    const blob=await Excel.createDepartmentWorkbook([first,second]);
    assert.equal(blob.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const xml=new TextDecoder().decode(files.get('xl/worksheets/sheet1.xml').data);
    assert.match(xml,/<autoFilter ref="A1:I3"\/>/);
    for(const value of ['Sign date','Full name','Nov 5, 2026','Sep 8, 2029','Jan 1, 2027','Jul 1, 2027'])assert(xml.includes(value));
    for(const cell of ['D2','G2'])assert.match(xml,new RegExp(`<c r="${cell}"[^>]*><is><t xml:space="preserve"></t></is></c>`));
    assert.match(xml,/<c r="B3"[^>]*><is><t xml:space="preserve">009876<\/t>/);
    assert(!xml.includes('Embassy place'));
  } finally { delete global.window;delete global.ZipLite; }
});
