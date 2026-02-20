import {
  getPerformances,
  getSongsByPerformance,
  getPerformance,
  deletePerformance,
  deleteSong,
  toggleSongFavorite,
} from './db.js';
import { navigateTo, showLoading, hideLoading, announce } from './app.js';
import { openUploadNew, openUploadEdit } from './upload.js';
import { loadSong } from './player.js';

let currentPerformanceId = null;

const performancesGrid = document.getElementById('performances-grid');
const songsGrid = document.getElementById('songs-grid');
const performanceTitle = document.getElementById('performance-title');
const btnAddPerformance = document.getElementById('btn-add-performance');
const btnHomeCredits = document.getElementById('btn-home-credits');
const btnBackHome = document.getElementById('btn-back-home');
const btnViewScript = document.getElementById('btn-view-script');
const btnDeletePerformance = document.getElementById('btn-delete-performance');
const btnEditPerformance = document.getElementById('btn-edit-performance');
const modalCredits = document.getElementById('modal-credits');
const btnCloseCredits = document.getElementById('btn-close-credits');

let lastCreditsTrigger = null;

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

const performanceIcons = [
  '\uD83C\uDFAD',
  '\uD83C\uDFAC',
  '\uD83C\uDFAA',
  '\uD83C\uDFB6',
  '\uD83C\uDF1F',
  '\uD83C\uDFA4',
  '\uD83C\uDFB5',
  '\uD83D\uDCAB',
];
const songIcons = [
  '\uD83C\uDFB5',
  '\uD83C\uDFB6',
  '\uD83C\uDFA4',
  '\uD83C\uDF1F',
  '\uD83D\uDC83',
  '\uD83D\uDD7A',
  '\u2728',
  '\uD83C\uDFB8',
  '\uD83C\uDFB9',
  '\uD83E\uDD41',
  '\uD83C\uDFBA',
  '\uD83C\uDFB7',
  '\uD83E\uDE97',
  '\uD83C\uDFBB',
  '\uD83E\uDE98',
];

async function renderPerformances() {
  const performances = await getPerformances();
  performancesGrid.innerHTML = '';

  if (performances.length === 0) {
    performancesGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding:40px 20px;">
        <p style="font-size:3rem;" aria-hidden="true">\uD83C\uDFAD</p>
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
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.setAttribute('aria-label', `Open performance ${performance.name}`);
    card.innerHTML = `
      <span class="card-icon" aria-hidden="true">${performanceIcons[i % performanceIcons.length]}</span>
      <span class="card-name">${esc(performance.name)}</span>
      <button class="card-delete" type="button" data-delete-performance="${performance.id}" title="Delete">\uD83D\uDDD1\uFE0F</button>
    `;
    const deleteBtn = card.querySelector('.card-delete');
    if (deleteBtn) {
      deleteBtn.dataset.performanceName = performance.name;
      deleteBtn.setAttribute('aria-label', `Delete performance ${performance.name}`);
    }
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-delete')) return;
      showSongs(performance.id);
    });
    card.addEventListener('keydown', (e) => {
      if (e.target.closest('.card-delete')) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showSongs(performance.id);
      }
    });
    performancesGrid.appendChild(card);
  });
}

function createSongCard(song, index, isShortcut = false) {
  const card = document.createElement('div');
  card.className = `card${isShortcut ? ' song-shortcut-card' : ''}`;
  card.dataset.id = song.id;
  card.dataset.songName = song.name;
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  card.setAttribute(
    'aria-label',
    `${isShortcut ? 'Open favorite song' : 'Open song'} ${song.name}${song.trackNumber ? `, track ${song.trackNumber}` : ''}`
  );

  const favoriteChar = song.isFavorite ? '\u2605' : '\u2606';
  const favoriteTitle = song.isFavorite ? 'Remove favorite' : 'Add to favorites';
  const shortcutBadge = isShortcut ? '<span class="card-shortcut-badge" aria-hidden="true">Shortcut</span>' : '';
  const deleteBtn = isShortcut
    ? ''
    : `<button class="card-delete" type="button" data-delete-song="${song.id}" title="Delete">\uD83D\uDDD1\uFE0F</button>`;

  card.innerHTML = `
    <span class="card-number" aria-hidden="true">${song.trackNumber || ''}</span>
    <span class="card-icon" aria-hidden="true">${isShortcut ? '\u2B50' : songIcons[index % songIcons.length]}</span>
    <span class="card-name">${esc(song.name)}</span>
    <button class="card-favorite-btn ${song.isFavorite ? 'active' : ''}" type="button" data-toggle-favorite-song="${song.id}" title="${favoriteTitle}" aria-pressed="${song.isFavorite ? 'true' : 'false'}">${favoriteChar}</button>
    ${shortcutBadge}
    ${deleteBtn}
  `;
  const favoriteBtn = card.querySelector('.card-favorite-btn');
  if (favoriteBtn) {
    favoriteBtn.setAttribute('aria-label', `${favoriteTitle} for ${song.name}`);
  }
  const deleteSongBtn = card.querySelector('.card-delete');
  if (deleteSongBtn) {
    deleteSongBtn.setAttribute('aria-label', `Delete song ${song.name}`);
  }

  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-delete') || e.target.closest('.card-favorite-btn')) return;
    openPlayer(song.id);
  });
  card.addEventListener('keydown', (e) => {
    if (e.target.closest('.card-delete') || e.target.closest('.card-favorite-btn')) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPlayer(song.id);
    }
  });

  return card;
}

async function renderSongs(performanceId) {
  const songs = await getSongsByPerformance(performanceId);
  songsGrid.innerHTML = '';

  if (songs.length === 0) {
    songsGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding:40px 20px;">
        <p style="font-size:2rem;" aria-hidden="true">\uD83C\uDFB5</p>
        <p style="font-family:var(--font-fun); color:var(--color-text-light); margin-top:8px;">
          No songs yet! Tap settings to add tracks.
        </p>
      </div>
    `;
    return;
  }

  const favoriteSongs = songs.filter((song) => !!song.isFavorite);

  if (favoriteSongs.length > 0) {
    const favoritesSection = document.createElement('section');
    favoritesSection.className = 'songs-section';

    const favoritesTitle = document.createElement('h2');
    favoritesTitle.className = 'songs-section-title';
    favoritesTitle.id = 'favorites-section-title';
    favoritesTitle.textContent = 'Favorites';
    favoritesSection.appendChild(favoritesTitle);

    const favoritesGrid = document.createElement('div');
    favoritesGrid.className = 'card-grid songs-section-grid';
    favoritesGrid.setAttribute('role', 'group');
    favoritesGrid.setAttribute('aria-labelledby', favoritesTitle.id);
    favoriteSongs.forEach((song, i) => {
      favoritesGrid.appendChild(createSongCard(song, i, true));
    });

    favoritesSection.appendChild(favoritesGrid);
    songsGrid.appendChild(favoritesSection);
  }

  const allSongsSection = document.createElement('section');
  allSongsSection.className = 'songs-section';

  const allSongsTitle = document.createElement('h2');
  allSongsTitle.className = 'songs-section-title';
  allSongsTitle.id = 'all-songs-section-title';
  allSongsTitle.textContent = favoriteSongs.length > 0 ? 'All Songs' : 'Songs';
  allSongsSection.appendChild(allSongsTitle);

  const allSongsGrid = document.createElement('div');
  allSongsGrid.className = 'card-grid songs-section-grid';
  allSongsGrid.setAttribute('role', 'group');
  allSongsGrid.setAttribute('aria-labelledby', allSongsTitle.id);
  songs.forEach((song, i) => {
    allSongsGrid.appendChild(createSongCard(song, i, false));
  });

  allSongsSection.appendChild(allSongsGrid);
  songsGrid.appendChild(allSongsSection);
}

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
  btnViewScript.classList.toggle('hidden', !performance?.scriptPdf);
  btnViewScript.setAttribute('aria-hidden', performance?.scriptPdf ? 'false' : 'true');

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
    announce(`Deleted performance ${performanceName}.`);
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

function openNoOpenerTab(url = 'about:blank') {
  const openedTab = window.open(url, '_blank', 'noopener,noreferrer');
  if (openedTab) openedTab.opener = null;
  return openedTab;
}

async function openScript() {
  if (!currentPerformanceId) return;

  const scriptTab = openNoOpenerTab('about:blank');
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
    openNoOpenerTab(url);
  }
  announce('Opened script in a new tab.');
}

function isCreditsOpen() {
  return !!modalCredits && !modalCredits.classList.contains('hidden');
}

function openCreditsDialog() {
  if (!modalCredits) return;
  lastCreditsTrigger = document.activeElement;
  modalCredits.classList.remove('hidden');
  modalCredits.setAttribute('aria-hidden', 'false');
  if (btnCloseCredits) btnCloseCredits.focus();
  announce('Opened credits dialog.');
}

function closeCreditsDialog() {
  if (!modalCredits || !isCreditsOpen()) return;
  modalCredits.classList.add('hidden');
  modalCredits.setAttribute('aria-hidden', 'true');
  if (lastCreditsTrigger && typeof lastCreditsTrigger.focus === 'function') {
    lastCreditsTrigger.focus();
  }
  announce('Closed credits dialog.');
}

export function initSongs() {
  btnAddPerformance.addEventListener('click', () => openUploadNew());
  if (btnHomeCredits) {
    btnHomeCredits.addEventListener('click', openCreditsDialog);
  }
  btnBackHome.addEventListener('click', () => showHome());
  btnViewScript.addEventListener('click', () => openScript());
  btnDeletePerformance.addEventListener('click', () => deleteCurrentPerformanceProject());
  btnEditPerformance.addEventListener('click', () => openCurrentPerformanceEditor());
  if (btnCloseCredits) {
    btnCloseCredits.addEventListener('click', closeCreditsDialog);
  }
  if (modalCredits) {
    modalCredits.addEventListener('click', (e) => {
      if (e.target === modalCredits) {
        closeCreditsDialog();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isCreditsOpen()) {
      e.preventDefault();
      closeCreditsDialog();
    }
  });

  document.addEventListener('click', async (e) => {
    const favoriteSongBtn = e.target.closest('[data-toggle-favorite-song]');
    if (favoriteSongBtn) {
      const id = favoriteSongBtn.dataset.toggleFavoriteSong;
      if (id && currentPerformanceId) {
        const updatedSong = await toggleSongFavorite(id);
        await renderSongs(currentPerformanceId);
        if (updatedSong) {
          announce(
            updatedSong.isFavorite
              ? `${updatedSong.name} added to favorites.`
              : `${updatedSong.name} removed from favorites.`
          );
        }
      }
      return;
    }

    const delPerformance = e.target.closest('[data-delete-performance]');
    if (delPerformance) {
      const id = delPerformance.dataset.deletePerformance;
      const performanceName = delPerformance.dataset.performanceName || 'performance';
      if (confirm('Delete this entire performance and all its songs?')) {
        await deletePerformance(id);
        announce(`Deleted performance ${performanceName}.`);
        await renderPerformances();
      }
      return;
    }

    const delSong = e.target.closest('[data-delete-song]');
    if (delSong) {
      const id = delSong.dataset.deleteSong;
      const songCard = delSong.closest('.card');
      const songName = songCard?.dataset.songName || 'song';
      if (confirm('Delete this song?')) {
        await deleteSong(id);
        announce(`Deleted song ${songName}.`);
        await renderSongs(currentPerformanceId);
      }
    }
  });
}
