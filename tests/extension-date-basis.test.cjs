/* Synthetic-only visa extension basis regression. */
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {TextEncoder,TextDecoder}=require('node:util');

const app=fs.readFileSync('app.js','utf8');
const needle="  boot();\n})();";
assert(app.includes(needle));
const appContext={window:{},document:{},console,Date,Math,Set,Map,Intl,Number,String,Array,RegExp};
vm.runInNewContext(app.replace(needle,
  "  window.__extensionTest={defaultExtensionDateBasis,extensionDateBasis,calculateRequestedUntil,calculateRequestUntil};\n})();"),appContext);
const fn=appContext.window.__extensionTest;

assert.equal(fn.defaultExtensionDateBasis({registeredCredits:49}),'issue_date');
assert.equal(fn.defaultExtensionDateBasis({registeredCredits:'49'}),'issue_date');
assert.equal(fn.defaultExtensionDateBasis({registeredCredits:50}),'current_stay');
assert.equal(fn.defaultExtensionDateBasis({registeredCredits:129}),'current_stay');
assert.equal(fn.defaultExtensionDateBasis({registeredCredits:''}),'current_stay');
assert.equal(fn.extensionDateBasis({registeredCredits:20,extensionDateBasis:'current_stay'}),'current_stay',
  'Staff can still override the auto-selected basis after it is chosen');

const low={registeredCredits:49,currentStayUntil:'2026-12-20',passportExpiry:'2030-01-01',requestRuleOverride:'six_months'};
assert.equal(fn.calculateRequestedUntil(low,'2026-10-07'),'2027-04-07',
  'Under 50 credits uses Date of issue as the six-month base');
const threshold={...low,registeredCredits:50};
assert.equal(fn.calculateRequestedUntil(threshold,'2026-10-07'),'2027-06-20',
  'At 50 credits the legacy Current stay until basis remains the default');
const capped={...low,passportExpiry:'2027-02-01'};
assert.equal(fn.calculateRequestUntil(capped,'2026-10-07'),'2027-02-01',
  'Passport expiry remains the hard cap');

const word=fs.readFileSync('docx-engine.js','utf8');
const ending="  window.BrowserDocx = { generateIndividual, generateBatch, generateList, formattedTitle };";
assert(word.includes(ending));
const wordContext={window:{},TextEncoder,TextDecoder,Blob,Date,Map,Uint8Array,console};
vm.runInNewContext(word.replace(ending,ending+
  "\n  window.__extensionDocxTest={extensionDateBasis,requestUntil};"),wordContext);
const w=wordContext.window.__extensionDocxTest;
assert.equal(w.extensionDateBasis({registeredCredits:49}),'issue_date');
assert.equal(w.extensionDateBasis({registeredCredits:50}),'current_stay');
assert.deepEqual(JSON.parse(JSON.stringify(w.requestUntil({
  registeredCredits:49,currentStayUntil:'2026-12-20',passportExpiry:'2030-01-01',requestRuleOverride:'six_months'
},'2026-10-07'))),{y:2027,m:4,d:7});
assert.deepEqual(JSON.parse(JSON.stringify(w.requestUntil({
  registeredCredits:49,extensionDateBasis:'current_stay',currentStayUntil:'2026-12-20',passportExpiry:'2030-01-01',requestRuleOverride:'six_months'
},'2026-10-07'))),{y:2027,m:6,d:20});

assert(app.includes("editableSelect('Extend until', 'extensionDateBasis'"));
assert(app.includes("['issue_date','Date of issue']"));
assert(app.includes("Credits Completed"));
console.log('PASS extension basis: <50 credits auto Date of issue; 50+ defaults to Current stay until; passport cap preserved.');
