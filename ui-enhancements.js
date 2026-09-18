(() => {
  'use strict';

  function parseIso(value) {
    if (!value) return null;
    const parts = value.split('-').map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function iso(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function addMonths(value, count) {
    const source = parseIso(value);
    if (!source) return '';
    const day = source.getDate();
    const target = new Date(source.getFullYear(), source.getMonth() + count, 1);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, last));
    return iso(target);
  }

  function pretty(value) {
    const d = parseIso(value);
    if (!d) return value || '—';
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
  }

  function field(form, name) {
    return form.querySelector(`[name="${name}"]`)?.closest('.form-field') || null;
  }

  function separator() {
    const node = document.createElement('div');
    node.className = 'form-separator';
    node.setAttribute('aria-hidden', 'true');
    return node;
  }

  function enhanceStudentForm() {
    const form = document.getElementById('studentForm');
    if (!form || !form.children.length || form.dataset.workflowEnhanced === 'true') return;
    form.dataset.workflowEnhanced = 'true';

    const documentNo = field(form, 'documentNo');
    const titleField = field(form, 'title');
    const fullName = field(form, 'fullName');
    const nationality = field(form, 'nationalityThai');
    const passportNo = field(form, 'passportNo');
    const passportExpiry = field(form, 'passportExpiry');
    const currentStay = field(form, 'currentStayUntil');
    const studentId = field(form, 'studentId');
    const programType = field(form, 'programType');
    const faculty = field(form, 'facultyKey');
    const major = field(form, 'programKey');
    const totalCredits = field(form, 'totalCredits');
    const registeredCredits = field(form, 'registeredCredits');
    const requestOption = field(form, 'requestRuleOverride');
    const manualRequest = field(form, 'manualRequestUntil');

    if (![documentNo, titleField, fullName, nationality, passportNo, passportExpiry, currentStay, studentId, programType, faculty, major, totalCredits, registeredCredits, requestOption].every(Boolean)) return;

    documentNo.classList.add('full');

    const titleSelect = titleField.querySelector('select');
    const fullInput = fullName.querySelector('input');
    const combo = document.createElement('div');
    combo.className = 'name-title-combo';
    titleSelect.setAttribute('aria-label', 'Title');
    combo.append(titleSelect, fullInput);
    fullName.append(combo);

    currentStay.classList.add('full', 'single-half');

    totalCredits.querySelector('label').textContent = 'Total credits (Auto)';
    const creditInput = totalCredits.querySelector('input');
    creditInput.readOnly = true;
    creditInput.tabIndex = -1;

    const academicRow = document.createElement('div');
    academicRow.className = 'form-row-three';
    academicRow.append(faculty, major, totalCredits);

    const warning = document.createElement('div');
    warning.className = 'passport-warning hidden';
    warning.innerHTML = '<div class="warning-copy"><strong>Passport validity warning</strong><span id="newPassportWarningText"></span></div><button class="warning-dismiss" type="button">Dismiss</button>';

    const nodes = [
      documentNo,
      separator(),
      fullName, nationality,
      passportNo, passportExpiry,
      currentStay,
      separator(),
      studentId, programType,
      academicRow,
      registeredCredits, requestOption,
    ];
    if (manualRequest) nodes.push(manualRequest);
    nodes.push(warning);
    form.replaceChildren(...nodes);

    let dismissedFor = '';
    const expiryInput = form.elements.passportExpiry;
    const stayInput = form.elements.currentStayUntil;
    const ruleInput = form.elements.requestRuleOverride;
    const manualInput = form.elements.manualRequestUntil;

    function requestedUntil() {
      if (!stayInput?.value) return '';
      if (ruleInput?.value === 'one_year') return addMonths(stayInput.value, 12);
      if (ruleInput?.value === 'manual') return manualInput?.value || '';
      return addMonths(stayInput.value, 6);
    }

    function updateWarning(resetDismiss = false) {
      if (resetDismiss) dismissedFor = '';
      const expiry = expiryInput?.value || '';
      const requested = requestedUntil();
      const signature = [expiry, stayInput?.value || '', ruleInput?.value || '', manualInput?.value || '', requested].join('|');
      const conflict = expiry && requested && parseIso(expiry) < parseIso(requested);
      const show = conflict && dismissedFor !== signature;
      warning.classList.toggle('hidden', !show);
      if (show) {
        warning.querySelector('#newPassportWarningText').textContent =
          `Passport expires ${pretty(expiry)}, before the requested stay date ${pretty(requested)}. Consider renewing the passport before extension; otherwise the requested date exceeds the passport validity.`;
      }
    }

    [expiryInput, stayInput, ruleInput, manualInput].filter(Boolean).forEach((input) => {
      input.addEventListener('change', () => updateWarning(true));
      input.addEventListener('input', () => updateWarning(true));
    });

    warning.querySelector('.warning-dismiss').addEventListener('click', () => {
      const requested = requestedUntil();
      dismissedFor = [expiryInput?.value || '', stayInput?.value || '', ruleInput?.value || '', manualInput?.value || '', requested].join('|');
      warning.classList.add('hidden');
    });

    updateWarning();
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('#addStudentBtn')) setTimeout(enhanceStudentForm, 0);
  });

  const modal = document.getElementById('studentModal');
  if (modal) {
    new MutationObserver(() => {
      if (!modal.classList.contains('hidden')) enhanceStudentForm();
    }).observe(modal, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  }
})();
