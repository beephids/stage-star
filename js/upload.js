import { addMusical, addSong, getMusical, getSongsByMusical, deleteMusical, deleteSong, updateMusical } from './db.js';
import { navigateTo, showLoading, hideLoading } from './app.js';
import { showHome, showSongs } from './songs.js';

/* ── State ───────────────────────────────────────────────── */

let editingMusicalId = null; // null = creating new, string = editing existing
let scriptFile = null;
let guideFiles = [];   // Array of { file, trackNumber, name }
let accompFiles = [];  // Array of { file, trackNumber, name }
let matchedSongs = []; // Array of { trackNumber, name, guide, accomp }

/* ── DOM Refs ────────────────────────────────────────────── */

const inputName = document.getElementById('input-musical-name');
const inputScript = document.getElementById('input-script');
const dropZoneScript = document.getElementById('drop-zone-script');
const scriptFileName = document.getElementById('script-file-name');

const dropZoneGuide = document.getElementById('drop-zone-guide');
const inputGuideFiles = document.getElementById('input-guide-files');
const inputGuideFolder = document.getElementById('input-guide-folder');
const guideFileList = document.getElementById('guide-file-list');

const dropZoneAccomp = document.getElementById('drop-zone-accomp');
const inputAccompFiles = document.getElementById('input-accomp-files');
const inputAccompFolder = document.getElementById('input-accomp-folder');
const accompFileList = document.getElementById('accomp-file-list');

const matchedSongsList = document.getElementById('matched-songs-list');
const btnSave = document.getElementById('btn-save-musical');
const btnBackUpload = document.getElementById('btn-back-upload');

/* ── HTML Escape ─────────────────────────────────────────── */

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

/* ── Filename Parser ─────────────────────────────────────── */

/**
 * Parses a filename like "03_Matchmaker.m4a" or "03 Matchmaker.m4a"
 * Returns { trackNumber, name } or null if unparseable.
 */
function parseFilename(filename) {
  // Remove extension
  const base = filename.replace(/\.[^.]+$/, '').trim();

  // Try patterns: "01_Song Name", "01 Song Name", "01-Song Name"
  const match = base.match(/^(\d{1,3})[_\-\s]+(.+)$/);
  if (match) {
    const trackNumber = parseInt(match[1], 10);
    // Clean up: replace underscores with spaces, trim
    const name = match[2].replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    return { trackNumber, name };
  }

  return null;
}

/**
 * Given a list of Files, parse them into { file, trackNumber, name } objects.
 * Filters to audio files only.
 */
function parseAudioFiles(files) {
  const audioExts = ['.mp3', '.wav', '.m4a', '.aif', '.aiff', '.ogg', '.flac', '.wma', '.aac'];
  const result = [];

  for (const file of files) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!audioExts.includes(ext)) continue;

    const parsed = parseFilename(file.name);
    if (parsed) {
      result.push({ file, trackNumber: parsed.trackNumber, name: parsed.name });
    } else {
      // Use full filename as name, no track number
      const name = file.name.replace(/\.[^.]+$/, '').trim();
      result.push({ file, trackNumber: 0, name });
    }
  }

  // Sort by track number
  result.sort((a, b) => a.trackNumber - b.trackNumber);
  return result;
}

/* ── Auto-Match ──────────────────────────────────────────── */

function autoMatch() {
  // Preserve existing scriptPage values by track number
  const existingPages = new Map();
  for (const s of matchedSongs) {
    if (s.scriptPage) existingPages.set(s.trackNumber, s.scriptPage);
  }

  const matched = new Map(); // trackNumber -> { trackNumber, name, guide, accomp, scriptPage }

  // Add guide tracks
  for (const g of guideFiles) {
    const key = g.trackNumber || `g_${g.name}`;
    if (!matched.has(key)) {
      matched.set(key, { trackNumber: g.trackNumber, name: g.name, guide: g.file, accomp: null, scriptPage: existingPages.get(g.trackNumber) || g.scriptPage || null });
    } else {
      matched.get(key).guide = g.file;
    }
  }

  // Match accompaniment tracks by track number
  for (const a of accompFiles) {
    const key = a.trackNumber || `a_${a.name}`;
    if (matched.has(key)) {
      matched.get(key).accomp = a.file;
    } else {
      matched.set(key, { trackNumber: a.trackNumber, name: a.name, guide: null, accomp: a.file, scriptPage: existingPages.get(a.trackNumber) || a.scriptPage || null });
    }
  }

  matchedSongs = Array.from(matched.values()).sort((a, b) => a.trackNumber - b.trackNumber);
  renderMatchedSongs();
  updateSaveButton();
}

/* ── Rendering ───────────────────────────────────────────── */

function renderFileList(container, files, type) {
  container.innerHTML = '';
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const fileName = f.file?.name || f.name || 'track';
    const div = document.createElement('div');
    div.className = 'file-item';
    div.innerHTML = `
      <span class="file-item-name">${f.trackNumber ? '#' + f.trackNumber + ' ' : ''}${esc(f.name)}</span>
      <button class="file-item-remove" data-type="${type}" data-index="${i}" title="Remove">✕</button>
    `;
    container.appendChild(div);
  }
}

function renderMatchedSongs() {
  matchedSongsList.innerHTML = '';

  if (matchedSongs.length === 0) {
    matchedSongsList.innerHTML = '<p style="color:#9ca3af;text-align:center;">Upload tracks above to see matched songs</p>';
    return;
  }

  for (let i = 0; i < matchedSongs.length; i++) {
    const song = matchedSongs[i];
    const hasGuide = !!song.guide;
    const hasAccomp = !!song.accomp;
    const isComplete = hasGuide && hasAccomp;

    const div = document.createElement('div');
    div.className = `matched-item ${isComplete ? '' : 'unmatched'}`;
    div.innerHTML = `
      <span class="matched-number">#${song.trackNumber || '?'}</span>
      <span class="matched-name">
        <input type="text" value="${esc(song.name)}" data-index="${i}" class="matched-name-input">
      </span>
      <span class="matched-page">
        <input type="number" value="${song.scriptPage || ''}" data-index="${i}" class="matched-page-input" placeholder="📜 Pg" min="1" title="Script page number">
      </span>
      <span class="matched-badges">
        ${hasGuide ? '<span class="badge badge-guide">🎤 Vocal</span>' : '<span class="badge badge-missing">🎤 Missing</span>'}
        ${hasAccomp ? '<span class="badge badge-accomp">🎵 Music</span>' : '<span class="badge badge-missing">🎵 Missing</span>'}
      </span>
    `;
    matchedSongsList.appendChild(div);
  }

  // Listen for name edits
  matchedSongsList.querySelectorAll('.matched-name-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      matchedSongs[idx].name = e.target.value.trim();
    });
  });

  // Listen for page number edits
  matchedSongsList.querySelectorAll('.matched-page-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      const val = parseInt(e.target.value, 10);
      matchedSongs[idx].scriptPage = isNaN(val) ? null : val;
    });
  });
}

function updateSaveButton() {
  // Can save if we have a name and at least one matched song with at least one track
  const hasName = inputName.value.trim().length > 0;
  const hasSongs = matchedSongs.some(s => s.guide || s.accomp);
  btnSave.disabled = !(hasName && hasSongs);
}

/* ── File Handling ───────────────────────────────────────── */

function getFilesFromInput(input) {
  return Array.from(input.files || []);
}

function getFilesFromDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  const items = e.dataTransfer?.items;
  if (!items) return Promise.resolve(Array.from(e.dataTransfer?.files || []));

  // Handle directory entries for modern browsers
  const promises = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.() || item.getAsEntry?.();
    if (entry) {
      promises.push(readEntry(entry));
    } else if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) promises.push(Promise.resolve([file]));
    }
  }

  return Promise.all(promises).then(arrays => arrays.flat());
}

function readEntry(entry) {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file(f => resolve([f]), () => resolve([]));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const allFiles = [];
      const readBatch = () => {
        reader.readEntries(entries => {
          if (entries.length === 0) {
            resolve(allFiles);
          } else {
            Promise.all(entries.map(e => readEntry(e))).then(results => {
              allFiles.push(...results.flat());
              readBatch(); // Continue reading (batched API)
            });
          }
        }, () => resolve(allFiles));
      };
      readBatch();
    } else {
      resolve([]);
    }
  });
}

/* ── Setup Drop Zones ────────────────────────────────────── */

function setupDropZone(zone, onFiles) {
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('drag-over');
  });

  zone.addEventListener('drop', async (e) => {
    zone.classList.remove('drag-over');
    const files = await getFilesFromDrop(e);
    onFiles(files);
  });
}

/* ── Event Wiring ────────────────────────────────────────── */

export function initUpload() {
  // Back button
  btnBackUpload.addEventListener('click', () => {
    if (editingMusicalId) {
      showSongs(editingMusicalId);
    } else {
      showHome();
    }
  });

  // Musical name input
  inputName.addEventListener('input', updateSaveButton);

  // Script upload
  inputScript.addEventListener('change', () => {
    const files = getFilesFromInput(inputScript);
    if (files.length > 0) {
      scriptFile = files[0];
      scriptFileName.textContent = '📄 ' + scriptFile.name;
    }
  });

  setupDropZone(dropZoneScript, (files) => {
    const pdf = files.find(f => f.name.toLowerCase().endsWith('.pdf'));
    if (pdf) {
      scriptFile = pdf;
      scriptFileName.textContent = '📄 ' + scriptFile.name;
    }
  });

  // Guide vocals upload
  const handleGuideFiles = (files) => {
    const parsed = parseAudioFiles(files);
    // Merge, replacing duplicates by track number
    for (const p of parsed) {
      const existingIdx = guideFiles.findIndex(g => g.trackNumber === p.trackNumber && p.trackNumber > 0);
      if (existingIdx >= 0) {
        guideFiles[existingIdx] = p;
      } else {
        guideFiles.push(p);
      }
    }
    guideFiles.sort((a, b) => a.trackNumber - b.trackNumber);
    renderFileList(guideFileList, guideFiles, 'guide');
    autoMatch();
  };

  inputGuideFiles.addEventListener('change', () => handleGuideFiles(getFilesFromInput(inputGuideFiles)));
  inputGuideFolder.addEventListener('change', () => handleGuideFiles(getFilesFromInput(inputGuideFolder)));
  document.getElementById('btn-browse-guide-files').addEventListener('click', () => inputGuideFiles.click());
  document.getElementById('btn-browse-guide-folder').addEventListener('click', () => inputGuideFolder.click());
  setupDropZone(dropZoneGuide, handleGuideFiles);

  // Accompaniment upload
  const handleAccompFiles = (files) => {
    const parsed = parseAudioFiles(files);
    for (const p of parsed) {
      const existingIdx = accompFiles.findIndex(a => a.trackNumber === p.trackNumber && p.trackNumber > 0);
      if (existingIdx >= 0) {
        accompFiles[existingIdx] = p;
      } else {
        accompFiles.push(p);
      }
    }
    accompFiles.sort((a, b) => a.trackNumber - b.trackNumber);
    renderFileList(accompFileList, accompFiles, 'accomp');
    autoMatch();
  };

  inputAccompFiles.addEventListener('change', () => handleAccompFiles(getFilesFromInput(inputAccompFiles)));
  inputAccompFolder.addEventListener('change', () => handleAccompFiles(getFilesFromInput(inputAccompFolder)));
  document.getElementById('btn-browse-accomp-files').addEventListener('click', () => inputAccompFiles.click());
  document.getElementById('btn-browse-accomp-folder').addEventListener('click', () => inputAccompFolder.click());
  setupDropZone(dropZoneAccomp, handleAccompFiles);

  // Remove file from lists
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.file-item-remove');
    if (!btn) return;
    const type = btn.dataset.type;
    const idx = parseInt(btn.dataset.index, 10);

    if (type === 'guide') {
      guideFiles.splice(idx, 1);
      renderFileList(guideFileList, guideFiles, 'guide');
    } else {
      accompFiles.splice(idx, 1);
      renderFileList(accompFileList, accompFiles, 'accomp');
    }
    autoMatch();
  });

  // Save
  btnSave.addEventListener('click', handleSave);
}

/* ── Save Musical ────────────────────────────────────────── */

async function handleSave() {
  const name = inputName.value.trim();
  if (!name) return;

  showLoading('Saving your musical...');

  try {
    let musicalId;

    if (editingMusicalId) {
      // Update existing
      const existing = await getMusical(editingMusicalId);
      existing.name = name;
      if (scriptFile) existing.scriptPdf = scriptFile;
      await updateMusical(existing);
      musicalId = editingMusicalId;

      // Delete old songs and re-add
      const oldSongs = await getSongsByMusical(musicalId);
      for (const s of oldSongs) await deleteSong(s.id);
    } else {
      // Create new
      const musical = await addMusical(name, scriptFile);
      musicalId = musical.id;
    }

    // Save each matched song
    for (const song of matchedSongs) {
      if (!song.guide && !song.accomp) continue;
      await addSong(musicalId, song.trackNumber, song.name, song.guide, song.accomp, song.scriptPage || null);
    }

    resetUploadState();
    showSongs(musicalId);
  } catch (err) {
    console.error('Save failed:', err);
    alert('Failed to save. Please try again.');
  }

  hideLoading();
}

/* ── Reset ───────────────────────────────────────────────── */

function resetUploadState() {
  editingMusicalId = null;
  scriptFile = null;
  guideFiles = [];
  accompFiles = [];
  matchedSongs = [];
  inputName.value = '';
  scriptFileName.textContent = '';
  guideFileList.innerHTML = '';
  accompFileList.innerHTML = '';
  matchedSongsList.innerHTML = '';
  btnSave.disabled = true;
}

/* ── Public: Open upload screen ──────────────────────────── */

export function openUploadNew() {
  resetUploadState();
  navigateTo('upload');
}

export async function openUploadEdit(musicalId) {
  resetUploadState();
  editingMusicalId = musicalId;

  const musical = await getMusical(musicalId);
  if (musical) {
    inputName.value = musical.name;
  }

  // Load existing songs to show as matched
  const songs = await getSongsByMusical(musicalId);
  for (const song of songs) {
    if (song.guideVocal) {
      guideFiles.push({ file: song.guideVocal, trackNumber: song.trackNumber, name: song.name, scriptPage: song.scriptPage });
    }
    if (song.accompaniment) {
      accompFiles.push({ file: song.accompaniment, trackNumber: song.trackNumber, name: song.name, scriptPage: song.scriptPage });
    }
  }

  autoMatch();
  renderFileList(guideFileList, guideFiles, 'guide');
  renderFileList(accompFileList, accompFiles, 'accomp');
  updateSaveButton();

  navigateTo('upload');
}
