/* BUIC Central Hub: public reference data only. Never sends student cases or templates. */
(() => {
  'use strict';
  const BASE = 'https://buic-central-hub.vercel.app';
  const REQUEST_TIMEOUT_MS = 7000;
  const normalize = value => String(value ?? '').trim().toLocaleLowerCase('en');
  let lastVersion = null;

  async function getJson(url, signal) {
    const response = await fetch(url, { cache: 'no-store', mode: 'cors', credentials: 'omit', signal });
    if (!response.ok) throw new Error('Central Hub returned HTTP ' + response.status);
    return response.json();
  }

  // The public reference aliases include formal Thai state names alongside
  // short country names, capitals and demonyms. Only explicit formal names
  // qualify for Partner country (Thai); never guess one from a place name.
  const OFFICIAL_COUNTRY_PREFIX = /^(?:สหพันธ์|สหพันธรัฐ|สหรัฐ|สหราชอาณาจักร|สหภาพ|สาธารณรัฐ|ราชอาณาจักร|ราชรัฐ|รัฐพหุชนชาติ|รัฐเอกราช|รัฐสุลต่าน|เครือรัฐ|สมาพันธรัฐ|จักรวรรดิ|ราชาธิปไตย|เนการา|รัฐอิสระ)/;
  function officialThaiCountry(row) {
    const shortName=String(row.thai||'').trim();
    if(!shortName || !/[ก-๙]/.test(shortName))return shortName;
    const provided=String(row.countryOfficialThai||'').trim();
    if(provided&&/[ก-๙]/.test(provided)&&!/[A-Za-z]/.test(provided))return provided;
    const aliases=Array.isArray(row.aliases)?row.aliases:[];
    return aliases.find(alias=>typeof alias==='string' &&
      alias!==shortName && OFFICIAL_COUNTRY_PREFIX.test(alias) &&
      /[ก-๙]/.test(alias) && !/[A-Za-z]/.test(alias))||shortName;
  }

  // Counts are not fixed: administrators can add and remove published references.
  // Validate the entire incoming release before changing either local dataset.
  function checkRows(rows, label, key) {
    if (!Array.isArray(rows) || !rows.length || rows.length > 5000) {
      throw new Error(label + ' has an invalid record count; existing references kept');
    }
    const ids = rows.map(row => String(row?.[key] ?? '').trim());
    if (ids.some(id => !id) || new Set(ids).size !== ids.length) {
      throw new Error(label + ' has missing or duplicate record identifiers');
    }
  }

  function mergedAliases(local, remote) {
    return [...new Set([
      ...(Array.isArray(local?.aliases) ? local.aliases : []),
      ...(Array.isArray(remote?.aliases) ? remote.aliases : [])
    ].filter(value => typeof value === 'string' && value.trim()))];
  }

  // The Hub records the original academic delivery classification while this
  // workspace uses four stable operational categories. Existing local keys and
  // categories must not be rewritten when a Hub release refreshes.
  const WORKSPACE_PROGRAM_TYPES = new Set([
    'thai', 'international', 'chinese_international', 'graduate'
  ]);
  const HUB_PROGRAM_TYPES = new Set([
    'thai', 'international', 'chinese_international', 'graduate',
    'bilingual', 'english', 'online_/_it-based'
  ]);
  function workspaceProgramType(remote, local) {
    const sourceType = String(remote.programType || '').trim().toLowerCase();
    const degree = String(remote.degreeLevel || '').trim().toLowerCase();
    if (!HUB_PROGRAM_TYPES.has(sourceType)) {
      throw new Error('Unsupported academic program type for ' + remote.recordId + ': ' + (sourceType || 'blank'));
    }
    if (local?.programType && WORKSPACE_PROGRAM_TYPES.has(local.programType)) {
      return local.programType;
    }
    if (degree === 'master' || degree === 'doctor') return 'graduate';
    if (WORKSPACE_PROGRAM_TYPES.has(sourceType)) return sourceType;
    if (sourceType === 'bilingual' && degree === 'bachelor') {
      if (remote.facultyCode === 'BUI') return 'international';
      if (remote.facultyCode === 'BUCI') return 'chinese_international';
    }
    throw new Error('Cannot safely categorize new academic program ' + remote.recordId);
  }

  function compatibleProgram(remote, local) {
    const english = String(remote.programEnglish || '').trim();
    const thai = String(remote.programThai || '').trim();
    const facultyEnglish = String(remote.facultyEnglish || '').trim();
    const facultyThai = String(remote.facultyThai || '').trim();
    const type = String(remote.programType || '').trim().toLowerCase();
    const degree = String(remote.degreeLevel || '').trim().toLowerCase();
    if (!english || !thai || !facultyEnglish || !facultyThai ||
        !HUB_PROGRAM_TYPES.has(type) ||
        !['bachelor','master','doctor'].includes(degree)) {
      throw new Error('Invalid academic program reference ' + remote.recordId);
    }
    const workspaceType = workspaceProgramType(remote, local);
    const credit = remote.credits?.['2026'];
    if (credit != null && (!Number.isInteger(credit) || credit < 1 || credit > 600)) {
      throw new Error('Invalid 2026 credits for ' + remote.recordId);
    }
    const code = String(remote.facultyCode || '').trim();
    const generatedKey = english + ' [' + (code || facultyEnglish) + ']';
    return {
      ...(local || {}),
      recordId: remote.recordId,
      key: local?.key || remote.key || generatedKey,
      programType: workspaceType,
      sourceProgramType: remote.sourceProgramType || local?.sourceProgramType || type,
      // Preserve the workspace's historical "graduate" degree grouping.
      degreeLevel: local?.degreeLevel || (degree === 'bachelor' ? 'bachelor' : 'graduate'),
      sourceDegreeLevel: degree,
      facultyEnglish, facultyThai,
      facultyCode: code, programEnglish: english, programThai: thai,
      additionalNotes: String(remote.additionalNotes || ''),
      credits: { ...(local?.credits || {}), '2026': credit ?? null },
      creditStatus: remote.creditStatus,
      creditSourceUrl: remote.creditSourceUrl || '',
      creditSourceStatus: remote.creditSourceStatus || '',
      creditNotes: remote.creditNotes || '',
      aliases: mergedAliases(local, remote)
    };
  }

  // Approved short-name conventions; a previously published Hub release may
  // predate the matching source correction. Apply the same display policy here.
  const THAI_NATIONALITY_OVERRIDES = Object.freeze({
    Germany:'เยอรมนี',
    Taiwan:'จีน', 'Hong Kong':'จีน', Macao:'จีน',
    'DR Congo':'คองโก', 'Republic of the Congo':'คองโก',
    Netherlands:'เนเธอร์แลนด์',
    'United Kingdom':'อังกฤษ', 'United States':'อเมริกา'
  });
  function compatibleNationality(remote, local) {
    const english = String(remote.english || '').trim();
    const countryThai = String(remote.thai || '').trim();
    const thaiNationality = THAI_NATIONALITY_OVERRIDES[english] || String(remote.nationalityThai || '').trim();
    if (!english || !countryThai || !thaiNationality ||
        !/[ก-๙]/.test(thaiNationality) || /[A-Za-z]/.test(thaiNationality)) {
      throw new Error('Invalid Thai nationality reference for ' + (english || remote.recordId));
    }
    return {
      ...(local || {}),
      recordId: remote.recordId,
      // The nationality field takes the Thai demonym, never the country label.
      thai: thaiNationality,
      english,
      countryThai,
      countryEnglish: english,
      countryOfficialThai: officialThaiCountry(remote),
      nationalityThai: thaiNationality,
      nationalityEnglish: String(remote.nationalityEnglish || '').trim(),
      aliases: mergedAliases(local, remote)
    };
  }

  async function update(localPrograms, localNationalities, force = false) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const meta = await getJson(BASE + '/api/v1/meta', controller.signal);
      if (!meta?.available || !Number.isSafeInteger(meta.version) || meta.version < 1) {
        return { status: 'unpublished' };
      }
      if (!force && lastVersion === meta.version) {
        return { status: 'unchanged', version: meta.version };
      }
      const [programResponse, nationalityResponse] = await Promise.all([
        getJson(BASE + '/api/v1/reference/programs', controller.signal),
        getJson(BASE + '/api/v1/reference/nationalities', controller.signal)
      ]);
      if (programResponse.version !== meta.version || nationalityResponse.version !== meta.version ||
          programResponse.dataset !== 'programs' || nationalityResponse.dataset !== 'nationalities') {
        throw new Error('Hub versions do not match; try refreshing again');
      }
      const programs = programResponse.records;
      const nationalities = nationalityResponse.records;
      checkRows(programs, 'Programs', 'recordId');
      checkRows(nationalities, 'Nationalities', 'recordId');
      const englishKeys = nationalities.map(row => normalize(row.english));
      if (englishKeys.some(key => !key) || new Set(englishKeys).size !== englishKeys.length) {
        throw new Error('Hub country names are missing or duplicated');
      }
      const localProgramById = new Map(localPrograms.map(row => [row.recordId, row]));
      const localNationalityById = new Map(
        localNationalities.filter(row => row.recordId).map(row => [row.recordId, row])
      );
      const localNationalityByEnglish = new Map(
        localNationalities.map(row => [normalize(row.english), row])
      );
      // Start with the published release, not the old fixed-length bundled arrays.
      // Removed entries disappear from new lookup options, but stored cases are never changed.
      const newPrograms = programs.map(remote =>
        compatibleProgram(remote, localProgramById.get(remote.recordId))
      );
      const newNationalities = nationalities.map(remote =>
        compatibleNationality(remote,
          localNationalityById.get(remote.recordId) ||
          localNationalityByEnglish.get(normalize(remote.english)))
      );
      lastVersion = meta.version;
      return {
        status: 'updated', version: meta.version,
        programs: newPrograms, nationalities: newNationalities,
        counts: { programs: newPrograms.length, nationalities: newNationalities.length }
      };
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('Hub request timed out; existing references preserved');
      }
      if (error instanceof TypeError) {
        throw new Error('Cannot reach Hub (connection or browser permission); references preserved');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  window.BUICReferenceHub = Object.freeze({ update, baseUrl: BASE });
})();
