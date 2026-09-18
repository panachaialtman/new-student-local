(() => {
  'use strict';

  const PARTS = {
    letter16: [
      'templates-data/letter16_part1.txt',
      'templates-data/letter16_part2.txt',
      'templates-data/letter16_part3.txt',
      'templates-data/letter16_part4.txt',
    ],
    letter76: [
      'templates-data/letter76_part1.txt',
      'templates-data/letter76_part2.txt',
      'templates-data/letter76_part3.txt',
      'templates-data/letter76_part4.txt',
    ],
    studentList: [
      'templates-data/studentlist_part1.txt',
      'templates-data/studentlist_part2.txt',
      'templates-data/studentlist_part3.txt',
    ],
  };

  const cache = new Map();
  const enc = new TextEncoder();

  async function decodeBundle(base64) {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const entries = JSON.parse(await new Response(stream).text());
    const files = new Map();
    Object.entries(entries).forEach(([name, text]) => {
      files.set(name, { name, data: enc.encode(text) });
    });
    return await ZipLite.writeZip(files);
  }

  async function getTemplate(key) {
    if (cache.has(key)) return cache.get(key).slice().buffer;
    const paths = PARTS[key];
    if (!paths) throw new Error('Unknown built-in template: ' + key);
    const responses = await Promise.all(paths.map((path) => fetch(path, { cache: 'no-store' })));
    const failed = responses.findIndex((response) => !response.ok);
    if (failed !== -1) throw new Error('Built-in template data could not be loaded: ' + paths[failed]);
    const base64 = (await Promise.all(responses.map((response) => response.text()))).join('').trim();
    const zipBytes = await decodeBundle(base64);
    cache.set(key, zipBytes);
    return zipBytes.slice().buffer;
  }

  window.BuiltinTemplates = { getTemplate };
})();
