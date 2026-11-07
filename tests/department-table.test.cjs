const test = require('node:test');
const assert = require('node:assert/strict');
const Excel = require('../excel-export.js');

const first = {documentDate:'2026-11-05',studentId:'1690123456',fullName:'Example Student',passportNo:'AA01234',passportExpiry:'2029-09-08',embassyPlace:'Ho Chi Minh City'};
const second = {documentDate:'2026-01-01',studentId:'009876',fullName:'Second Student',passportNo:'P002',passportExpiry:'',embassyPlace:''};

test('the same seven columns and dates as New Letter are used', () => {
  assert.deepEqual(Excel.departmentHeaders,['Document date','Student ID','Full name (first + last)','(blank)','Passport number','Passport Expiry','Embassy place']);
  assert.deepEqual(Excel.departmentCells(first),['Nov 5, 2026','1690123456','Example Student','','AA01234','Sep 8, 2029','Ho Chi Minh City']);
  assert.equal(Excel.formatDepartmentDate('2026-02-29'),'');
  assert.equal(Excel.formatDepartmentDate('2028-02-29'),'Feb 29, 2028');
  assert.equal(Excel.formatDepartmentDate(''),'');
});

test('multiple editable rows copy without a header, retaining the blank column and missing fields', () => {
  assert.equal(Excel.departmentTsv([first,second]),'Nov 5, 2026\t1690123456\tExample Student\t\tAA01234\tSep 8, 2029\tHo Chi Minh City\nJan 1, 2026\t009876\tSecond Student\t\tP002\t\t');
  assert.equal(Excel.departmentTsv([{...first,fullName:' =1+2\nnext',embassyPlace:'@place'}]),'Nov 5, 2026\t1690123456\t\'=1+2 next\t\tAA01234\tSep 8, 2029\t\'@place');
});

test('Excel workbook has the same seven columns, values, and one header row', async () => {
  let files;
  global.ZipLite={writeZip:async value=>{files=value;return new Uint8Array([80,75]);}};
  global.window={ZipLite:global.ZipLite};
  try {
    const blob=await Excel.createDepartmentWorkbook([first,second]);
    assert.equal(blob.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const xml=new TextDecoder().decode(files.get('xl/worksheets/sheet1.xml').data);
    assert.match(xml,/<autoFilter ref="A1:G3"\/>/);
    for(const value of ['Document date','Full name (first + last)','Nov 5, 2026','Sep 8, 2029','Ho Chi Minh City'])assert(xml.includes(value));
    assert.match(xml,/<c r="D2"[^>]*><is><t xml:space="preserve"><\/t><\/is><\/c>/);
    assert.match(xml,/<c r="B3"[^>]*><is><t xml:space="preserve">009876<\/t>/);
    assert(!xml.includes('Visa expiry'));
  } finally { delete global.window;delete global.ZipLite; }
});
