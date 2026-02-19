import { getMusicals, getSongsByMusical, getMusical, deleteMusical, deleteSong } from './db.js';
import { navigateTo, showLoading, hideLoading } from './app.js';
import { openUploadNew, openUploadEdit } from './upload.js';
import { loadSong } from './player.js';

/* ── State ───────────────────────────────────────────────── */

let currentMusicalId = null;
let isEditing = false;

/* ── DOM Refs ────────────────────────────────────────────── */

const musicalsGrid = document.getElementById('musicals-grid');
const songsGrid = document.getElementById('songs-grid');
const musicalTitle = document.getElementById('musical-title');
const btnAddMusical = document.getElementById('btn-add-musical');
const btnBackHome = document.getElementById('btn-back-home');
const btnViewScript = document.getElementById('btn-view-script');
const btnEditMusical = document.getElementById('btn-edit-musical');
const modalScript = document.getElementById('modal-script');
const btnCloseScript = document.getElementById('btn-close-script');
const scriptViewer = document.getElementById('script-viewer');

/* ── HTML Escape ─────────────────────────────────────────── */

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

/* ── Musical icons — cycle through fun emojis ────────────── */

const musicalIcons = ['🎭', '🎬', '🎪', '🎶', '🌟', '🎤', '🎵', '💫'];
const songIcons = ['🎵', '🎶', '🎤', '🌟', '💃', '🕺', '✨', '🎸', '🎹', '🥁', '🎺', '🎷', '🪗', '🎻', '🪘'];

/* ── Render Musicals Grid ────────────────────────────────── */

async function renderMusicals() {
  const musicals = await getMusicals();
  musicalsGrid.innerHTML = '';

  if (musicals.length === 0) {
    musicalsGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding:40px 20px;">
        <p style="font-size:3rem;">🎭</p>
        <p style="font-family:var(--font-fun); font-size:1.2rem; color:var(--color-text-light); margin-top:12px;">
          No musicals yet!<br>Tap the button below to get started.
        </p>
      </div>
    `;
    return;
  }

  musicals.forEach((musical, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = musical.id;
    card.innerHTML = `
      <span class="card-icon">${musicalIcons[i % musicalIcons.length]}</span>
      <span>${esc(musical.name)}</span>
      <button class="card-delete" data-delete-musical="${musical.id}" title="Delete">🗑️</button>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-delete')) return;
      showSongs(musical.id);
    });
    musicalsGrid.appendChild(card);
  });
}

/* ── Render Songs Grid ───────────────────────────────────── */

async function renderSongs(musicalId) {
  const songs = await getSongsByMusical(musicalId);
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
  isEditing = false;
  musicalsGrid.classList.remove('editing');
  await renderMusicals();
  navigateTo('home');
}

export async function showSongs(musicalId) {
  currentMusicalId = musicalId;
  isEditing = false;
  songsGrid.classList.remove('editing');

  const musical = await getMusical(musicalId);
  musicalTitle.textContent = musical ? musical.name : 'Songs';

  // Show/hide script button based on whether script exists
  btnViewScript.classList.toggle('hidden', !musical?.scriptPdf);

  await renderSongs(musicalId);
  navigateTo('songs');
}

async function openPlayer(songId) {
  showLoading('Loading song...');
  await loadSong(songId);
  navigateTo('player');
  hideLoading();
}

/* ── Script Viewer ───────────────────────────────────────── */

async function openScript() {
  if (!currentMusicalId) return;
  const musical = await getMusical(currentMusicalId);
  if (!musical?.scriptPdf) return;

  const blob = musical.scriptPdf instanceof Blob
    ? musical.scriptPdf
    : new Blob([musical.scriptPdf], { type: 'application/pdf' });

  const url = URL.createObjectURL(blob);
  scriptViewer.setAttribute('src', url);
  modalScript.classList.remove('hidden');
}

function closeScript() {
  modalScript.classList.add('hidden');
  const src = scriptViewer.getAttribute('src');
  if (src) URL.revokeObjectURL(src);
  scriptViewer.removeAttribute('src');
}

/* ── Event Wiring ────────────────────────────────────────── */

export function initSongs() {
  btnAddMusical.addEventListener('click', () => openUploadNew());

  btnBackHome.addEventListener('click', () => showHome());

  btnViewScript.addEventListener('click', () => openScript());
  btnCloseScript.addEventListener('click', () => closeScript());

  // Close modal on backdrop click
  modalScript.addEventListener('click', (e) => {
    if (e.target === modalScript) closeScript();
  });

  // Edit musical button
  btnEditMusical.addEventListener('click', () => {
    if (isEditing) {
      isEditing = false;
      songsGrid.classList.remove('editing');
    } else {
      isEditing = true;
      songsGrid.classList.add('editing');
    }
  });

  // Delete handlers (delegated)
  document.addEventListener('click', async (e) => {
    const delMusical = e.target.closest('[data-delete-musical]');
    if (delMusical) {
      const id = delMusical.dataset.deleteMusical;
      if (confirm('Delete this entire musical and all its songs?')) {
        await deleteMusical(id);
        await renderMusicals();
      }
      return;
    }

    const delSong = e.target.closest('[data-delete-song]');
    if (delSong) {
      const id = delSong.dataset.deleteSong;
      if (confirm('Delete this song?')) {
        await deleteSong(id);
        await renderSongs(currentMusicalId);
      }
    }
  });
}
