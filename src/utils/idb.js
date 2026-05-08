const DB_NAME    = 'fulfld_scout';
const DB_VERSION = 1;
const STORE      = 'csv_data';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

export async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

export async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = e => resolve(e.target.result ?? null);
    req.onerror   = e => reject(e.target.error);
  });
}

export async function idbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx     = db.transaction(STORE, 'readonly');
    const store  = tx.objectStore(STORE);
    const keys   = [];
    const values = [];
    const kReq   = store.getAllKeys();
    const vReq   = store.getAll();
    kReq.onsuccess = e => keys.push(...e.target.result);
    vReq.onsuccess = e => values.push(...e.target.result);
    tx.oncomplete = () => {
      const result = {};
      keys.forEach((k, i) => { result[k] = values[i]; });
      resolve(result);
    };
    tx.onerror = e => reject(e.target.error);
  });
}

export async function idbClear() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}
