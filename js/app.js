import { initDB } from './db.js';
import { initSongs, showHome, showSongs } from './songs.js';
import { initUpload } from './upload.js';
import { initPlayer, destroyPlayer } from './player.js';

/* ── Screen Routing ─────────────────────────────────────── */

const screens = {
  home: document.getElementById('screen-home'),
  songs: document.getElementById('screen-songs'),
  player: document.getElementById('screen-player'),
  upload: document.getElementById('screen-upload'),
};

let currentScreen = 'home';

export function navigateTo(name) {
  if (screens[currentScreen]) screens[currentScreen].classList.remove('active');
  currentScreen = name;
  if (screens[name]) screens[name].classList.add('active');

  // Destroy player when leaving player screen
  if (name !== 'player') {
    destroyPlayer();
  }

  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* ── Loading Overlay ────────────────────────────────────── */

const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.querySelector('.loading-text');

export function showLoading(text = 'Loading...') {
  loadingText.textContent = text;
  loadingOverlay.classList.remove('hidden');
}

export function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

/* ── Init ───────────────────────────────────────────────── */

async function init() {
  showLoading('Setting the stage...');

  try {
    await initDB();
    initSongs();
    initUpload();
    initPlayer();
    showHome();
  } catch (err) {
    console.error('Failed to initialize app:', err);
    loadingText.textContent = 'Something went wrong. Please refresh.';
    return;
  }

  hideLoading();
}

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Service worker registration failed — app still works fine
    });
  });
}

init();
