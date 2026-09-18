(() => {
  'use strict';

  const DB_NAME = 'bu_visa_workspace_db';
  const DB_VERSION = 1;
  const STATE_STORE = 'state';
  const TEMPLATE_STORE = 'templates';

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE);
        if (!db.objectStoreNames.contains(TEMPLATE_STORE)) db.createObjectStore(TEMPLATE_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB could not be opened'));
    });
  }

  async function withStore(storeName, mode, callback) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let result;
      try { result = callback(store); } catch (err) { reject(err); return; }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction was aborted'));
    }).finally(() => db.close());
  }

  function requestResult(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
    });
  }

  async function getState(key) {
    const db = await openDb();
    try {
      const tx = db.transaction(STATE_STORE, 'readonly');
      const result = await requestResult(tx.objectStore(STATE_STORE).get(key));
      return result;
    } finally { db.close(); }
  }

  async function setState(key, value) {
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STATE_STORE, 'readwrite');
        tx.objectStore(STATE_STORE).put(value, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }

  async function putTemplate(key, file) {
    const buffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
    const record = {
      name: file?.name || `${key}.docx`,
      type: file?.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: buffer.byteLength,
      updatedAt: new Date().toISOString(),
      buffer,
    };
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(TEMPLATE_STORE, 'readwrite');
        tx.objectStore(TEMPLATE_STORE).put(record, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
    return { ...record, buffer: undefined };
  }

  async function getTemplate(key) {
    const db = await openDb();
    try {
      const tx = db.transaction(TEMPLATE_STORE, 'readonly');
      return await requestResult(tx.objectStore(TEMPLATE_STORE).get(key));
    } finally { db.close(); }
  }

  async function deleteTemplate(key) {
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(TEMPLATE_STORE, 'readwrite');
        tx.objectStore(TEMPLATE_STORE).delete(key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }

  async function listTemplates() {
    const keys = ['letter16', 'letter76', 'studentList'];
    const result = {};
    for (const key of keys) {
      const record = await getTemplate(key);
      result[key] = record ? { name: record.name, size: record.size, updatedAt: record.updatedAt } : null;
    }
    return result;
  }

  async function exportTemplatesBase64() {
    const keys = ['letter16', 'letter76', 'studentList'];
    const out = {};
    for (const key of keys) {
      const record = await getTemplate(key);
      if (!record?.buffer) continue;
      const bytes = new Uint8Array(record.buffer);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      out[key] = {
        name: record.name,
        type: record.type,
        updatedAt: record.updatedAt,
        data: btoa(binary),
      };
    }
    return out;
  }

  async function importTemplatesBase64(payload = {}) {
    for (const [key, item] of Object.entries(payload)) {
      if (!item?.data) continue;
      const binary = atob(item.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], item.name || `${key}.docx`, { type: item.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      await putTemplate(key, file);
    }
  }

  window.VisaDB = {
    getState, setState,
    putTemplate, getTemplate, deleteTemplate, listTemplates,
    exportTemplatesBase64, importTemplatesBase64,
  };
})();
