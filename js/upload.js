import { addPerformance, addSong, getPerformance, getSongsByPerformance, deleteSong, updatePerformance } from './db.js';
import { navigateTo, showLoading, hideLoading, announce } from './app.js';
import { showHome, showSongs } from './songs.js';

/* ── State ───────────────────────────────────────────────── */

let editingPerformanceId = null; // null = creating new, string = editing existing
let scriptFile = null;
let guideFiles = [];   // Array of { file, trackNumber, name }
let accompFiles = [];  // Array of { file, trackNumber, name }
let matchedSongs = []; // Array of { trackNumber, name, guide, accomp }

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aif', '.aiff', '.ogg', '.flac', '.wma', '.aac']);
const MAX_SCRIPT_PDF_BYTES = 30 * 1024 * 1024;
const MAX_AUDIO_FILE_BYTES = 150 * 1024 * 1024;
const MAX_AUDIO_TOTAL_BYTES = 1024 * 1024 * 1024;

/* ── DOM Refs ────────────────────────────────────────────── */

const inputName = document.getElementById('input-performance-name');
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
const btnSave = document.getElementById('btn-save-performance');
const btnBackUpload = document.getElementById('btn-back-upload');

/* ── HTML Escape ─────────────────────────────────────────── */

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function getFileExtension(filename) {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx++;
  }
  const fixed = value >= 100 || unitIdx === 0 ? 0 : 1;
  return `${value.toFixed(fixed)} ${units[unitIdx]}`;
}

function getFileSize(file) {
  return Number(file?.size) || 0;
}

function getAudioTotalBytes() {
  const guideBytes = guideFiles.reduce((sum, item) => sum + getFileSize(item.file), 0);
  const accompBytes = accompFiles.reduce((sum, item) => sum + getFileSize(item.file), 0);
  return guideBytes + accompBytes;
}

function validateScriptPdfFile(file) {
  if (!file) return { valid: false, message: 'No script file selected.' };

  const ext = getFileExtension(file.name || '');
  const mime = String(file.type || '').toLowerCase();
  const isPdfExt = ext === '.pdf';
  const isPdfMime = !mime || mime === 'application/pdf' || mime.endsWith('/pdf');
  if (!isPdfExt || !isPdfMime) {
    return { valid: false, message: 'Script must be a PDF file.' };
  }
  if (getFileSize(file) > MAX_SCRIPT_PDF_BYTES) {
    return {
      valid: false,
      message: `Script PDF is too large. Max size is ${formatBytes(MAX_SCRIPT_PDF_BYTES)}.`,
    };
  }

  return { valid: true, message: '' };
}

function validateAudioFileType(file) {
  const ext = getFileExtension(file.name || '');
  const mime = String(file.type || '').toLowerCase();
  if (!AUDIO_EXTENSIONS.has(ext)) return false;
  if (mime && !mime.startsWith('audio/')) return false;
  return true;
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
 * Filters to supported audio files only.
 */
function parseAudioFiles(files) {
  const parsed = [];
  const rejectedUnsupported = [];

  for (const file of files) {
    if (!validateAudioFileType(file)) {
      rejectedUnsupported.push(file.name || 'unnamed file');
      continue;
    }

    const fileMeta = parseFilename(file.name);
    if (fileMeta) {
      parsed.push({ file, trackNumber: fileMeta.trackNumber, name: fileMeta.name });
    } else {
      // Use full filename as name, no track number
      const name = file.name.replace(/\.[^.]+$/, '').trim();
      parsed.push({ file, trackNumber: 0, name });
    }
  }

  // Sort by track number
  parsed.sort((a, b) => a.trackNumber - b.trackNumber);
  return { parsed, rejectedUnsupported };
}

/* ── Auto-Match ──────────────────────────────────────────── */

function autoMatch() {
  // Preserve existing scriptPage values by track number
  const existingPages = new Map();
  const existingFavorites = new Map();
  const existingLoopPresets = new Map();
  for (const s of matchedSongs) {
    if (s.scriptPage) existingPages.set(s.trackNumber, s.scriptPage);
    if (s.isFavorite) existingFavorites.set(s.trackNumber, true);
    if (Array.isArray(s.loopPresets) && s.loopPresets.length > 0) {
      existingLoopPresets.set(s.trackNumber, s.loopPresets);
    }
  }

  const matched = new Map(); // trackNumber -> { trackNumber, name, guide, accomp, scriptPage, isFavorite, loopPresets }

  // Add guide tracks
  for (const g of guideFiles) {
    const key = g.trackNumber || `g_${g.name}`;
    if (!matched.has(key)) {
      matched.set(key, {
        trackNumber: g.trackNumber,
        name: g.name,
        guide: g.file,
        accomp: null,
        scriptPage: existingPages.get(g.trackNumber) || g.scriptPage || null,
        isFavorite: existingFavorites.get(g.trackNumber) || g.isFavorite || false,
        loopPresets: existingLoopPresets.get(g.trackNumber) || g.loopPresets || [],
      });
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
      matched.set(key, {
        trackNumber: a.trackNumber,
        name: a.name,
        guide: null,
        accomp: a.file,
        scriptPage: existingPages.get(a.trackNumber) || a.scriptPage || null,
        isFavorite: existingFavorites.get(a.trackNumber) || a.isFavorite || false,
        loopPresets: existingLoopPresets.get(a.trackNumber) || a.loopPresets || [],
      });
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
      <button class="file-item-remove" type="button" data-type="${type}" data-index="${i}" title="Remove" aria-label="Remove ${esc(fileName)}">✕</button>
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
    const trackLabel = song.trackNumber ? `track ${song.trackNumber}` : `song ${i + 1}`;

    const div = document.createElement('div');
    div.className = `matched-item ${isComplete ? '' : 'unmatched'}`;
    div.innerHTML = `
      <span class="matched-number">#${song.trackNumber || '?'}</span>
      <span class="matched-name">
        <input type="text" value="${esc(song.name)}" data-index="${i}" class="matched-name-input" aria-label="Song name for ${trackLabel}">
      </span>
      <span class="matched-page">
        <input type="number" value="${song.scriptPage || ''}" data-index="${i}" class="matched-page-input" placeholder="📜 Pg" min="1" title="Script page number" aria-label="Script page for ${trackLabel}" inputmode="numeric">
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

function notifyAudioValidationIssues(sourceLabel, unsupportedCount, oversizedCount, overTotalCount) {
  const issues = [];
  if (unsupportedCount > 0) issues.push(`${unsupportedCount} unsupported type${unsupportedCount === 1 ? '' : 's'}`);
  if (oversizedCount > 0) {
    issues.push(
      `${oversizedCount} file${oversizedCount === 1 ? '' : 's'} over ${formatBytes(MAX_AUDIO_FILE_BYTES)} each`
    );
  }
  if (overTotalCount > 0) {
    issues.push(
      `${overTotalCount} file${overTotalCount === 1 ? '' : 's'} exceeding ${formatBytes(MAX_AUDIO_TOTAL_BYTES)} total`
    );
  }

  if (!issues.length) return;
  const message = `${sourceLabel}: ${issues.join('; ')}.`;
  alert(message);
  announce(message);
}

function setScriptFileIfValid(file) {
  const validation = validateScriptPdfFile(file);
  if (!validation.valid) {
    alert(validation.message);
    announce(validation.message);
    return false;
  }

  scriptFile = file;
  scriptFileName.textContent = 'PDF ' + scriptFile.name;
  announce(`Selected script file ${scriptFile.name}.`);
  return true;
}

export function initUpload() {
  // Back button
  btnBackUpload.addEventListener('click', () => {
    if (editingPerformanceId) {
      showSongs(editingPerformanceId);
    } else {
      showHome();
    }
  });

  // Performance name input
  inputName.addEventListener('input', updateSaveButton);

  // Script upload
  inputScript.addEventListener('change', () => {
    const files = getFilesFromInput(inputScript);
    if (files.length > 0) {
      const ok = setScriptFileIfValid(files[0]);
      if (!ok) inputScript.value = '';
    }
  });

  setupDropZone(dropZoneScript, (files) => {
    const pdf = files.find((f) => getFileExtension(f.name || '') === '.pdf');
    if (pdf) {
      setScriptFileIfValid(pdf);
    } else if (files.length > 0) {
      const message = 'Script must be a PDF file.';
      alert(message);
      announce(message);
    }
  });

  // Guide vocals upload
  const handleGuideFiles = (files) => {
    const { parsed, rejectedUnsupported } = parseAudioFiles(files);
    let rejectedOversized = 0;
    let rejectedOverTotal = 0;
    let acceptedCount = 0;

    // Merge, replacing duplicates by track number
    for (const p of parsed) {
      const size = getFileSize(p.file);
      if (size > MAX_AUDIO_FILE_BYTES) {
        rejectedOversized++;
        continue;
      }

      const existingIdx = guideFiles.findIndex(g => g.trackNumber === p.trackNumber && p.trackNumber > 0);
      const replacedSize = existingIdx >= 0 ? getFileSize(guideFiles[existingIdx].file) : 0;
      const projectedTotal = getAudioTotalBytes() - replacedSize + size;
      if (projectedTotal > MAX_AUDIO_TOTAL_BYTES) {
        rejectedOverTotal++;
        continue;
      }

      if (existingIdx >= 0) {
        guideFiles[existingIdx] = p;
      } else {
        guideFiles.push(p);
      }
      acceptedCount++;
    }

    guideFiles.sort((a, b) => a.trackNumber - b.trackNumber);
    renderFileList(guideFileList, guideFiles, 'guide');
    autoMatch();
    if (acceptedCount > 0) {
      announce('Added ' + acceptedCount + ' guide track' + (acceptedCount === 1 ? '' : 's') + '.');
    }
    notifyAudioValidationIssues('Guide upload', rejectedUnsupported.length, rejectedOversized, rejectedOverTotal);
  };

  inputGuideFiles.addEventListener('change', () => handleGuideFiles(getFilesFromInput(inputGuideFiles)));
  inputGuideFolder.addEventListener('change', () => handleGuideFiles(getFilesFromInput(inputGuideFolder)));
  document.getElementById('btn-browse-guide-files').addEventListener('click', () => inputGuideFiles.click());
  document.getElementById('btn-browse-guide-folder').addEventListener('click', () => inputGuideFolder.click());
  setupDropZone(dropZoneGuide, handleGuideFiles);

  // Accompaniment upload
  const handleAccompFiles = (files) => {
    const { parsed, rejectedUnsupported } = parseAudioFiles(files);
    let rejectedOversized = 0;
    let rejectedOverTotal = 0;
    let acceptedCount = 0;

    for (const p of parsed) {
      const size = getFileSize(p.file);
      if (size > MAX_AUDIO_FILE_BYTES) {
        rejectedOversized++;
        continue;
      }

      const existingIdx = accompFiles.findIndex(a => a.trackNumber === p.trackNumber && p.trackNumber > 0);
      const replacedSize = existingIdx >= 0 ? getFileSize(accompFiles[existingIdx].file) : 0;
      const projectedTotal = getAudioTotalBytes() - replacedSize + size;
      if (projectedTotal > MAX_AUDIO_TOTAL_BYTES) {
        rejectedOverTotal++;
        continue;
      }

      if (existingIdx >= 0) {
        accompFiles[existingIdx] = p;
      } else {
        accompFiles.push(p);
      }
      acceptedCount++;
    }

    accompFiles.sort((a, b) => a.trackNumber - b.trackNumber);
    renderFileList(accompFileList, accompFiles, 'accomp');
    autoMatch();
    if (acceptedCount > 0) {
      announce('Added ' + acceptedCount + ' accompaniment track' + (acceptedCount === 1 ? '' : 's') + '.');
    }
    notifyAudioValidationIssues('Accompaniment upload', rejectedUnsupported.length, rejectedOversized, rejectedOverTotal);
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
      const removed = guideFiles[idx];
      guideFiles.splice(idx, 1);
      renderFileList(guideFileList, guideFiles, 'guide');
      if (removed) announce(`Removed guide track ${removed.name}.`);
    } else {
      const removed = accompFiles[idx];
      accompFiles.splice(idx, 1);
      renderFileList(accompFileList, accompFiles, 'accomp');
      if (removed) announce(`Removed accompaniment track ${removed.name}.`);
    }
    autoMatch();
  });

  // Save
  btnSave.addEventListener('click', handleSave);
}

/* ── Save Performance ────────────────────────────────────────── */

async function handleSave() {
  const name = inputName.value.trim();
  if (!name) return;
  if (scriptFile) {
    const scriptValidation = validateScriptPdfFile(scriptFile);
    if (!scriptValidation.valid) {
      alert(scriptValidation.message);
      announce(scriptValidation.message);
      return;
    }
  }

  showLoading('Saving your performance...');

  try {
    let performanceId;

    if (editingPerformanceId) {
      // Update existing
      const existing = await getPerformance(editingPerformanceId);
      existing.name = name;
      if (scriptFile) existing.scriptPdf = scriptFile;
      await updatePerformance(existing);
      performanceId = editingPerformanceId;

      // Delete old songs and re-add
      const oldSongs = await getSongsByPerformance(performanceId);
      for (const s of oldSongs) await deleteSong(s.id);
    } else {
      // Create new
      const performance = await addPerformance(name, scriptFile);
      performanceId = performance.id;
    }

    // Save each matched song
    for (const song of matchedSongs) {
      if (!song.guide && !song.accomp) continue;
      await addSong(
        performanceId,
        song.trackNumber,
        song.name,
        song.guide,
        song.accomp,
        song.scriptPage || null,
        song.isFavorite || false,
        song.loopPresets || []
      );
    }

    resetUploadState();
    showSongs(performanceId);
    announce('Performance saved.');
  } catch (err) {
    console.error('Save failed:', err);
    alert('Failed to save. Please try again.');
  }

  hideLoading();
}

/* ── Reset ───────────────────────────────────────────────── */

function resetUploadState() {
  editingPerformanceId = null;
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
  announce('Opened performance setup.');
}

export async function openUploadEdit(performanceId) {
  resetUploadState();
  editingPerformanceId = performanceId;

  const performance = await getPerformance(performanceId);
  if (performance) {
    inputName.value = performance.name;
  }

  // Load existing songs to show as matched
  const songs = await getSongsByPerformance(performanceId);
  for (const song of songs) {
    if (song.guideVocal) {
      guideFiles.push({
        file: song.guideVocal,
        trackNumber: song.trackNumber,
        name: song.name,
        scriptPage: song.scriptPage,
        isFavorite: !!song.isFavorite,
        loopPresets: Array.isArray(song.loopPresets) ? song.loopPresets : [],
      });
    }
    if (song.accompaniment) {
      accompFiles.push({
        file: song.accompaniment,
        trackNumber: song.trackNumber,
        name: song.name,
        scriptPage: song.scriptPage,
        isFavorite: !!song.isFavorite,
        loopPresets: Array.isArray(song.loopPresets) ? song.loopPresets : [],
      });
    }
  }

  autoMatch();
  renderFileList(guideFileList, guideFiles, 'guide');
  renderFileList(accompFileList, accompFiles, 'accomp');
  updateSaveButton();

  navigateTo('upload');
  announce('Opened performance editor.');
}

