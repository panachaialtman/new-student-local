(() => {
  'use strict';

  const STORAGE_KEY = 'buic_new_student_visa_workspace_v01';
  const BATCH_KEY = 'buic_new_student_visa_batches_v01';
  const SETTINGS_KEY = 'buic_new_student_visa_settings_v01';

  const STATUS_META = {
    all: { label: 'All' },
    ready: { label: 'Ready', className: 'status-ready' },
    missing_info: { label: 'Needs attention', className: 'status-missing' },
    generated: { label: 'Generated', className: 'status-generated' },
    completed: { label: 'Completed', className: 'status-completed' },
    draft: { label: 'Draft', className: 'status-draft' },
  };

  const SIGNATORY_PROFILES = {
    somyot: {
      name: 'ผู้ช่วยศาสตราจารย์ ดร. สมยศ วัฒนากมลชัย',
      role: 'รองอธิการบดีสายนานาชาติ ปฏิบัติหน้าที่แทน',
    },
    duangthida: {
      name: 'ผู้ช่วยศาสตราจารย์ ดร. ดวงธิดา นันทาภิรัตน์',
      role: 'ผู้ช่วยอธิการบดีสายนานาชาติ ปฏิบัติหน้าที่แทน',
    },
  };

  const PROGRAM_TYPE_OPTIONS = [
    ['international', 'International program'],
    ['chinese_international', 'Chinese International program'],
    ['thai', 'Thai program'],
    ['graduate', 'Graduate program'],
  ];

  const state = {
    programs: [],
    nationalities: [],
    cases: [],
    batches: [],
    selected: new Set(),
    activeStatus: 'all',
    search: '',
    programTypeFilter: 'all',
    activeCaseId: null,
    editing: false,
    settings: {
      signatory: 'somyot',
    },
    templates: { letter16: null, letter76: null, studentList: null },
  };

  const el = (id) => document.getElementById(id);
  const escapeHtml = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function uid(prefix = 'case') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function todayIso() {
    const d = new Date();
    return toIsoDate(d);
  }

  function toIsoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseIsoDate(value) {
    if (!value) return null;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function addMonths(value, count) {
    const source = parseIsoDate(value);
    if (!source) return '';
    const day = source.getDate();
    const target = new Date(source.getFullYear(), source.getMonth() + count, 1);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, last));
    return toIsoDate(target);
  }

  function endOfMonth(value) {
    const source = parseIsoDate(value);
    if (!source) return '';
    const end = new Date(source.getFullYear(), source.getMonth() + 1, 0);
    return toIsoDate(end);
  }

  function formatDate(value, options = {}) {
    const d = parseIsoDate(value);
    if (!d) return '—';
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', ...options,
    }).format(d);
  }

  function inferRule(caseItem) {
    const rule = caseItem.requestRuleOverride;
    return ['six_months', 'one_year', 'manual'].includes(rule) ? rule : 'six_months';
  }

  function calculateRequestUntil(caseItem) {
    const rule = inferRule(caseItem);
    if (rule === 'six_months') return addMonths(caseItem.currentStayUntil, 6);
    if (rule === 'one_year') return addMonths(caseItem.currentStayUntil, 12);
    if (rule === 'manual') return caseItem.manualRequestUntil || '';
    return '';
  }

  function ruleLabel(caseItem) {
    const labels = { six_months: '+6 months', one_year: '+1 year', manual: 'Manual Date' };
    return labels[inferRule(caseItem)] || '+6 months';
  }

  function normalizeSignatoryKey(value) {
    const raw = String(value || '').trim();
    if (SIGNATORY_PROFILES[raw]) return raw;
    if (raw.includes('ดวงธิดา')) return 'duangthida';
    return 'somyot';
  }

  function signatoryProfile(value) {
    return SIGNATORY_PROFILES[normalizeSignatoryKey(value)];
  }

  function signatoryOptions(selected) {
    const key = normalizeSignatoryKey(selected);
    return Object.entries(SIGNATORY_PROFILES).map(([id, profile]) =>
      `<option value="${id}" ${id === key ? 'selected' : ''}>${escapeHtml(profile.name)}</option>`
    ).join('');
  }

  function signatoryPreview(value) {
    const profile = signatoryProfile(value);
    return `<div class="signature-preview"><strong>(${escapeHtml(profile.name)})</strong><span>${escapeHtml(profile.role)}</span><span>อธิการบดี</span></div>`;
  }

  function programByKey(key) {
    return state.programs.find((p) => p.key === key);
  }

  function normalizeCase(caseItem) {
    const item = { ...caseItem };
    const program = programByKey(item.programKey);
    if (program) {
      item.programType = program.programType || item.programType;
      item.facultyEnglish = program.facultyEnglish || item.facultyEnglish || '';
      item.facultyThai = program.facultyThai || item.facultyThai || '';
      item.programEnglish = program.programEnglish || item.programEnglish || '';
      item.programThai = program.programThai || item.programThai || '';
      const referenceCredits = program.credits?.['2026'];
      if (referenceCredits !== null && referenceCredits !== undefined && referenceCredits !== '-') item.totalCredits = referenceCredits;
    }
    if (!PROGRAM_TYPE_OPTIONS.some(([value]) => value === item.programType)) item.programType = 'international';
    if (!['six_months', 'one_year', 'manual'].includes(item.requestRuleOverride)) item.requestRuleOverride = 'six_months';
    item.studyHours = item.registeredCredits ? Number(item.registeredCredits) * 14 : '';
    item.requestUntil = calculateRequestUntil(item);
    return item;
  }

  function validationFor(caseItem) {
    const item = normalizeCase(caseItem);
    const missing = [];
    const requiredFields = [
      ['documentNo', 'document number'],
      ['fullName', 'student name'],
      ['studentId', 'student ID'],
      ['title', 'title'],
      ['nationalityThai', 'Thai nationality'],
      ['passportNo', 'passport number'],
      ['passportExpiry', 'passport expiry'],
      ['currentStayUntil', 'current stay date'],
      ['programKey', 'major'],
      ['totalCredits', 'total credits'],
      ['registeredCredits', 'registered credits'],
    ];
    requiredFields.forEach(([field, label]) => {
      if (item[field] === undefined || item[field] === null || String(item[field]).trim() === '') missing.push(label);
    });
    if (!item.facultyThai) missing.push('faculty');
    if (!item.programThai) missing.push('Thai major name');
    if (inferRule(item) === 'manual' && !item.manualRequestUntil) missing.push('manual request-until date');
    return { missing, valid: missing.length === 0 };
  }

  function deriveStatus(caseItem) {
    if (caseItem.completedAt) return 'completed';
    if (caseItem.generatedAt) return 'generated';
    return validationFor(caseItem).missing.length ? 'missing_info' : 'ready';
  }

  function programTypeLabel(type) {
    return ({
      international: 'International',
      chinese_international: 'Chinese International',
      thai: 'Thai',
      graduate: 'Graduate',
    })[type] || 'Program';
  }

  function facultyKeyFor(program) {
    if (!program) return '';
    return `${program.facultyEnglish || ''}|||${program.facultyThai || ''}`;
  }

  function facultyLabelForType(type, program) {
    if (!program) return '';
    if (type === 'international' || type === 'chinese_international') return program.facultyEnglish || program.facultyThai || '';
    return program.facultyThai || program.facultyEnglish || '';
  }

  function majorLabelForType(type, program) {
    if (!program) return '';
    if (type === 'thai') return program.programThai || program.programEnglish || '';
    return program.programEnglish || program.programThai || '';
  }

  function programsForType(type) {
    return state.programs.filter((program) => program.programType === type);
  }

  function facultyOptionsForType(type) {
    const seen = new Map();
    programsForType(type).forEach((program) => {
      const key = facultyKeyFor(program);
      if (key && !seen.has(key)) seen.set(key, facultyLabelForType(type, program));
    });
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], type === 'thai' || type === 'graduate' ? 'th' : 'en'));
  }

  function programsForFaculty(type, facultyKey) {
    return programsForType(type)
      .filter((program) => facultyKeyFor(program) === facultyKey)
      .sort((a, b) => majorLabelForType(type, a).localeCompare(majorLabelForType(type, b), type === 'thai' ? 'th' : 'en'));
  }

  function displayProgramName(item, program) {
    if (program) return majorLabelForType(item.programType, program);
    return item.programEnglish || item.programThai || item.programKey || 'Program not selected';
  }

  function buildSeedCases() {
    // Demo-only data. No real passport/student records from the uploaded ZIP are embedded here.
    return [
      {
        id: uid(), documentNo: '3371', title: 'MISS', fullName: 'Demo Student A', nationalityThai: 'เมียนมา', studentId: '1691000001',
        passportNo: 'DEMO0001', passportExpiry: '2028-05-24', currentStayUntil: '2026-08-28',
        programKey: 'Creative Communication Design [BUI]', programType: 'international', registeredCredits: 51,
        requestRuleOverride: 'six_months', attachment43: 'transcript',
      },
      {
        id: uid(), documentNo: '3372', title: 'MR', fullName: 'Demo Student B', nationalityThai: 'จีน', studentId: '1691000002',
        passportNo: 'DEMO0002', passportExpiry: '2029-01-12', currentStayUntil: '2026-09-04',
        programKey: 'Business Administration [BUI]', programType: 'international', registeredCredits: 18,
        requestRuleOverride: 'one_year',
      },
      {
        id: uid(), documentNo: '3373', title: 'MISS', fullName: 'Demo Student C', nationalityThai: 'เวียดนาม', studentId: '1691000003',
        passportNo: 'DEMO0003', passportExpiry: '2030-02-03', currentStayUntil: '2026-09-12',
        programKey: 'Marketing [BUI]', programType: 'international', registeredCredits: 129,
        requestRuleOverride: 'six_months',
      },
      {
        id: uid(), documentNo: '3374', title: 'MR', fullName: 'Demo Graduate Student', nationalityThai: 'เมียนมา', studentId: '7690300004',
        passportNo: 'DEMO0004', passportExpiry: '2028-05-06', currentStayUntil: '2026-08-11',
        programKey: 'Master of Business Administration Program (English Program) [คณะบริหารธุรกิจ]', programType: 'graduate',
        totalCredits: 42, registeredCredits: 12, requestRuleOverride: 'six_months',
      },
    ].map(normalizeCase);
  }

  async function loadLocalState() {
    try {
      const stored = await VisaDB.getState('workspace_v02');
      if (stored && typeof stored === 'object') {
        state.cases = Array.isArray(stored.cases) ? stored.cases.map(normalizeCase) : [];
        state.batches = Array.isArray(stored.batches) ? stored.batches : [];
        state.settings = { ...state.settings, ...(stored.settings || {}) };
      } else {
        // Same-origin migration for development builds. GitHub Pages uses a new
        // origin, so portable users should use Backup data -> Restore instead.
        const legacyCases = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        const legacyBatches = JSON.parse(localStorage.getItem(BATCH_KEY) || '[]');
        const legacySettings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
        state.cases = Array.isArray(legacyCases) ? legacyCases.map(normalizeCase) : [];
        state.batches = Array.isArray(legacyBatches) ? legacyBatches : [];
        if (legacySettings) state.settings = { ...state.settings, ...legacySettings };
        if (state.cases.length || state.batches.length || legacySettings) persist();
      }
      delete state.settings.nextDocumentNumber;
      state.settings.signatory = normalizeSignatoryKey(state.settings.signatory);
    } catch (err) {
      console.warn('Could not load browser state', err);
      state.cases = [];
      state.batches = [];
    }
  }

  function persist() {
    VisaDB.setState('workspace_v02', {
      cases: state.cases,
      batches: state.batches,
      settings: state.settings,
      savedAt: new Date().toISOString(),
    }).catch((err) => console.error('Autosave failed', err));
  }

  async function loadReferenceData() {
    const programFiles = [
      'data/programs-1.json',
      'data/programs-2.json',
      'data/programs-3.json',
      'data/programs-4.json',
      'data/programs-5.json',
    ];
    const nationalityFiles = [
      'data/nationalities-1.json',
      'data/nationalities-2.json',
      'data/nationalities-3.json',
      'data/nationalities-4.json',
    ];
    const loadChunks = async (files, label) => {
      const responses = await Promise.all(files.map((path) => fetch(path, { cache: 'no-store' })));
      const failed = responses.findIndex((response) => !response.ok);
      if (failed !== -1) throw new Error(`Could not load ${label} reference data (${files[failed]})`);
      const chunks = await Promise.all(responses.map((response) => response.json()));
      return chunks.flat();
    };
    [state.programs, state.nationalities] = await Promise.all([
      loadChunks(programFiles, 'program'),
      loadChunks(nationalityFiles, 'nationality'),
    ]);
    if (state.programs.length !== 82) throw new Error(`Program reference data incomplete: ${state.programs.length}/82 records loaded`);
    if (state.nationalities.length !== 199) throw new Error(`Nationality reference data incomplete: ${state.nationalities.length}/199 records loaded`);
  }

  function ensureNationalityDatalist() {
    const list = el('nationalitySuggestions');
    if (!list) return;
    const options = [];
    state.nationalities.forEach((item) => {
      const aliasText = item.aliases?.length ? ` · ${item.aliases.join(', ')}` : '';
      options.push(`<option value="${escapeHtml(item.thai)}" label="${escapeHtml(item.english + aliasText)}"></option>`);
      (item.aliases || []).forEach((alias) => options.push(`<option value="${escapeHtml(alias)}" label="${escapeHtml(item.english + ' · alias')}"></option>`));
    });
    list.innerHTML = options.join('');
  }

  function filteredCases() {
    const q = state.search.trim().toLowerCase();
    return state.cases.filter((item) => {
      const status = deriveStatus(item);
      if (state.activeStatus !== 'all' && status !== state.activeStatus) return false;
      if (state.programTypeFilter !== 'all' && item.programType !== state.programTypeFilter) return false;
      if (!q) return true;
      return [item.fullName, item.studentId, item.documentNo, item.passportNo, item.programKey]
        .some((v) => String(v || '').toLowerCase().includes(q));
    });
  }

  function renderStats() {
    const counts = { total: state.cases.length, ready: 0, generated: 0, attention: 0 };
    state.cases.forEach((item) => {
      const status = deriveStatus(item);
      if (status === 'ready') counts.ready++;
      if (status === 'generated' || status === 'completed') counts.generated++;
      if (status === 'missing_info') counts.attention++;
    });
    el('statsGrid').innerHTML = [
      ['Active cases', counts.total, 'Current local workspace', 'stat-blue'],
      ['Ready to prepare', counts.ready, 'Validated and complete', 'stat-green'],
      ['Generated', counts.generated, 'Letters already prepared', 'stat-amber'],
      ['Needs attention', counts.attention, 'Missing required information', 'stat-red'],
    ].map(([label, value, foot, klass]) => `
      <article class="stat-card ${klass}">
        <div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div>
      </article>`).join('');
  }

  function renderTabs() {
    const counts = {};
    Object.keys(STATUS_META).forEach((k) => counts[k] = 0);
    counts.all = state.cases.length;
    state.cases.forEach((item) => { const s = deriveStatus(item); counts[s] = (counts[s] || 0) + 1; });
    const order = ['all', 'ready', 'missing_info', 'generated', 'completed'];
    el('statusTabs').innerHTML = order.map((key) => `
      <button class="tab-btn ${state.activeStatus === key ? 'active' : ''}" data-status="${key}">
        ${STATUS_META[key].label}<span class="tab-count">${counts[key] || 0}</span>
      </button>`).join('');
    el('statusTabs').querySelectorAll('[data-status]').forEach((btn) => btn.addEventListener('click', () => {
      state.activeStatus = btn.dataset.status;
      renderWorkspace();
    }));
  }

  function statusChip(status) {
    const meta = STATUS_META[status] || STATUS_META.draft;
    return `<span class="status-chip ${meta.className || 'status-draft'}">${escapeHtml(meta.label)}</span>`;
  }

  function renderCaseRow(item) {
    const status = deriveStatus(item);
    const selected = state.selected.has(item.id);
    const requestUntil = calculateRequestUntil(item);
    const program = programByKey(item.programKey);
    const programName = displayProgramName(item, program);
    return `
      <div class="case-row ${selected ? 'selected' : ''}" data-case-id="${item.id}">
        <div><input class="case-check" type="checkbox" ${selected ? 'checked' : ''} aria-label="Select ${escapeHtml(item.fullName)}" /></div>
        <div class="case-click student-cell">
          <div class="student-name">${escapeHtml(item.fullName || 'Unnamed student')}</div>
          <div class="student-meta"><span class="meta-strong">${escapeHtml(item.studentId || 'No ID')}</span><span>•</span><span>Doc ${escapeHtml(item.documentNo || '—')}</span></div>
        </div>
        <div class="case-click program-cell">
          <div class="program-name">${escapeHtml(programName)}</div>
          <div class="program-sub"><span class="type-chip">${programTypeLabel(item.programType)}</span><span>${escapeHtml(ruleLabel(item))}</span></div>
        </div>
        <div class="case-click visa-cell">
          <div class="visa-primary">${requestUntil ? formatDate(requestUntil) : 'Not available yet'}</div>
          <div class="visa-secondary">Stay: ${formatDate(item.currentStayUntil)}</div>
        </div>
        <div class="case-click">${statusChip(status)}</div>
        <div class="case-click row-chevron">›</div>
      </div>`;
  }

  function renderCaseList() {
    const items = filteredCases();
    el('caseList').innerHTML = items.map(renderCaseRow).join('');
    el('emptyState').classList.toggle('hidden', items.length > 0);
    items.forEach((item) => {
      const row = el('caseList').querySelector(`[data-case-id="${CSS.escape(item.id)}"]`);
      const check = row.querySelector('.case-check');
      check.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleSelection(item.id, check.checked);
      });
      row.querySelectorAll('.case-click').forEach((cell) => cell.addEventListener('click', () => openDrawer(item.id)));
    });
    const allVisible = items.length > 0 && items.every((i) => state.selected.has(i.id));
    el('selectAll').checked = allVisible;
    el('selectAll').indeterminate = items.some((i) => state.selected.has(i.id)) && !allVisible;
  }

  function renderWorkspace() {
    state.cases = state.cases.map(normalizeCase);
    renderStats();
    renderTabs();
    renderCaseList();
    renderSelectionBar();
    persist();
  }

  function toggleSelection(id, checked) {
    if (checked) state.selected.add(id); else state.selected.delete(id);
    renderCaseList();
    renderSelectionBar();
  }

  function renderSelectionBar() {
    const count = state.selected.size;
    el('selectionBar').classList.toggle('hidden', count === 0);
    el('selectedCount').textContent = `${count} selected`;
  }

  function getActiveCase() {
    return state.cases.find((item) => item.id === state.activeCaseId);
  }

  function openDrawer(id) {
    state.activeCaseId = id;
    state.editing = false;
    renderDrawer();
    el('drawerBackdrop').classList.remove('hidden');
    el('detailDrawer').classList.add('open');
  }

  function closeDrawer() {
    el('drawerBackdrop').classList.add('hidden');
    el('detailDrawer').classList.remove('open');
    state.editing = false;
  }

  function fieldItem(label, value, strong = false) {
    return `<div class="field-item"><label>${label}</label><div class="field-value ${strong ? 'strong' : ''}">${escapeHtml(value || '—')}</div></div>`;
  }

  function editableField(label, field, value, type = 'text', extra = '') {
    return `<div class="drawer-field"><label>${label}</label><input data-edit-field="${field}" type="${type}" value="${escapeHtml(value || '')}" ${extra}/></div>`;
  }

  function editableSelect(label, field, value, options, extra = '') {
    return `<div class="drawer-field"><label>${label}</label><select data-edit-field="${field}" ${extra}>${options.map(([v,l]) => `<option value="${escapeHtml(v)}" ${value === v ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select></div>`;
  }

  function renderDrawer() {
    const source = getActiveCase();
    if (!source) return;
    const item = normalizeCase(source);
    const status = deriveStatus(item);
    const validation = validationFor(item);
    const program = programByKey(item.programKey);
    el('drawerName').textContent = item.fullName || 'Unnamed student';
    el('drawerId').textContent = `${item.studentId || 'No student ID'} · Document ${item.documentNo || 'not assigned'}`;
    el('editStudentBtn').classList.toggle('hidden', state.editing);
    el('saveStudentBtn').classList.toggle('hidden', !state.editing);
    el('printIndividualBtn').classList.toggle('hidden', state.editing);

    if (state.editing) {
      const rule = inferRule(item);
      const typeOptions = PROGRAM_TYPE_OPTIONS;
      const currentFacultyKey = facultyKeyFor(program) || `${item.facultyEnglish || ''}|||${item.facultyThai || ''}`;
      const facultyOptions = facultyOptionsForType(item.programType);
      const majorOptions = programsForFaculty(item.programType, currentFacultyKey);
      el('drawerContent').innerHTML = `
        <div class="drawer-section"><div class="drawer-section-head"><h3>Personal information</h3>${statusChip(status)}</div>
          <div class="field-grid">
            ${editableField('Document no.', 'documentNo', item.documentNo)}
            ${editableSelect('Title', 'title', item.title, [['MISS','MISS'],['MR','MR'],['MS','MS'],['MRS','MRS']])}
            ${editableField('Full name', 'fullName', item.fullName)}
            ${editableField('Student ID', 'studentId', item.studentId)}
            ${editableField('Nationality Thai', 'nationalityThai', item.nationalityThai, 'text', 'list="nationalitySuggestions" autocomplete="off"')}
            ${editableField('Passport no.', 'passportNo', item.passportNo)}
            ${editableField('Passport expiry', 'passportExpiry', item.passportExpiry, 'date')}
            ${editableField('Current stay until', 'currentStayUntil', item.currentStayUntil, 'date')}
          </div>
        </div>
        <div class="drawer-section"><div class="drawer-section-head"><h3>Academic information</h3></div>
          <div class="field-grid">
            ${editableSelect('Program type', 'programType', item.programType, typeOptions, 'data-academic-type="drawer"')}
            <div class="drawer-field"><label>Faculty</label><select id="drawerFacultySelect" data-academic-faculty="drawer">${facultyOptions.map(([v,l]) => `<option value="${escapeHtml(v)}" ${v === currentFacultyKey ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select></div>
            <div class="drawer-field full"><label>Major</label><select data-edit-field="programKey" id="drawerProgramSelect" data-academic-program="drawer">${majorOptions.map((p) => `<option value="${escapeHtml(p.key)}" ${p.key === item.programKey ? 'selected' : ''}>${escapeHtml(majorLabelForType(item.programType, p))}</option>`).join('')}</select></div>
            ${editableField('Total credits', 'totalCredits', item.totalCredits, 'number')}
            ${editableField('Registered credits', 'registeredCredits', item.registeredCredits, 'number')}
          </div>
        </div>
        <div class="drawer-section"><div class="drawer-section-head"><h3>Visa request</h3></div>
          <div class="field-grid">
            ${editableSelect('Request option', 'requestRuleOverride', rule, [['six_months','+6 months'],['one_year','+1 year'],['manual','Manual Date']], 'data-request-rule="drawer"')}
            <div class="drawer-field manual-request-field ${rule === 'manual' ? '' : 'hidden'}"><label>Manual request until</label><input data-edit-field="manualRequestUntil" type="date" value="${escapeHtml(item.manualRequestUntil || '')}" /></div>
          </div>
        </div>`;
      const ruleSelect = el('drawerContent').querySelector('[data-request-rule="drawer"]');
      ruleSelect?.addEventListener('change', () => {
        el('drawerContent').querySelector('.manual-request-field')?.classList.toggle('hidden', ruleSelect.value !== 'manual');
      });
      bindAcademicSelectors({
        root: el('drawerContent'),
        typeSelector: '[data-academic-type="drawer"]',
        facultySelector: '#drawerFacultySelect',
        programSelector: '#drawerProgramSelect',
        totalCreditsSelector: '[data-edit-field="totalCredits"]',
      });
    } else {
      const facultyDisplay = program ? facultyLabelForType(item.programType, program) : (item.facultyThai || item.facultyEnglish);
      el('drawerContent').innerHTML = `
        <div class="drawer-section"><div class="drawer-section-head"><h3>Case status</h3>${statusChip(status)}</div>
          <div class="rule-box"><strong>${escapeHtml(ruleLabel(item))}</strong><br>${ruleExplanation(item)}</div>
          ${validation.valid ? '' : `<div class="validation-summary bad"><strong>Needs attention:</strong> ${escapeHtml(validation.missing.join(', '))}</div>`}
        </div>
        <div class="drawer-section"><div class="drawer-section-head"><h3>Personal information</h3></div>
          <div class="field-grid">
            ${fieldItem('Title', item.title)}${fieldItem('Nationality', item.nationalityThai)}${fieldItem('Passport', item.passportNo, true)}${fieldItem('Passport expiry', formatDate(item.passportExpiry))}
          </div>
        </div>
        <div class="drawer-section"><div class="drawer-section-head"><h3>Academic information</h3></div>
          <div class="field-grid">
            ${fieldItem('Program type', programTypeLabel(item.programType))}
            ${fieldItem('Faculty', facultyDisplay)}
            ${fieldItem('Major', displayProgramName(item, program))}
            ${fieldItem('Thai major name', item.programThai || program?.programThai)}
            ${fieldItem('Total credits', item.totalCredits || program?.credits?.['2026'])}
            ${fieldItem('Registered credits', item.registeredCredits)}
            ${fieldItem('Study hours', item.studyHours ? `${Number(item.studyHours).toLocaleString()} hours` : '—', true)}
          </div>
        </div>
        <div class="drawer-section"><div class="drawer-section-head"><h3>Visa request</h3></div>
          <div class="field-grid">
            ${fieldItem('Current stay', formatDate(item.currentStayUntil))}
            ${fieldItem('Request option', ruleLabel(item))}
            ${fieldItem('Request until', item.requestUntil ? formatDate(item.requestUntil) : '—', true)}
          </div>
        </div>`;
    }
  }

  function ruleExplanation(item) {
    const rule = inferRule(item);
    if (rule === 'six_months') return `Request-until date is calculated six months after the current stay-until date: ${formatDate(calculateRequestUntil(item))}.`;
    if (rule === 'one_year') return `Request-until date is calculated twelve months after the current stay-until date: ${formatDate(calculateRequestUntil(item))}.`;
    if (rule === 'manual') return `Manual request-until date: ${formatDate(calculateRequestUntil(item))}.`;
    return '';
  }

  function bindAcademicSelectors({ root, typeSelector, facultySelector, programSelector, totalCreditsSelector }) {
    const typeSelect = root.querySelector(typeSelector);
    const facultySelect = root.querySelector(facultySelector);
    const programSelect = root.querySelector(programSelector);
    const creditsInput = totalCreditsSelector ? root.querySelector(totalCreditsSelector) : null;
    if (!typeSelect || !facultySelect || !programSelect) return;

    const refreshPrograms = (preferredProgramKey = '') => {
      const type = typeSelect.value;
      const facultyKey = facultySelect.value;
      const programs = programsForFaculty(type, facultyKey);
      programSelect.innerHTML = `<option value="">Select a major</option>` + programs.map((program) =>
        `<option value="${escapeHtml(program.key)}" ${program.key === preferredProgramKey ? 'selected' : ''}>${escapeHtml(majorLabelForType(type, program))}</option>`
      ).join('');
      if (preferredProgramKey && programs.some((program) => program.key === preferredProgramKey)) programSelect.value = preferredProgramKey;
      const selected = programByKey(programSelect.value);
      if (creditsInput && selected?.credits?.['2026'] !== null && selected?.credits?.['2026'] !== undefined) creditsInput.value = selected.credits['2026'];
    };

    const refreshFaculties = (preferredFacultyKey = '', preferredProgramKey = '') => {
      const type = typeSelect.value;
      const faculties = facultyOptionsForType(type);
      facultySelect.innerHTML = `<option value="">Select a faculty</option>` + faculties.map(([key, label]) =>
        `<option value="${escapeHtml(key)}" ${key === preferredFacultyKey ? 'selected' : ''}>${escapeHtml(label)}</option>`
      ).join('');
      if (preferredFacultyKey && faculties.some(([key]) => key === preferredFacultyKey)) facultySelect.value = preferredFacultyKey;
      refreshPrograms(preferredProgramKey);
    };

    typeSelect.addEventListener('change', () => refreshFaculties());
    facultySelect.addEventListener('change', () => refreshPrograms());
    programSelect.addEventListener('change', () => {
      const selected = programByKey(programSelect.value);
      if (creditsInput) creditsInput.value = selected?.credits?.['2026'] ?? '';
    });
  }

  function saveDrawerChanges() {
    const item = getActiveCase();
    if (!item) return;
    document.querySelectorAll('[data-edit-field]').forEach((input) => {
      let value = input.value;
      if (input.type === 'number' && value !== '') value = Number(value);
      item[input.dataset.editField] = value;
    });
    const program = programByKey(item.programKey);
    if (program) {
      item.programType = program.programType;
      item.facultyEnglish = program.facultyEnglish;
      item.facultyThai = program.facultyThai;
      item.programEnglish = program.programEnglish;
      item.programThai = program.programThai;
      if (program.credits?.['2026'] !== null && program.credits?.['2026'] !== undefined) item.totalCredits = program.credits['2026'];
    }
    if (item.requestRuleOverride !== 'manual') item.manualRequestUntil = '';
    Object.assign(item, normalizeCase(item));
    state.editing = false;
    renderDrawer();
    renderWorkspace();
    toast('Case updated', 'Visa calculations and academic reference data were refreshed automatically.');
  }

  function renderStudentForm() {
    el('studentForm').innerHTML = `
      <div class="form-field"><label>Document no.</label><input name="documentNo" value="" required /></div>
      <div class="form-field"><label>Title</label><select name="title"><option>MISS</option><option>MR</option><option>MS</option><option>MRS</option></select></div>
      <div class="form-field full"><label>Full name</label><input name="fullName" required placeholder="Student full name" /></div>
      <div class="form-field"><label>Student ID</label><input name="studentId" required /></div>
      <div class="form-field"><label>Nationality Thai</label><input name="nationalityThai" required list="nationalitySuggestions" autocomplete="off" placeholder="Start typing เช่น เมียนมา" /></div>
      <div class="form-field"><label>Passport no.</label><input name="passportNo" /></div>
      <div class="form-field"><label>Passport expiry</label><input type="date" name="passportExpiry" /></div>
      <div class="form-field"><label>Current stay until</label><input type="date" name="currentStayUntil" required /></div>
      <div class="form-field"><label>Program type</label><select name="programType" data-academic-type="new">${PROGRAM_TYPE_OPTIONS.map(([v,l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join('')}</select></div>
      <div class="form-field"><label>Faculty</label><select name="facultyKey" data-academic-faculty="new" required></select></div>
      <div class="form-field full"><label>Major</label><select name="programKey" data-academic-program="new" required></select></div>
      <div class="form-field"><label>Total credits</label><input type="number" min="0" name="totalCredits" data-total-credits="new" /></div>
      <div class="form-field"><label>Registered credits</label><input type="number" min="0" name="registeredCredits" /></div>
      <div class="form-field"><label>Request option</label><select name="requestRuleOverride" data-request-rule="new"><option value="six_months">+6 months</option><option value="one_year">+1 year</option><option value="manual">Manual Date</option></select></div>
      <div class="form-field manual-request-field hidden"><label>Manual request until</label><input type="date" name="manualRequestUntil" /></div>`;
    const form = el('studentForm');
    const typeSelect = form.querySelector('[data-academic-type="new"]');
    const initialFaculty = facultyOptionsForType(typeSelect.value)[0]?.[0] || '';
    const facultySelect = form.querySelector('[data-academic-faculty="new"]');
    facultySelect.innerHTML = `<option value="">Select a faculty</option>` + facultyOptionsForType(typeSelect.value).map(([key,label], idx) => `<option value="${escapeHtml(key)}" ${idx === 0 ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
    const initialPrograms = programsForFaculty(typeSelect.value, initialFaculty);
    const programSelect = form.querySelector('[data-academic-program="new"]');
    programSelect.innerHTML = `<option value="">Select a major</option>` + initialPrograms.map((program) => `<option value="${escapeHtml(program.key)}">${escapeHtml(majorLabelForType(typeSelect.value, program))}</option>`).join('');
    bindAcademicSelectors({
      root: form,
      typeSelector: '[data-academic-type="new"]',
      facultySelector: '[data-academic-faculty="new"]',
      programSelector: '[data-academic-program="new"]',
      totalCreditsSelector: '[data-total-credits="new"]',
    });
    const ruleSelect = form.querySelector('[data-request-rule="new"]');
    ruleSelect?.addEventListener('change', () => {
      form.querySelector('.manual-request-field')?.classList.toggle('hidden', ruleSelect.value !== 'manual');
    });
  }

  function addStudentFromForm(form) {
    const fd = new FormData(form);
    const obj = Object.fromEntries(fd.entries());
    const program = programByKey(obj.programKey);
    if (obj.requestRuleOverride !== 'manual') obj.manualRequestUntil = '';
    const item = normalizeCase({
      id: uid(), ...obj,
      totalCredits: obj.totalCredits ? Number(obj.totalCredits) : (program?.credits?.['2026'] ?? ''),
      registeredCredits: obj.registeredCredits ? Number(obj.registeredCredits) : '',
      programType: program?.programType || obj.programType || 'international',
      facultyEnglish: program?.facultyEnglish || '',
      facultyThai: program?.facultyThai || '',
      programEnglish: program?.programEnglish || '',
      programThai: program?.programThai || '',
    });
    delete item.facultyKey;
    state.cases.unshift(item);
    persist();
    closeModal('studentModal');
    renderWorkspace();
    openDrawer(item.id);
    toast('Student added', 'Faculty and major were linked to the supplied reference data.');
  }

  function openModal(id) {
    el('modalBackdrop').classList.remove('hidden');
    el(id).classList.remove('hidden');
  }

  function closeModal(id) {
    el(id).classList.add('hidden');
    const anyOpen = ['studentModal', 'batchModal', 'individualModal'].some((modalId) => !el(modalId).classList.contains('hidden'));
    if (!anyOpen) el('modalBackdrop').classList.add('hidden');
  }

  function selectedCases() {
    return state.cases.filter((item) => state.selected.has(item.id));
  }

  function listValidationFor(caseItem) {
    const missing = [];
    [
      ['documentNo', 'document number'],
      ['studentId', 'student ID'],
      ['title', 'title'],
      ['fullName', 'student name'],
    ].forEach(([field, label]) => {
      if (caseItem[field] === undefined || caseItem[field] === null || String(caseItem[field]).trim() === '') missing.push(label);
    });
    return { missing, valid: missing.length === 0 };
  }

  function historyStudentSnapshot(items) {
    return items.map((item) => ({
      documentNo: String(item.documentNo || '').trim(),
      studentId: String(item.studentId || '').trim(),
      fullName: String(item.fullName || '').trim(),
    }));
  }

  function renderBatchModal() {
    const items = selectedCases();
    const letterValidCount = items.filter((item) => validationFor(item).valid).length;
    const listValidCount = items.filter((item) => listValidationFor(item).valid).length;
    const needs16 = items.some((item) => item.programType !== 'graduate');
    const needs76 = items.some((item) => item.programType === 'graduate');
    const lettersTemplatesReady = (!needs16 || state.templates.letter16) && (!needs76 || state.templates.letter76);
    const listTemplateReady = Boolean(state.templates.studentList);
    const issueDate = todayIso();
    el('batchModalBody').innerHTML = `
      <div class="batch-layout">
        <div class="batch-summary">
          <h3>Selected cases</h3>
          ${items.map((item) => {
            const letterV = validationFor(item);
            const listV = listValidationFor(item);
            return `<div class="batch-case"><div><strong>${escapeHtml(item.fullName)}</strong><small>Doc ${escapeHtml(item.documentNo || '—')} · ${escapeHtml(item.studentId)} · ${escapeHtml(ruleLabel(item))}</small></div><div class="batch-validations"><span class="validation-pill ${letterV.valid ? 'ok' : 'error'}">LETTER ${letterV.valid ? 'VALID' : `${letterV.missing.length} ISSUE${letterV.missing.length === 1 ? '' : 'S'}`}</span><span class="validation-pill ${listV.valid ? 'ok' : 'error'}">LIST ${listV.valid ? 'VALID' : `${listV.missing.length} ISSUE${listV.missing.length === 1 ? '' : 'S'}`}</span></div></div>`;
          }).join('')}
          <div class="validation-summary ${letterValidCount === items.length ? 'good' : 'bad'}">
            <strong>Letters: ${letterValidCount}/${items.length} cases valid.</strong><br>
            ${letterValidCount === items.length ? 'Ready to generate the combined visa-letter Word file.' : 'Invalid letter cases will block Generate letters.'}
          </div>
          <div class="validation-summary ${listValidCount === items.length ? 'good' : 'bad'}">
            <strong>Student list: ${listValidCount}/${items.length} cases valid.</strong><br>
            ${listValidCount === items.length ? 'Ready to generate the student-list Word file.' : 'The list only requires document no., student ID, title and student name.'}
          </div>
        </div>
        <div class="batch-settings">
          <h3>Generate settings</h3>
          <div class="batch-setting"><label>Document date</label><input id="batchIssueDate" type="date" value="${issueDate}" /></div>
          ${lettersTemplatesReady && listTemplateReady ? '' : `<div class="template-warning"><strong>Template setup required</strong><br>${!lettersTemplatesReady ? 'Letter template missing. ' : ''}${!listTemplateReady ? 'Student-list template missing.' : ''} Open Workspace settings and import the approved DOCX file once.</div>`}
          <div class="rule-box"><strong>Student list date</strong><br>The selected date replaces <code>mmmm dd, 2026</code> in the list template automatically.</div>
          <div class="batch-setting"><label>Signatory — letters only</label><select id="batchSignatory">${signatoryOptions(state.settings.signatory)}</select></div>
          <div id="batchSignaturePreview">${signatoryPreview(state.settings.signatory)}</div>
          <div class="rule-box"><strong>Document numbers</strong><br>Each output uses the document number already saved on each student. No renumbering or sorting is applied.</div>
        </div>
      </div>`;
    const batchSigner = el('batchSignatory');
    batchSigner?.addEventListener('change', () => { el('batchSignaturePreview').innerHTML = signatoryPreview(batchSigner.value); });
    el('generateBatchBtn').disabled = !items.length || letterValidCount !== items.length || !lettersTemplatesReady;
    el('generateListBtn').disabled = !items.length || listValidCount !== items.length || !listTemplateReady;
  }

  async function generateBatch() {
    const items = selectedCases();
    if (!items.length) return;
    const body = {
      issueDate: el('batchIssueDate').value,
      signatory: el('batchSignatory').value,
      students: items.map((item) => ({ ...normalizeCase(item), status: deriveStatus(item) })),
    };
    const button = el('generateBatchBtn');
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Exporting…';
    try {
      const blob = await BrowserDocx.generateBatch(body.students, body.issueDate, body.signatory);
      const filename = `Visa_Extension_Letters_${body.students.length}_Students_${body.issueDate.replaceAll('-', '')}.docx`;
      downloadBlob(blob, filename);
      const generatedAt = new Date().toISOString();
      items.forEach((item) => { item.generatedAt = generatedAt; });
      state.batches.unshift({
        id: uid('batch'), createdAt: generatedAt, issueDate: body.issueDate,
        documentNumbers: items.map((item) => String(item.documentNo || '').trim()),
        students: historyStudentSnapshot(items),
        count: items.length, signatory: body.signatory,
        outputType: 'letters', filename,
      });
      persist();
      closeModal('batchModal');
      renderWorkspace();
      renderBatchHistory();
      toast('Word file exported', `${items.length} selected letters were generated entirely in this browser.`);
    } catch (err) {
      toast('Export could not finish', err.message || String(err), true);
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  async function generateStudentList() {
    const items = selectedCases();
    if (!items.length) return;
    const body = {
      issueDate: el('batchIssueDate').value,
      students: items.map((item) => ({ ...normalizeCase(item) })),
    };
    const button = el('generateListBtn');
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Generating list…';
    try {
      const blob = await BrowserDocx.generateList(body.students, body.issueDate);
      const filename = `Student_List_${body.issueDate.replaceAll('-', '')}.docx`;
      downloadBlob(blob, filename);
      const generatedAt = new Date().toISOString();
      state.batches.unshift({
        id: uid('list'), createdAt: generatedAt, issueDate: body.issueDate,
        documentNumbers: items.map((item) => String(item.documentNo || '').trim()),
        students: historyStudentSnapshot(items),
        count: items.length, signatory: state.settings.signatory,
        outputType: 'student_list', filename,
      });
      persist();
      renderBatchHistory();
      toast('Student list created', `${items.length} selected students were written into one Word list in this browser.`);
    } catch (err) {
      toast('Student list could not be created', err.message || String(err), true);
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  function renderIndividualModal() {
    const item = getActiveCase();
    if (!item) return;
    const validation = validationFor(item);
    el('individualModalBody').innerHTML = `
      <div class="individual-summary"><strong>${escapeHtml(item.fullName || 'Student')}</strong><span>${escapeHtml(item.studentId || '')} · Document ${escapeHtml(item.documentNo || '—')}</span></div>
      ${validation.valid ? '' : `<div class="validation-summary bad"><strong>Needs attention:</strong> ${escapeHtml(validation.missing.join(', '))}</div>`}
      <div class="batch-setting"><label>Letter date</label><input id="individualIssueDate" type="date" value="${todayIso()}" /></div>
      <div class="rule-box"><strong>Document ${escapeHtml(item.documentNo || "—")}</strong><br>The letter uses the document number already saved on this student case.</div>
      <div class="batch-setting"><label>Signatory</label><select id="individualSignatory">${signatoryOptions(state.settings.signatory)}</select></div>
      <div id="individualSignaturePreview">${signatoryPreview(state.settings.signatory)}</div>
      <div class="rule-box">This creates one Word letter for this student. Open the downloaded DOCX in Word to print.</div>`;
    const signer = el('individualSignatory');
    signer?.addEventListener('change', () => { el('individualSignaturePreview').innerHTML = signatoryPreview(signer.value); });
    const templateReady = item.programType === 'graduate' ? Boolean(state.templates.letter76) : Boolean(state.templates.letter16);
    if (!templateReady) el('individualModalBody').insertAdjacentHTML('beforeend', '<div class="template-warning"><strong>Word template not configured.</strong><br>Import the required Letter 16/76 DOCX once in Workspace settings.</div>');
    el('generateIndividualBtn').disabled = !validation.valid || !templateReady;
  }

  async function generateIndividual() {
    const item = getActiveCase();
    if (!item) return;
    const body = {
      student: normalizeCase(item),
      issueDate: el('individualIssueDate').value,
      signatory: el('individualSignatory').value,
    };
    const button = el('generateIndividualBtn');
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Creating…';
    try {
      const blob = await BrowserDocx.generateIndividual(body.student, body.issueDate, body.signatory);
      const filename = `Visa_Extension_Letter_${item.studentId || 'student'}.docx`;
      downloadBlob(blob, filename);
      item.generatedAt = new Date().toISOString();
      persist();
      closeModal('individualModal');
      renderWorkspace();
      renderDrawer();
      toast('Individual Word letter created', 'The DOCX was generated locally in your browser.');
    } catch (err) {
      toast('Individual letter could not be created', err.message || String(err), true);
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  function deleteSelectedCases() {
    const items = selectedCases();
    if (!items.length) return;
    if (!confirm(`Delete all ${items.length} selected cases from the local workspace?`)) return;
    const ids = new Set(items.map((item) => item.id));
    state.cases = state.cases.filter((item) => !ids.has(item.id));
    if (state.activeCaseId && ids.has(state.activeCaseId)) closeDrawer();
    state.selected.clear();
    persist();
    renderWorkspace();
    toast('Selected cases deleted', `${items.length} cases were removed from the local workspace.`);
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportBackup() {
    const templates = await VisaDB.exportTemplatesBase64();
    const payload = {
      exportedAt: new Date().toISOString(), version: '0.2-web',
      cases: state.cases, batches: state.batches, settings: state.settings, templates,
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `visa_workspace_${todayIso()}.visabackup`);
    toast('Backup exported', 'Cases, history, settings and imported Word templates are included.');
  }

  async function restoreBackupFile(file) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (!payload || typeof payload !== 'object') throw new Error('Backup file is not valid JSON');
      state.cases = Array.isArray(payload.cases) ? payload.cases.map(normalizeCase) : [];
      state.batches = Array.isArray(payload.batches) ? payload.batches : [];
      state.settings = { ...state.settings, ...(payload.settings || {}) };
      state.settings.signatory = normalizeSignatoryKey(state.settings.signatory);
      if (payload.templates) await VisaDB.importTemplatesBase64(payload.templates);
      persist();
      await refreshTemplateStatus();
      el('signatoryInput').innerHTML = signatoryOptions(state.settings.signatory);
      el('signatoryInput').value = state.settings.signatory;
      el('settingsSignaturePreview').innerHTML = signatoryPreview(state.settings.signatory);
      state.selected.clear();
      renderWorkspace(); renderBatchHistory(); renderProgramTable();
      toast('Backup restored', `${state.cases.length} cases restored into this browser.`);
    } catch (err) {
      toast('Restore failed', err.message || String(err), true);
    } finally {
      el('restoreFileInput').value = '';
    }
  }

  async function refreshTemplateStatus() {
    state.templates = await VisaDB.listTemplates();
    const mapping = [
      ['letter16', 'letter16TemplateStatus'],
      ['letter76', 'letter76TemplateStatus'],
      ['studentList', 'studentListTemplateStatus'],
    ];
    mapping.forEach(([key, id]) => {
      const node = el(id); if (!node) return;
      const item = state.templates[key];
      node.textContent = item ? `Ready · ${item.name}` : 'Not configured';
      node.classList.toggle('ready', Boolean(item));
    });
  }

  async function importTemplate(key, file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.docx')) { toast('Template not imported', 'Please choose a .docx file.', true); return; }
    try {
      await VisaDB.putTemplate(key, file);
      await refreshTemplateStatus();
      toast('Template saved', `${file.name} is stored only in this browser.`);
      if (!el('batchModal').classList.contains('hidden')) renderBatchModal();
    } catch (err) { toast('Template import failed', err.message || String(err), true); }
  }

  function renderProgramTable() {
    const q = (el('programSearch')?.value || '').trim().toLowerCase();
    const rows = state.programs.filter((program) => [program.programEnglish, program.programThai, program.facultyEnglish, program.facultyThai, program.key].some((value) => String(value || '').toLowerCase().includes(q)));
    el('programCountPill').textContent = `${state.programs.length} reference records`;
    el('programTable').innerHTML = `<table class="program-table"><thead><tr><th>Major</th><th>Faculty</th><th>Type</th><th>2026 credits</th></tr></thead><tbody>${rows.map((program) => `<tr><td><strong>${escapeHtml(program.programEnglish)}</strong><div class="program-thai">${escapeHtml(program.programThai)}</div></td><td><strong>${escapeHtml(program.facultyEnglish)}</strong><div class="program-thai">${escapeHtml(program.facultyThai)}</div></td><td><span class="type-chip">${programTypeLabel(program.programType)}</span></td><td>${escapeHtml(program.credits?.['2026'] ?? '—')}</td></tr>`).join('')}</tbody></table>`;
  }

  function historyStudents(batch) {
    if (Array.isArray(batch.students) && batch.students.length) return batch.students;
    const docs = Array.isArray(batch.documentNumbers) ? batch.documentNumbers : [];
    if (!docs.length) return [];
    return docs.map((docNo) => {
      const match = state.cases.find((item) => String(item.documentNo || '').trim() === String(docNo || '').trim());
      return match ? {
        documentNo: String(match.documentNo || '').trim(),
        studentId: String(match.studentId || '').trim(),
        fullName: String(match.fullName || '').trim(),
      } : {
        documentNo: String(docNo || '').trim(),
        studentId: '',
        fullName: '',
      };
    });
  }

  function renderBatchHistory() {
    if (!state.batches.length) {
      el('batchHistory').innerHTML = `<div class="history-empty"><strong>No generated documents yet</strong><span>Generate letters or a student list from selected cases to create the first history record.</span></div>`;
      return;
    }
    el('batchHistory').innerHTML = state.batches.map((batch) => {
      const students = historyStudents(batch);
      const type = batch.outputType === 'student_list' ? 'student_list' : 'letters';
      const title = type === 'student_list'
        ? `Student list · ${batch.count} student${batch.count === 1 ? '' : 's'}`
        : `${batch.count} Word letter${batch.count === 1 ? '' : 's'}`;
      const outputLabel = type === 'student_list' ? 'Student list exported' : 'Word letters exported';
      const signer = type === 'student_list' ? '' : ` · ${escapeHtml(signatoryProfile(batch.signatory).name)}`;
      const details = students.length
        ? `<div class="history-student-table"><div class="history-student-head"><span>Document</span><span>Student name</span><span>Student ID</span></div>${students.map((student) => `<div class="history-student-row"><span>${escapeHtml(student.documentNo || '—')}</span><strong>${escapeHtml(student.fullName || 'Student details unavailable')}</strong><span>${escapeHtml(student.studentId || '—')}</span></div>`).join('')}</div>`
        : `<div class="history-legacy-note">Student names and IDs were not stored in this older history record.</div>`;
      return `<details class="history-entry">
        <summary class="history-row">
          <div><div class="history-title">${title}</div><div class="history-meta">${formatDate(batch.issueDate)} · Documents: ${escapeHtml((batch.documentNumbers || []).join(', ') || 'legacy batch')}${signer}</div></div>
          <div class="history-files">${outputLabel}<br>${new Date(batch.createdAt).toLocaleString()}<span class="history-chevron">⌄</span></div>
        </summary>
        <div class="history-details">${details}</div>
      </details>`;
    }).join('');
  }

  function switchView(view) {
    const map = {
      workspace: ['workspaceView', 'Case workspace', 'NEW STUDENT VISA PREPARATION'],
      batches: ['batchesView', 'Generation history', 'DOCUMENT OUTPUT'],
      programs: ['programsView', 'Academic programs', 'REFERENCE DATA'],
      settings: ['settingsView', 'Workspace settings', 'CONFIGURATION'],
    };
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
    const [id, title, eyebrow] = map[view] || map.workspace;
    el(id).classList.add('active');
    document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add('active');
    el('pageTitle').textContent = title;
    el('pageEyebrow').textContent = eyebrow;
    if (view === 'programs') renderProgramTable();
    if (view === 'batches') renderBatchHistory();
    if (view === 'settings') refreshTemplateStatus().catch(console.error);
    if (window.innerWidth <= 880) el('sidebar').classList.remove('open');
  }

  function toast(title, message, isError = false) {
    const node = document.createElement('div');
    node.className = 'toast';
    node.innerHTML = `<div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div><button aria-label="Close">×</button>`;
    if (isError) node.style.background = '#552828';
    node.querySelector('button').addEventListener('click', () => node.remove());
    el('toastStack').appendChild(node);
    setTimeout(() => node.remove(), 5000);
  }

  function bindEvents() {
    document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', () => switchView(item.dataset.view)));
    el('menuToggle')?.addEventListener('click', () => el('sidebar').classList.toggle('open'));
    el('addStudentBtn').addEventListener('click', () => { renderStudentForm(); openModal('studentModal'); });

    el('backupBtn').addEventListener('click', () => exportBackup().catch((err) => toast('Backup failed', err.message || String(err), true)));
    el('restoreBtn').addEventListener('click', () => el('restoreFileInput').click());
    el('restoreFileInput').addEventListener('change', (event) => restoreBackupFile(event.target.files?.[0]));

    el('letter16TemplateInput').addEventListener('change', (event) => {
      importTemplate('letter16', event.target.files?.[0]).finally(() => { event.target.value = ''; });
    });
    el('letter76TemplateInput').addEventListener('change', (event) => {
      importTemplate('letter76', event.target.files?.[0]).finally(() => { event.target.value = ''; });
    });
    el('studentListTemplateInput').addEventListener('change', (event) => {
      importTemplate('studentList', event.target.files?.[0]).finally(() => { event.target.value = ''; });
    });

    el('searchInput').addEventListener('input', (e) => { state.search = e.target.value; renderCaseList(); });
    el('moreFiltersBtn').addEventListener('click', () => el('filterPanel').classList.toggle('hidden'));
    el('programTypeFilter').addEventListener('change', (e) => { state.programTypeFilter = e.target.value; renderCaseList(); });
    el('clearFiltersBtn').addEventListener('click', () => {
      state.programTypeFilter = 'all';
      el('programTypeFilter').value = 'all';
      renderCaseList();
    });
    el('selectAll').addEventListener('change', (e) => {
      filteredCases().forEach((item) => e.target.checked ? state.selected.add(item.id) : state.selected.delete(item.id));
      renderCaseList();
      renderSelectionBar();
    });
    el('clearSelectionBtn').addEventListener('click', () => { state.selected.clear(); renderCaseList(); renderSelectionBar(); });
    el('deleteSelectedBtn').addEventListener('click', deleteSelectedCases);
    el('prepareBatchBtn').addEventListener('click', () => { renderBatchModal(); openModal('batchModal'); });
    el('generateBatchBtn').addEventListener('click', generateBatch);
    el('generateListBtn').addEventListener('click', generateStudentList);
    el('generateIndividualBtn').addEventListener('click', generateIndividual);

    el('drawerBackdrop').addEventListener('click', closeDrawer);
    el('closeDrawerBtn').addEventListener('click', closeDrawer);
    el('editStudentBtn').addEventListener('click', () => { state.editing = true; renderDrawer(); });
    el('saveStudentBtn').addEventListener('click', saveDrawerChanges);
    el('printIndividualBtn').addEventListener('click', () => { renderIndividualModal(); openModal('individualModal'); });
    el('deleteStudentBtn').addEventListener('click', () => {
      const item = getActiveCase();
      if (!item) return;
      if (!confirm(`Delete ${item.fullName || 'this case'} from the local workspace?`)) return;
      state.cases = state.cases.filter((c) => c.id !== item.id);
      state.selected.delete(item.id);
      persist();
      closeDrawer();
      renderWorkspace();
      toast('Case deleted', 'The local case was removed.');
    });

    document.querySelectorAll('.modal-close').forEach((btn) => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
    el('modalBackdrop').addEventListener('click', () => {
      closeModal('studentModal');
      closeModal('batchModal');
      closeModal('individualModal');
    });
    el('studentForm').addEventListener('submit', (e) => {
      e.preventDefault();
      addStudentFromForm(e.currentTarget);
    });
    el('programSearch').addEventListener('input', renderProgramTable);
    el('signatoryInput').addEventListener('change', (e) => {
      state.settings.signatory = normalizeSignatoryKey(e.target.value);
      el('settingsSignaturePreview').innerHTML = signatoryPreview(state.settings.signatory);
      persist();
      toast('Setting saved', 'Default signatory updated.');
    });
  }

  async function boot() {
    try {
      await loadReferenceData();
      await loadLocalState();
      await refreshTemplateStatus();
      ensureNationalityDatalist();

      el('signatoryInput').innerHTML = signatoryOptions(state.settings.signatory);
      el('signatoryInput').value = state.settings.signatory;
      el('settingsSignaturePreview').innerHTML = signatoryPreview(state.settings.signatory);

      bindEvents();
      renderWorkspace();
      renderProgramTable();
      renderBatchHistory();

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker registration failed', err));
      }
    } catch (err) {
      console.error(err);
      document.body.innerHTML = `<div style="padding:40px;font-family:system-ui"><h2>Workspace could not start</h2><p>${escapeHtml(err.message || String(err))}</p><p>Please refresh the page. If the problem continues, send a screenshot of this message.</p></div>`;
    }
  }

  boot();
})();
