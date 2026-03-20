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
 * Streams the video file directly to the browser
 */
app.get('/download', (req, res) => {
  const { url, quality = 'best' } = req.query;

  if (!url || !isInstagramUrl(url)) {
    return res.status(400).json({ error: 'Invalid or missing Instagram URL.' });
  }

  // Map quality label to yt-dlp format selector
  const formatMap = {
    best:  'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '1080p': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best',
    '720p':  'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best',
    '480p':  'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best',
  };

  const formatSelector = formatMap[quality] || formatMap['best'];
  const filename = `gramlink_${Date.now()}.mp4`;

  // Try to get a clean filename from the URL
  const cleanFilename = `gramlink-video.mp4`;

  res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}"`);
  res.setHeader('Content-Type', 'video/mp4');

  const args = [
    '--format', formatSelector,
    '--merge-output-format', 'mp4',
    '--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    '-o', '-',  // Output to stdout
    '--no-playlist',
    url
  ];

  console.log(`[download] ${url} @ ${quality}`);

  const ytdlp = spawn('yt-dlp', args);

  ytdlp.stdout.pipe(res);

  ytdlp.stderr.on('data', (data) => {
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
    }
  });

  // Clean up if client disconnects
  req.on('close', () => {
    ytdlp.kill('SIGTERM');
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