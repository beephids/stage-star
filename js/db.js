// IndexedDB wrapper for performances, songs, and script PDFs.

const DB_NAME = 'StageStar';
const DB_VERSION = 2;
const DEMO_PERFORMANCE_NAME = 'Demo Performance';
const DEMO_TRACK_NAME = 'Welcome Number';
const DEMO_GUIDE_PATH = './assets/sound4stock-demo-WITH_VOICE.mp3';
const DEMO_ACCOMP_PATH = './assets/sound4stock-demo-NO_VOICE.mp3';

let db = null;

export function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      const transaction = e.target.transaction;

      if (!database.objectStoreNames.contains('performances')) {
        database.createObjectStore('performances', { keyPath: 'id' });
      }

      let songStore;
      if (!database.objectStoreNames.contains('songs')) {
        songStore = database.createObjectStore('songs', { keyPath: 'id' });
      } else {
        songStore = transaction.objectStore('songs');
      }

      if (!songStore.indexNames.contains('performanceId')) {
        songStore.createIndex('performanceId', 'performanceId', { unique: false });
      }

      // Migrate legacy performance records from v1 "musicals" store.
      if (database.objectStoreNames.contains('musicals')) {
        const legacyStore = transaction.objectStore('musicals');
        const performanceStore = transaction.objectStore('performances');

        legacyStore.openCursor().onsuccess = (evt) => {
          const cursor = evt.target.result;
          if (!cursor) return;
          performanceStore.put(cursor.value);
          cursor.continue();
        };
      }

      // Migrate song foreign key from musicalId -> performanceId.
      songStore.openCursor().onsuccess = (evt) => {
        const cursor = evt.target.result;
        if (!cursor) return;

        const song = cursor.value;
        if (!song.performanceId && song.musicalId) {
          song.performanceId = song.musicalId;
          cursor.update(song);
        }
        cursor.continue();
      };
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

export async function addPerformance(name, scriptBlob = null) {
  const performance = {
    id: generateId(),
    name,
    scriptPdf: scriptBlob,
    createdAt: Date.now(),
  };
  await reqToPromise(tx('performances', 'readwrite').put(performance));
  return performance;
}

export async function getPerformances() {
  return reqToPromise(tx('performances').getAll());
}

export async function getPerformance(id) {
  return reqToPromise(tx('performances').get(id));
}

export async function updatePerformance(performance) {
  return reqToPromise(tx('performances', 'readwrite').put(performance));
}

export async function deletePerformance(id) {
  const songs = await getSongsByPerformance(id);
  const songStore = tx('songs', 'readwrite');
  for (const song of songs) {
    songStore.delete(song.id);
  }
  return reqToPromise(tx('performances', 'readwrite').delete(id));
}

export async function addSong(
  performanceId,
  trackNumber,
  name,
  guideVocalBlob,
  accompanimentBlob,
  scriptPage = null,
  isFavorite = false,
  loopPresets = []
) {
  const song = {
    id: generateId(),
    performanceId,
    trackNumber,
    name,
    guideVocal: guideVocalBlob,
    accompaniment: accompanimentBlob,
    scriptPage,
    isFavorite: !!isFavorite,
    loopPresets: Array.isArray(loopPresets) ? loopPresets : [],
  };
  await reqToPromise(tx('songs', 'readwrite').put(song));
  return song;
}

export async function getSongsByPerformance(performanceId) {
  const store = tx('songs');
  const index = store.index('performanceId');
  const songs = await reqToPromise(index.getAll(performanceId));
  return songs.sort((a, b) => a.trackNumber - b.trackNumber);
}

export async function getSong(id) {
  return reqToPromise(tx('songs').get(id));
}

export async function updateSong(song) {
  return reqToPromise(tx('songs', 'readwrite').put(song));
}

export async function deleteSong(id) {
  return reqToPromise(tx('songs', 'readwrite').delete(id));
}

export async function toggleSongFavorite(id) {
  const song = await getSong(id);
  if (!song) return null;
  song.isFavorite = !song.isFavorite;
  await reqToPromise(tx('songs', 'readwrite').put(song));
  return song;
}

async function fetchAssetBlob(path, fallbackType) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch demo asset: ${path}`);
  }

  const blob = await response.blob();
  if (blob.type) return blob;
  return new Blob([await blob.arrayBuffer()], { type: fallbackType });
}

export async function seedDemoPerformanceIfEmpty() {
  const performances = await getPerformances();
  if (performances.length > 0) return null;

  const [guideBlob, accompBlob] = await Promise.all([
    fetchAssetBlob(DEMO_GUIDE_PATH, 'audio/mpeg'),
    fetchAssetBlob(DEMO_ACCOMP_PATH, 'audio/mpeg'),
  ]);

  const performance = await addPerformance(DEMO_PERFORMANCE_NAME, null);
  await addSong(performance.id, 1, DEMO_TRACK_NAME, guideBlob, accompBlob, null);
  return performance.id;
}
