# GramLink

A clean, self-hosted Instagram video downloader.

## Setup

### 1. Install yt-dlp

**macOS (Homebrew):**
```bash
brew install yt-dlp
```

**Linux:**
```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

**Windows:**
Download the `.exe` from https://github.com/yt-dlp/yt-dlp/releases and add it to your PATH.

### 2. Install Node dependencies

```bash
npm install
```

### 3. Start the server

```bash
npm start
```

The server runs on **http://localhost:3001** and serves the frontend at the same address.

---

## API

| Endpoint | Description |
|----------|-------------|
| `GET /info?url=...` | Returns video metadata (title, uploader, duration, qualities) |
| `GET /download?url=...&quality=best` | Streams the MP4 directly |
| `GET /health` | Returns yt-dlp version and server status |

### Quality options
`best`, `1080p`, `720p`, `480p`

---

## Deploying

To host publicly (e.g. on Railway, Render, or a VPS):
1. Set the `PORT` environment variable if needed
2. Ensure `yt-dlp` is available in the system PATH
3. Update `API_BASE` in `index.html` to your server's public URL

> **Note:** Instagram aggressively rate-limits scrapers. For heavy use, consider rotating user-agents or adding cookie-based auth via yt-dlp's `--cookies` flag.

---

## Disclaimer

For personal use only. Downloading content you don't own may violate Instagram's Terms of Service. Respect creators' work.