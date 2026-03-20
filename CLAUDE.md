# CLAUDE.md — GramLink Project Log

> This file tracks all changes, decisions, architecture, and tech used in GramLink.
> Updated as the project evolves.

---

## Project Overview

**GramLink** is a self-hosted Instagram video downloader.
- Paste any Instagram reel, post, or story link
- Backend extracts the video using `yt-dlp`
- User gets a direct MP4 download

**Status:** v1.0 — Initial build  
**Last updated:** 2025

---

## Architecture

```
User Browser
     │
     ▼
Netlify (Static)          Railway (Node.js Server)
┌─────────────┐           ┌──────────────────────────┐
│  index.html │  ──────►  │  server.js (Express)     │
│  (frontend) │  fetch()  │  /info    → yt-dlp dump  │
└─────────────┘           │  /download → yt-dlp pipe │
                          └──────────────────────────┘
```

- Frontend lives on **Netlify** (free static hosting)
- Backend lives on **Railway** (free Node.js container hosting)
- The two talk via HTTP — `API_BASE` in `index.html` points to the Railway URL

---

## Tech Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Frontend | HTML / CSS / JS | Vanilla | No framework needed |
| Typography | Bebas Neue | Google Fonts | Display headings |
| Typography | DM Sans | Google Fonts | Body text |
| Typography | DM Mono | Google Fonts | Labels, monospace |
| Backend | Node.js | ≥ 18.x | Runtime |
| Backend | Express | 4.18.x | HTTP server |
| Backend | cors | 2.8.x | Cross-origin requests |
| Video extraction | yt-dlp | latest | System binary, not npm |
| Frontend hosting | Netlify | — | Static deploy |
| Backend hosting | Railway | — | Container deploy |

---

## Project Structure

```
gramlink/
├── index.html      ← Full frontend (single file, no build step)
├── server.js       ← Express backend
├── package.json    ← Node dependencies
├── CLAUDE.md       ← This file
└── README.md       ← Setup instructions
```

---

## API Endpoints

### `GET /info?url=<instagram_url>`
Returns video metadata before download.

**Response:**
```json
{
  "title": "Video caption or title",
  "uploader": "@username",
  "duration": "0:30",
  "type": "Reel",
  "qualities": ["best", "720p", "480p"],
  "thumbnail": "https://...",
  "url": "https://www.instagram.com/reel/..."
}
```

**Errors:**
- `400` — Invalid or missing URL
- `422` — Private video, deleted, or login required
- `500` — yt-dlp parse failure

---

### `GET /download?url=<url>&quality=<quality>`
Streams MP4 directly to the browser as a file download.

**Quality options:** `best`, `1080p`, `720p`, `480p`

**Format selector logic:**
- `best` → `bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best`
- `720p` → `bestvideo[height<=720][ext=mp4]+bestaudio/best[height<=720]`
- etc.

Streams via `stdout` pipe — no temp files on disk.

---

### `GET /health`
Returns yt-dlp version. Useful for confirming the binary is installed on the server.

---

## Design System

**Color palette:**
| Token | Value | Usage |
|-------|-------|-------|
| `--black` | `#080808` | Page background |
| `--surface` | `#111111` | Card backgrounds |
| `--border` | `#222222` | Default borders |
| `--text-primary` | `#f0ede8` | Main text |
| `--text-secondary` | `#6b6b6b` | Muted labels |
| `--amber` | `#e8a830` | Accent color, CTAs |
| `--green` | `#27a360` | Success states |
| `--red` | `#c0392b` | Error states |

**Fonts:**
- Bebas Neue → Hero title, logo
- DM Mono → Labels, URL input, badges, buttons
- DM Sans (300/400/500) → Body, descriptions

**UI principles:**
- No rounded corners (border-radius: 2px only)
- Dark-first, no gradients on structural elements
- Amber as the single accent — used sparingly
- Monospace for all data/technical elements

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server listen port |

Frontend config (hardcoded in `index.html`):
| Constant | Default | Description |
|----------|---------|-------------|
| `API_BASE` | `http://localhost:3001` | Backend URL — **change this to Railway URL for production** |

---

## Known Limitations & Notes

- **Instagram rate-limits** scrapers. Heavy use may result in temporary IP blocks.
- **Private videos** cannot be downloaded without Instagram cookies. yt-dlp supports `--cookies` / `--cookies-from-browser` for authenticated downloads if needed later.
- **Stories** expire after 24 hours — link must be valid at download time.
- **Netlify Functions** were considered for the backend but rejected: yt-dlp is a system binary that can't run in Lambda-style serverless environments (no persistent filesystem, execution time limits, no binary support). Railway (Docker container) is the right fit.
- yt-dlp must be kept updated as Instagram frequently changes its API. Run `yt-dlp -U` periodically on the server.

---

## Changelog

### v1.3 — Audio Fix & Robust Download
- **Fixed: no audio on Instagram videos (again)** — format fallback chain previously included `bestvideo` (video-only) before `best` (combined). Removed that middle step. New chain: `bestvideo+bestaudio/best` — if streams can't be merged, fall back to best single combined stream (always has audio), never video-only.
- **Fixed: Pinterest downloads failing** — yt-dlp writes intermediate fragment files (`tmpBase.f123.mp4`, `tmpBase.f456.m4a`) before producing final output. Old code checked for `tmpFile` exactly; if the filename differed slightly it returned "file not found". New `findOutput()` function scans the temp dir for any file starting with the unique `tmpBase` prefix, prefers `.mp4`.
- **Fixed: Railway still running old code** — error message "Invalid or missing Instagram URL" confirmed old deploy was cached. Force clear build cache in Railway dashboard before deploying.
- Added `cleanup()` helper to delete all temp fragments on failure or disconnect.
- `fs` is now imported at top of file (was `require`d inline).
- Health endpoint now also reports ffmpeg version.
- `BASE_ARGS` constant shared between `/info` and `/download` routes.
- Updated user-agent to iOS 17.

### v1.2 — Pinterest Support
- Added Pinterest video download support
- Replaced `isInstagramUrl()` with `isSupportedUrl()` — validates against a list of supported hostnames including all Pinterest regional domains (`pinterest.com`, `pinterest.co.uk`, `pinterest.fr`, etc.) and short links (`pin.it`)
- Added `detectPlatform()` helper to distinguish Instagram vs Pinterest
- Updated `detectType()` to return `'Pin'` for Pinterest URLs
- `/info` response now includes a `platform` field (`'Instagram'` or `'Pinterest'`)
- Frontend URL validation updated to accept both platforms
- UI hints updated: "IG Reels", "IG Posts", "IG Stories", "Pinterest Pins"
- Hero eyebrow updated to "Instagram & Pinterest Video Downloader"
- Success card subtitle now shows correct platform name

### v1.1 — Download Fix
- **Fixed: no audio / unsupported format on downloaded videos**
  - Root cause 1: MP4 containers require seekable output (moov atom must be written at file start). Piping to stdout means ffmpeg can't seek back — file arrives broken or silent.
  - Root cause 2: Format selectors with `[ext=mp4]` were too strict — if Instagram served a different codec, the fallback picked video-only or WebM.
  - Fix: Download route now writes to a **temp file** first, streams the completed file back with correct `Content-Length`, then deletes it.
  - Fix: Loosened format selectors to `bestvideo+bestaudio/bestvideo/best` with `--remux-video mp4` — ffmpeg remuxes any input into valid MP4.
- Fixed Dockerfile: switched from `curl` binary download to `pip3 install yt-dlp` to avoid SSL cert failures on Railway.

### v1.0 — Initial Build
- Built full frontend (`index.html`) — dark editorial design with Bebas Neue, amber accents
- Built Express backend (`server.js`) with `/info`, `/download`, `/health` endpoints
- yt-dlp integration for metadata extraction and video streaming
- Quality selector auto-populated from available formats
- Three UI states: loading (animated progress), success (video info + download), error (descriptive message)
- CORS enabled for cross-origin frontend → backend requests
- Mobile responsive layout

---

## Future Ideas

- [ ] Cookie-based auth support (for private videos)
- [ ] Batch download (multiple URLs)
- [ ] Audio-only download option (MP3)
- [ ] Download history (localStorage)
- [ ] Netlify + Railway one-click deploy button
- [ ] Thumbnail preview before download
- [ ] yt-dlp auto-update cron on Railway