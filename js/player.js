import { getSong, getPerformance } from './db.js';
import { navigateTo } from './app.js';
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
  } else {
    btnPlayerScript.classList.add('hidden');
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
  isPlaying = false;
  updatePlayButton();
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

  // Hide toggle buttons if only one track exists
  btnToggleGuide.classList.toggle('hidden', !guideUrl);
  btnToggleAccomp.classList.toggle('hidden', !accompUrl);
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

  updateLoopRegions();
  updateLoopClearButton();
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

  updateLoopRegions();
  updateLoopClearButton();
}

function clearLoop() {
  resetLoop();
  updateLoopRegions();
}

function resetLoop() {
  loopStart = null;
  loopEnd = null;
  btnLoopStart.classList.remove('loop-active');
  btnLoopEnd.classList.remove('loop-active');
  btnLoopStart.textContent = '🅰️ Start';
  btnLoopEnd.textContent = '🅱️ End';
  updateLoopClearButton();
  removeLoopRegions();
}

function updateLoopClearButton() {
  btnLoopClear.classList.toggle('hidden', loopStart === null && loopEnd === null);
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
      btnLoopStart.textContent = '🅰️ ' + formatTime(loopStart);
      btnLoopEnd.textContent = '🅱️ ' + formatTime(loopEnd);
      syncLoopRegion('guide');
    });
  }

  if (accompRegions) {
    loopRegionAccomp = accompRegions.addRegion(regionOptions);
    loopRegionAccomp.on('update-end', () => {
      loopStart = loopRegionAccomp.start;
      loopEnd = loopRegionAccomp.end;
      btnLoopStart.textContent = '🅰️ ' + formatTime(loopStart);
      btnLoopEnd.textContent = '🅱️ ' + formatTime(loopEnd);
      syncLoopRegion('accomp');
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
}

