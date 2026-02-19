import { getSong, getPerformance, updateSong } from './db.js';
import { navigateTo, announce } from './app.js';
import { showSongs } from './songs.js';

/* ── WaveSurfer dynamic import (ESM from CDN) ───────────── */

let WaveSurfer = null;
let RegionsPlugin = null;

async function loadWaveSurfer() {
  if (WaveSurfer) return;
  const ws = await import('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.esm.js');
  WaveSurfer = ws.default;
  const regions = await import('https://unpkg.com/wavesurfer.js@7/dist/plugins/regions.esm.js');
  RegionsPlugin = regions.default;
}

/* ── State ───────────────────────────────────────────────── */

let guideWaveSurfer = null;
let accompWaveSurfer = null;
let guideRegions = null;
let accompRegions = null;
let activeTrack = 'guide'; // 'guide' or 'accomp'
let currentSongData = null;
let guideUrl = null;
let accompUrl = null;
let isPlaying = false;
let isSeeking = false;

// A-B Loop
let loopStart = null;
let loopEnd = null;
let loopRegionGuide = null;
let loopRegionAccomp = null;
let loopPresets = [];

/* ── DOM Refs ────────────────────────────────────────────── */

const songTitle = document.getElementById('song-title');
const btnBackSongs = document.getElementById('btn-back-songs');
const btnPlay = document.getElementById('btn-play');
const btnSkipBack = document.getElementById('btn-skip-back');
const btnSkipForward = document.getElementById('btn-skip-forward');
const btnToggleGuide = document.getElementById('btn-toggle-guide');
const btnToggleAccomp = document.getElementById('btn-toggle-accomp');
const timeCurrent = document.getElementById('time-current');
const timeTotal = document.getElementById('time-total');
const waveformGuideEl = document.getElementById('waveform-guide');
const waveformAccompEl = document.getElementById('waveform-accomp');

// Script
const btnPlayerScript = document.getElementById('btn-player-script');

// Loop
const btnLoopStart = document.getElementById('btn-loop-start');
const btnLoopEnd = document.getElementById('btn-loop-end');
const btnLoopClear = document.getElementById('btn-loop-clear');
const btnSaveLoopPreset = document.getElementById('btn-save-loop-preset');
const loopPresetsList = document.getElementById('loop-presets-list');

/* ── Helpers ─────────────────────────────────────────────── */

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getActive() {
  return activeTrack === 'guide' ? guideWaveSurfer : accompWaveSurfer;
}

function getInactive() {
  return activeTrack === 'guide' ? accompWaveSurfer : guideWaveSurfer;
}

const LOOP_PRESET_TOLERANCE = 0.05;

function isValidLoopRange(start, end) {
  return start !== null && end !== null && !isNaN(start) && !isNaN(end) && start < end;
}

function roundLoopTime(seconds) {
  return Math.round(seconds * 100) / 100;
}

function normalizeLoopPresets(rawPresets) {
  if (!Array.isArray(rawPresets)) return [];

  return rawPresets
    .map((preset, i) => {
      const start = Number(preset?.start);
      const end = Number(preset?.end);
      if (!isFinite(start) || !isFinite(end) || start >= end) return null;
      return {
        id: preset?.id || `lp-${Date.now()}-${i}`,
        name: preset?.name || `Loop ${i + 1}`,
        start: roundLoopTime(start),
        end: roundLoopTime(end),
      };
    })
    .filter(Boolean);
}

function isLoopPresetActive(preset) {
  if (!isValidLoopRange(loopStart, loopEnd)) return false;
  return (
    Math.abs(loopStart - preset.start) <= LOOP_PRESET_TOLERANCE &&
    Math.abs(loopEnd - preset.end) <= LOOP_PRESET_TOLERANCE
  );
}

function getLoopPresetLabel(preset) {
  return `${preset.name} · ${formatTime(preset.start)} - ${formatTime(preset.end)}`;
}

function updateLoopPointLabels() {
  btnLoopStart.setAttribute(
    'aria-label',
    loopStart === null ? 'Set loop start' : `Loop start at ${formatTime(loopStart)}`
  );
  btnLoopEnd.setAttribute(
    'aria-label',
    loopEnd === null ? 'Set loop end' : `Loop end at ${formatTime(loopEnd)}`
  );
}

function updateLoopSaveButtonState() {
  if (!btnSaveLoopPreset) return;
  btnSaveLoopPreset.disabled = !currentSongData || !isValidLoopRange(loopStart, loopEnd);
}

function renderLoopPresets() {
  if (!loopPresetsList) return;

  if (!loopPresets.length) {
    loopPresetsList.innerHTML = '<p class="loop-preset-empty">No saved loops yet.</p>';
    return;
  }

  loopPresetsList.innerHTML = '';
  loopPresets.forEach((preset) => {
    const row = document.createElement('div');
    row.className = 'loop-preset-item';
    row.setAttribute('role', 'listitem');

    const selectBtn = document.createElement('button');
    selectBtn.type = 'button';
    selectBtn.className = `loop-preset-select${isLoopPresetActive(preset) ? ' active' : ''}`;
    selectBtn.dataset.loopPresetId = preset.id;
    selectBtn.textContent = getLoopPresetLabel(preset);
    selectBtn.setAttribute(
      'aria-label',
      `Apply ${preset.name}, from ${formatTime(preset.start)} to ${formatTime(preset.end)}`
    );

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'loop-preset-delete';
    delBtn.dataset.deleteLoopPreset = preset.id;
    delBtn.title = 'Delete loop preset';
    delBtn.setAttribute('aria-label', `Delete loop preset ${preset.name}`);
    delBtn.textContent = 'X';

    row.appendChild(selectBtn);
    row.appendChild(delBtn);
    loopPresetsList.appendChild(row);
  });
}

function applyLoopRange(start, end) {
  if (!isValidLoopRange(start, end)) return;

  loopStart = roundLoopTime(start);
  loopEnd = roundLoopTime(end);
  btnLoopStart.classList.add('loop-active');
  btnLoopEnd.classList.add('loop-active');
  btnLoopStart.textContent = '🅰️ ' + formatTime(loopStart);
  btnLoopEnd.textContent = '🅱️ ' + formatTime(loopEnd);
  updateLoopPointLabels();

  updateLoopRegions();
  updateLoopClearButton();
  updateLoopSaveButtonState();
  renderLoopPresets();
}

async function persistLoopPresets() {
  if (!currentSongData?.id) return;
  const updatedSong = {
    ...currentSongData,
    loopPresets: loopPresets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      start: preset.start,
      end: preset.end,
    })),
  };
  await updateSong(updatedSong);
  currentSongData = updatedSong;
}

function nextLoopPresetName() {
  let n = 1;
  while (loopPresets.some((p) => p.name === `Loop ${n}`)) n++;
  return `Loop ${n}`;
}

async function saveCurrentLoopPreset() {
  if (!isValidLoopRange(loopStart, loopEnd)) return;

  const roundedStart = roundLoopTime(loopStart);
  const roundedEnd = roundLoopTime(loopEnd);
  const duplicate = loopPresets.find((preset) =>
    Math.abs(preset.start - roundedStart) <= LOOP_PRESET_TOLERANCE &&
    Math.abs(preset.end - roundedEnd) <= LOOP_PRESET_TOLERANCE
  );
  if (duplicate) {
    applyLoopRange(duplicate.start, duplicate.end);
    announce(`Applied existing loop preset ${duplicate.name}.`);
    return;
  }

  const newPreset = {
    id: `lp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: nextLoopPresetName(),
    start: roundedStart,
    end: roundedEnd,
  };

  loopPresets = [...loopPresets, newPreset];
  try {
    await persistLoopPresets();
  } catch (err) {
    loopPresets = loopPresets.filter((preset) => preset.id !== newPreset.id);
    console.error('Failed to save loop preset:', err);
    alert('Could not save loop preset. Please try again.');
    return;
  }

  renderLoopPresets();
  announce(`Saved loop preset ${newPreset.name}.`);
}

async function deleteLoopPreset(presetId) {
  const removedPreset = loopPresets.find((preset) => preset.id === presetId);
  const previousPresets = loopPresets;
  loopPresets = loopPresets.filter((preset) => preset.id !== presetId);
  try {
    await persistLoopPresets();
    renderLoopPresets();
    if (removedPreset) announce(`Deleted loop preset ${removedPreset.name}.`);
  } catch (err) {
    loopPresets = previousPresets;
    console.error('Failed to delete loop preset:', err);
    alert('Could not delete loop preset. Please try again.');
  }
}

/* ── Sync ────────────────────────────────────────────────── */

function syncCursors() {
  if (isSeeking) return;
  const active = getActive();
  if (!active) return;

  const currentTime = active.getCurrentTime();
  const inactive = getInactive();

  if (inactive) {
    isSeeking = true;
    const dur = inactive.getDuration();
    if (dur > 0) {
      inactive.seekTo(currentTime / dur);
    }
    isSeeking = false;
  }

  timeCurrent.textContent = formatTime(currentTime);

  // A-B Loop: if we've passed the end, loop back to start
  if (loopStart !== null && loopEnd !== null && currentTime >= loopEnd) {
    seekBothTo(loopStart);
  }
}

function seekBothTo(timeInSeconds) {
  isSeeking = true;

  if (guideWaveSurfer) {
    const dur = guideWaveSurfer.getDuration();
    if (dur > 0) guideWaveSurfer.seekTo(Math.min(timeInSeconds / dur, 1));
  }
  if (accompWaveSurfer) {
    const dur = accompWaveSurfer.getDuration();
    if (dur > 0) accompWaveSurfer.seekTo(Math.min(timeInSeconds / dur, 1));
  }

  timeCurrent.textContent = formatTime(timeInSeconds);
  isSeeking = false;
}

/* ── Create WaveSurfer Instance ──────────────────────────── */

function createWaveSurfer(container, color, progressColor) {
  const regions = RegionsPlugin.create();

  const ws = WaveSurfer.create({
    container,
    waveColor: color,
    progressColor: progressColor,
    cursorColor: '#7c3aed',
    cursorWidth: 3,
    barWidth: 3,
    barGap: 2,
    barRadius: 3,
    height: 70,
    normalize: true,
    interact: true,
    hideScrollbar: true,
    plugins: [regions],
  });

  return { ws, regions };
}

/* ── Load Song ───────────────────────────────────────────── */

export async function loadSong(songId) {
  await loadWaveSurfer();

  const song = await getSong(songId);
  if (!song) return;

  currentSongData = song;
  songTitle.textContent = song.name;

  // Set up script button
  const performance = await getPerformance(song.performanceId);
  if (performance?.scriptPdf) {
    btnPlayerScript.classList.remove('hidden');
    btnPlayerScript.dataset.scriptPage = song.scriptPage || '1';
    btnPlayerScript.setAttribute('aria-hidden', 'false');
  } else {
    btnPlayerScript.classList.add('hidden');
    btnPlayerScript.setAttribute('aria-hidden', 'true');
  }

  // Cleanup previous
  cleanupWaveSurfers();

  // Create object URLs for blobs
  if (song.guideVocal) {
    const blob = song.guideVocal instanceof Blob
      ? song.guideVocal
      : new Blob([song.guideVocal]);
    guideUrl = URL.createObjectURL(blob);
  }

  if (song.accompaniment) {
    const blob = song.accompaniment instanceof Blob
      ? song.accompaniment
      : new Blob([song.accompaniment]);
    accompUrl = URL.createObjectURL(blob);
  }

  // Create wavesurfer instances
  if (guideUrl) {
    const result = createWaveSurfer(waveformGuideEl, '#f9a8d4', '#ec4899');
    guideWaveSurfer = result.ws;
    guideRegions = result.regions;
    guideWaveSurfer.load(guideUrl);

    guideWaveSurfer.on('ready', () => {
      timeTotal.textContent = formatTime(guideWaveSurfer.getDuration());
    });

    guideWaveSurfer.on('audioprocess', syncCursors);
    guideWaveSurfer.on('seeking', () => {
      if (activeTrack === 'guide') syncCursors();
    });
    guideWaveSurfer.on('interaction', () => {
      if (activeTrack !== 'guide') {
        // Clicked on inactive waveform — seek both
        const time = guideWaveSurfer.getCurrentTime();
        seekBothTo(time);
      } else {
        syncCursors();
      }
    });
    guideWaveSurfer.on('finish', handleFinish);
  }

  if (accompUrl) {
    const result = createWaveSurfer(waveformAccompEl, '#93c5fd', '#3b82f6');
    accompWaveSurfer = result.ws;
    accompRegions = result.regions;
    accompWaveSurfer.load(accompUrl);

    accompWaveSurfer.on('ready', () => {
      if (!guideWaveSurfer) {
        timeTotal.textContent = formatTime(accompWaveSurfer.getDuration());
      }
    });

    accompWaveSurfer.on('audioprocess', syncCursors);
    accompWaveSurfer.on('seeking', () => {
      if (activeTrack === 'accomp') syncCursors();
    });
    accompWaveSurfer.on('interaction', () => {
      if (activeTrack !== 'accomp') {
        const time = accompWaveSurfer.getCurrentTime();
        seekBothTo(time);
      } else {
        syncCursors();
      }
    });
    accompWaveSurfer.on('finish', handleFinish);
  }

  // Default to guide track if available
  activeTrack = guideUrl ? 'guide' : 'accomp';
  updateTrackToggleUI();
  updateMutedVisuals();
  resetLoop();
  loopPresets = normalizeLoopPresets(song.loopPresets);
  renderLoopPresets();
  updateLoopSaveButtonState();
  isPlaying = false;
  updatePlayButton();
  announce(`Loaded song ${song.name}.`);
}

function handleFinish() {
  if (loopStart !== null && loopEnd !== null) {
    seekBothTo(loopStart);
    getActive()?.play();
  } else {
    isPlaying = false;
    updatePlayButton();
  }
}

/* ── Play / Pause ────────────────────────────────────────── */

function togglePlay() {
  const active = getActive();
  if (!active) return;

  if (isPlaying) {
    active.pause();
    isPlaying = false;
  } else {
    // Make sure inactive is paused
    getInactive()?.pause();
    active.play();
    isPlaying = true;
  }

  updatePlayButton();
}

function updatePlayButton() {
  btnPlay.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
  btnPlay.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
  btnPlay.textContent = isPlaying ? '⏸️' : '▶️';
}

/* ── Track Toggle ────────────────────────────────────────── */

function switchTrack(track) {
  if (track === activeTrack) return;

  const wasPlaying = isPlaying;
  const currentTime = getActive()?.getCurrentTime() || 0;

  // Pause current
  getActive()?.pause();

  activeTrack = track;
  updateTrackToggleUI();
  updateMutedVisuals();

  // Seek new active to same position
  seekBothTo(currentTime);

  // Resume if was playing
  if (wasPlaying) {
    getActive()?.play();
    isPlaying = true;
  }

  updatePlayButton();
}

function updateTrackToggleUI() {
  btnToggleGuide.classList.toggle('active', activeTrack === 'guide');
  btnToggleAccomp.classList.toggle('active', activeTrack === 'accomp');
  btnToggleGuide.setAttribute('aria-pressed', activeTrack === 'guide' ? 'true' : 'false');
  btnToggleAccomp.setAttribute('aria-pressed', activeTrack === 'accomp' ? 'true' : 'false');

  // Hide toggle buttons if only one track exists
  btnToggleGuide.classList.toggle('hidden', !guideUrl);
  btnToggleAccomp.classList.toggle('hidden', !accompUrl);
  btnToggleGuide.setAttribute('aria-hidden', !guideUrl ? 'true' : 'false');
  btnToggleAccomp.setAttribute('aria-hidden', !accompUrl ? 'true' : 'false');
}

function updateMutedVisuals() {
  waveformGuideEl.classList.toggle('waveform-muted', activeTrack !== 'guide');
  waveformAccompEl.classList.toggle('waveform-muted', activeTrack !== 'accomp');
}

/* ── Skip ────────────────────────────────────────────────── */

function skipBack() {
  const active = getActive();
  if (!active) return;
  const newTime = Math.max(0, active.getCurrentTime() - 5);
  seekBothTo(newTime);
}

function skipForward() {
  const active = getActive();
  if (!active) return;
  const newTime = Math.min(active.getDuration(), active.getCurrentTime() + 5);
  seekBothTo(newTime);
}

/* ── A-B Loop ────────────────────────────────────────────── */

function setLoopStart() {
  const active = getActive();
  if (!active) return;
  loopStart = active.getCurrentTime();
  btnLoopStart.classList.add('loop-active');
  btnLoopStart.textContent = '🅰️ ' + formatTime(loopStart);

  if (loopEnd !== null) {
    // Ensure start < end
    if (loopStart >= loopEnd) {
      loopEnd = null;
      btnLoopEnd.classList.remove('loop-active');
      btnLoopEnd.textContent = '🅱️ End';
    }
  }

  updateLoopPointLabels();
  updateLoopRegions();
  updateLoopClearButton();
  updateLoopSaveButtonState();
  renderLoopPresets();
}

function setLoopEnd() {
  const active = getActive();
  if (!active) return;
  loopEnd = active.getCurrentTime();
  btnLoopEnd.classList.add('loop-active');
  btnLoopEnd.textContent = '🅱️ ' + formatTime(loopEnd);

  if (loopStart !== null && loopEnd <= loopStart) {
    loopStart = null;
    btnLoopStart.classList.remove('loop-active');
    btnLoopStart.textContent = '🅰️ Start';
  }

  updateLoopPointLabels();
  updateLoopRegions();
  updateLoopClearButton();
  updateLoopSaveButtonState();
  renderLoopPresets();
}

function clearLoop() {
  const hadLoop = isValidLoopRange(loopStart, loopEnd);
  resetLoop();
  updateLoopRegions();
  if (hadLoop) announce('Cleared loop.');
}

function resetLoop() {
  loopStart = null;
  loopEnd = null;
  updateLoopPointLabels();
  btnLoopStart.classList.remove('loop-active');
  btnLoopEnd.classList.remove('loop-active');
  btnLoopStart.textContent = '🅰️ Start';
  btnLoopEnd.textContent = '🅱️ End';
  updateLoopClearButton();
  removeLoopRegions();
  updateLoopSaveButtonState();
  renderLoopPresets();
}

function updateLoopClearButton() {
  btnLoopClear.classList.toggle('hidden', loopStart === null && loopEnd === null);
  btnLoopClear.setAttribute('aria-hidden', loopStart === null && loopEnd === null ? 'true' : 'false');
}

function updateLoopRegions() {
  removeLoopRegions();

  if (loopStart === null || loopEnd === null) return;
  if (loopStart >= loopEnd) return;

  const regionOptions = {
    start: loopStart,
    end: loopEnd,
    color: 'rgba(245, 158, 11, 0.18)',
    drag: true,
    resize: true,
  };

  if (guideRegions) {
    loopRegionGuide = guideRegions.addRegion(regionOptions);
    loopRegionGuide.on('update-end', () => {
      loopStart = loopRegionGuide.start;
      loopEnd = loopRegionGuide.end;
      updateLoopPointLabels();
      btnLoopStart.textContent = '🅰️ ' + formatTime(loopStart);
      btnLoopEnd.textContent = '🅱️ ' + formatTime(loopEnd);
      syncLoopRegion('guide');
      updateLoopSaveButtonState();
      renderLoopPresets();
    });
  }

  if (accompRegions) {
    loopRegionAccomp = accompRegions.addRegion(regionOptions);
    loopRegionAccomp.on('update-end', () => {
      loopStart = loopRegionAccomp.start;
      loopEnd = loopRegionAccomp.end;
      updateLoopPointLabels();
      btnLoopStart.textContent = '🅰️ ' + formatTime(loopStart);
      btnLoopEnd.textContent = '🅱️ ' + formatTime(loopEnd);
      syncLoopRegion('accomp');
      updateLoopSaveButtonState();
      renderLoopPresets();
    });
  }
}

function syncLoopRegion(source) {
  // When one region is dragged, update the other
  if (source === 'guide' && loopRegionAccomp) {
    loopRegionAccomp.setOptions({ start: loopStart, end: loopEnd });
  } else if (source === 'accomp' && loopRegionGuide) {
    loopRegionGuide.setOptions({ start: loopStart, end: loopEnd });
  }
}

function removeLoopRegions() {
  if (loopRegionGuide) {
    loopRegionGuide.remove();
    loopRegionGuide = null;
  }
  if (loopRegionAccomp) {
    loopRegionAccomp.remove();
    loopRegionAccomp = null;
  }
}

/* ── Cleanup ─────────────────────────────────────────────── */

function cleanupWaveSurfers() {
  if (guideWaveSurfer) {
    guideWaveSurfer.destroy();
    guideWaveSurfer = null;
    guideRegions = null;
  }
  if (accompWaveSurfer) {
    accompWaveSurfer.destroy();
    accompWaveSurfer = null;
    accompRegions = null;
  }
  if (guideUrl) {
    URL.revokeObjectURL(guideUrl);
    guideUrl = null;
  }
  if (accompUrl) {
    URL.revokeObjectURL(accompUrl);
    accompUrl = null;
  }

  waveformGuideEl.innerHTML = '';
  waveformAccompEl.innerHTML = '';

  loopRegionGuide = null;
  loopRegionAccomp = null;
}

export function destroyPlayer() {
  if (isPlaying) {
    getActive()?.pause();
    isPlaying = false;
  }
  cleanupWaveSurfers();
  resetLoop();
  loopPresets = [];
  renderLoopPresets();
  updateLoopSaveButtonState();
  timeCurrent.textContent = '0:00';
  timeTotal.textContent = '0:00';
  updatePlayButton();
}

/* ── Script Viewer ───────────────────────────────────────── */

async function openScriptFromPlayer() {
  if (!currentSongData?.performanceId) return;

  // Open the tab immediately in the user gesture to avoid popup blocking.
  const scriptTab = window.open('about:blank', '_blank');
  const performance = await getPerformance(currentSongData.performanceId);
  if (!performance?.scriptPdf) {
    if (scriptTab) scriptTab.close();
    return;
  }

  const blob = performance.scriptPdf instanceof Blob
    ? performance.scriptPdf
    : new Blob([performance.scriptPdf], { type: 'application/pdf' });

  const scriptObjectUrl = URL.createObjectURL(blob);
  const page = currentSongData.scriptPage || 1;
  const scriptUrl = `${scriptObjectUrl}#page=${page}`;
  if (scriptTab) {
    scriptTab.location.href = scriptUrl;
  } else {
    window.open(scriptUrl, '_blank');
  }
  announce('Opened script in a new tab.');
}

/* ── Init ────────────────────────────────────────────────── */

export function initPlayer() {
  btnPlay.addEventListener('click', togglePlay);
  btnSkipBack.addEventListener('click', skipBack);
  btnSkipForward.addEventListener('click', skipForward);

  btnToggleGuide.addEventListener('click', () => switchTrack('guide'));
  btnToggleAccomp.addEventListener('click', () => switchTrack('accomp'));

  btnLoopStart.addEventListener('click', setLoopStart);
  btnLoopEnd.addEventListener('click', setLoopEnd);
  btnLoopClear.addEventListener('click', clearLoop);
  if (btnSaveLoopPreset) {
    btnSaveLoopPreset.addEventListener('click', saveCurrentLoopPreset);
  }
  if (loopPresetsList) {
    loopPresetsList.addEventListener('click', async (e) => {
      const delBtn = e.target.closest('[data-delete-loop-preset]');
      if (delBtn) {
        const presetId = delBtn.dataset.deleteLoopPreset;
        if (presetId) {
          await deleteLoopPreset(presetId);
        }
        return;
      }

      const selectBtn = e.target.closest('[data-loop-preset-id]');
      if (selectBtn) {
        const presetId = selectBtn.dataset.loopPresetId;
        const preset = loopPresets.find((p) => p.id === presetId);
        if (preset) {
          applyLoopRange(preset.start, preset.end);
          announce(`Applied loop preset ${preset.name}.`);
        }
      }
    });
  }

  // Script viewer from player
  btnPlayerScript.addEventListener('click', openScriptFromPlayer);

  btnBackSongs.addEventListener('click', () => {
    if (currentSongData?.performanceId) {
      showSongs(currentSongData.performanceId);
    } else {
      navigateTo('home');
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Only when player screen is active
    if (!document.getElementById('screen-player').classList.contains('active')) return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        skipBack();
        break;
      case 'ArrowRight':
        e.preventDefault();
        skipForward();
        break;
    }
  });

  renderLoopPresets();
  updateLoopSaveButtonState();
  updateLoopPointLabels();
}

