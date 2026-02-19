import { getPerformances, getSongsByPerformance, getPerformance, deletePerformance, deleteSong } from './db.js';
import { navigateTo, showLoading, hideLoading } from './app.js';
import { openUploadNew, openUploadEdit } from './upload.js';
import { loadSong } from './player.js';

/* ── State ───────────────────────────────────────────────── */

let currentPerformanceId = null;

/* ── DOM Refs ────────────────────────────────────────────── */

const performancesGrid = document.getElementById('performances-grid');
const songsGrid = document.getElementById('songs-grid');
const performanceTitle = document.getElementById('performance-title');
const btnAddPerformance = document.getElementById('btn-add-performance');
const btnBackHome = document.getElementById('btn-back-home');
const btnViewScript = document.getElementById('btn-view-script');
const btnDeletePerformance = document.getElementById('btn-delete-performance');
const btnEditPerformance = document.getElementById('btn-edit-performance');

/* ── HTML Escape ─────────────────────────────────────────── */

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

/* ── Performance icons — cycle through fun emojis ────────────── */

const performanceIcons = ['🎭', '🎬', '🎪', '🎶', '🌟', '🎤', '🎵', '💫'];
const songIcons = ['🎵', '🎶', '🎤', '🌟', '💃', '🕺', '✨', '🎸', '🎹', '🥁', '🎺', '🎷', '🪗', '🎻', '🪘'];

/* ── Render Performances Grid ────────────────────────────────── */

async function renderPerformances() {
  const performances = await getPerformances();
  performancesGrid.innerHTML = '';

  if (performances.length === 0) {
    performancesGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding:40px 20px;">
        <p style="font-size:3rem;">🎭</p>
        <p style="font-family:var(--font-fun); font-size:1.2rem; color:var(--color-text-light); margin-top:12px;">
          No performances yet!<br>Tap the button below to get started.
        </p>
      </div>
    `;
    return;
  }

  performances.forEach((performance, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = performance.id;
    card.innerHTML = `
      <span class="card-icon">${performanceIcons[i % performanceIcons.length]}</span>
      <span>${esc(performance.name)}</span>
      <button class="card-delete" data-delete-performance="${performance.id}" title="Delete">🗑️</button>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-delete')) return;
      showSongs(performance.id);
    });
    performancesGrid.appendChild(card);
  });
}

/* ── Render Songs Grid ───────────────────────────────────── */

async function renderSongs(performanceId) {
  const songs = await getSongsByPerformance(performanceId);
  songsGrid.innerHTML = '';

  if (songs.length === 0) {
    songsGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding:40px 20px;">
        <p style="font-size:2rem;">🎵</p>
        <p style="font-family:var(--font-fun); color:var(--color-text-light); margin-top:8px;">
          No songs yet! Tap ⚙️ to add tracks.
        </p>
      </div>
    `;
    return;
  }

  songs.forEach((song, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = song.id;
    card.innerHTML = `
      <span class="card-number">${song.trackNumber || ''}</span>
      <span class="card-icon">${songIcons[i % songIcons.length]}</span>
      <span>${esc(song.name)}</span>
      <button class="card-delete" data-delete-song="${song.id}" title="Delete">🗑️</button>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-delete')) return;
      openPlayer(song.id);
    });
    songsGrid.appendChild(card);
  });
}

/* ── Navigation Helpers ──────────────────────────────────── */

export async function showHome() {
  performancesGrid.classList.remove('editing');
  await renderPerformances();
  navigateTo('home');
}

export async function showSongs(performanceId) {
  currentPerformanceId = performanceId;
  songsGrid.classList.remove('editing');

  const performance = await getPerformance(performanceId);
  performanceTitle.textContent = performance ? performance.name : 'Songs';

  // Show/hide script button based on whether script exists
  btnViewScript.classList.toggle('hidden', !performance?.scriptPdf);

  await renderSongs(performanceId);
  navigateTo('songs');
}

async function openPlayer(songId) {
  showLoading('Loading song...');
  await loadSong(songId);
  navigateTo('player');
  hideLoading();
}

async function deleteCurrentPerformanceProject() {
  if (!currentPerformanceId) return;

  const performance = await getPerformance(currentPerformanceId);
  const performanceName = performance?.name || 'this performance';
  if (!confirm(`Delete "${performanceName}" and all its songs?`)) return;

  showLoading('Deleting performance...');
  try {
    await deletePerformance(currentPerformanceId);
    currentPerformanceId = null;
    await showHome();
  } catch (err) {
    console.error('Delete performance failed:', err);
    alert('Failed to delete this performance. Please try again.');
  } finally {
    hideLoading();
  }
}

async function openCurrentPerformanceEditor() {
  if (!currentPerformanceId) return;

  showLoading('Opening performance editor...');
  try {
    await openUploadEdit(currentPerformanceId);
  } catch (err) {
    console.error('Failed to open performance editor:', err);
    alert('Could not open the performance editor. Please try again.');
  } finally {
    hideLoading();
  }
}

/* ── Script Viewer ───────────────────────────────────────── */

async function openScript() {
  if (!currentPerformanceId) return;

  // Open the tab immediately in the user gesture to avoid popup blocking.
  const scriptTab = window.open('about:blank', '_blank');
  const performance = await getPerformance(currentPerformanceId);
  if (!performance?.scriptPdf) {
    if (scriptTab) scriptTab.close();
    return;
  }

  const blob = performance.scriptPdf instanceof Blob
    ? performance.scriptPdf
    : new Blob([performance.scriptPdf], { type: 'application/pdf' });

  const url = URL.createObjectURL(blob);
  if (scriptTab) {
    scriptTab.location.href = url;
  } else {
    window.open(url, '_blank');
  }
}

/* ── Event Wiring ────────────────────────────────────────── */

export function initSongs() {
  btnAddPerformance.addEventListener('click', () => openUploadNew());

  btnBackHome.addEventListener('click', () => showHome());

  btnViewScript.addEventListener('click', () => openScript());
  btnDeletePerformance.addEventListener('click', () => deleteCurrentPerformanceProject());
  btnEditPerformance.addEventListener('click', () => openCurrentPerformanceEditor());

  // Delete handlers (delegated)
  document.addEventListener('click', async (e) => {
    const delPerformance = e.target.closest('[data-delete-performance]');
    if (delPerformance) {
      const id = delPerformance.dataset.deletePerformance;
      if (confirm('Delete this entire performance and all its songs?')) {
        await deletePerformance(id);
        await renderPerformances();
      }
      return;
    }

    const delSong = e.target.closest('[data-delete-song]');
    if (delSong) {
      const id = delSong.dataset.deleteSong;
      if (confirm('Delete this song?')) {
        await deleteSong(id);
        await renderSongs(currentPerformanceId);
      }
    }
  });
}

