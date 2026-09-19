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
  function titleCase(raw) {
    const x = text(raw).toLowerCase();
    return x ? x[0].toUpperCase() + x.slice(1) : '';
  }
  async function generateStudentList(templateBuffer, students, issueDate) {
    const files = await bufferToFiles(templateBuffer);
    let xml = dec.decode(files.get('word/document.xml').data);
    const tableMatch = new RegExp(TABLE_RE.source).exec(xml);
    if (!tableMatch) throw new Error('Student-list table not found');
    const table = tableMatch[0];
    const rows = [...table.matchAll(new RegExp(ROW_RE.source, 'g'))];
    if (rows.length < 2) throw new Error('Student-list template needs header and data row');
    const d = parseIso(issueDate);
    const dateEN = `${ENGLISH_MONTHS[d.m]} ${d.d}, ${d.y}`;
    const header = replaceCells(rows[0][0], [dateEN, 'หน.บน.', 'ลส.นช.']);
    const proto = rows[1][0];
    const body = students.map(st => replaceCells(proto, [text(st.documentNo), text(st.studentId), titleCase(st.title), text(st.fullName), '', ''])).join('');
    const firstStart = rows[0].index;
    const last = rows[rows.length - 1];
    const lastEnd = last.index + last[0].length;
    const newTable = table.slice(0, firstStart) + header + body + table.slice(lastEnd);
    xml = xml.slice(0, tableMatch.index) + newTable + xml.slice(tableMatch.index + table.length);
    files.set('word/document.xml', { name: 'word/document.xml', data: enc.encode(xml) });
    return filesToBlob(files);
  }

  async function requireTemplate(key) {
    const record = await VisaDB.getTemplate(key);
    if (record?.buffer) return record.buffer;
    if (!window.BuiltinTemplates?.getTemplate) throw new Error('Built-in Word template loader is unavailable.');
    return await window.BuiltinTemplates.getTemplate(key);
  }

  async function generateIndividual(st, issueDate, signatory) {
    const key = st.programType === 'graduate' ? 'letter76' : 'letter16';
    const tpl = await requireTemplate(key);
    return filesToBlob(await renderLetter(tpl, st, issueDate, signatory));
  }

  async function generateBatch(students, issueDate, signatory) {
    const rendered = [];
    for (const st of students) {
      const key = st.programType === 'graduate' ? 'letter76' : 'letter16';
      const tpl = await requireTemplate(key);
      rendered.push(await renderLetter(tpl, st, issueDate, signatory));
    }
    return combineRendered(rendered);
  }

  async function generateList(students, issueDate) {
    const tpl = await requireTemplate('studentList');
    return generateStudentList(tpl, students, issueDate);
  }

  window.BrowserDocx = { generateIndividual, generateBatch, generateList, formattedTitle };
})();
