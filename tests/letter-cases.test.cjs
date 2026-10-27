/* Saved Current Letter cases: regression checks for local persistence and
   last generated/downloaded dates. No real student data is used. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const styles=fs.readFileSync('styles.css','utf8');
const start=app.indexOf('  const LETTER_CASE_FIELDS=');
const end=app.indexOf('  function letterCaseValues(kind)',start);
assert(start>=0&&end>start,'Case model is accessible');
const scope={};
vm.runInNewContext(app.slice(start,end)+
  '\nthis.__model={normalizeLetterCases,letterPrintStamp,LETTER_CASE_FIELDS};',scope);
const {normalizeLetterCases,letterPrintStamp,LETTER_CASE_FIELDS}=scope.__model;
assert.deepEqual(Object.keys(LETTER_CASE_FIELDS),['cancel','graduated','criminal']);
const sample={id:'letter_testing1',kind:'graduated',
  createdAt:'2026-10-20T08:00:00Z',updatedAt:'2026-10-27T08:00:00Z',
  lastGeneratedAt:'2026-10-27T07:23:00Z',printCount:2,
  values:{fullName:'MR. EXAMPLE STUDENT',documentNo:'9999',
    passportNo:'TEST123456',signatory:'somyot',untrusted:'ignored'}};
const entries=normalizeLetterCases([sample,sample,
  {...sample,id:'invalid_id'}, {...sample,id:'letter_wrong',kind:'unknown'},
  null]);
assert.equal(entries.length,1,'Ignore invalid/duplicate records');
assert.equal(entries[0].values.untrusted,undefined,'Unknown values are not reintroduced');
assert.equal(entries[0].lastGeneratedAt,sample.lastGeneratedAt);
assert.equal(entries[0].printCount,2);
assert.equal(entries[0].values.fullName,'MR. EXAMPLE STUDENT');
assert(letterPrintStamp(sample.lastGeneratedAt).includes('27 Oct 2026'));
assert.equal(letterPrintStamp(''),'Never');
for(const kind of ['cancel','graduated','criminal']){
 for(const suffix of ['CaseList','NewCase','SaveCase','CurrentCaseStatus'])
  assert(html.includes('id="'+kind+suffix+'"'),'Missing '+kind+suffix);
 assert(app.includes("saveLetterCase('"+kind+"',{generatedAt:new Date().toISOString(),silent:true})"),
   kind+' must store download time after document generation');
 assert(app.includes("state.activeLetterCaseIds."+kind+"=null; // A test case cannot overwrite"),
   kind+' demonstration fill cannot overwrite an opened case');
}
assert(app.includes("letterCases: state.letterCases,"),'Persistent local state includes letter cases');
assert(app.includes("normalizeLetterCases(stored.letterCases)"),'Restore saved cases at startup');
assert(app.includes("normalizeLetterCases(payload.letterCases)"),'Import cases from backup');
assert(app.includes("letterCases: state.letterCases, settings: state.settings, templates,"),
  'Export cases in backup');
assert(app.includes("letterPrintStamp(item.generatedAt)"),
  'Normal, Exchange and Non-O cases expose the existing generated date');
assert(app.includes("Last printed / downloaded:"),
  'Use an honest generated/downloaded timestamp instead of asserting physical printing');
assert(styles.includes('.letter-case-panel')&&styles.includes('.letter-case-row'));
assert.equal(fs.readFileSync('cancel-letter.js','utf8').includes('word/document.xml'),true);
assert.equal(fs.readFileSync('graduated-letter.js','utf8').includes('word/document.xml'),true);
assert.equal(fs.readFileSync('criminal-record-letter.js','utf8').includes('word/document.xml'),true);
console.log('Saved letter case tests passed: reusable cases, normalized imports, backups, category isolation, print timestamps, test-data safety.');
