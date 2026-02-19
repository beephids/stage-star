/* ── IndexedDB Wrapper ───────────────────────────────────
   Stores musicals, songs (with audio blobs), and scripts.
   ──────────────────────────────────────────────────────── */

const DB_NAME = 'StageStar';
const DB_VERSION = 1;

let db = null;

export function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const database = e.target.result;

      if (!database.objectStoreNames.contains('musicals')) {
        database.createObjectStore('musicals', { keyPath: 'id' });
      }

      if (!database.objectStoreNames.contains('songs')) {
        const songStore = database.createObjectStore('songs', { keyPath: 'id' });
        songStore.createIndex('musicalId', 'musicalId', { unique: false });
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };

    request.onerror = (e) => {
      reject(e.target.error);
    };
  });
}

/* ── Helpers ─────────────────────────────────────────────── */

function tx(storeName, mode = 'readonly') {
  const transaction = db.transaction(storeName, mode);
  return transaction.objectStore(storeName);
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ── Musicals CRUD ───────────────────────────────────────── */

export async function addMusical(name, scriptBlob = null) {
  const musical = {
    id: generateId(),
    name,
    scriptPdf: scriptBlob,
    createdAt: Date.now(),
  };
  await reqToPromise(tx('musicals', 'readwrite').put(musical));
  return musical;
}

export async function getMusicals() {
  return reqToPromise(tx('musicals').getAll());
}

export async function getMusical(id) {
  return reqToPromise(tx('musicals').get(id));
}

export async function updateMusical(musical) {
  return reqToPromise(tx('musicals', 'readwrite').put(musical));
}

export async function deleteMusical(id) {
  // Delete all songs for this musical first
  const songs = await getSongsByMusical(id);
  const songStore = tx('songs', 'readwrite');
  for (const song of songs) {
    songStore.delete(song.id);
  }
  // Then delete the musical
  return reqToPromise(tx('musicals', 'readwrite').delete(id));
}

/* ── Songs CRUD ──────────────────────────────────────────── */

export async function addSong(musicalId, trackNumber, name, guideVocalBlob, accompanimentBlob, scriptPage = null) {
  const song = {
    id: generateId(),
    musicalId,
    trackNumber,
    name,
    guideVocal: guideVocalBlob,
    accompaniment: accompanimentBlob,
    scriptPage,
  };
  await reqToPromise(tx('songs', 'readwrite').put(song));
  return song;
}

export async function getSongsByMusical(musicalId) {
  const store = tx('songs');
  const index = store.index('musicalId');
  const songs = await reqToPromise(index.getAll(musicalId));
  return songs.sort((a, b) => a.trackNumber - b.trackNumber);
}

export async function getSong(id) {
  return reqToPromise(tx('songs').get(id));
}

export async function deleteSong(id) {
  return reqToPromise(tx('songs', 'readwrite').delete(id));
}
