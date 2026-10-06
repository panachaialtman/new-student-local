const fs=require('node:fs');
const assert=require('node:assert/strict');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');

assert.match(app,/rememberCurrentLetterCases\(\[item\],'add_student'/,'Add Student must explicitly write shared memory');
assert.match(app,/rememberCurrentLetterCases\(items,'create_letter',body\.issueDate,body\.signatory/,'Batch Create Letter must finalize shared memory');
assert.match(app,/rememberCurrentLetterCases\(\[item\],'create_letter',body\.issueDate,body\.signatory/,'Individual Create Letter must finalize shared memory');
const saveDrawer=app.slice(app.indexOf('function saveDrawerChanges()'),app.indexOf('function renderStudentForm',app.indexOf('function saveDrawerChanges()')));
assert.doesNotMatch(saveDrawer,/BUICStudentMemory|rememberCurrentLetterCases/,'Ordinary case edits must not update shared memory');
const draft=app.slice(app.indexOf('async function saveStudentDraft()'),app.indexOf('function todayIso',app.indexOf('async function saveStudentDraft()')));
assert.doesNotMatch(draft,/BUICStudentMemory|rememberCurrentLetterCases/,'Draft save must not update shared memory');
assert.match(app,/buic-student-memory-selected/,'Student DB selection must populate Current Letter');
assert.match(html,/student-memory\.js\?v=2/);
assert.match(sw,/\.\/student-memory\.js/);
console.log('PASS shared student-memory save contract');
