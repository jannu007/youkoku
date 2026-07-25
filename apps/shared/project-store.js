/* ============================================================
   Youkoku — shared cross-app project store (IndexedDB)
   All 5 apps live under the same origin, so this lets Lumen/Flux/
   Echo/Quill/Mesh hand off their output to the Studio page without
   any server: text/model go in as JSON, image/video/audio as Blobs.
   ============================================================ */
window.YoukokuProject = (() => {
  const DB_NAME = 'youkoku_studio';
  const STORE = 'slots';
  const KINDS = ['text', 'image', 'model', 'video', 'audio'];

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveSlot(kind, data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ ...data, kind, savedAt: Date.now() }, kind);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getSlot(kind) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(kind);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAllSlots() {
    const out = {};
    for (const k of KINDS) out[k] = await getSlot(k);
    return out;
  }

  async function clearSlot(kind) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(kind);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  return { KINDS, saveSlot, getSlot, getAllSlots, clearSlot };
})();
