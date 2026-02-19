import { initDB, seedDemoPerformanceIfEmpty } from './db.js';
import { initSongs, showHome } from './songs.js';
import { initUpload } from './upload.js';
import { initPlayer, destroyPlayer } from './player.js';

/* ── Screen Routing ─────────────────────────────────────── */

const screens = {
  home: document.getElementById('screen-home'),
  songs: document.getElementById('screen-songs'),
  player: document.getElementById('screen-player'),
  upload: document.getElementById('screen-upload'),
};
const screenHeadingTargets = {
  home: document.getElementById('home-title'),
  songs: document.getElementById('performance-title'),
  player: document.getElementById('song-title'),
  upload: document.getElementById('upload-title'),
};

let currentScreen = 'home';
let announceTimeout = null;

function syncScreenState(activeName) {
  Object.entries(screens).forEach(([name, screen]) => {
    if (!screen) return;
    const isActive = name === activeName;
    screen.classList.toggle('active', isActive);
    screen.toggleAttribute('hidden', !isActive);
    screen.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    screen.toggleAttribute('inert', !isActive);
  });
}

function focusScreenHeading(screenName) {
  const heading = screenHeadingTargets[screenName];
  if (!heading) return;
  requestAnimationFrame(() => heading.focus());
}

export function announce(message) {
  const announcer = document.getElementById('sr-announcer');
  if (!announcer || !message) return;
  announcer.textContent = '';
  if (announceTimeout) clearTimeout(announceTimeout);
  announceTimeout = setTimeout(() => {
    announcer.textContent = message;
  }, 20);
}

export function navigateTo(name) {
  if (!screens[name]) return;

  currentScreen = name;
  syncScreenState(name);
  focusScreenHeading(name);

  // Destroy player when leaving player screen
  if (name !== 'player') {
    destroyPlayer();
  }

  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* ── Loading Overlay ────────────────────────────────────── */

const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.querySelector('.loading-text');
const appShell = document.getElementById('app');

export function showLoading(text = 'Loading...') {
  loadingText.textContent = text;
  loadingOverlay.classList.remove('hidden');
  loadingOverlay.setAttribute('aria-hidden', 'false');
  appShell?.setAttribute('aria-busy', 'true');
  announce(text);
}

export function hideLoading() {
  loadingOverlay.classList.add('hidden');
  loadingOverlay.setAttribute('aria-hidden', 'true');
  appShell?.setAttribute('aria-busy', 'false');
}

/* ── Init ───────────────────────────────────────────────── */

async function init() {
  showLoading('Setting the stage...');

  try {
    await initDB();
    try {
      await seedDemoPerformanceIfEmpty();
    } catch (seedErr) {
      console.error('Failed to seed demo performance:', seedErr);
    }
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

syncScreenState(currentScreen);
init();

