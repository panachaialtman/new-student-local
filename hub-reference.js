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

  function checkRows(rows, expected, label, key) {
    if (!Array.isArray(rows) || rows.length !== expected) {
      throw new Error(label + ' record count changed; existing references were kept');
    }
    const ids = rows.map(row => String(row?.[key] ?? ''));
    if (ids.some(id => !id) || new Set(ids).size !== ids.length) {
      throw new Error(label + ' contains missing or duplicate identifiers');
    }
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
        throw new Error('Central Hub dataset versions do not match');
      }
      const programs = programResponse.records;
      const nationalities = nationalityResponse.records;
      checkRows(programs, localPrograms.length, 'Programs', 'recordId');
      checkRows(nationalities, localNationalities.length, 'Nationalities', 'recordId');

      const programById = new Map(programs.map(row => [row.recordId, row]));
      if (localPrograms.some(row => !programById.has(row.recordId))) {
        throw new Error('Program IDs changed; existing local records were kept');
      }
      const nationalityByEnglish = new Map(nationalities.map(row => [normalize(row.english), row]));
      if (localNationalities.some(row => !nationalityByEnglish.has(normalize(row.english)))) {
        throw new Error('Nationality names changed; existing local records were kept');
      }
      const newPrograms = localPrograms.map(local => {
        const remote = programById.get(local.recordId);
        const credit = remote.credits?.['2026'];
        if (credit !== null && credit !== undefined &&
            (!Number.isInteger(credit) || credit < 1 || credit > 600)) {
          throw new Error('Invalid 2026 credits for ' + local.recordId);
        }
        return {
          ...local,
          facultyEnglish: remote.facultyEnglish,
          facultyThai: remote.facultyThai,
          facultyCode: remote.facultyCode,
          programEnglish: remote.programEnglish,
          programThai: remote.programThai,
          additionalNotes: remote.additionalNotes || '',
          credits: { ...local.credits, '2026': credit ?? null },
          creditStatus: remote.creditStatus,
          creditSourceUrl: remote.creditSourceUrl,
          creditSourceStatus: remote.creditSourceStatus,
          aliases: [...new Set([...(local.aliases || []), ...(remote.aliases || [])])]
          // Do not replace "key"/"programType": existing local cases depend on them.
        };
      });
      const newNationalities = localNationalities.map(local => {
        const remote = nationalityByEnglish.get(normalize(local.english));
        return {
          ...local, thai: remote.thai, english: remote.english,
          aliases: [...new Set([...(local.aliases || []), ...(remote.aliases || [])])]
        };
      });
      lastVersion = meta.version;
      return { status: 'updated', version: meta.version, programs: newPrograms, nationalities: newNationalities };
    } finally {
      clearTimeout(timer);
    }
  }
  window.BUICReferenceHub = Object.freeze({ update, baseUrl: BASE });
})();
