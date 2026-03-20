/**
 * GramLink — Backend Server
 * Requires: Node.js 18+, yt-dlp installed on system
 *
 * Install deps:  npm install
 * Install yt-dlp: https://github.com/yt-dlp/yt-dlp#installation
 * Start server:  node server.js
 */

const express = require('express');
const cors = require('cors');
const { execFile, spawn } = require('child_process');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve the frontend from the same folder
app.use(express.static(path.join(__dirname)));

// ── Helpers ───────────────────────────────────────────────────────────────────
function isInstagramUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname === 'www.instagram.com' || u.hostname === 'instagram.com';
  } catch {
    return false;
  }
}

function formatDuration(seconds) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function detectType(url) {
  if (url.includes('/reel/')) return 'Reel';
  if (url.includes('/stories/')) return 'Story';
  if (url.includes('/p/')) return 'Post';
  return 'Video';
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /info?url=...
 * Returns video metadata (title, uploader, duration, available qualities)
 */
app.get('/info', (req, res) => {
  const { url } = req.query;

  if (!url || !isInstagramUrl(url)) {
    return res.status(400).json({ error: 'Invalid or missing Instagram URL.' });
  }

  const args = [
    '--dump-json',
    '--no-playlist',
    '--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    url
  ];

  execFile('yt-dlp', args, { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('[yt-dlp error]', stderr || err.message);
      const msg = stderr?.includes('Private') || stderr?.includes('login')
        ? 'This video is private or requires a login.'
        : 'Could not extract video. It may have been deleted or is unavailable.';
      return res.status(422).json({ error: msg });
    }

    try {
      const info = JSON.parse(stdout);

      // Build quality options from available formats
      const qualitySet = new Set(['best']);
      if (info.formats) {
        info.formats.forEach(f => {
          if (f.height) {
            if (f.height >= 1080) qualitySet.add('1080p');
            else if (f.height >= 720) qualitySet.add('720p');
            else if (f.height >= 480) qualitySet.add('480p');
          }
        });
      }

      return res.json({
        title: info.title || info.description?.slice(0, 60) || 'Instagram Video',
        uploader: info.uploader || info.channel || '@unknown',
        duration: formatDuration(info.duration),
        type: detectType(url),
        qualities: [...qualitySet],
        thumbnail: info.thumbnail || null,
        url: info.webpage_url || url,
      });
    } catch (parseErr) {
      return res.status(500).json({ error: 'Failed to parse video data.' });
    }
  });
});

/**
 * GET /download?url=...&quality=...
 * Downloads to a temp file (required for MP4 moov atom), streams back, then deletes.
 */
app.get('/download', (req, res) => {
  const { url, quality = 'best' } = req.query;

  if (!url || !isInstagramUrl(url)) {
    return res.status(400).json({ error: 'Invalid or missing Instagram URL.' });
  }

  // Format selectors: always request best video+audio and remux to mp4
  // Fallback chain handles cases where ext=mp4 isn't available
  const formatMap = {
    best:    'bestvideo+bestaudio/bestvideo/best',
    '1080p': 'bestvideo[height<=1080]+bestaudio/bestvideo[height<=1080]/best[height<=1080]',
    '720p':  'bestvideo[height<=720]+bestaudio/bestvideo[height<=720]/best[height<=720]',
    '480p':  'bestvideo[height<=480]+bestaudio/bestvideo[height<=480]/best[height<=480]',
  };

  const formatSelector = formatMap[quality] || formatMap['best'];

  // Use a unique temp file — MP4 container CANNOT be piped to stdout (moov atom issue)
  const tmpFile = path.join(os.tmpdir(), `gramlink_${Date.now()}.mp4`);

  const args = [
    '--format', formatSelector,
    '--merge-output-format', 'mp4',    // ffmpeg merges video+audio into mp4
    '--remux-video', 'mp4',            // remux to mp4 if already merged
    '--no-playlist',
    '--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    '-o', tmpFile,
    url
  ];

  console.log(`[download] ${url} @ ${quality} → ${tmpFile}`);

  const ytdlp = spawn('yt-dlp', args);

  let stderrLog = '';
  ytdlp.stderr.on('data', (data) => {
    stderrLog += data.toString();
    process.stderr.write(`[yt-dlp] ${data}`);
  });

  ytdlp.on('error', (err) => {
    console.error('[spawn error]', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'yt-dlp not found. Make sure it is installed.' });
    }
  });

  ytdlp.on('close', (code) => {
    if (code !== 0) {
      console.error(`[yt-dlp] exited with code ${code}`);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Failed to download video. It may be private or unavailable.' });
      }
      return;
    }

    // Stream the completed temp file to the browser
    const fs = require('fs');
    if (!fs.existsSync(tmpFile)) {
      return res.status(500).json({ error: 'Output file not found after download.' });
    }

    const stat = fs.statSync(tmpFile);
    res.setHeader('Content-Disposition', 'attachment; filename="gramlink-video.mp4"');
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', stat.size);

    const readStream = fs.createReadStream(tmpFile);
    readStream.pipe(res);

    readStream.on('close', () => {
      // Delete temp file after streaming
      fs.unlink(tmpFile, (err) => {
        if (err) console.error('[cleanup]', err.message);
      });
    });
  });

  // If client disconnects mid-download, kill yt-dlp and clean up
  req.on('close', () => {
    ytdlp.kill('SIGTERM');
    const fs = require('fs');
    fs.unlink(tmpFile, () => {});
  });
});

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  execFile('yt-dlp', ['--version'], (err, stdout) => {
    res.json({
      status: 'ok',
      ytdlp: err ? 'not found' : stdout.trim(),
    });
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ╔════════════════════════════════════╗`);
  console.log(`  ║   GramLink Server — Port ${PORT}     ║`);
  console.log(`  ╚════════════════════════════════════╝\n`);
  console.log(`  Frontend → http://localhost:${PORT}`);
  console.log(`  Health   → http://localhost:${PORT}/health\n`);
});