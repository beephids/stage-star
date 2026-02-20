# Local WaveSurfer Vendor Files

To fully remove third-party runtime script loading, place these files in this folder:

- `vendor/wavesurfer/wavesurfer.esm.js`
- `vendor/wavesurfer/regions.esm.js`

Expected source paths (version pinned in app fallback):

- `wavesurfer.js@7.8.11/dist/wavesurfer.esm.js`
- `wavesurfer.js@7.8.11/dist/plugins/regions.esm.js`

The player currently tries local files first, then falls back to pinned CDN URLs if local files are missing.
