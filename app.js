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

  const BUILTIN_TEMPLATE_NAMES = {
    letter16: 'Visa Extension Letter 16',
    letter76: 'Visa Extension Letter 76',
    studentList: 'Student List',
    exchange: 'Exchange Student Visa Letter',
    non_o: 'Non-O to ED Transfer Letter',
  };

  const PROGRAM_TYPE_OPTIONS = [
    ['international', 'International program'],
    ['chinese_international', 'Chinese International program'],
    ['thai', 'Thai program'],
    ['graduate', 'Graduate School'],
  ];

  const DEFAULT_STUDENT_LIST_COLUMNS = ['หน.บน.', 'ผศ.ดร.ธรรญธร', 'อ.เนาวกานต์'];
  const MAX_STUDENT_LIST_COLUMNS = 6;
  const CASE_LABEL_COLORS = ['#2563eb','#0f766e','#e58a16','#be3a46','#8b5cf6','#0f8ba7','#64748b','#db4a91'];
  const MAX_CASE_LABELS = CASE_LABEL_COLORS.length;

  const state = {
    programs: [],
    nationalities: [],
    cases: [],
    drafts: [],
    activeDraftId: null,
    batches: [],
    selected: new Set(),
    activeCategory: 'normal',
    activeStatus: 'all',
    activeLabelId: 'all',
    groupByLabel: false,
    search: '',
    programTypeFilter: 'all',
    activeCaseId: null,
    editing: false,
    settings: {
      signatory: 'somyot',
      newStudentPrefixes: '169, 769, 869, 969',
      studentListColumns: [...DEFAULT_STUDENT_LIST_COLUMNS],
      letterReviewBoxEnabled: false,
      caseLabels: [],
      exchangeUniversities: [],
      lastExchangeAcademicYear: null,
    },
    templates: { letter16: null, letter76: null, studentList: null, exchange: null, non_o: null },
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

  function normalizeDrafts(rows) {
    if(!Array.isArray(rows))return [];
    const seen=new Set();
    return rows.filter(draft=>draft&&typeof draft==='object'&&
      typeof draft.id==='string'&&draft.id.startsWith('draft_')&&
      draft.values&&typeof draft.values==='object'&&!Array.isArray(draft.values)&&
      !seen.has(draft.id)&&seen.add(draft.id)
    ).map(draft=>({
      id:draft.id,createdAt:String(draft.createdAt||''),updatedAt:String(draft.updatedAt||''),
      values:{...draft.values}
    }));
  }

  function renderDraftsButton() {
    const button=el('draftsBtn'),count=state.drafts.length;
    if(!button)return;
    el('draftsCount').textContent=String(count);
    button.setAttribute('aria-label','Open '+count+' saved student draft'+(count===1?'':'s'));
  }
  function renderDraftsModal() {
    const list=el('draftsList');if(!list)return;
    renderDraftsButton();
    const drafts=[...state.drafts].sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
    list.innerHTML=drafts.length?drafts.map(draft=>{
      const name=String(draft.values.fullName||'').trim()||'Untitled student draft';
      const id=String(draft.values.studentId||draft.values.documentNo||'').trim();
      const cat=({normal:'Normal cases',exchange:'Exchange students',non_o:'Non-O transfer'})[draft.values.caseCategory]||'Normal cases';
      const stamp=draft.updatedAt?new Date(draft.updatedAt).toLocaleString():'';
      return `<div class="student-draft-card" data-draft-id="${escapeHtml(draft.id)}">
        <div class="student-draft-info">
          <strong>${escapeHtml(name)}</strong>
          <span>${escapeHtml(cat)}${id?' · '+escapeHtml(id):''}</span>
          <small>Saved ${escapeHtml(stamp)} · Not added to active cases</small>
        </div>
        <div class="student-draft-actions">
          <button type="button" class="btn subtle" data-draft-open="${escapeHtml(draft.id)}">Edit draft</button>
          <button type="button" class="btn subtle draft-delete-btn" data-draft-delete="${escapeHtml(draft.id)}">Delete</button>
        </div>
      </div>`;
    }).join(''):'<div class="drafts-empty"><strong>No student drafts yet.</strong><span>Start a new student, enter any available details, then select Save draft.</span></div>';
  }
  function readDraftValues(form) {
    const values=Object.fromEntries(new FormData(form).entries());
    values.currentStudent=Boolean(form.elements.currentStudent?.checked);
    values.enabledOverrides={};
    for(const name of ['studyYearOverride','graduationYearOverride']){
      values.enabledOverrides[name]=Boolean(form.querySelector('[data-unlock-target="new_'+name+'"]')?.checked);
    }
    return values;
  }
  function restoreDraftValues(form,values) {
    if(!values||typeof values!=='object')return;
    // Respect dependency order: type -> faculty -> major, then restore all
    // other fields without triggering student-ID auto-guessing on saved drafts.
    for(const name of ['programType','facultyKey','programKey']){
      const control=form.elements[name];
      if(!control || typeof values[name]!=='string')continue;
      control.value=values[name];
      if(name!=='programKey')control.dispatchEvent(new Event('change',{bubbles:true}));
    }
    Object.entries(values).forEach(([name,value])=>{
      if(['programType','facultyKey','programKey','caseCategory','enabledOverrides'].includes(name))return;
      const control=form.elements[name];
      if(!control)return;
      if(control.type==='checkbox')control.checked=Boolean(value);
      else control.value=String(value??'');
    });
    for(const name of ['studyYearOverride','graduationYearOverride']){
      const enabled=Boolean(values.enabledOverrides?.[name]);
      const checkbox=form.querySelector('[data-unlock-target="new_'+name+'"]');
      if(checkbox){checkbox.checked=enabled;checkbox.dispatchEvent(new Event('change',{bubbles:true}));}
      if(enabled && form.elements[name])form.elements[name].value=String(values[name]??'');
    }
    form.querySelector('[data-request-rule="new"]')?.dispatchEvent(new Event('change',{bubbles:true}));
    updateAutomaticStudyFields(form);
    const nationality=form.querySelector('[data-nationality-input]');
    if(nationality)nationality.dataset.confirmedThai=
      state.nationalities.some(row=>row.thai===nationality.value)?nationality.value:'';
  }
  function openNewStudentForm() {
    state.activeDraftId=null;
    renderStudentForm();
    el('saveStudentDraftBtn').textContent='Save draft';
    openModal('studentModal');
  }
  function openDraft(id) {
    const draft=state.drafts.find(row=>row.id===id);
    if(!draft)return;
    closeModal('draftsModal');
    state.activeDraftId=draft.id;
    renderStudentForm(draft.values.caseCategory);
    restoreDraftValues(el('studentForm'),draft.values);
    el('studentModalTitle').textContent='Edit draft · Add student';
    el('saveStudentDraftBtn').textContent='Update draft';
    openModal('studentModal');
  }
  async function saveStudentDraft() {
    const values=readDraftValues(el('studentForm'));
    const now=new Date().toISOString();
    const existing=state.drafts.find(draft=>draft.id===state.activeDraftId);
    if(existing){existing.values=values;existing.updatedAt=now;}
    else{
      const draft={id:uid('draft'),createdAt:now,updatedAt:now,values};
      state.drafts.push(draft);
      state.activeDraftId=draft.id;
    }
    const saved=await persist();
    if(!saved){
      toast('Draft not saved','Browser storage is unavailable. Keep this window open and try again.',true);
      return;
    }
    renderDraftsButton();renderDraftsModal();
    closeModal('studentModal');openModal('draftsModal');
    toast('Draft saved','This unfinished student is stored locally and is not an active case.');
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
    // BU operational rule: if the same calendar day does not exist in the
    // target month, use the FIRST day of the following month, not the last
    // day of the target month. E.g. 2026-10-31 + 6m -> 2027-05-01.
    target.setDate(day > last ? last + 1 : day);
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

  function formatDepartmentDate(value) {
    const d = parseIsoDate(value);
    if (!d) return '';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: '2-digit', year: 'numeric',
    }).format(d);
  }

  function caseCreatedTime(item) {
    const value = Date.parse(item?.createdAt || '');
    return Number.isFinite(value) ? value : 0;
  }

  function sortCasesOldestFirst(items) {
    return [...items].sort((a, b) => {
      const diff = caseCreatedTime(a) - caseCreatedTime(b);
      if (diff) return diff;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  }

  function migrateCaseOrder(items) {
    const list = Array.isArray(items) ? items.map(normalizeCase) : [];
    if (!list.length) return list;

    const missing = list.filter((item) => !item.createdAt);
    if (missing.length === list.length) {
      // Legacy builds inserted every new case at the top, so the stored order is
      // newest -> oldest. Assign timestamps that preserve that history, then sort.
      const base = Date.now();
      list.forEach((item, index) => {
        item.createdAt = new Date(base - index * 1000).toISOString();
      });
    } else if (missing.length) {
      const existing = list.map(caseCreatedTime).filter(Boolean);
      let cursor = (existing.length ? Math.min(...existing) : Date.now()) - missing.length * 1000;
      list.forEach((item) => {
        if (!item.createdAt) {
          item.createdAt = new Date(cursor).toISOString();
          cursor += 1000;
        }
      });
    }
    return sortCasesOldestFirst(list);
  }

  function inferRule(caseItem) {
    const rule = caseItem.requestRuleOverride;
    return ['six_months', 'one_year', 'manual'].includes(rule) ? rule : 'six_months';
  }

  function calculateRequestedUntil(caseItem) {
    const rule = inferRule(caseItem);
    if (rule === 'six_months') return addMonths(caseItem.currentStayUntil, 6);
    if (rule === 'one_year') return addMonths(caseItem.currentStayUntil, 12);
    if (rule === 'manual') return caseItem.manualRequestUntil || '';
    return '';
  }

  // The passport expiration date is a hard ceiling for every letter, even
  // when a staff member dismisses the separate on-screen warning.
  function calculateRequestUntil(caseItem) {
    const requested = calculateRequestedUntil(caseItem);
    const expiry = String(caseItem.passportExpiry || '').trim();
    return requested && expiry && expiry < requested ? expiry : requested;
  }

  function isPassportCapped(caseItem) {
    const requested = calculateRequestedUntil(caseItem);
    const expiry = String(caseItem.passportExpiry || '').trim();
    return Boolean(requested && expiry && expiry < requested);
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


  function studentListColumns() {
    const saved = state.settings.studentListColumns;
    if (!Array.isArray(saved)) state.settings.studentListColumns = [...DEFAULT_STUDENT_LIST_COLUMNS];
    else state.settings.studentListColumns = saved.slice(0, MAX_STUDENT_LIST_COLUMNS)
      .map(value => String(value ?? '').trim().slice(0, 70)).filter(Boolean);
    return state.settings.studentListColumns;
  }

  function renderListColumnSettings() {
    const root = el('studentListColumnsEditor');
    if (!root) return;
    const labels = studentListColumns();
    root.innerHTML = labels.length ? labels.map((name, i) => `
      <div class="list-column-item" data-column-index="${i}">
        <span class="list-column-index">${i + 1}.</span>
        <input class="list-column-name" type="text" maxlength="70" aria-label="Letter checker name ${i + 1}" value="${escapeHtml(name)}" />
        <button type="button" class="list-column-control" data-action="up" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="list-column-control" data-action="down" aria-label="Move down" ${i === labels.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="list-column-control list-column-remove" data-action="remove" aria-label="Delete column">×</button>
      </div>`).join('') : '<div class="list-column-empty">No letter checkers configured. The list will contain only the date and student details.</div>';
    el('addStudentListColumnBtn').disabled = labels.length >= MAX_STUDENT_LIST_COLUMNS;
    el('studentListColumnCount').textContent = `${labels.length} letter checker${labels.length === 1 ? '' : 's'} · Saved locally`;
  }

  function bindListColumnSettings() {
    const root = el('studentListColumnsEditor');
    root?.addEventListener('change', event => {
      const input = event.target.closest('.list-column-name');
      if (!input) return;
      const idx = Number(input.closest('[data-column-index]').dataset.columnIndex);
      const name = input.value.trim();
      if (!name) {
        input.value = studentListColumns()[idx];
        toast('Checker name required', 'Give the letter checker a name or use × to remove it.', true);
        return;
      }
      studentListColumns()[idx] = name;
      input.value = name;
      persist();
    });
    root?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target.matches('.list-column-name')) {
        event.preventDefault();
        event.target.blur();
      }
    });
    root?.addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const idx = Number(button.closest('[data-column-index]').dataset.columnIndex);
      const list = studentListColumns();
      if (button.dataset.action === 'remove') list.splice(idx, 1);
      if (button.dataset.action === 'up' && idx > 0) [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
      if (button.dataset.action === 'down' && idx < list.length - 1) [list[idx + 1], list[idx]] = [list[idx], list[idx + 1]];
      persist();
      renderListColumnSettings();
    });
    el('addStudentListColumnBtn')?.addEventListener('click', () => {
      const list = studentListColumns();
      if (list.length >= MAX_STUDENT_LIST_COLUMNS) return;
      list.push('New checker');
      persist();
      renderListColumnSettings();
      const input = root.querySelector('.list-column-item:last-child .list-column-name');
      input?.focus();
      input?.select();
    });
    el('resetStudentListColumnsBtn')?.addEventListener('click', () => {
      state.settings.studentListColumns = [...DEFAULT_STUDENT_LIST_COLUMNS];
      persist();
      renderListColumnSettings();
    });
  }


  function caseLabels() {
    if (!Array.isArray(state.settings.caseLabels)) state.settings.caseLabels = [];
    const usedColors = new Set(), usedIds = new Set();
    state.settings.caseLabels = state.settings.caseLabels.slice(0, MAX_CASE_LABELS).filter(entry => {
      if (!entry || typeof entry !== 'object') return false;
      const id = String(entry.id || '');
      const color = String(entry.color || '').toLowerCase();
      if (!/^label_[a-z0-9_-]{4,50}$/.test(id) || usedIds.has(id) ||
          !CASE_LABEL_COLORS.includes(color) || usedColors.has(color)) return false;
      usedIds.add(id); usedColors.add(color); return true;
    }).map(entry => ({ id:String(entry.id), color:String(entry.color).toLowerCase(),
      name:String(entry.name || '').trim().slice(0, 42) || 'Untitled group' }));
    return state.settings.caseLabels;
  }
  function labelForCase(item) {
    return caseLabels().find(label => label.id === item.labelId) || null;
  }
  function renderCaseLabelSettings() {
    const root = el('caseLabelSettings');
    if (!root) return;
    root.innerHTML = caseLabels().map(label => `
      <div class="case-label-setting" data-label-id="${escapeHtml(label.id)}">
        <span class="case-label-swatch" style="--case-label-color:${label.color}"></span>
        <input class="case-label-name" maxlength="42" value="${escapeHtml(label.name)}" aria-label="Group name for ${escapeHtml(label.color)}" />
        <span class="case-label-count">${state.cases.filter(c => c.labelId === label.id).length} cases</span>
        <button type="button" class="btn subtle case-label-remove" data-remove-case-label="${escapeHtml(label.id)}">Remove</button>
      </div>`).join('') || '<div class="small-muted">No custom groups. Create a named color to organize cases.</div>';
    const picker = el('newCaseLabelColor');
    if (picker) picker.innerHTML = CASE_LABEL_COLORS.map(color =>
      `<option value="${color}" ${caseLabels().some(label => label.color === color) ? 'disabled' : ''}>${({
        '#2563eb':'Blue','#0f766e':'Teal','#e58a16':'Amber','#be3a46':'Red','#8b5cf6':'Purple',
        '#0f8ba7':'Cyan','#64748b':'Slate','#db4a91':'Pink'
      })[color]}</option>`).join('');
    if (el('addCaseLabelBtn')) el('addCaseLabelBtn').disabled = caseLabels().length >= MAX_CASE_LABELS;
    if (picker) picker.value = CASE_LABEL_COLORS.find(c => !caseLabels().some(label => label.color === c)) || '';
  }
  function bindCaseLabelSettings() {
    el('addCaseLabelBtn')?.addEventListener('click', () => {
      const name = el('newCaseLabelName').value.trim().slice(0,42);
      const color = el('newCaseLabelColor').value;
      if (!name || !CASE_LABEL_COLORS.includes(color) || caseLabels().some(l => l.color===color)) {
        toast('Group not created', 'Enter a name and select an unused color.', true); return;
      }
      caseLabels().push({id:uid('label'),name,color});
      el('newCaseLabelName').value = '';
      persist();renderCaseLabelSettings();renderCaseList();
    });
    el('caseLabelSettings')?.addEventListener('change', event => {
      const input = event.target.closest('.case-label-name');
      if (!input) return;
      const label = caseLabels().find(l => l.id === input.closest('[data-label-id]').dataset.labelId);
      if (!label) return;
      const name=input.value.trim().slice(0,42);
      if (!name) {input.value=label.name; toast('Group name required','Enter a group name.',true);return;}
      label.name=name;input.value=name;persist();renderCaseList();
    });
    el('caseLabelSettings')?.addEventListener('click', event => {
      const button=event.target.closest('[data-remove-case-label]');if(!button)return;
      const id=button.dataset.removeCaseLabel;
      const label=caseLabels().find(l=>l.id===id);if(!label)return;
      const count=state.cases.filter(item=>item.labelId===id).length;
      if(count && !confirm('Remove group "'+label.name+'"? Its '+count+' case(s) will become Unlabeled; no student cases are deleted.'))return;
      state.settings.caseLabels=caseLabels().filter(l=>l.id!==id);
      state.cases.forEach(item=>{if(item.labelId===id)item.labelId='';});
      if(state.activeLabelId===id)state.activeLabelId='all';
      persist();renderCaseLabelSettings();renderCaseList();
    });
  }

  function normalizeExchangeUniversities(value) {
    if (!Array.isArray(value)) return [];
    const names = [];
    for (const entry of value) {
      const name = String(entry ?? '').trim().slice(0, 180);
      if (name && !names.some(saved => saved.toLocaleLowerCase() === name.toLocaleLowerCase())) names.push(name);
    }
    return names.slice(-200);
  }

  function rememberedAcademicYear() {
    const saved = Number(state.settings.lastExchangeAcademicYear);
    if (Number.isInteger(saved) && saved >= 2500 && saved <= 2700) return saved;
    const last = [...state.cases].reverse().find(item =>
      item.caseCategory === 'exchange' && Number.isInteger(Number(item.exchangeAcademicYear)) &&
      Number(item.exchangeAcademicYear) >= 2500 && Number(item.exchangeAcademicYear) <= 2700);
    if (last) return Number(last.exchangeAcademicYear);
    const prefix = newStudentPrefixes().find(value => /^[0-9]{3}$/.test(value));
    return 2500 + (prefix ? Number(prefix.slice(1, 3)) : 69);
  }

  function showPartnerUniversitySuggestions() {
    const list = el('partnerUniversitySuggestions');
    if (list) list.innerHTML = normalizeExchangeUniversities(state.settings.exchangeUniversities)
      .map(name => '<option value="' + escapeHtml(name) + '"></option>').join('');
  }

  function renderSavedUniversities() {
    const list = el('savedUniversitiesList');
    if (!list) return;
    const names = normalizeExchangeUniversities(state.settings.exchangeUniversities);
    list.innerHTML = names.length
      ? names.map((name, index) => '<div class="saved-university-row"><span>' + escapeHtml(name)
        + '</span><button type="button" class="btn subtle" data-remove-university="' + index
        + '" aria-label="Remove ' + escapeHtml(name) + '">Remove</button></div>').join('')
      : '<div class="list-column-empty">No partner universities remembered yet.</div>';
    el('clearSavedUniversitiesBtn').disabled = names.length === 0;
  }

  function rememberExchangeDetails(item) {
    if (item.caseCategory !== 'exchange') return;
    const name = String(item.exchangeUniversity || '').trim().slice(0, 180);
    if (name) {
      const names = normalizeExchangeUniversities(state.settings.exchangeUniversities);
      if (!names.some(saved => saved.toLocaleLowerCase() === name.toLocaleLowerCase())) names.push(name);
      state.settings.exchangeUniversities = names.slice(-200);
    }
    const year = Number(item.exchangeAcademicYear);
    if (Number.isInteger(year) && year >= 2500 && year <= 2700) state.settings.lastExchangeAcademicYear = year;
    showPartnerUniversitySuggestions();
    renderSavedUniversities();
  }

  function countryOptions() {
    const records = new Map();
    for (const item of state.nationalities) {
      if (item.thai) records.set(String(item.thai).trim(), String(item.english || '').trim());
    }
    // The supplied nationality reference uses shortened labels for some
    // countries. Include familiar full country names as searchable alternatives.
    for (const [thai, english] of [
      ['ประเทศไทย', 'Thailand'], ['สหรัฐอเมริกา', 'United States'],
      ['สหราชอาณาจักร', 'United Kingdom'], ['สาธารณรัฐประชาชนจีน', 'China'],
      ['สาธารณรัฐเกาหลี', 'South Korea'], ['เกาหลีใต้', 'South Korea'],
      ['สาธารณรัฐแห่งสหภาพเมียนมา', 'Myanmar']
    ]) records.set(thai, english);
    return [...records.entries()].map(([thai, english]) =>
      '<option value="' + escapeHtml(thai) + '" label="' + escapeHtml(english) + '"></option>').join('');
  }

  function inferredAcademicYearFields(studentId, programType) {
    const id = String(studentId || '').trim();
    const intakePrefix = newStudentPrefixes().find(prefix => /^[0-9]{3}$/.test(prefix));
    const cohort = intakePrefix ? Number(intakePrefix.slice(1, 3)) : null;
    const valid = /^[0-9]{3}/.test(id);
    return {
      studyYear: valid && cohort !== null ? ((cohort - Number(id.slice(1, 3)) + 100) % 100) + 1 : '',
      graduationYear: valid && programType !== 'graduate' ? 2504 + Number(id.slice(1, 3)) : '',
    };
  }

  function lockedField(label, field, value, type = 'text', isDrawer = false, extra = '', initiallyEnabled = false) {
    const key = (isDrawer ? 'edit_' : 'new_') + field;
    const valueAttribute = value === null || value === undefined ? '' : String(value);
    return '<div class="' + (isDrawer ? 'drawer-field' : 'form-field') + ' lockable-field" data-lock-field="' + field + '">'
      + '<div class="locked-field-heading"><label for="' + key + '">' + escapeHtml(label) + '</label>'
      + '<label class="unlock-field-check"><input type="checkbox" data-unlock-target="' + key + '" '
      + (initiallyEnabled ? 'checked' : '') + '/><span>Enable edit</span></label></div>'
      + '<input id="' + key + '" class="locked-input" ' + (isDrawer ? 'data-edit-field="' : 'name="') + field
      + '" type="' + type + '" value="' + escapeHtml(valueAttribute) + '" '
      + (initiallyEnabled ? '' : 'readonly ') + extra + '/></div>';
  }

  function bindLockedFields(root) {
    root.querySelectorAll('[data-unlock-target]').forEach(toggle => {
      const input = root.querySelector('#' + toggle.dataset.unlockTarget);
      if (!input) return;
      input.readOnly = !toggle.checked;
      toggle.addEventListener('change', () => {
        input.readOnly = !toggle.checked;
        if (toggle.checked) input.focus();
        if (!toggle.checked) updateAutomaticStudyFields(root);
      });
    });
  }

  function updateAutomaticStudyFields(root) {
    const studentId = root.querySelector('[name="studentId"],[data-edit-field="studentId"]')?.value || '';
    const programType = root.querySelector('[name="programType"],[data-edit-field="programType"]')?.value || '';
    const auto = inferredAcademicYearFields(studentId, programType);
    for (const [field, value] of [['studyYearOverride', auto.studyYear], ['graduationYearOverride', auto.graduationYear]]) {
      const input = root.querySelector('[name="' + field + '"],[data-edit-field="' + field + '"]');
      if (input && input.readOnly) input.value = value;
    }
  }

  function cleanNewStudentPrefixes(value) {
    const items = String(value || '')
      .split(/[\s,;]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => /^\d+$/.test(item));
    return [...new Set(items)].join(', ');
  }

  function newStudentPrefixes() {
    const cleaned = cleanNewStudentPrefixes(state.settings.newStudentPrefixes);
    return cleaned ? cleaned.split(',').map((item) => item.trim()) : [];
  }

  function inferCurrentStudentFromId(studentId) {
    const id = String(studentId || '').trim();
    if (!id) return false;
    return !newStudentPrefixes().some((prefix) => id.startsWith(prefix));
  }

  function normalizedProgramSearch(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\[[^\]]*\]\s*$/g, '')
      .replace(/\((?:international|bilingual|thai|english) program\)/g, '')
      .replace(/\b(?:program|programme)\b/g, '')
      .replace(/[^a-z0-9ก-๙]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function programByKey(key) {
    const exact = state.programs.find((p) => p.key === key);
    if (exact) return exact;

    const raw = String(key || '').trim();
    if (!raw) return undefined;
    const suffixMatch = raw.match(/\[([^\]]+)\]\s*$/);
    const suffix = suffixMatch ? suffixMatch[1].trim() : '';
    const majorPart = raw.replace(/\s*\[[^\]]+\]\s*$/, '');
    const wantedMajor = normalizedProgramSearch(majorPart);
    const wantedFaculty = normalizedProgramSearch(suffix);

    const candidates = state.programs.filter((p) => normalizedProgramSearch(p.programEnglish) === wantedMajor);
    if (candidates.length === 1) return candidates[0];

    if (wantedFaculty) {
      const matched = candidates.find((p) =>
        normalizedProgramSearch(p.facultyCode) === wantedFaculty ||
        normalizedProgramSearch(p.facultyEnglish) === wantedFaculty ||
        normalizedProgramSearch(p.facultyThai) === wantedFaculty
      );
      if (matched) return matched;
    }

    return candidates[0] || state.programs.find((p) =>
      normalizedProgramSearch(p.programThai) === wantedMajor
    );
  }

  function normalizeCase(caseItem) {
    const item = { ...caseItem };
    if (typeof item.currentStudent !== 'boolean') {
      item.currentStudent = inferCurrentStudentFromId(item.studentId);
    }
    item.attachment43 = item.currentStudent ? 'transcript' : 'application';
    // The normal workspace includes both new and continuing students.
    // Preserve the independent checkbox so attachment 4.3 and study wording still differ.
    item.caseCategory = ['exchange', 'non_o'].includes(item.caseCategory)
      ? item.caseCategory : 'normal';
    // Configurable current intake: 169/769/869/969 -> 69; next year 170/770/870/970 -> 70.
    const intakePrefix = newStudentPrefixes().find((prefix) => /^[0-9]{3}$/.test(prefix));
    item.academicCohortYear = intakePrefix ? Number(intakePrefix.slice(1, 3)) : null;
    const program = programByKey(item.programKey);
    if (program) {
      item.programKey = program.key;
      item.programType = program.programType || item.programType;
      item.facultyEnglish = program.facultyEnglish || item.facultyEnglish || '';
      item.facultyThai = program.facultyThai || item.facultyThai || '';
      item.programEnglish = program.programEnglish || item.programEnglish || '';
      item.programThai = program.programThai || item.programThai || '';
      const referenceCredits = program.credits?.['2026'];
      const creditsBlank = item.totalCredits === undefined || item.totalCredits === null || String(item.totalCredits).trim() === '';
      if (creditsBlank && referenceCredits !== null && referenceCredits !== undefined && referenceCredits !== '-') item.totalCredits = referenceCredits;
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
    if (item.caseCategory === 'exchange') {
      for (const [field, label] of [
        ['exchangeUniversity','partner university'],
        ['exchangeCountryThai','partner country in Thai'],
        ['exchangeTerm','exchange semester'],
        ['exchangeAcademicYear','exchange academic year'],
        ['exchangeDurationSemesters','exchange duration'],
      ]) if (!String(item[field] ?? '').trim()) missing.push(label);
    }
    if (item.caseCategory === 'non_o') {
      if (!String(item.nonOVisaPurpose || '').trim()) missing.push('current Non-O visa purpose');
      if (!String(item.programDurationYears || '').trim()) missing.push('program duration');
      if (item.programType === 'graduate' && !String(item.graduationYearOverride || '').trim()) {
        missing.push('graduate expected graduation year (B.E.) override');
      }
    }
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
      graduate: 'Graduate School',
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
        state.cases = migrateCaseOrder(stored.cases);
        state.drafts = normalizeDrafts(stored.drafts);
        state.batches = Array.isArray(stored.batches) ? stored.batches : [];
        state.settings = { ...state.settings, ...(stored.settings || {}) };
      } else {
        // Same-origin migration for development builds. GitHub Pages uses a new
        // origin, so portable users should use Backup data -> Restore instead.
        const legacyCases = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        const legacyBatches = JSON.parse(localStorage.getItem(BATCH_KEY) || '[]');
        const legacySettings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
        state.cases = migrateCaseOrder(legacyCases);
        state.drafts = [];
        state.batches = Array.isArray(legacyBatches) ? legacyBatches : [];
        if (legacySettings) state.settings = { ...state.settings, ...legacySettings };
        if (state.cases.length || state.batches.length || legacySettings) persist();
      }
      delete state.settings.nextDocumentNumber;
      state.settings.signatory = normalizeSignatoryKey(state.settings.signatory);
      state.settings.newStudentPrefixes = cleanNewStudentPrefixes(state.settings.newStudentPrefixes) || '169, 769, 869, 969';
      studentListColumns();
      caseLabels();
      state.settings.exchangeUniversities = normalizeExchangeUniversities(state.settings.exchangeUniversities);
    } catch (err) {
      console.warn('Could not load browser state', err);
      state.cases = [];
      state.drafts = [];
      state.batches = [];
    }
  }

  function persist() {
    return VisaDB.setState('workspace_v02', {
      cases: state.cases,
      drafts: state.drafts,
      batches: state.batches,
      settings: state.settings,
      savedAt: new Date().toISOString(),
    }).then(()=>true).catch((err) => {
      console.error('Autosave failed',err);
      return false;
    });
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
    if (state.programs.length !== 86) throw new Error(`Program reference data incomplete: ${state.programs.length}/86 records loaded`);
    if (state.nationalities.length !== 250) throw new Error(`Nationality reference data incomplete: ${state.nationalities.length}/250 records loaded`);
  }

  let hubRefreshInProgress = false;
  function hubStatus(message, isError = false) {
    const node = el('hubReferenceStatus');
    if (node) {
      node.textContent = message;
      node.title = message;
      node.style.color = isError ? '#b45309' : '';
    }
  }
  async function syncHubReferences(force = false) {
    if (hubRefreshInProgress || !window.BUICReferenceHub) return;
    hubRefreshInProgress = true;
    const button = el('refreshHubReferencesBtn');
    if (button) button.disabled = true;
    try {
      const result = await window.BUICReferenceHub.update(state.programs, state.nationalities, force);
      if (result.status === 'updated') {
        state.programs = result.programs;
        state.nationalities = result.nationalities;
        ensureNationalityDatalist();
        el('partnerCountrySuggestions').innerHTML = countryOptions();
        renderProgramTable();
        // Student cases, imported Word templates, history and local settings are untouched.
        hubStatus('Hub v' + result.version + ' · reference data updated');
      } else if (result.status === 'unchanged') {
        hubStatus('Hub v' + result.version + ' · up to date');
      } else {
        hubStatus('Hub: no published dataset · bundled references active');
      }
    } catch (error) {
      console.warn('Central Hub reference refresh failed; retaining current local references', error);
      hubStatus('Hub unavailable · existing references preserved', true);
    } finally {
      hubRefreshInProgress = false;
      if (button) button.disabled = false;
    }
  }

  // Thai is the only selectable nationality value. English and Thai country
  // names, demonyms and source aliases are search terms, never form values.
  const EXTRA_NATIONALITY_TERMS={
    Myanmar:['Burmese','Burma','พม่า'],
    Thailand:['Thai','ประเทศไทย'],
    China:['Chinese','ประเทศจีน'],
    Japan:['Japanese','ประเทศญี่ปุ่น'],
    India:['Indian','ประเทศอินเดีย'],
    Philippines:['Filipino','Filipina','Philippine'],
    'United Kingdom':['British','Briton','UK','สหราชอาณาจักร'],
    'United States':['American','USA','สหรัฐอเมริกา'],
    Vietnam:['Vietnamese'],Cambodia:['Cambodian','Khmer'],
    Laos:['Lao','Laotian'],Malaysia:['Malaysian'],
    Indonesia:['Indonesian'],Singapore:['Singaporean'],
    Australia:['Australian'],Canada:['Canadian'],
    France:['French'],Germany:['German'],Russia:['Russian']
  };
  function nationalitySearchKey(value) {
    return String(value??'').normalize('NFKC').toLocaleLowerCase()
      .replace(/[^a-z0-9ก-๙]+/g,' ').trim().replace(/\s+/g,' ');
  }
  function nationalityMatches(item,search) {
    const tokens=nationalitySearchKey(search).split(' ').filter(Boolean);
    const terms=[
      item.thai,item.english,item.countryThai,item.countryEnglish,
      item.nationalityThai,item.nationalityEnglish,
      ...(Array.isArray(item.aliases)?item.aliases:[]),
      ...(EXTRA_NATIONALITY_TERMS[item.english]||[])
    ].map(nationalitySearchKey).filter(Boolean);
    return tokens.every(token=>terms.some(term=>term.includes(token)));
  }
  function nationalityField(value='',isDrawer=false) {
    const id=isDrawer?'drawerNationality':'newNationality';
    const field=isDrawer?'data-edit-field="nationalityThai"':'name="nationalityThai"';
    return `<div class="${isDrawer?'drawer-field':'form-field'} nationality-field">
      <label for="${id}">Nationality Thai</label>
      <div class="nationality-combobox">
        <input id="${id}" ${field} data-nationality-input type="text" required
          value="${escapeHtml(value)}" autocomplete="off" spellcheck="false"
          placeholder="Search country or nationality · ไทย / English"
          role="combobox" aria-autocomplete="list" aria-expanded="false"
          aria-controls="${id}Options" aria-haspopup="listbox" />
        <div class="nationality-results hidden" id="${id}Options" role="listbox"
          aria-label="Select Thai nationality"></div>
      </div>
      <small class="nationality-help">Search in Thai or English; choose the Thai nationality.</small>
    </div>`;
  }
  function bindNationalityPicker(root) {
    const input=root.querySelector('[data-nationality-input]');
    if (!input) return;
    const popup=root.querySelector('#'+input.getAttribute('aria-controls'));
    // An existing saved value is preserved until edited, without changing
    // historical student records or guessing a translation.
    input.dataset.confirmedThai=input.value;
    let matches=[],active=0;
    const hide=()=>{
      popup.classList.add('hidden');input.setAttribute('aria-expanded','false');
      input.removeAttribute('aria-activedescendant');
    };
    const select=index=>{
      const item=matches[index];if(!item)return;
      input.value=item.thai;input.dataset.confirmedThai=item.thai;
      input.setCustomValidity('');hide();input.focus();
      input.dispatchEvent(new Event('change',{bubbles:true}));
    };
    const open=()=>{
      matches=state.nationalities.filter(item=>nationalityMatches(item,input.value)).slice(0,12);
      active=0;
      popup.innerHTML=matches.length?matches.map((item,i)=>
        `<button type="button" class="nationality-option${i===0?' active':''}"
          role="option" aria-selected="${i===0}" id="${popup.id}Row${i}"
          data-nationality-index="${i}">${escapeHtml(item.thai)}</button>`).join('')
        :'<div class="nationality-empty">No matching nationality. Try another country or nationality name.</div>';
      popup.classList.remove('hidden');input.setAttribute('aria-expanded','true');
      if(matches.length)input.setAttribute('aria-activedescendant',popup.id+'Row0');
      else input.removeAttribute('aria-activedescendant');
    };
    input.addEventListener('focus',open);
    input.addEventListener('input',()=>{
      input.dataset.confirmedThai='';input.setCustomValidity('');open();
    });
    input.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&input.getAttribute('aria-expanded')==='true'){
        event.preventDefault();hide();return;
      }
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        event.preventDefault();
        if(input.getAttribute('aria-expanded')!=='true')open();
        else if(matches.length){
          active=(active+(event.key==='ArrowDown'?1:-1)+matches.length)%matches.length;
          popup.querySelectorAll('[data-nationality-index]').forEach((button,i)=>{
            const selected=i===active;button.classList.toggle('active',selected);
            button.setAttribute('aria-selected',String(selected));
            if(selected)button.scrollIntoView({block:'nearest'});
          });
          input.setAttribute('aria-activedescendant',popup.id+'Row'+active);
        }
      }else if(event.key==='Enter'&&input.getAttribute('aria-expanded')==='true'){
        event.preventDefault();select(active);
      }
    });
    popup.addEventListener('pointerdown',event=>{
      if(event.target.closest('[data-nationality-index]'))event.preventDefault();
    });
    popup.addEventListener('click',event=>{
      const choice=event.target.closest('[data-nationality-index]');
      if(choice)select(Number(choice.dataset.nationalityIndex));
    });
    input.addEventListener('blur',hide);
  }
  function nationalitySelectionValid(root) {
    const input=root.querySelector('[data-nationality-input]');
    if(!input)return true;
    const thai=state.nationalities.find(item=>item.thai===input.value)?.thai;
    if(input.value===input.dataset.confirmedThai&&thai){
      input.setCustomValidity('');return true;
    }
    input.setCustomValidity('Select a Thai nationality from the suggestions before saving.');
    input.reportValidity();input.focus();
    return false;
  }
  function ensureNationalityDatalist() {
    // Compatibility with existing Hub refresh calls. Active pickers search
    // state.nationalities directly; a datalist must never expose English options.
    const list=el('nationalitySuggestions');
    if(list)list.innerHTML='';
  }

  function filteredCases() {
    const q = state.search.trim().toLowerCase();
    return state.cases.filter((item) => {
      if (item.caseCategory !== state.activeCategory) return false;
      if (state.activeLabelId !== 'all' && (labelForCase(item)?.id || 'unlabeled') !== state.activeLabelId) return false;
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

  function renderCaseGroupFilter() {
    const select=el('caseLabelFilter');if(!select)return;
    const labels=caseLabels();
    const options=[['all','All groups'],['unlabeled','Unlabeled'],
      ...labels.map(label=>[label.id,label.name+' ('+state.cases.filter(c=>c.labelId===label.id&&c.caseCategory===state.activeCategory).length+')'])];
    if(!options.some(([value])=>value===state.activeLabelId))state.activeLabelId='all';
    select.innerHTML=options.map(([value,name])=>`<option value="${escapeHtml(value)}" ${state.activeLabelId===value?'selected':''}>${escapeHtml(name)}</option>`).join('');
    if(el('groupCasesToggle')) el('groupCasesToggle').checked=state.groupByLabel;
  }
  // Group numbers follow the order of the existing named color groups.
  // Stable group IDs, not display numbers, remain the value stored on cases.
  function caseGroupNumber(item) {
    const group=labelForCase(item);
    if (!group) return '—';
    return String(caseLabels().findIndex(label=>label.id===group.id)+1);
  }
  function caseGroupSelectLabel(item,selected) {
    const group=labelForCase(item);
    return (selected?'Deselect ':'Select ')+(item.fullName||'student')+
      '. '+(group?'Group '+caseGroupNumber(item)+': '+group.name:'Unlabeled')+'.';
  }
  function groupedCaseRows(items) {
    if(!state.groupByLabel)return items.map(renderCaseRow).join('');
    const buckets=new Map(caseLabels().map(label=>[label.id,[]]));
    buckets.set('unlabeled',[]);
    items.forEach(item=>(buckets.get(labelForCase(item)?.id||'unlabeled')||buckets.get('unlabeled')).push(item));
    return [...caseLabels().map(l=>[l.id,l.name,l.color]),['unlabeled','Unlabeled','#94a3b8']].map(([id,name,color])=>{
      const group=buckets.get(id)||[];if(!group.length)return'';
      return `<div class="case-group-heading" role="heading" aria-level="3" style="--case-label-color:${color}"><span class="case-group-heading-swatch"></span><strong>${escapeHtml(name)}</strong><span>${group.length} case${group.length===1?'':'s'}</span></div>${group.map(renderCaseRow).join('')}`;
    }).join('');
  }

  function renderCaseRow(item) {
    const selected = state.selected.has(item.id);
    const requestUntil = calculateRequestUntil(item);
    const capped = isPassportCapped(item);
    const program = programByKey(item.programKey);
    const programName = displayProgramName(item, program);
    const group = labelForCase(item);
    return `
      <div class="case-row ${selected ? 'selected' : ''} ${group ? 'has-case-label' : ''}" data-case-id="${escapeHtml(item.id)}" style="--case-label-color:${group?.color || '#e2e8f0'}">
        <button class="case-select-rail" type="button" data-case-select aria-pressed="${selected}" aria-label="${escapeHtml(caseGroupSelectLabel(item,selected))}" title="${escapeHtml((group?'Group '+caseGroupNumber(item)+' · '+group.name:'Unlabeled')+' · click to '+(selected?'deselect':'select')+' case')}">
          <span class="case-rail-number" aria-hidden="true">${caseGroupNumber(item)}</span>
        </button>
        <div class="case-click student-cell">
          <div class="student-name">${escapeHtml(item.fullName || 'Unnamed student')}${item.isTestCase ? ' <span class="tester-case-pill" title="Fictional demonstration case">TEST ONLY</span>' : ''}</div>
          <div class="student-meta"><span class="meta-strong">${escapeHtml(item.studentId || 'No ID')}</span><span>•</span><span>Doc ${escapeHtml(item.documentNo || '—')}</span></div>
        </div>
        <div class="case-click program-cell">
          <div class="program-name">${escapeHtml(programName)}</div>
          <div class="program-sub"><span class="type-chip">${programTypeLabel(item.programType)}</span><span>${escapeHtml(ruleLabel(item))}</span></div>
        </div>
        <div class="case-click visa-cell">
          <div class="visa-primary">${requestUntil ? formatDate(requestUntil) : 'Not available yet'}</div>
          <div class="visa-secondary">Stay: ${formatDate(item.currentStayUntil)}${capped ? ' · Passport cap' : ''}</div>
        </div>
        <div class="case-click row-chevron">›</div>
      </div>`;
  }

  function renderCaseList() {
    renderCaseGroupFilter();
    const items = filteredCases();
    el('caseList').innerHTML = groupedCaseRows(items);
    el('emptyState').classList.toggle('hidden', items.length > 0);
    items.forEach((item) => {
      const row = el('caseList').querySelector(`[data-case-id="${CSS.escape(item.id)}"]`);
      row.querySelector('[data-case-select]').addEventListener('click', event => {
        event.stopPropagation();
        toggleSelection(item.id,!state.selected.has(item.id));
      });
      row.querySelectorAll('.case-click').forEach((cell) => cell.addEventListener('click', () => openDrawer(item.id)));
    });
    const allVisible = items.length > 0 && items.every((i) => state.selected.has(i.id));
    const selectAll=el('selectAll');
    selectAll.setAttribute('aria-pressed',String(allVisible));
    selectAll.textContent=allVisible?'None':'All';
    selectAll.setAttribute('aria-label',allVisible?'Deselect all visible cases':'Select all visible cases');
    selectAll.title=selectAll.getAttribute('aria-label');
  }

  function renderWorkspace() {
    state.cases = sortCasesOldestFirst(state.cases.map(normalizeCase));
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


  function arrangeCaseFields(root, isDrawer) {
    const attribute = isDrawer ? 'data-edit-field' : 'name';
    const fieldFor = name => root.querySelector('[' + attribute + '="' + name + '"]')?.closest('.drawer-field, .form-field');
    const move = (grid, specs) => {
      if (!grid) return;
      grid.classList.add('ordered-case-grid');
      for (const [name, width] of specs) {
        const field = fieldFor(name);
        if (!field) continue;
        field.classList.remove('full');
        field.classList.add('case-col-' + width);
        grid.appendChild(field);
      }
    };
    const personal = root.querySelector('.drawer-section:first-child .field-grid');
    const academic = root.querySelector('.drawer-section:nth-child(2) .field-grid');
    let personalGrid = personal;
    let academicGrid = academic;
    if (!isDrawer) {
      const form = root;
      const header = [...form.querySelectorAll('.entry-section-title')].find(x => x.textContent.includes('Student and passport'));
      const academicHeader = [...form.querySelectorAll('.entry-section-title')].find(x => x.textContent.includes('Academic information'));
      if (!header || !academicHeader) return;
      personalGrid = document.createElement('div');
      personalGrid.className = 'ordered-case-grid entry-order-grid';
      academicGrid = document.createElement('div');
      academicGrid.className = 'ordered-case-grid entry-order-grid';
      header.after(personalGrid);
      academicHeader.after(academicGrid);
    }
    if (personalGrid) personalGrid.classList.add('personal-case-grid');
    move(personalGrid, [
      ['documentNo', 3], ['nationalityThai', 3], ['passportNo', 3],
      ['passportExpiry', 3], ['currentStayUntil', 3],
      ['title', 2], ['fullName', 7], ['studentId', 6],
    ]);
    move(academicGrid, [
      ['programType', 12],
      ['facultyKey', 6], ['programKey', 6],
      ['totalCredits', 4], ['registeredCredits', 4], ['requestRuleOverride', 4],
      ['studyYearOverride', 6], ['graduationYearOverride', 6],
    ]);
    if (!isDrawer && academicGrid) {
      const manual = fieldFor('manualRequestUntil');
      if (manual) { manual.classList.add('case-col-12'); academicGrid.appendChild(manual); }
    }
    // Faculty has no data-edit-field because its key is a UI-only selector.
    if (isDrawer && academicGrid) {
      const faculty = root.querySelector('#drawerFacultySelect')?.closest('.drawer-field');
      if (faculty) {
        faculty.classList.add('case-col-6');
        const major = fieldFor('programKey');
        academicGrid.insertBefore(faculty, major || null);
      }
    }
    const idField = fieldFor('studentId');
    if (idField) {
      const input = idField.querySelector('[' + attribute + '="studentId"]');
      const checkbox = idField.querySelector('.current-student-check');
      const label = idField.querySelector('label:not(.current-student-check)');
      if (input && checkbox && label) {
        const line = document.createElement('div');
        line.className = 'case-inline-label';
        label.before(line);
        line.append(label, checkbox);
        // Remove the now-empty former input/checkbox row after relocation.
        const oldRow = input.parentElement;
        if (oldRow !== idField) {
          idField.append(input);
          if (oldRow.classList.contains('student-id-current-row')) oldRow.remove();
        }
      }
    }
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
    el('detailDrawer').classList.toggle('editing', state.editing);

    if (state.editing) {
      const rule = inferRule(item);
      const typeOptions = PROGRAM_TYPE_OPTIONS;
      const currentFacultyKey = facultyKeyFor(program) || `${item.facultyEnglish || ''}|||${item.facultyThai || ''}`;
      const facultyOptions = facultyOptionsForType(item.programType);
      const majorOptions = programsForFaculty(item.programType, currentFacultyKey);
      el('drawerContent').innerHTML = `
        <div class="drawer-section"><div class="drawer-section-head"><h3>Personal information</h3></div>
          <div class="field-grid">
            ${editableField('Document no.', 'documentNo', item.documentNo)}
            ${editableSelect('Title', 'title', item.title, [['MISS','MISS'],['MR','MR'],['MS','MS'],['MRS','MRS']])}
            ${editableField('Full name', 'fullName', item.fullName)}
            <div class="drawer-field"><label>Student ID</label>
              <div class="student-id-current-row">
                <input data-edit-field="studentId" type="text" value="${escapeHtml(item.studentId || '')}" />
                <label class="current-student-check"><input data-edit-field="currentStudent" type="checkbox" ${item.currentStudent ? 'checked' : ''} /> <span>Current student</span></label>
              </div>
            </div>
            ${nationalityField(item.nationalityThai,true)}
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
            ${lockedField('Study year override (optional)', 'studyYearOverride', item.studyYearOverride || '', 'number', true, 'min="1" max="20" placeholder="Automatic from Student ID"', Boolean(item.studyYearOverride))}
            ${lockedField('Graduation year B.E. override (optional)', 'graduationYearOverride', item.graduationYearOverride || '', 'number', true, 'min="2500" max="2700" placeholder="Automatic from Student ID"', Boolean(item.graduationYearOverride))}
          </div>
        </div>
        <div class="drawer-section"><div class="drawer-section-head"><h3>Visa request</h3></div>
          <div class="field-grid">
            ${editableSelect('Request option', 'requestRuleOverride', rule, [['six_months','+6 months'],['one_year','+1 year'],['manual','Manual Date']], 'data-request-rule="drawer"')}
            <div class="drawer-field manual-request-field ${rule === 'manual' ? '' : 'hidden'}"><label>Manual request until</label><input data-edit-field="manualRequestUntil" type="date" value="${escapeHtml(item.manualRequestUntil || '')}" /></div>
            ${editableSelect('Case type · move to another section', 'caseCategory', item.caseCategory, [['normal','Normal cases'],['exchange','Exchange students'],['non_o','Non-O → ED transfer']], 'id="editCaseCategory"')}
            ${editableSelect('Case group', 'labelId', item.labelId || '', [['','Unlabeled'],...caseLabels().map((group,index)=>[group.id,(index+1)+' · '+group.name])])}
            <div class="case-move-hint">Change the case type and save to move this student. The new letter template will be used.</div>
          </div>
        </div>
        <div class="drawer-section case-special-section ${item.caseCategory === 'exchange' ? '' : 'hidden'}" data-case-specific="exchange">
          <div class="drawer-section-head"><h3>Exchange details</h3></div><div class="field-grid">
            ${editableField('Partner university (English)', 'exchangeUniversity', item.exchangeUniversity, 'text', 'list="partnerUniversitySuggestions" autocomplete="off"')}
            ${editableField('Partner country (Thai)', 'exchangeCountryThai', item.exchangeCountryThai, 'text', 'list="partnerCountrySuggestions" autocomplete="off"')}
            <div class="exchange-trio">
              ${editableSelect('Exchange semester', 'exchangeTerm', String(item.exchangeTerm || 2), [['1','1'],['2','2'],['3','3']])}
              ${editableField('Academic year (B.E.)', 'exchangeAcademicYear', item.exchangeAcademicYear || rememberedAcademicYear(), 'number', 'min="2500" max="2700"')}
              ${editableField('Duration (semesters)', 'exchangeDurationSemesters', item.exchangeDurationSemesters || 1, 'number', 'min="1" max="12"')}
            </div>
          </div>
        </div>
        <div class="drawer-section case-special-section ${item.caseCategory === 'non_o' ? '' : 'hidden'}" data-case-specific="non_o">
          <div class="drawer-section-head"><h3>Non-O transfer details</h3></div><div class="field-grid">
            ${lockedField('Current Non-O visa purpose (Thai)', 'nonOVisaPurpose', item.nonOVisaPurpose || 'ติดตามธุรกิจ', 'text', true, '', false)}
            ${lockedField('Program duration (years)', 'programDurationYears', item.programDurationYears || (item.programType === 'graduate' ? 2 : 4), 'number', true, 'min="1" max="10"', false)}
          </div>
        </div>
`;
      const ruleSelect = el('drawerContent').querySelector('[data-request-rule="drawer"]');
      ruleSelect?.addEventListener('change', () => {
        el('drawerContent').querySelector('.manual-request-field')?.classList.toggle('hidden', ruleSelect.value !== 'manual');
      });
      arrangeCaseFields(el('drawerContent'), true);
      bindNationalityPicker(el('drawerContent'));
      const caseSelector = el('drawerContent').querySelector('#editCaseCategory');
      const updateCaseFields = () => {
        el('drawerContent').querySelectorAll('[data-case-specific]').forEach(section => {
          const active = section.dataset.caseSpecific === caseSelector.value;
          section.classList.toggle('hidden', !active);
          section.querySelectorAll('[data-edit-field]').forEach(input => { input.disabled = !active; });
        });
      };
      caseSelector.addEventListener('change', updateCaseFields);
      updateCaseFields();
      bindLockedFields(el('drawerContent'));
      updateAutomaticStudyFields(el('drawerContent'));
      const editRoot = el('drawerContent');
      editRoot.querySelector('[data-edit-field="studentId"]')?.addEventListener('input', () => updateAutomaticStudyFields(editRoot));
      editRoot.querySelector('[data-edit-field="programType"]')?.addEventListener('change', () => updateAutomaticStudyFields(editRoot));
      bindAcademicSelectors({
        root: el('drawerContent'),
        typeSelector: '[data-academic-type="drawer"]',
        facultySelector: '#drawerFacultySelect',
        programSelector: '#drawerProgramSelect',
        totalCreditsSelector: '[data-edit-field="totalCredits"]',
        studentIdSelector: '[data-edit-field="studentId"]',
        currentStudentSelector: '[data-edit-field="currentStudent"]',
      });
    } else {
      const facultyDisplay = program ? facultyLabelForType(item.programType, program) : (item.facultyThai || item.facultyEnglish);
      el('drawerContent').innerHTML = `
        <div class="drawer-section"><div class="drawer-section-head"><h3>Personal information</h3></div>
          <div class="field-grid">
            ${fieldItem('Title', item.title)}${fieldItem('Nationality', item.nationalityThai)}${fieldItem('Passport', item.passportNo, true)}${fieldItem('Passport expiry', formatDate(item.passportExpiry))}
            ${fieldItem('Student type', item.currentStudent ? 'Current student · 4.3 Transcript' : 'New student · 4.3 Admission education document')}
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
            ${fieldItem('Study year', item.currentStudent ? (item.studyYearOverride || ((item.academicCohortYear !== null && /^[0-9]{3}/.test(String(item.studentId || ''))) ? (((item.academicCohortYear - Number(String(item.studentId).slice(1, 3)) + 100) % 100) + 1) : 'Verify')) : 1)}
            ${fieldItem('Graduation year B.E.', item.graduationYearOverride || (item.programType === 'graduate' ? 'Graduate template value' : (/^[0-9]{3}/.test(String(item.studentId || '')) ? 2504 + Number(String(item.studentId).slice(1, 3)) : 'Verify')))}
            ${fieldItem('Study hours', item.studyHours ? `${Number(item.studyHours).toLocaleString()} hours` : '—', true)}
          </div>
        </div>
        ${item.caseCategory === 'exchange' ? `
        <div class="drawer-section"><div class="drawer-section-head"><h3>Exchange details</h3></div><div class="field-grid">
          ${fieldItem('Partner university', item.exchangeUniversity)}
          ${fieldItem('Partner country (Thai)', item.exchangeCountryThai)}
          ${fieldItem('Exchange semester', item.exchangeTerm)}
          ${fieldItem('Academic year (B.E.)', item.exchangeAcademicYear)}
          ${fieldItem('Duration (semesters)', item.exchangeDurationSemesters)}
        </div></div>` : ''}
        ${item.caseCategory === 'non_o' ? `
        <div class="drawer-section"><div class="drawer-section-head"><h3>Non-O transfer details</h3></div><div class="field-grid">
          ${fieldItem('Current Non-O visa purpose', item.nonOVisaPurpose)}
          ${fieldItem('Program duration (years)', item.programDurationYears)}
        </div></div>` : ''}
        <div class="drawer-section"><div class="drawer-section-head"><h3>Visa request</h3></div>
          <div class="field-grid">
            ${fieldItem('Current stay', formatDate(item.currentStayUntil))}
            ${fieldItem('Case group', labelForCase(item) ? 'Group '+caseGroupNumber(item)+' · '+labelForCase(item).name : 'Unlabeled')}
            ${fieldItem('Request option', ruleLabel(item))}
            <div class="field-item"><label>Case type</label><div class="field-value">${escapeHtml(({normal:'Normal cases',exchange:'Exchange students',non_o:'Non-O → ED transfer'})[item.caseCategory] || 'Normal cases')}</div><button type="button" class="btn subtle case-move-button" id="moveCaseTypeBtn">Move to another case type →</button></div>
            ${fieldItem(isPassportCapped(item) ? 'Extend until (passport cap)' : 'Request until', item.requestUntil ? formatDate(item.requestUntil) : '—', true)}
          </div>
        </div>`;
    }
    el('moveCaseTypeBtn')?.addEventListener('click', () => {
      state.editing = true;
      renderDrawer();
      const selector = el('drawerContent').querySelector('#editCaseCategory');
      selector?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      selector?.focus();
    });
  }

  function ruleExplanation(item) {
    const rule = inferRule(item);
    const requested = calculateRequestedUntil(item);
    const capped = isPassportCapped(item);
    const description = rule === 'six_months' ? 'Six-month request' : rule === 'one_year' ? 'One-year request' : 'Manual request';
    return capped
      ? `${description}: ${formatDate(requested)}. Passport expires ${formatDate(item.passportExpiry)}, so the letter and table use the passport expiry date.`
      : `${description}: ${formatDate(calculateRequestUntil(item))}.`;
    return '';
  }

  function bindAcademicSelectors({ root, typeSelector, facultySelector, programSelector, totalCreditsSelector, studentIdSelector = '', currentStudentSelector = '' }) {
    const typeSelect = root.querySelector(typeSelector);
    const facultySelect = root.querySelector(facultySelector);
    const programSelect = root.querySelector(programSelector);
    const creditsInput = totalCreditsSelector ? root.querySelector(totalCreditsSelector) : null;
    const studentIdInput = studentIdSelector ? root.querySelector(studentIdSelector) : null;
    const currentStudentInput = currentStudentSelector ? root.querySelector(currentStudentSelector) : null;
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
    studentIdInput?.addEventListener('input', () => {
      const studentId = String(studentIdInput.value || '').trim();
      if (studentId.startsWith('7') && typeSelect.value !== 'graduate') {
        typeSelect.value = 'graduate';
        refreshFaculties();
      }
      if (currentStudentInput) {
        currentStudentInput.checked = inferCurrentStudentFromId(studentId);
      }
    });
    programSelect.addEventListener('change', () => {
      const selected = programByKey(programSelect.value);
      if (creditsInput) creditsInput.value = selected?.credits?.['2026'] ?? '';
    });
  }

  function saveDrawerChanges() {
    const item = getActiveCase();
    if (!item) return;
    if(!nationalitySelectionValid(el('drawerContent')))return;
    const originalCategory = item.caseCategory;
    const category = el('drawerContent').querySelector('#editCaseCategory')?.value || item.caseCategory;
    if (category !== item.caseCategory &&
        !confirm('Move this student to ' + ({normal:'Normal cases',exchange:'Exchange students',non_o:'Non-O → ED transfer'})[category] + '? The case will use the corresponding Word letter template.')) return;
    el('drawerContent').querySelectorAll('[data-edit-field]').forEach((input) => {
      if (input.disabled) return;
      const field = input.dataset.editField;
      if (['studyYearOverride', 'graduationYearOverride'].includes(field)) {
        const enabled = document.querySelector('[data-unlock-target="edit_' + field + '"]')?.checked;
        if (!enabled) { item[field] = ''; return; }
      }
      let value = input.type === 'checkbox' ? input.checked : input.value;
      if (input.type === 'number' && value !== '') value = Number(value);
      item[field] = value;
    });
    const program = programByKey(item.programKey);
    if (program) {
      item.programType = program.programType;
      item.facultyEnglish = program.facultyEnglish;
      item.facultyThai = program.facultyThai;
      item.programEnglish = program.programEnglish;
      item.programThai = program.programThai;
    }
    if (item.requestRuleOverride !== 'manual') item.manualRequestUntil = '';
    if (originalCategory !== item.caseCategory) {
      // Historical batch records are untouched. The new category needs a new
      // letter generated using its own template.
      item.generatedAt = null;
      item.completedAt = null;
      state.selected.delete(item.id);
    }
    Object.assign(item, normalizeCase(item));
    rememberExchangeDetails(item);
    persist();
    state.editing = false;
    // An edited Current student checkbox can move an ordinary case between
    // the New and Current sections. Keep the user on the case's new section.
    if (item.caseCategory !== state.activeCategory) {
      closeDrawer();
      switchView('workspace', item.caseCategory);
    } else {
      renderDrawer();
    }
    renderWorkspace();
    const missing = validationFor(item).missing;
    toast('Case saved', missing.length ? 'Complete missing information before generating Word: ' + missing.join(', ')
      : 'Student information and visa calculations were updated.');
  }

  function renderStudentForm(category = state.activeCategory) {
    if (!['normal', 'exchange', 'non_o'].includes(category)) category = 'normal';
    const categoryLabels = {normal:'Normal student',exchange:'Exchange student',non_o:'Non-O transfer'};
    el('studentModalTitle').textContent = 'Add ' + (categoryLabels[category] || 'student');
    const typePanel = el('studentCaseTypePanel');
    typePanel.innerHTML = `
      <p class="type-panel-eyebrow">STEP 1 · CASE TYPE</p>
      <h3>Select student type</h3>
      <div class="type-option-list" role="group" aria-label="Student case type">
        ${[['normal','▦','Normal cases'],['exchange','⇄','Exchange students'],['non_o','↗','Non-O → ED transfer']]
          .map(([value,icon,label]) => `
            <button class="type-option" type="button" data-entry-category="${value}" aria-pressed="${category === value}">
              <span class="type-option-icon" aria-hidden="true">${icon}</span>
              <span>${label}</span>
            </button>`).join('')}
      </div>
      <p class="type-panel-help">The form on the right changes to match your selection. Your existing cases are not affected.</p>`;
    el('studentForm').innerHTML = `
      <input type="hidden" name="caseCategory" value="${category}" />
      ${category === 'exchange' ? `
        <div class="entry-section-title entry-priority">Exchange student information · complete before adding</div>
        <div class="exchange-partners">
          <div class="form-field"><label>Partner university (English)</label><input name="exchangeUniversity" list="partnerUniversitySuggestions" autocomplete="off" required placeholder="Enter a university name; previous entries will be suggested" /></div>
          <div class="form-field"><label>Partner country (Thai)</label><input name="exchangeCountryThai" list="partnerCountrySuggestions" autocomplete="off" required placeholder="พิมพ์ชื่อประเทศภาษาไทยเพื่อค้นหา" /></div>
        </div>
        <div class="exchange-trio">
          <div class="form-field"><label>Exchange semester</label><select name="exchangeTerm" required><option value="1">1</option><option value="2" selected>2</option><option value="3">3</option></select></div>
          <div class="form-field"><label>Academic year (B.E.)</label><input type="number" name="exchangeAcademicYear" min="2500" max="2700" value="${rememberedAcademicYear()}" required /></div>
          <div class="form-field"><label>Duration (semesters)</label><input type="number" name="exchangeDurationSemesters" min="1" max="12" value="1" required /></div>
        </div>
      ` : ''}
      ${category === 'non_o' ? `
        <div class="entry-section-title entry-priority">Non-O transfer information · complete before adding</div>
        ${lockedField('Current Non-O visa purpose (Thai)', 'nonOVisaPurpose', 'ติดตามธุรกิจ', 'text', false, 'required', false)}
        ${lockedField('Program duration (years)', 'programDurationYears', 4, 'number', false, 'min="1" max="10" required', false)}
      ` : ''}

      <div class="entry-section-title first">Student and passport information</div>
      <div class="form-field"><label>Document no.</label><input name="documentNo" value="" required /></div>
      <div class="form-field"><label>Title</label><select name="title"><option>MISS</option><option>MR</option><option>MS</option><option>MRS</option></select></div>
      <div class="form-field full"><label>Full name</label><input name="fullName" required placeholder="Student full name" /></div>
      <div class="form-field student-id-field"><label>Student ID</label>
        <div class="student-id-current-row">
          <input name="studentId" required />
          <label class="current-student-check"><input type="checkbox" name="currentStudent" /> <span>Current student</span></label>
        </div>
      </div>
      ${nationalityField()}
      <div class="form-field"><label>Passport no.</label><input name="passportNo" /></div>
      <div class="form-field"><label>Passport expiry</label><input type="date" name="passportExpiry" /></div>
      <div class="form-field"><label>Current stay until</label><input type="date" name="currentStayUntil" required /></div>
      <div class="entry-section-title">Academic information and visa request</div>

      <div class="form-field"><label>Program type</label><select name="programType" data-academic-type="new">${PROGRAM_TYPE_OPTIONS.map(([v,l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join('')}</select></div>
      <div class="form-field"><label>Faculty</label><select name="facultyKey" data-academic-faculty="new" required></select></div>
      <div class="form-field full"><label>Major</label><select name="programKey" data-academic-program="new" required></select></div>
      <div class="form-field"><label>Total credits</label><input type="number" min="0" name="totalCredits" data-total-credits="new" /></div>
      <div class="form-field"><label>Registered credits</label><input type="number" min="0" name="registeredCredits" /></div>
      ${lockedField('Study year override (optional)', 'studyYearOverride', '', 'number', false, 'min="1" max="20" placeholder="Automatic from Student ID"', false)}
      ${lockedField('Graduation year B.E. override (optional)', 'graduationYearOverride', '', 'number', false, 'min="2500" max="2700" placeholder="Automatic from Student ID"', false)}
      <div class="form-field"><label>Request option</label><select name="requestRuleOverride" data-request-rule="new"><option value="six_months">+6 months</option><option value="one_year">+1 year</option><option value="manual">Manual Date</option></select></div>
      <div class="form-field manual-request-field hidden"><label>Manual request until</label><input type="date" name="manualRequestUntil" /></div>`;
    const form = el('studentForm');
    typePanel.querySelectorAll('[data-entry-category]').forEach(button => button.addEventListener('click', () => {
      const next = button.dataset.entryCategory;
      if (next === category) return;
      const entered = [...form.querySelectorAll('input, textarea')].some(input =>
        ['documentNo', 'nationalityThai', 'passportNo', 'fullName', 'studentId',
         'passportExpiry', 'currentStayUntil', 'registeredCredits',
         'exchangeUniversity', 'exchangeCountryThai'].includes(input.name) && Boolean(input.value.trim()));
      if (entered && !confirm('Switching case type will clear the information you entered in this form. Continue?')) return;
      renderStudentForm(next);
      form.scrollTop = 0;
    }));
    arrangeCaseFields(form, false);
    bindNationalityPicker(form);
    bindLockedFields(form);
    updateAutomaticStudyFields(form);
    form.elements.studentId.addEventListener('input', () => updateAutomaticStudyFields(form));
    form.elements.programType.addEventListener('change', () => {
      updateAutomaticStudyFields(form);
      const duration = form.elements.programDurationYears;
      if (duration && duration.readOnly) duration.value = form.elements.programType.value === 'graduate' ? 2 : 4;
    });
    // New/current classification is determined by the editable checkbox and
    // ID-prefix rules within Normal cases; it is not a separate sidebar category.
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
      studentIdSelector: '[name="studentId"]',
      currentStudentSelector: '[name="currentStudent"]',
    });
    const ruleSelect = form.querySelector('[data-request-rule="new"]');
    ruleSelect?.addEventListener('change', () => {
      form.querySelector('.manual-request-field')?.classList.toggle('hidden', ruleSelect.value !== 'manual');
    });
  }

  function addStudentFromForm(form) {
    if(!nationalitySelectionValid(form))return;
    const fd = new FormData(form);
    const obj = Object.fromEntries(fd.entries());
    obj.currentStudent = Boolean(form.elements.currentStudent?.checked);
    // Locked study/graduation values are previews; only checked overrides
    // may replace the student-ID calculations in official Word letters.
    for (const field of ['studyYearOverride', 'graduationYearOverride']) {
      const control = form.elements[field];
      const checkbox = form.querySelector('[data-unlock-target="new_' + field + '"]');
      if (control && checkbox && !checkbox.checked) obj[field] = '';
    }
    const program = programByKey(obj.programKey);
    if (obj.requestRuleOverride !== 'manual') obj.manualRequestUntil = '';
    const item = normalizeCase({
      id: uid(), createdAt: new Date().toISOString(), ...obj, caseCategory: obj.caseCategory || state.activeCategory,
      totalCredits: obj.totalCredits ? Number(obj.totalCredits) : (program?.credits?.['2026'] ?? ''),
      registeredCredits: obj.registeredCredits ? Number(obj.registeredCredits) : '',
      programType: program?.programType || obj.programType || 'international',
      facultyEnglish: program?.facultyEnglish || '',
      facultyThai: program?.facultyThai || '',
      programEnglish: program?.programEnglish || '',
      programThai: program?.programThai || '',
    });
    delete item.facultyKey;
    state.cases.push(item);
    state.cases = sortCasesOldestFirst(state.cases);
    if(state.activeDraftId){
      state.drafts=state.drafts.filter(draft=>draft.id!==state.activeDraftId);
      state.activeDraftId=null;
      renderDraftsButton();
    }
    rememberExchangeDetails(item);
    if (item.caseCategory !== state.activeCategory) switchView('workspace', item.caseCategory);
    persist();
    closeModal('studentModal');
    renderWorkspace();
    openDrawer(item.id);
    toast('Student added', 'Faculty and major were linked to the supplied reference data.');
  }

  // Group assignment is a local-only action: never touches student data or the Hub.
  let groupAssignmentIds=[];
  function openGroupAssignmentModal() {
    const items=selectedCases();
    if (!items.length) return;
    groupAssignmentIds=items.map(item=>item.id);
    const first=items[0].labelId||'';
    const shared=items.every(item=>(item.labelId||'')===first);
    el('groupAssignSummary').textContent=items.length+' selected case'+(items.length===1?'':'s')+
      ' · Set one group for these cases without changing their visa information.';
    const root=el('groupAssignCaseList');
    root.innerHTML=items.slice(0,8).map(item=>{
      const group=labelForCase(item);
      return `<div class="group-assign-case"><strong>${escapeHtml(item.fullName||'Unnamed student')}</strong>
        <span>${escapeHtml(group?'Group '+caseGroupNumber(item)+' · '+group.name:'Unlabeled')}</span></div>`;
    }).join('')+(items.length>8?
      '<div class="group-assign-extra">+ '+(items.length-8)+' more selected cases</div>':'');
    const select=el('groupAssignSelect');
    select.innerHTML=(shared?'':'<option value="__choose__">Choose a group…</option>')+
      '<option value="">Unlabeled · remove assignment</option>'+
      caseLabels().map((group,index)=>`<option value="${escapeHtml(group.id)}">Group ${index+1} · ${escapeHtml(group.name)}</option>`).join('');
    select.value=shared?first:'__choose__';
    openModal('groupAssignModal');
    select.focus();
  }
  function saveGroupAssignment() {
    const id=el('groupAssignSelect').value;
    if (id==='__choose__' || (id && !caseLabels().some(group=>group.id===id))) {
      toast('Choose a group','Select a named group or Unlabeled before saving.',true);
      return;
    }
    const ids=new Set(groupAssignmentIds.filter(caseId=>state.selected.has(caseId)));
    const items=state.cases.filter(item=>ids.has(item.id) && item.caseCategory===state.activeCategory);
    if (!items.length) {
      closeModal('groupAssignModal');
      toast('Selection changed','Select the cases again and reopen Edit group assign.',true);
      return;
    }
    items.forEach(item=>{item.labelId=id;});
    persist();
    groupAssignmentIds=[];
    closeModal('groupAssignModal');
    state.selected.clear();
    renderWorkspace();
    renderCaseLabelSettings();
    if (state.activeCaseId && !state.editing && el('detailDrawer').classList.contains('open'))renderDrawer();
    toast('Group assignment saved',items.length+' case'+(items.length===1?'':'s')+
      ' updated locally. No student or visa information was changed.');
  }

  function openModal(id) {
    el('modalBackdrop').classList.remove('hidden');
    el(id).classList.remove('hidden');
  }

  function closeModal(id) {
    el(id).classList.add('hidden');
    const anyOpen = ['studentModal', 'batchModal', 'individualModal', 'departmentModal', 'groupAssignModal', 'draftsModal'].some((modalId) => !el(modalId).classList.contains('hidden'));
    if (!anyOpen) el('modalBackdrop').classList.add('hidden');
  }

  function selectedCases() {
    return sortCasesOldestFirst(state.cases.filter((item) => state.selected.has(item.id) && item.caseCategory === state.activeCategory));
  }

  function departmentFullName(item) {
    const title = String(item.title || '').trim().toUpperCase();
    const prefix = ({ MR: 'MR.', 'MR.': 'MR.', MS: 'MS.', 'MS.': 'MS.', MRS: 'MRS.', 'MRS.': 'MRS.', MISS: 'MISS' })[title] || title;
    const name = String(item.fullName || '').trim().replace(/^(?:MR\.?|MRS\.?|MS\.?|MISS)\s+/i, '');
    return [prefix, name].filter(Boolean).join(' ');
  }

  function departmentRows(items = selectedCases()) {
    return items.map((item) => ({
      documentNo: String(item.documentNo || '').trim(),
      studentId: String(item.studentId || '').trim(),
      fullName: departmentFullName(item),
      passportNo: String(item.passportNo || '').trim(),
      passportExpiry: formatDepartmentDate(item.passportExpiry),
      visaExpiry: formatDepartmentDate(item.currentStayUntil),
      extendUntil: formatDepartmentDate(calculateRequestUntil(item)),
    }));
  }

  function departmentTsv(rows) {
    const header = ['Doc no.', 'Student id', 'Name', 'Passport no.', 'Passport expiry', 'Visa expiry', 'Extend until'];
    const clean = (value) => String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
    return [header, ...rows.map((row) => [
      row.documentNo, row.studentId, row.fullName, row.passportNo,
      row.passportExpiry, row.visaExpiry, row.extendUntil,
    ])].map((row) => row.map(clean).join('\t')).join('\n');
  }

  function renderDepartmentModal() {
    const rows = departmentRows();
    el('departmentModalBody').innerHTML = `
      <div class="department-summary">
        <strong>${rows.length} selected case${rows.length === 1 ? '' : 's'}</strong>
        <span>Oldest case first — the same order used by Generate letters and Generate list.</span>
      </div>
      <div class="department-table-wrap">
        <table class="department-table">
          <thead><tr>
            <th>Doc no.</th><th>Student id</th><th>Name</th><th>Passport no.</th>
            <th>Passport expiry</th><th>Visa expiry</th><th>Extend until</th>
          </tr></thead>
          <tbody>
            ${rows.map((row) => `<tr>
              <td>${escapeHtml(row.documentNo)}</td>
              <td>${escapeHtml(row.studentId)}</td>
              <td><strong>${escapeHtml(row.fullName)}</strong></td>
              <td>${escapeHtml(row.passportNo)}</td>
              <td>${escapeHtml(row.passportExpiry)}</td>
              <td>${escapeHtml(row.visaExpiry)}</td>
              <td>${escapeHtml(row.extendUntil)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    el('copyDepartmentBtn').disabled = !rows.length;
    el('downloadDepartmentBtn').disabled = !rows.length;
  }

  async function copyDepartmentTable() {
    const rows = departmentRows();
    if (!rows.length) return;
    const text = departmentTsv(rows);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    toast('Table copied', 'Paste directly into your department spreadsheet; columns will stay separated.');
  }

  async function downloadDepartmentExcel() {
    const rows = departmentRows();
    if (!rows.length) return;
    try {
      const blob = await ExcelExport.createDepartmentWorkbook(rows);
      downloadBlob(blob, `New_Student_Visa_Table_${todayIso()}.xlsx`);
      toast('Excel downloaded', `${rows.length} rows exported oldest to newest.`);
    } catch (err) {
      toast('Excel export failed', err.message || String(err), true);
    }
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

  function templateKeyForCase(item) {
    if (item.caseCategory === 'exchange') return 'exchange';
    if (item.caseCategory === 'non_o') return 'non_o';
    return item.programType === 'graduate' ? 'letter76' : 'letter16';
  }

  function reviewerBoxOptionMarkup(id) {
    const names=studentListColumns().slice(0,3);
    return `<label class="review-box-option">
      <input type="checkbox" id="${id}" ${state.settings.letterReviewBoxEnabled?'checked':''} ${names.length?'':'disabled'} />
      <span><strong>Add review table at top-right of Word letter</strong>
        <small>Same names as Letter checkers (first three): ${escapeHtml(names.join(' | ') || 'No columns configured')}.
        Right-hand cells stay blank for handwritten notes. Optional, and applied to each generated letter.</small></span>
    </label>`;
  }
  function bindReviewerBoxChoice(id) {
    el(id)?.addEventListener('change', event => {
      state.settings.letterReviewBoxEnabled=event.target.checked;
      persist();
    });
  }
  function reviewerBoxGenerationOptions(id) {
    return {reviewBox:Boolean(el(id)?.checked),
      columnNames:[...studentListColumns().slice(0,3)]};
  }

  function renderBatchModal() {
    const items = selectedCases();
    const letterValidCount = items.filter((item) => validationFor(item).valid).length;
    const listValidCount = items.filter((item) => listValidationFor(item).valid).length;
    const requiredTemplates = [...new Set(items.map(templateKeyForCase))];
    const lettersTemplatesReady = requiredTemplates.every((key) => Boolean(state.templates[key]));
    const listTemplateReady = Boolean(state.templates.studentList);
    const issueDate = todayIso();
    el('batchModalBody').innerHTML = `
      <div class="batch-layout">
        <div class="batch-summary">
          <h3>Selected cases</h3>
          ${items.map((item) => {
            const letterV = validationFor(item);
            const listV = listValidationFor(item);
            return `<div class="batch-case"><div><strong>${escapeHtml(item.fullName)}</strong><small>Doc ${escapeHtml(item.documentNo || '—')} · ${escapeHtml(item.studentId)} · ${escapeHtml(ruleLabel(item))}${isPassportCapped(item) ? ' · Passport cap: ' + escapeHtml(formatDate(item.passportExpiry)) : ''}</small></div><div class="batch-validations"><span class="validation-pill ${letterV.valid ? 'ok' : 'error'}">LETTER ${letterV.valid ? 'VALID' : `${letterV.missing.length} ISSUE${letterV.missing.length === 1 ? '' : 'S'}`}</span><span class="validation-pill ${listV.valid ? 'ok' : 'error'}">LIST ${listV.valid ? 'VALID' : `${listV.missing.length} ISSUE${listV.missing.length === 1 ? '' : 'S'}`}</span></div></div>`;
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
          <div class="rule-box"><strong>Student list date</strong><br>The selected date replaces <code>mmmm dd, 2026</code> in the list template automatically.<br><strong>Columns:</strong> ${escapeHtml(studentListColumns().join(' | ') || 'None')}. Manage them in Workspace settings.</div>
          ${reviewerBoxOptionMarkup('batchReviewBox')}
          <div class="batch-setting"><label>Signatory — letters only</label><select id="batchSignatory">${signatoryOptions(state.settings.signatory)}</select></div>
          <div id="batchSignaturePreview">${signatoryPreview(state.settings.signatory)}</div>
          <div class="rule-box"><strong>Document numbers</strong><br>Each output uses the document number already saved on each student. No renumbering or sorting is applied.</div>
        </div>
      </div>`;
    bindReviewerBoxChoice('batchReviewBox');
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
      reviewerBox: reviewerBoxGenerationOptions('batchReviewBox'),
      students: items.map((item) => ({ ...normalizeCase(item), status: deriveStatus(item) })),
    };
    const button = el('generateBatchBtn');
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Exporting…';
    try {
      const blob = await BrowserDocx.generateBatch(body.students, body.issueDate, body.signatory, body.reviewerBox);
      const filename = `Visa_Extension_Letters_${body.students.length}_Students_${body.issueDate.replaceAll('-', '')}.docx`;
      downloadBlob(blob, filename);
      const generatedAt = new Date().toISOString();
      items.forEach((item) => { item.generatedAt = generatedAt; });
      state.batches.unshift({
        id: uid('batch'), createdAt: generatedAt, issueDate: body.issueDate,
        documentNumbers: items.map((item) => String(item.documentNo || '').trim()),
        students: historyStudentSnapshot(items),
        count: items.length, signatory: body.signatory,
        outputType: 'letters', category: state.activeCategory, filename,
        reviewerBox:body.reviewerBox.reviewBox, reviewerColumns:body.reviewerBox.reviewBox?body.reviewerBox.columnNames:[],
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
      const columns = [...studentListColumns()];
      const blob = await BrowserDocx.generateList(body.students, body.issueDate, columns);
      const filename = `Student_List_${body.issueDate.replaceAll('-', '')}.docx`;
      downloadBlob(blob, filename);
      const generatedAt = new Date().toISOString();
      state.batches.unshift({
        id: uid('list'), createdAt: generatedAt, issueDate: body.issueDate,
        documentNumbers: items.map((item) => String(item.documentNo || '').trim()),
        students: historyStudentSnapshot(items),
        count: items.length, signatory: state.settings.signatory,
        outputType: 'student_list', listColumns: [...columns], filename,
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
      ${isPassportCapped(item) ? `<div class="validation-summary"><strong>Passport expiry cap:</strong> Requested until ${escapeHtml(formatDate(calculateRequestedUntil(item)))}; the Word letter will use ${escapeHtml(formatDate(item.passportExpiry))}.</div>` : ''}
      ${validation.valid ? '' : `<div class="validation-summary bad"><strong>Needs attention:</strong> ${escapeHtml(validation.missing.join(', '))}</div>`}
      <div class="batch-setting"><label>Letter date</label><input id="individualIssueDate" type="date" value="${todayIso()}" /></div>
      <div class="rule-box"><strong>Document ${escapeHtml(item.documentNo || "—")}</strong><br>The letter uses the document number already saved on this student case.</div>
      ${reviewerBoxOptionMarkup('individualReviewBox')}
      <div class="batch-setting"><label>Signatory</label><select id="individualSignatory">${signatoryOptions(state.settings.signatory)}</select></div>
      <div id="individualSignaturePreview">${signatoryPreview(state.settings.signatory)}</div>
      <div class="rule-box">This creates one Word letter for this student. Open the downloaded DOCX in Word to print.</div>`;
    bindReviewerBoxChoice('individualReviewBox');
    const signer = el('individualSignatory');
    signer?.addEventListener('change', () => { el('individualSignaturePreview').innerHTML = signatoryPreview(signer.value); });
    const templateReady = Boolean(state.templates[templateKeyForCase(item)]);
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
      reviewerBox:reviewerBoxGenerationOptions('individualReviewBox'),
    };
    const button = el('generateIndividualBtn');
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Creating…';
    try {
      const blob = await BrowserDocx.generateIndividual(body.student, body.issueDate, body.signatory, body.reviewerBox);
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
      cases: state.cases, drafts: state.drafts, batches: state.batches, settings: state.settings, templates,
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `visa_workspace_${todayIso()}.visabackup`);
    toast('Backup exported', 'Cases, history, settings and imported Word templates are included.');
  }

  async function restoreBackupFile(file) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (!payload || typeof payload !== 'object') throw new Error('Backup file is not valid JSON');
      state.cases = migrateCaseOrder(payload.cases);
      state.drafts = normalizeDrafts(payload.drafts);
      state.activeDraftId = null;
      state.batches = Array.isArray(payload.batches) ? payload.batches : [];
      state.settings = { ...state.settings, ...(payload.settings || {}) };
      state.settings.signatory = normalizeSignatoryKey(state.settings.signatory);
      state.settings.newStudentPrefixes = cleanNewStudentPrefixes(state.settings.newStudentPrefixes) || '169, 769, 869, 969';
      studentListColumns();
      caseLabels();
      state.settings.exchangeUniversities = normalizeExchangeUniversities(state.settings.exchangeUniversities);
      if (payload.templates) await VisaDB.importTemplatesBase64(payload.templates);
      persist();
      await refreshTemplateStatus();
      el('signatoryInput').innerHTML = signatoryOptions(state.settings.signatory);
      el('signatoryInput').value = state.settings.signatory;
      el('settingsSignaturePreview').innerHTML = signatoryPreview(state.settings.signatory);
      if (el('newStudentPrefixesInput')) el('newStudentPrefixesInput').value = state.settings.newStudentPrefixes;
      renderListColumnSettings();
      renderCaseLabelSettings();
      showPartnerUniversitySuggestions();
      renderSavedUniversities();
      renderDraftsButton();
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
    const overrides = await VisaDB.listTemplates();
    state.templates = {};
    const mapping = [
      ['letter16', 'letter16TemplateStatus'],
      ['letter76', 'letter76TemplateStatus'],
      ['studentList', 'studentListTemplateStatus'],
      ['exchange', 'exchangeTemplateStatus'],
      ['non_o', 'nonOTemplateStatus'],
    ];
    mapping.forEach(([key, id]) => {
      const node = el(id);
      const override = overrides[key];
      state.templates[key] = override || { name: BUILTIN_TEMPLATE_NAMES[key], builtin: true };
      if (!node) return;
      node.textContent = override
        ? `Ready · Browser override · ${override.name}`
        : `Ready · Built-in · ${BUILTIN_TEMPLATE_NAMES[key]}`;
      node.classList.add('ready');
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

  const SETTINGS_TABS = ['general','groups','documents','data','tools'];
  let activeSettingsTab = 'general';
  function switchSettingsTab(tab) {
    activeSettingsTab=SETTINGS_TABS.includes(tab)?tab:'general';
    document.querySelectorAll('[data-settings-tab]').forEach(button=>{
      const active=button.dataset.settingsTab===activeSettingsTab;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
      button.tabIndex=active?0:-1;
    });
    document.querySelectorAll('[data-settings-panel]').forEach(panel=>{
      const active=panel.dataset.settingsPanel===activeSettingsTab;
      panel.hidden=!active;
      panel.classList.toggle('active',active);
    });
  }
  function bindSettingsTabs() {
    document.querySelectorAll('[data-settings-tab]').forEach(button=>{
      button.addEventListener('click',()=>switchSettingsTab(button.dataset.settingsTab));
      button.addEventListener('keydown',event=>{
        if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
        event.preventDefault();
        const current=SETTINGS_TABS.indexOf(button.dataset.settingsTab);
        const next=event.key==='Home'?0:event.key==='End'?SETTINGS_TABS.length-1:
          (current+(event.key==='ArrowDown'?1:-1)+SETTINGS_TABS.length)%SETTINGS_TABS.length;
        switchSettingsTab(SETTINGS_TABS[next]);
        document.querySelector('[data-settings-tab="'+SETTINGS_TABS[next]+'"]')?.focus();
      });
    });
    switchSettingsTab(activeSettingsTab);
  }
  function addTesterCase() {
    const sampleProgram=state.programs.find(p=>p.programType==='international' &&
      /business administration/i.test(p.programEnglish||''))||
      state.programs.find(p=>p.programType==='international' && p.credits?.['2026']);
    if(!sampleProgram) {
      toast('Test case unavailable','Academic references are still loading. Try again shortly.',true);
      return;
    }
    // Clearly synthetic values: no student record is read or copied.
    let serial=1,number;
    do {number='TEST'+String(serial++).padStart(5,'0')}
    while(state.cases.some(item=>item.studentId===number || item.documentNo==='TEST-'+number));
    const item=normalizeCase({
      id:uid('tester'), createdAt:new Date().toISOString(), isTestCase:true,
      caseCategory:'normal', documentNo:'TEST-'+number, title:'MISS',
      fullName:'TESTER [SAMPLE CASE]', studentId:number, currentStudent:true,
      nationalityThai:'ไทย', passportNo:'TEST-ONLY',
      passportExpiry:addMonths(todayIso(),48),
      currentStayUntil:addMonths(todayIso(),1),
      programKey:sampleProgram.key, programType:sampleProgram.programType,
      facultyEnglish:sampleProgram.facultyEnglish, facultyThai:sampleProgram.facultyThai,
      programEnglish:sampleProgram.programEnglish, programThai:sampleProgram.programThai,
      totalCredits:sampleProgram.credits?.['2026']??'',
      registeredCredits:18, requestRuleOverride:'six_months',
      labelId:''
    });
    state.cases.push(item);
    state.cases=sortCasesOldestFirst(state.cases);
    persist();
    state.search='';
    state.activeLabelId='all';
    el('searchInput').value='';
    switchView('workspace','normal');
    renderWorkspace();
    openDrawer(item.id);
    toast('Tester created','A fictional local case was added. Delete it when your testing is finished.');
  }

  function switchView(view, caseCategory = state.activeCategory) {
    const categories = {
      normal: ['Normal cases', 'NEW & CURRENT STUDENTS'],
      exchange: ['Exchange students', 'EXCHANGE LETTERS'],
      non_o: ['Non-O → ED transfer', 'NON-O TRANSFER LETTERS'],
    };
    if (view === 'workspace') {
      state.activeCategory = categories[caseCategory] ? caseCategory : 'normal';
      state.selected.clear();
      if (el('detailDrawer')?.classList.contains('open')) closeDrawer();
      renderCaseList();
      renderSelectionBar();
    }
    const map = {
      workspace: ['workspaceView', ...categories[state.activeCategory]],
      batches: ['batchesView', 'Generation history', 'DOCUMENT OUTPUT'],
      programs: ['programsView', 'Academic programs', 'REFERENCE DATA'],
      settings: ['settingsView', 'Workspace settings', 'CONFIGURATION'],
    };
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
    const [id, title, eyebrow] = map[view] || map.workspace;
    el(id).classList.add('active');
    document.querySelector(view === 'workspace'
      ? `.nav-item[data-view="workspace"][data-case-category="${state.activeCategory}"]`
      : `.nav-item[data-view="${view}"]`)?.classList.add('active');
    el('pageTitle').textContent = title;
    el('pageEyebrow').textContent = eyebrow;
    if (view === 'programs') renderProgramTable();
    if (view === 'batches') renderBatchHistory();
    if (view === 'settings') { switchSettingsTab(activeSettingsTab); refreshTemplateStatus().catch(console.error); }
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
    document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click',
      () => switchView(item.dataset.view, item.dataset.caseCategory || state.activeCategory)));
    el('menuToggle')?.addEventListener('click', () => el('sidebar').classList.toggle('open'));
    el('addStudentBtn').addEventListener('click',openNewStudentForm);
    el('draftsBtn').addEventListener('click',()=>{
      renderDraftsModal();openModal('draftsModal');
    });
    el('newFromDraftsBtn').addEventListener('click',()=>{
      closeModal('draftsModal');openNewStudentForm();
    });
    el('saveStudentDraftBtn').addEventListener('click',saveStudentDraft);
    el('draftsList').addEventListener('click',event=>{
      const edit=event.target.closest('[data-draft-open]');
      if(edit){openDraft(edit.dataset.draftOpen);return;}
      const remove=event.target.closest('[data-draft-delete]');
      if(!remove)return;
      const draft=state.drafts.find(item=>item.id===remove.dataset.draftDelete);
      if(!draft)return;
      const name=String(draft.values.fullName||'').trim()||'this draft';
      if(!confirm('Delete draft "'+name+'"? No active student case will be removed.'))return;
      state.drafts=state.drafts.filter(item=>item.id!==draft.id);
      if(state.activeDraftId===draft.id)state.activeDraftId=null;
      persist();renderDraftsModal();
      toast('Draft deleted','Only the selected local draft was removed.');
    });
    bindSettingsTabs();
    el('addTesterBtn')?.addEventListener('click',addTesterCase);
    el('openHistoryFromSettings').addEventListener('click', () => switchView('batches'));
    el('openProgramsFromSettings').addEventListener('click', () => switchView('programs'));

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
    el('exchangeTemplateInput').addEventListener('change', (event) => {
      importTemplate('exchange', event.target.files?.[0]).finally(() => { event.target.value = ''; });
    });
    el('nonOTemplateInput').addEventListener('change', (event) => {
      importTemplate('non_o', event.target.files?.[0]).finally(() => { event.target.value = ''; });
    });

    el('searchInput').addEventListener('input', (e) => { state.search = e.target.value; renderCaseList(); });
    el('caseLabelFilter')?.addEventListener('change', e => { state.activeLabelId=e.target.value;renderCaseList(); });
    el('groupCasesToggle')?.addEventListener('change', e => { state.groupByLabel=e.target.checked;renderCaseList(); });
    bindCaseLabelSettings();
    el('selectAll').addEventListener('click', () => {
      const items=filteredCases();
      const allSelected=items.length>0 && items.every(item=>state.selected.has(item.id));
      items.forEach(item=>allSelected?state.selected.delete(item.id):state.selected.add(item.id));
      renderCaseList();
      renderSelectionBar();
    });
    el('clearSelectionBtn').addEventListener('click', () => { state.selected.clear(); renderCaseList(); renderSelectionBar(); });
    el('deleteSelectedBtn').addEventListener('click', deleteSelectedCases);
    el('editGroupAssignBtn').addEventListener('click',openGroupAssignmentModal);
    el('saveGroupAssignBtn').addEventListener('click',saveGroupAssignment);
    el('departmentTableBtn').addEventListener('click', () => { renderDepartmentModal(); openModal('departmentModal'); });
    el('copyDepartmentBtn').addEventListener('click', copyDepartmentTable);
    el('downloadDepartmentBtn').addEventListener('click', downloadDepartmentExcel);
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
      closeModal('draftsModal');
      closeModal('batchModal');
      closeModal('individualModal');
      closeModal('departmentModal');
      closeModal('groupAssignModal');
    });
    el('studentForm').addEventListener('submit', (e) => {
      e.preventDefault();
      addStudentFromForm(e.currentTarget);
    });
    el('programSearch').addEventListener('input', renderProgramTable);
    el('refreshHubReferencesBtn')?.addEventListener('click', () => { void syncHubReferences(true); });
    el('signatoryInput').addEventListener('change', (e) => {
      state.settings.signatory = normalizeSignatoryKey(e.target.value);
      el('settingsSignaturePreview').innerHTML = signatoryPreview(state.settings.signatory);
      persist();
      toast('Setting saved', 'Default signatory updated.');
    });
    bindListColumnSettings();
    el('savedUniversitiesList').addEventListener('click', event => {
      const button = event.target.closest('[data-remove-university]');
      if (!button) return;
      const index = Number(button.dataset.removeUniversity);
      const names = normalizeExchangeUniversities(state.settings.exchangeUniversities);
      if (!Number.isInteger(index) || index < 0 || index >= names.length) return;
      names.splice(index, 1);
      state.settings.exchangeUniversities = names;
      persist();
      renderSavedUniversities();
      showPartnerUniversitySuggestions();
    });
    el('clearSavedUniversitiesBtn').addEventListener('click', () => {
      if (!confirm('Clear all remembered partner university suggestions? Existing cases will remain unchanged.')) return;
      state.settings.exchangeUniversities = [];
      persist();
      renderSavedUniversities();
      showPartnerUniversitySuggestions();
    });
    el('newStudentPrefixesInput')?.addEventListener('change', (e) => {
      const cleaned = cleanNewStudentPrefixes(e.target.value);
      if (!cleaned) {
        e.target.value = state.settings.newStudentPrefixes;
        toast('Prefixes not changed', 'Enter at least one numeric prefix, separated by commas.', true);
        return;
      }
      state.settings.newStudentPrefixes = cleaned;
      e.target.value = cleaned;
      persist();
      toast('Setting saved', `New-student prefixes: ${cleaned}`);
    });
  }

  async function boot() {
    try {
      await loadReferenceData();
      await loadLocalState();
      await refreshTemplateStatus();
      ensureNationalityDatalist();
      el('partnerCountrySuggestions').innerHTML = countryOptions();
      showPartnerUniversitySuggestions();

      el('signatoryInput').innerHTML = signatoryOptions(state.settings.signatory);
      el('signatoryInput').value = state.settings.signatory;
      el('settingsSignaturePreview').innerHTML = signatoryPreview(state.settings.signatory);
      if (el('newStudentPrefixesInput')) el('newStudentPrefixesInput').value = state.settings.newStudentPrefixes;
      renderListColumnSettings();
      renderCaseLabelSettings();
      renderSavedUniversities();
      renderDraftsButton();

      bindEvents();
      renderWorkspace();
      renderProgramTable();
      renderBatchHistory();

      // Check the public reference API only after local workspace loading has completed.
      // Never send cases, student identifiers or imported templates to the Hub.
      void syncHubReferences(true);
      setInterval(() => {
        if (document.visibilityState === 'visible') void syncHubReferences();
      }, 5 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void syncHubReferences();
      });

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
