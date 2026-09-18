(() => {
  'use strict';

  const SIG_LOCAL = 0x04034b50;
  const SIG_CENTRAL = 0x02014b50;
  const SIG_EOCD = 0x06054b50;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8');

  function u16(view, off) { return view.getUint16(off, true); }
  function u32(view, off) { return view.getUint32(off, true); }
  function w16(view, off, value) { view.setUint16(off, value, true); }
  function w32(view, off, value) { view.setUint32(off, value >>> 0, true); }

  function concat(parts) {
    const len = parts.reduce((n, part) => n + part.length, 0);
    const out = new Uint8Array(len);
    let at = 0;
    for (const part of parts) { out.set(part, at); at += part.length; }
    return out;
  }

  async function streamTransform(bytes, mode) {
    const Ctor = mode === 'compress' ? CompressionStream : DecompressionStream;
    const stream = new Blob([bytes]).stream().pipeThrough(new Ctor('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function findEocd(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const min = Math.max(0, bytes.length - 0xffff - 22);
    for (let i = bytes.length - 22; i >= min; i--) {
      if (u32(view, i) === SIG_EOCD) return i;
    }
    throw new Error('Invalid DOCX/ZIP: end-of-central-directory record was not found');
  }

  async function readZip(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = findEocd(bytes);
    const count = u16(view, eocd + 10);
    const centralOffset = u32(view, eocd + 16);
    const files = new Map();
    let pos = centralOffset;
    for (let i = 0; i < count; i++) {
      if (u32(view, pos) !== SIG_CENTRAL) throw new Error('Invalid ZIP central directory');
      const method = u16(view, pos + 10);
      const crc = u32(view, pos + 16);
      const compressedSize = u32(view, pos + 20);
      const uncompressedSize = u32(view, pos + 24);
      const nameLen = u16(view, pos + 28);
      const extraLen = u16(view, pos + 30);
      const commentLen = u16(view, pos + 32);
      const localOffset = u32(view, pos + 42);
      const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
      if (u32(view, localOffset) !== SIG_LOCAL) throw new Error(`Invalid ZIP local header: ${name}`);
      const localNameLen = u16(view, localOffset + 26);
      const localExtraLen = u16(view, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      let data;
      if (method === 0) data = compressed;
      else if (method === 8) data = await streamTransform(compressed, 'decompress');
      else throw new Error(`Unsupported ZIP compression method ${method} in ${name}`);
      if (uncompressedSize !== 0 && data.length !== uncompressedSize) {
        throw new Error(`ZIP size mismatch for ${name}`);
      }
      files.set(name, { name, data, crc, method });
      pos += 46 + nameLen + extraLen + commentLen;
    }
    return files;
  }

  let crcTable;
  function makeCrcTable() {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  }
  function crc32(bytes) {
    if (!crcTable) crcTable = makeCrcTable();
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { dosDate, dosTime };
  }

  async function writeZip(files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const { dosDate, dosTime } = dosDateTime();
    const entries = files instanceof Map ? [...files.values()] : Object.entries(files).map(([name, data]) => ({ name, data }));
    for (const entry of entries) {
      const nameBytes = encoder.encode(entry.name);
      const raw = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
      const method = raw.length ? 8 : 0;
      const compressed = method === 8 ? await streamTransform(raw, 'compress') : raw;
      const crc = crc32(raw);
      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      w32(lv, 0, SIG_LOCAL); w16(lv, 4, 20); w16(lv, 6, 0x0800); w16(lv, 8, method);
      w16(lv, 10, dosTime); w16(lv, 12, dosDate); w32(lv, 14, crc);
      w32(lv, 18, compressed.length); w32(lv, 22, raw.length); w16(lv, 26, nameBytes.length); w16(lv, 28, 0);
      local.set(nameBytes, 30);
      localParts.push(local, compressed);

      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      w32(cv, 0, SIG_CENTRAL); w16(cv, 4, 20); w16(cv, 6, 20); w16(cv, 8, 0x0800); w16(cv, 10, method);
      w16(cv, 12, dosTime); w16(cv, 14, dosDate); w32(cv, 16, crc);
      w32(cv, 20, compressed.length); w32(cv, 24, raw.length); w16(cv, 28, nameBytes.length);
      w16(cv, 30, 0); w16(cv, 32, 0); w16(cv, 34, 0); w16(cv, 36, 0); w32(cv, 38, 0); w32(cv, 42, offset);
      central.set(nameBytes, 46);
      centralParts.push(central);
      offset += local.length + compressed.length;
    }
    const central = concat(centralParts);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    w32(ev, 0, SIG_EOCD); w16(ev, 4, 0); w16(ev, 6, 0); w16(ev, 8, entries.length); w16(ev, 10, entries.length);
    w32(ev, 12, central.length); w32(ev, 16, offset); w16(ev, 20, 0);
    return concat([...localParts, central, eocd]);
  }

  window.ZipLite = { readZip, writeZip };
})();
