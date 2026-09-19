(() => {
  'use strict';

  const enc = new TextEncoder();
  const dec = new TextDecoder('utf-8');
  const THAI_MONTHS = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const ENGLISH_MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DEFAULT_NAME = 'ผู้ช่วยศาสตราจารย์ ดร. สมยศ วัฒนากมลชัย';
  const DEFAULT_ROLE = 'รองอธิการบดีสายนานาชาติ ปฏิบัติหน้าที่แทน';
  const SIGNATORIES = {
    somyot: { name: DEFAULT_NAME, role: DEFAULT_ROLE },
    duangthida: { name: 'ผู้ช่วยศาสตราจารย์ ดร. ดวงธิดา นันทาภิรัตน์', role: 'ผู้ช่วยอธิการบดีสายนานาชาติ ปฏิบัติหน้าที่แทน' },
  };
  const ATTACHMENT_DEFAULT = 'สำเนาหลักฐานการศึกษาที่ใช้ในการสมัครเรียน';
  const ATTACHMENT_TRANSCRIPT = 'สำเนาหลักฐานการศึกษา (Transcript)';

  function text(v) { return v == null ? '' : String(v).trim(); }
  function escapeXml(v) { return String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;'); }
  function decodeXml(v) {
    return String(v).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
  }
  function parseIso(raw) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(raw));
    if (!m) throw new Error(`Invalid or missing date: ${raw || 'blank'}`);
    return { y: +m[1], m: +m[2], d: +m[3] };
  }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
  function addMonths(raw, count) {
    const d = parseIso(raw);
    const idx = d.m - 1 + count;
    const y = d.y + Math.floor(idx / 12);
    const m = (idx % 12 + 12) % 12 + 1;
    return { y, m, d: Math.min(d.d, daysInMonth(y, m)) };
  }
  function thaiDateObj(d) { return `${d.d}  ${THAI_MONTHS[d.m]}  ${d.y + 543}`; }
  function thaiDate(raw) { return thaiDateObj(parseIso(raw)); }
  function requestUntil(st) {
    const rule = text(st.requestRuleOverride) || 'six_months';
    let requested;
    if (rule === 'six_months') requested = addMonths(st.currentStayUntil, 6);
    else if (rule === 'one_year') requested = addMonths(st.currentStayUntil, 12);
    else if (rule === 'manual') requested = parseIso(st.manualRequestUntil);
    else throw new Error(`Unknown request rule: ${rule}`);

    // Recalculate within the document engine: do not trust a potentially stale
    // requestUntil supplied by the UI, or the dismissed UI warning.
    const expiry = parseIso(st.passportExpiry);
    const passportBeforeRequest = expiry.y < requested.y ||
      (expiry.y === requested.y && (expiry.m < requested.m ||
      (expiry.m === requested.m && expiry.d < requested.d)));
    return passportBeforeRequest ? expiry : requested;
  }
  function formattedTitle(raw) {
    const t = text(raw).toUpperCase();
    if (t === 'MR' || t === 'MR.') return 'MR.';
    if (t === 'MS' || t === 'MS.') return 'MS.';
    if (t === 'MRS' || t === 'MRS.') return 'MRS.';
    if (t === 'MISS') return 'MISS';
    return t;
  }
  function commaInt(n) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  function replacements(st) {
    const credits = Number.parseInt(text(st.registeredCredits), 10);
    if (!Number.isFinite(credits)) throw new Error('Invalid registered credits');
    return [
      text(st.documentNo),
      `${formattedTitle(st.title)} ${text(st.fullName).toUpperCase()}`.trim(),
      text(st.nationalityThai),
      text(st.studentId),
      text(st.passportNo),
      thaiDate(st.passportExpiry),
      thaiDate(st.currentStayUntil),
      text(st.facultyThai),
      text(st.programThai),
      text(st.totalCredits),
      String(credits),
      commaInt(credits * 14),
      thaiDateObj(requestUntil(st)),
    ];
  }

  const PARA_RE = /<w:p\b[\s\S]*?<\/w:p>/g;
  const RUN_RE = /<w:r\b[\s\S]*?<\/w:r>/g;
  const TEXT_RE = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  const HIGHLIGHT_RE = /<w:highlight\b[^>]*\/>/g;
  const BODY_RE = /<w:body>([\s\S]*)<\/w:body>/;
  const SECT_RE = /<w:sectPr\b[\s\S]*?<\/w:sectPr>\s*$/;
  const TABLE_RE = /<w:tbl\b[\s\S]*?<\/w:tbl>/g;
  const ROW_RE = /<w:tr\b[\s\S]*?<\/w:tr>/g;
  const CELL_RE = /<w:tc\b[\s\S]*?<\/w:tc>/g;

  function getTexts(xml) {
    const out = [];
    const re = new RegExp(TEXT_RE.source, 'g');
    let m;
    while ((m = re.exec(xml))) out.push(decodeXml(m[1]));
    return out;
  }
  function allText(xml) { return getTexts(xml).join(''); }
  function oneText(xml) { return getTexts(xml)[0] || ''; }
  function replaceTextNodes(xml, values) {
    let index = 0;
    return xml.replace(new RegExp(TEXT_RE.source, 'g'), (whole, old) => {
      const value = index < values.length ? values[index++] : decodeXml(old);
      const gt = whole.indexOf('>');
      return whole.slice(0, gt + 1) + escapeXml(value) + '</w:t>';
    });
  }
  function replaceRun(run, value, first) {
    run = run.replace(HIGHLIGHT_RE, '');
    const matches = [...run.matchAll(new RegExp(TEXT_RE.source, 'g'))];
    if (!matches.length) return run;
    const vals = matches.map((_, i) => (first && i === 0 ? value : ''));
    return replaceTextNodes(run, vals);
  }

  function fillHighlights(xml, reps) {
    let repIndex = 0;
    xml = xml.replace(new RegExp(PARA_RE.source, 'g'), (p) => {
      const runs = [...p.matchAll(new RegExp(RUN_RE.source, 'g'))].map(m => m[0]);
      if (!runs.length) return p;
      for (let i = 0; i < runs.length;) {
        const highlighted = runs[i].includes('<w:highlight') && oneText(runs[i]) !== '';
        if (!highlighted) { i++; continue; }
        const start = i++;
        while (i < runs.length && runs[i].includes('<w:highlight') && oneText(runs[i]) !== '') i++;
        if (repIndex >= reps.length) break;
        runs[start] = replaceRun(runs[start], reps[repIndex], true);
        for (let j = start + 1; j < i; j++) runs[j] = replaceRun(runs[j], '', false);
        repIndex++;
      }
      let ri = 0;
      return p.replace(new RegExp(RUN_RE.source, 'g'), () => runs[ri++]);
    });
    if (repIndex < reps.length) throw new Error(`Template has ${repIndex} highlighted groups, but ${reps.length} replacements are required`);
    return xml;
  }

  function replacePlain(xml, needle, replacement) {
    let replaced = false;
    const out = xml.replace(new RegExp(PARA_RE.source, 'g'), (p) => {
      if (replaced) return p;
      const texts = getTexts(p);
      const full = texts.join('');
      const start = full.indexOf(needle);
      if (start < 0) return p;
      const end = start + needle.length;
      let pos = 0;
      let wrote = false;
      const vals = texts.map((cur) => {
        const ns = pos, ne = pos + cur.length; pos = ne;
        if (ne <= start || ns >= end) return cur;
        const ls = Math.max(0, start - ns), le = Math.min(cur.length, end - ns);
        let v = cur.slice(0, ls);
        if (!wrote) { v += replacement; wrote = true; }
        v += cur.slice(le);
        return v;
      });
      replaced = true;
      return replaceTextNodes(p, vals);
    });
    return { xml: out, replaced };
  }

  function replaceIssueDate(xml, desired) {
    let done = false;
    const out = xml.replace(new RegExp(PARA_RE.source, 'g'), (p) => {
      if (done) return p;
      const full = allText(p);
      if (!THAI_MONTHS.slice(1).some(month => full.includes(month))) return p;
      const texts = getTexts(p);
      if (!texts.length) return p;
      done = true;
      return replaceTextNodes(p, texts.map((_, i) => i === 0 ? desired : ''));
    });
    if (!done) throw new Error('Could not locate issue-date paragraph in template');
    return out;
  }


  function cohortStudyYear(st) {
    const override = text(st.studyYearOverride);
    if (override !== '') {
      const n = Number(override);
      if (!Number.isInteger(n) || n < 1 || n > 20) throw new Error('Study year override must be between 1 and 20');
      return n;
    }
    const id = text(st.studentId);
    const cohort = Number(st.academicCohortYear);
    if (!/^[0-9]{3}/.test(id) || st.academicCohortYear == null ||
        !Number.isInteger(cohort) || cohort < 0 || cohort > 99) {
      throw new Error('Cannot infer study year. Check the student ID or enter a Study year override.');
    }
    return ((cohort - Number(id.slice(1, 3)) + 100) % 100) + 1;
  }
  function graduationAcademicYear(st) {
    const override = text(st.graduationYearOverride);
    if (override !== '') {
      const n = Number(override);
      if (!Number.isInteger(n) || n < 2500 || n > 2700) {
        throw new Error('Graduation year override must be a B.E. year, e.g. 2573');
      }
      return n;
    }
    // Letter 76 has separate graduate-specific rules: don't apply undergraduate
    // five-year cohort graduation calculations to a graduate case.
    if (st.programType === 'graduate') return null;
    const id = text(st.studentId);
    if (!/^[0-9]{3}/.test(id)) {
      throw new Error('Cannot infer graduation year. Check the student ID or enter a Graduation year override.');
    }
    return 2504 + Number(id.slice(1, 3));
  }
  function applyAcademicWording(xml, st) {
    const current = st.currentStudent === true ||
      (st.currentStudent !== false && st.attachment43 === 'transcript');
    const year = current ? cohortStudyYear(st) : 1;
    const enrollment = current ? 'ศึกษาอยู่ชั้นปีที่ ' + year : 'เริ่มศึกษาชั้นปีที่ 1';
    let replaced = replacePlain(xml, 'ศึกษาอยู่ชั้นปีที่ 1', enrollment);
    if (!replaced.replaced) throw new Error('Could not locate the enrollment-year sentence in the Word template');
    xml = replaced.xml;
    const graduation = graduationAcademicYear(st);
    if (graduation !== null) {
      replaced = replacePlain(xml, 'สำเร็จการศึกษาในปีการศึกษา 2572',
        'สำเร็จการศึกษาในปีการศึกษา ' + graduation);
      if (!replaced.replaced) throw new Error('Could not locate the graduation-year sentence in the Word template');
      xml = replaced.xml;
    }
    return xml;
  }

  function resolveSignatory(raw) {
    if (SIGNATORIES[raw]) return SIGNATORIES[raw];
    if (String(raw || '').includes('ดวงธิดา')) return SIGNATORIES.duangthida;
    return SIGNATORIES.somyot;
  }

  async function bufferToFiles(buffer) { return ZipLite.readZip(buffer); }
  async function filesToBlob(files) { return new Blob([await ZipLite.writeZip(files)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }); }
  function cloneFiles(files) {
    const out = new Map();
    for (const [name, item] of files.entries()) out.set(name, { name, data: item.data.slice() });
    return out;
  }

  async function renderLetter(templateBuffer, st, issueDate, signatory) {
    const files = await bufferToFiles(templateBuffer);
    const doc = files.get('word/document.xml');
    if (!doc) throw new Error('Invalid Word template: word/document.xml is missing');
    let xml = dec.decode(doc.data);
    xml = fillHighlights(xml, replacements(st));
    xml = applyAcademicWording(xml, st);
    xml = replaceIssueDate(xml, thaiDate(issueDate));
    const profile = resolveSignatory(signatory);
    if (profile.name !== DEFAULT_NAME) {
      let result = replacePlain(xml, DEFAULT_NAME, profile.name); xml = result.xml;
      if (!result.replaced) throw new Error('Could not locate the default signatory name in template');
    }
    if (profile.role !== DEFAULT_ROLE) {
      let result = replacePlain(xml, DEFAULT_ROLE, profile.role); xml = result.xml;
      if (!result.replaced) throw new Error('Could not locate the default signatory role in template');
    }
    if (st.programType !== 'graduate' && st.attachment43 === 'transcript') {
      let result = replacePlain(xml, ATTACHMENT_DEFAULT, ATTACHMENT_TRANSCRIPT); xml = result.xml;
      if (!result.replaced) throw new Error('Could not locate attachment 4.3 text');
    }
    files.set('word/document.xml', { name: 'word/document.xml', data: enc.encode(xml) });
    return files;
  }

  function bodyContent(xml) {
    const m = BODY_RE.exec(xml);
    if (!m) throw new Error('DOCX body not found');
    return m[1].replace(SECT_RE, '');
  }
  function pageBreakBeforeFirstParagraph(content) {
    const match = /<w:p\b[^>]*>/.exec(content);
    if (!match) return content;
    const start = match.index;
    const openEnd = start + match[0].length;
    const close = content.indexOf('</w:p>', openEnd);
    if (close < 0) return content;
    const para = content.slice(start, close);
    if (para.includes('<w:pageBreakBefore')) return content;
    const pprEnd = para.indexOf('</w:pPr>');
    if (pprEnd >= 0) {
      const insert = start + pprEnd;
      return content.slice(0, insert) + '<w:pageBreakBefore/>' + content.slice(insert);
    }
    return content.slice(0, openEnd) + '<w:pPr><w:pageBreakBefore/></w:pPr>' + content.slice(openEnd);
  }

  async function combineRendered(rendered) {
    if (!rendered.length) throw new Error('No letters to combine');
    const base = cloneFiles(rendered[0]);
    let xml = dec.decode(base.get('word/document.xml').data);
    let at = xml.lastIndexOf('<w:sectPr');
    if (at < 0) at = xml.lastIndexOf('</w:body>');
    if (at < 0) throw new Error('Base DOCX body not found');
    let add = '';
    for (const files of rendered.slice(1)) {
      const other = dec.decode(files.get('word/document.xml').data);
      add += pageBreakBeforeFirstParagraph(bodyContent(other));
    }
    xml = xml.slice(0, at) + add + xml.slice(at);
    base.set('word/document.xml', { name: 'word/document.xml', data: enc.encode(xml) });
    return filesToBlob(base);
  }

  function replaceCells(row, values) {
    const cells = [...row.matchAll(new RegExp(CELL_RE.source, 'g'))].map(m => m[0]);
    for (let i = 0; i < cells.length && i < values.length; i++) {
      const texts = getTexts(cells[i]);
      cells[i] = replaceTextNodes(cells[i], texts.map((_, j) => j === 0 ? String(values[i] ?? '') : ''));
    }
    let ci = 0;
    return row.replace(new RegExp(CELL_RE.source, 'g'), () => cells[ci++]);
  }

  function listCells(row) {
    return [...row.matchAll(new RegExp(CELL_RE.source, 'g'))].map(m => m[0]);
  }
  function replaceListRowCells(row, cells) {
    const hits = [...row.matchAll(new RegExp(CELL_RE.source, 'g'))];
    if (!hits.length) throw new Error('Student-list row has no table cells');
    const first = hits[0], last = hits[hits.length - 1];
    return row.slice(0, first.index) + cells.join('') + row.slice(last.index + last[0].length);
  }
  function listCellWidth(cell, width, value) {
    if (!/<w:tcW\b[^>]*\/>/.test(cell)) throw new Error('Student-list template cell width is missing');
    let updated = cell.replace(/<w:tcW\b[^>]*\/>/, '<w:tcW w:w="' + Math.max(1, Math.round(width)) + '" w:type="dxa"/>');
    if (value !== undefined) {
      const values = getTexts(updated);
      if (!values.length) throw new Error('Student-list template header has no text node');
      updated = replaceTextNodes(updated, values.map((_, i) => i ? '' : String(value)));
    }
    return updated;
  }
  function listTableGrid(table, count) {
    const match = /<w:tblGrid\b[^>]*>([\s\S]*?)<\/w:tblGrid>/.exec(table);
    if (!match) throw new Error('Student-list table grid not found');
    const widths = [...match[1].matchAll(/<w:gridCol\b[^>]*w:w="(\d+)"[^>]*\/>/g)].map(m => Number(m[1]));
    if (widths.length < 6) throw new Error('Student-list template must include four student fields and two blank columns');
    const fixed = widths.slice(0, 4);
    const space = widths.slice(4).reduce((sum, width) => sum + width, 0);
    const extras = Array.from({length: count}, (_, i) => Math.floor(space / count) + (i < space % count ? 1 : 0));
    const grid = '<w:tblGrid>' + [...fixed, ...extras].map(w => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>';
    return {table: table.replace(match[0], grid), fixed, extras};
  }
  function titleCase(raw) {
    const x = text(raw).toLowerCase();
    return x ? x[0].toUpperCase() + x.slice(1) : '';
  }
  async function generateStudentList(templateBuffer, students, issueDate, columnNames = ['หน.บน.', 'ผศ.ดร.ธรรญธร', 'อ.เนาวกานต์']) {
    const labels = Array.isArray(columnNames) ? columnNames.map(name => text(name)) : [];
    if (labels.length > 6 || labels.some(name => !name)) throw new Error('Student list requires up to six nonempty column names');
    const files = await bufferToFiles(templateBuffer);
    const part = files.get('word/document.xml');
    if (!part) throw new Error('Invalid student-list template: document.xml is missing');
    let xml = dec.decode(part.data);
    const found = new RegExp(TABLE_RE.source).exec(xml);
    if (!found) throw new Error('Student-list table not found');
    const originalTable = found[0];
    const oldRows = [...originalTable.matchAll(new RegExp(ROW_RE.source, 'g'))];
    if (oldRows.length < 2) throw new Error('Student-list template needs header and data row');
    const headerCells = listCells(oldRows[0][0]);
    const dataCells = listCells(oldRows[1][0]);
    if (headerCells.length < 3 || dataCells.length < 6) throw new Error('Student-list template requires four student cells and two blank columns');
    const {table, fixed, extras} = listTableGrid(originalTable, labels.length);
    const rows = [...table.matchAll(new RegExp(ROW_RE.source, 'g'))];
    const d = parseIso(issueDate);
    const dateEN = `${ENGLISH_MONTHS[d.m]} ${d.d}, ${d.y}`;
    const newHeader = replaceListRowCells(rows[0][0], [
      listCellWidth(headerCells[0], fixed.reduce((sum, w) => sum + w, 0), dateEN),
      ...labels.map((name, i) => listCellWidth(headerCells[1], extras[i], name)),
    ]);
    const proto = rows[1][0];
    const body = students.map(student => {
      const filled = replaceCells(proto, [text(student.documentNo), text(student.studentId), titleCase(student.title), text(student.fullName)]);
      const leftCells = listCells(filled).slice(0, 4);
      const emptyCells = extras.map(width => listCellWidth(dataCells[4], width));
      return replaceListRowCells(filled, [...leftCells, ...emptyCells]);
    }).join('');
    const last = rows[rows.length - 1];
    const newTable = table.slice(0, rows[0].index) + newHeader + body + table.slice(last.index + last[0].length);
    xml = xml.slice(0, found.index) + newTable + xml.slice(found.index + originalTable.length);
    files.set('word/document.xml', {name: 'word/document.xml', data: enc.encode(xml)});
    return filesToBlob(files);
  }

  async function requireTemplate(key) {
    const record = await VisaDB.getTemplate(key);
    if (record?.buffer) return record.buffer;
    if (!window.BuiltinTemplates?.getTemplate) throw new Error('Built-in Word template loader is unavailable.');
    return await window.BuiltinTemplates.getTemplate(key);
  }


  function specialReplacements(st, issueDate, category) {
    const credits = Number.parseInt(text(st.registeredCredits), 10);
    if (!Number.isFinite(credits) || credits < 0) throw new Error('Registered credits are missing or invalid');
    const shared = [
      text(st.documentNo),
      (formattedTitle(st.title) + ' ' + text(st.fullName).toUpperCase()).trim(),
      text(st.nationalityThai),
      text(st.studentId),
      text(st.passportNo),
      thaiDate(st.passportExpiry),
      thaiDate(st.currentStayUntil),
    ];
    const effectiveDate = thaiDateObj(requestUntil(st));
    if (category === 'exchange') {
      const term = Number(st.exchangeTerm);
      const academicYear = Number(st.exchangeAcademicYear);
      const duration = Number(st.exchangeDurationSemesters);
      if (!text(st.exchangeUniversity) || !text(st.exchangeCountryThai) ||
          !Number.isInteger(term) || term < 1 || term > 3 ||
          !Number.isInteger(academicYear) || academicYear < 2500 ||
          !Number.isInteger(duration) || duration < 1) {
        throw new Error('Complete the exchange university, country, semester, academic year, and duration.');
      }
      // The supplied exchange template does not have a graduation-year field:
      // retain its semester-specific academic wording instead of inventing one.
      return [...shared, text(st.facultyThai), text(st.programThai),
        String(credits), commaInt(credits * 14), ' ' + text(st.exchangeUniversity),
        text(st.exchangeCountryThai), String(term), String(academicYear),
        String(duration), effectiveDate];
    }
    if (category === 'non_o') {
      const duration = Number(st.programDurationYears || (st.programType === 'graduate' ? 2 : 4));
      const graduation = graduationAcademicYear(st);
      if (!Number.isInteger(duration) || duration < 1 || duration > 10 || graduation === null) {
        throw new Error('Provide program duration and the expected graduation year (B.E.) for this Non-O case.');
      }
      const current = st.currentStudent === true ||
        (st.currentStudent !== false && st.attachment43 === 'transcript');
      const studyYear = current ? cohortStudyYear(st) : 1;
      const degree = st.programType === 'graduate' ? 'โท' : 'ตรี';
      return [text(st.documentNo), thaiDate(issueDate),
        ...shared.slice(1), degree, text(st.facultyThai), text(st.programThai),
        String(duration), text(st.totalCredits), String(graduation),
        String(studyYear), String(credits), commaInt(credits * 14), effectiveDate];
    }
    throw new Error('Unknown special letter category: ' + category);
  }

  function replaceFirstMatching(xml, needles, replacement, description) {
    for (const needle of needles) {
      const result = replacePlain(xml, needle, replacement);
      if (result.replaced) return result.xml;
    }
    throw new Error('Cannot locate ' + description + ' in the supplied Word template.');
  }

  async function renderSpecialLetter(templateBuffer, st, issueDate, signatory, category) {
    const files = await bufferToFiles(templateBuffer);
    const doc = files.get('word/document.xml');
    if (!doc) throw new Error('Supplied Word template is missing word/document.xml');
    let xml = dec.decode(doc.data);

    // Modify non-highlighted wording before populating highlighted data groups.
    if (category === 'non_o') {
      const visaPurpose = text(st.nonOVisaPurpose) || 'ติดตามธุรกิจ';
      xml = replaceFirstMatching(xml, ['ติดตามธุรกิจ'], visaPurpose, 'Non-O visa purpose');
      if (st.currentStudent === true || st.attachment43 === 'transcript') {
        xml = replaceFirstMatching(xml, ['เริ่มศึกษาชั้นปีที่ '],
          'ศึกษาอยู่ชั้นปีที่ ', 'current-student enrollment wording');
      }
      if (st.currentStudent === true || st.attachment43 === 'transcript') {
        xml = replaceFirstMatching(xml,
          ['สำเนาหลักฐานการศึกษาที่ใช้สมัครเรียน',
           'สำเนาหลักฐานการศึกษาที่ใช้ในการสมัครเรียน'],
          ATTACHMENT_TRANSCRIPT, 'attachment 4.3');
      }
    } else if (category === 'exchange') {
      if (st.programType === 'graduate') {
        xml = replaceFirstMatching(xml, ['หลักสูตรปริญญาตรี'],
          'หลักสูตรปริญญาโท', 'exchange degree level');
      }
      if (st.currentStudent === false || st.attachment43 === 'application') {
        xml = replaceFirstMatching(xml, [ATTACHMENT_TRANSCRIPT],
          'สำเนาหลักฐานการศึกษาที่ใช้สมัครเรียน', 'attachment 4.3');
      }
    }

    const expectedCount = category === 'exchange' ? 17 : 18;
    const values = specialReplacements(st, issueDate, category);
    if (values.length !== expectedCount) throw new Error('Special template field count mismatch');
    xml = fillHighlights(xml, values);
    // The Exchange template's top document date is plain text. Non-O's date
    // is one of its highlighted fields, so must not be overwritten again.
    if (category === 'exchange') xml = replaceIssueDate(xml, thaiDate(issueDate));
    const profile = resolveSignatory(signatory);
    if (profile.name !== DEFAULT_NAME) {
      xml = replaceFirstMatching(xml,
        [DEFAULT_NAME, 'ผู้ช่วยศาสตราจารย์ ดร.สมยศ วัฒนากมลชัย'],
        profile.name, 'signatory name');
    }
    if (profile.role !== DEFAULT_ROLE) {
      xml = replaceFirstMatching(xml, [DEFAULT_ROLE], profile.role, 'signatory role');
    }
    files.set('word/document.xml', {name:'word/document.xml',data:enc.encode(xml)});
    return files;
  }

  function letterTemplateKey(st) {
    if (st.caseCategory === 'exchange') return 'exchange';
    if (st.caseCategory === 'non_o') return 'non_o';
    return st.programType === 'graduate' ? 'letter76' : 'letter16';
  }

  async function renderCaseLetter(st, issueDate, signatory) {
    const key = letterTemplateKey(st);
    const tpl = await requireTemplate(key);
    return key === 'exchange' || key === 'non_o'
      ? renderSpecialLetter(tpl, st, issueDate, signatory, key)
      : renderLetter(tpl, st, issueDate, signatory);
  }

  async function generateIndividual(st, issueDate, signatory) {
    return filesToBlob(await renderCaseLetter(st, issueDate, signatory));
  }

  async function generateBatch(students, issueDate, signatory) {
    const rendered = [];
    for (const st of students) rendered.push(await renderCaseLetter(st, issueDate, signatory));
    return combineRendered(rendered);
  }

  async function generateList(students, issueDate, columnNames) {
    const tpl = await requireTemplate('studentList');
    return generateStudentList(tpl, students, issueDate, columnNames);
  }

  window.BrowserDocx = { generateIndividual, generateBatch, generateList, formattedTitle };
})();
