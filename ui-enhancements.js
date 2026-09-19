// Non-destructive Add Student enhancements. Never replaceChildren on #studentForm:
// doing so silently discarded Exchange, Non-O, and case-type fields.
(() => {
  'use strict';
  const form=document.getElementById('studentForm');
  const modal=document.getElementById('studentModal');
  if(!form||!modal)return;
  const date=value=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return null;
    const [y,m,d]=value.split('-').map(Number), result=new Date(y,m-1,d);
    return result.getFullYear()===y&&result.getMonth()===m-1&&result.getDate()===d?result:null;
  };
  const addMonths=(value,count)=>{
    const source=date(value);if(!source)return null;
    const result=new Date(source.getFullYear(),source.getMonth()+count,1);
    result.setDate(Math.min(source.getDate(),new Date(result.getFullYear(),result.getMonth()+1,0).getDate()));
    return result;
  };
  const readable=value=>value?new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(value):'—';
  let dismissed='';
  function signature() {
    const expiry=date(form.elements.passportExpiry?.value),stay=form.elements.currentStayUntil?.value||'';
    const rule=form.elements.requestRuleOverride?.value||'',manual=form.elements.manualRequestUntil?.value||'';
    const requested=rule==='manual'?date(manual):addMonths(stay,rule==='one_year'?12:6);
    return {expiry,requested,key:[expiry?.getTime(),stay,rule,manual,requested?.getTime()].join('|')};
  }
  function update(reset=false) {
    if(reset)dismissed='';
    const warning=form.querySelector('.passport-warning');if(!warning)return;
    const {expiry,requested,key}=signature();
    const visible=Boolean(expiry&&requested&&expiry<requested&&key!==dismissed);
    warning.classList.toggle('hidden',!visible);
    if(visible)warning.querySelector('.passport-warning-text').textContent=
      'Passport expires '+readable(expiry)+', before the requested date '+readable(requested)+
      '. The generated letter will use '+readable(expiry)+' as the extension end date, even if this warning is dismissed.';
  }
  function enhance() {
    if(modal.classList.contains('hidden')||!form.children.length||form.querySelector('.passport-warning'))return;
    const warning=document.createElement('div');
    warning.className='passport-warning case-passport-warning hidden';
    warning.setAttribute('role','alert');
    warning.innerHTML='<div class="warning-copy"><strong>Passport validity warning</strong><span class="passport-warning-text"></span></div><button type="button" class="warning-dismiss">Dismiss</button>';
    form.append(warning);
    update();
  }
  form.addEventListener('input',event=>{
    if(event.target.matches('[name="passportExpiry"],[name="currentStayUntil"],[name="requestRuleOverride"],[name="manualRequestUntil"]'))update(true);
  });
  form.addEventListener('change',event=>{
    if(event.target.matches('[name="passportExpiry"],[name="currentStayUntil"],[name="requestRuleOverride"],[name="manualRequestUntil"]'))update(true);
  });
  form.addEventListener('click',event=>{
    if(!event.target.closest('.warning-dismiss'))return;
    dismissed=signature().key;update();
  });
  new MutationObserver(enhance).observe(modal,{subtree:true,childList:true});
  document.addEventListener('click',event=>{if(event.target.closest('#addStudentBtn'))queueMicrotask(enhance)});
})();
