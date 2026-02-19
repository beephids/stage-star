# Stage Star

Stage Star is a browser-based rehearsal app for performance tracks.  
It lets you organize shows ("performances"), load guide-vocal and accompaniment audio, and rehearse songs with fast A/B looping.

The app is fully client-side and stores data in the browser (IndexedDB). No backend is required.

## What it does

- Create and manage performance projects
- Import optional script PDF files per performance
- Import guide-vocal and accompaniment tracks (files or folders)
- Auto-match tracks by filename pattern (`01 Song Name.mp3`, `01_Song_Name.wav`, etc.)
- Edit an existing performance in the same setup screen used for creation
- Open script PDFs in a new tab
- Favorite songs and surface them as shortcuts above the full song list
- Guide-vocal/accompaniment switching
- 5-second skip controls
- A/B looping with draggable loop regions
- Saved loop presets per song (apply/delete)
- Keyboard playback shortcuts on player screen
- Basic screen reader accessibility and live announcements
- Offline-friendly behavior via service worker caching

## Quick start

### Option 1: Python (recommended)

From the project root:

```bash
python -m http.server 5500
```

Open:

```text
http://localhost:5500
```

### Option 2: Any static server

Use any static server you prefer (for example VS Code Live Server, `npx serve`, etc.).

## App flow

### Home screen

- View existing performances
- Add a new performance
- Delete a performance

### Performance songs screen

- View songs for a performance
- Open script PDF (if available)
- Edit performance (opens setup screen pre-filled)
- Delete performance
- Favorite/unfavorite songs

### Player screen

- Play/pause and skip controls
- Toggle between guide-vocal and accompaniment
- Set loop start/end, clear loop
- Save loop presets
- Apply or delete saved loop presets
- Open script at the configured page

### Setup screen (new or edit)

- Name the performance
- Add optional script PDF
- Add guide and accompaniment tracks
- Review and edit auto-matched songs
- Assign script page per song
- Save

## Filename conventions for best auto-match results

The matcher works best when filenames begin with a track number:

- `01 Opening Number.mp3`
- `01_Opening_Number.wav`
- `01-Opening Number.m4a`

If a filename does not parse, it is still accepted but treated as track number `0`.

## Data model and storage

All data is local to the browser in IndexedDB database `StageStar`.

Object stores:

- `performances`
- `songs` (indexed by `performanceId`)

Song records include:

- `performanceId`
- `trackNumber`
- `name`
- `guideVocal` (Blob)
- `accompaniment` (Blob)
- `scriptPage` (nullable)
- `isFavorite` (boolean)
- `loopPresets` (array)

Notes:

- Audio and PDFs are persisted in-browser only.
- Clearing site data or using a different browser/profile will remove/lose app data.
- A migration path exists from legacy `musicals` naming to `performances`.

## Demo content

On first launch, if no performances exist, the app seeds:

- `Demo Performance`
- One demo track (`Welcome Number`) with guide/accompaniment audio from `assets/`

See `assets/attribution.md` for asset credits.

## Keyboard shortcuts (player screen)

- `Space`: play/pause
- `Left Arrow`: skip back 5 seconds
- `Right Arrow`: skip forward 5 seconds

## Accessibility

Implemented accessibility support includes:

- Skip link to main content
- Screen-reader live region announcements
- Focus management when navigating between app screens
- Keyboard activation for interactive cards (Enter/Space)
- ARIA labels/states for dynamic controls (favorites, play state, loop presets, etc.)

## Offline and caching

The service worker (`sw.js`) caches app assets for offline use.

Important behavior:

- Navigation requests use network-first strategy (so updated HTML shows quickly)
- Static assets and CDN resources are cached for performance/offline fallback

When making UI changes during development, hard refresh if needed.

## Troubleshooting

### I changed code but still see old UI

1. Hard refresh (`Ctrl+Shift+R` / `Cmd+Shift+R`)
2. If still stale: open DevTools -> Application -> Service Workers -> Unregister
3. Reload the page

### Loop preset controls are missing

- Confirm you are on the player screen under loop controls
- Ensure latest `index.html` is loaded (see cache steps above)

### Large audio imports fail or feel slow

- Browser storage quotas vary
- Use smaller/compressed files where possible

## Project structure

```text
.
|-- index.html
|-- css/
|   `-- styles.css
|-- js/
|   |-- app.js
|   |-- db.js
|   |-- songs.js
|   |-- player.js
|   `-- upload.js
|-- assets/
|   |-- attribution.md
|   |-- sound4stock-demo-WITH_VOICE.mp3
|   `-- sound4stock-demo-NO_VOICE.mp3
|-- sw.js
|-- manifest.json
`-- README.md
```

## Tech stack

- Vanilla HTML/CSS/JavaScript (ES modules)
- IndexedDB for persistence
- WaveSurfer.js (CDN ESM import) for waveform playback/regions
- Service Worker + Web App Manifest for install/offline behavior

## License

See `LICENSE`.
