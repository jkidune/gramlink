/**
 * GramLink — Backend Server v1.3
 * Requires: Node.js 18+, yt-dlp, ffmpeg
 */

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const { execFile, spawn } = require('child_process');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── Supported platforms ───────────────────────────────────────────────────────
const SUPPORTED_HOSTS = [
  'www.instagram.com', 'instagram.com',
  'www.pinterest.com', 'pinterest.com', 'pin.it',
  'www.pinterest.co.uk', 'pinterest.co.uk',
  'www.pinterest.fr',    'pinterest.fr',
  'www.pinterest.de',    'pinterest.de',
  'www.pinterest.ca',    'pinterest.ca',
  'www.pinterest.com.au','pinterest.com.au',
];

function isSupportedUrl(url) {
  try {
    const u = new URL(url);
    return SUPPORTED_HOSTS.some(h => u.hostname === h);
  } catch { return false; }
}

function detectPlatform(url) {
  try {
    const host = new URL(url).hostname;
    if (host.includes('pinterest') || host === 'pin.it') return 'Pinterest';
    if (host.includes('instagram')) return 'Instagram';
  } catch {}
  return 'Video';
}

function detectType(url) {
  if (detectPlatform(url) === 'Pinterest') return 'Pin';
  if (url.includes('/reel/'))    return 'Reel';
  if (url.includes('/stories/')) return 'Story';
  if (url.includes('/p/'))       return 'Post';
  return 'Video';
}

function formatDuration(seconds) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Format selectors ──────────────────────────────────────────────────────────
// KEY FIX: never fall back to bestvideo alone (no audio).
// Chain: merge best streams → best single combined stream → absolute best.
const FORMAT_MAP = {
  best:    'bestvideo+bestaudio/best',
  '1080p': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
  '720p':  'bestvideo[height<=720]+bestaudio/best[height<=720]/best',
  '480p':  'bestvideo[height<=480]+bestaudio/best[height<=480]/best',
};

const BASE_ARGS = [
  '--no-playlist',
  '--no-warnings',
  '--socket-timeout', '30',
  '--extractor-retries', '3',
  '--user-agent',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
];

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/info', (req, res) => {
  const { url } = req.query;

  if (!url || !isSupportedUrl(url)) {
    return res.status(400).json({ error: 'Unsupported URL. Paste an Instagram or Pinterest link.' });
  }

  const args = ['--dump-json', ...BASE_ARGS, url];

  execFile('yt-dlp', args, { timeout: 35000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('[/info error]', stderr || err.message);
      const isPrivate = (stderr || '').toLowerCase().includes('private') ||
                        (stderr || '').toLowerCase().includes('login');
      return res.status(422).json({
        error: isPrivate
          ? 'This content is private or requires a login.'
          : 'Could not fetch video info. It may have been deleted or is unavailable.',
      });
    }

    try {
      const info = JSON.parse(stdout.trim().split('\n')[0]);

      const qualitySet = new Set(['best']);
      (info.formats || []).forEach(f => {
        if (f.height) {
          if (f.height >= 1080) qualitySet.add('1080p');
          else if (f.height >= 720)  qualitySet.add('720p');
          else if (f.height >= 480)  qualitySet.add('480p');
        }
      });

      return res.json({
        title:    info.title || info.description?.slice(0, 80) || 'Video',
        uploader: info.uploader || info.channel || info.uploader_id || null,
        platform: detectPlatform(url),
        duration: formatDuration(info.duration),
        type:     detectType(url),
        qualities: [...qualitySet],
        thumbnail: info.thumbnail || null,
        url:      info.webpage_url || url,
      });
    } catch (parseErr) {
      console.error('[/info parse error]', parseErr.message);
      return res.status(500).json({ error: 'Failed to parse video data.' });
    }
  });
});

app.get('/download', (req, res) => {
  const { url, quality = 'best' } = req.query;

  if (!url || !isSupportedUrl(url)) {
    return res.status(400).json({ error: 'Unsupported URL. Paste an Instagram or Pinterest link.' });
  }

  const formatSelector = FORMAT_MAP[quality] || FORMAT_MAP['best'];
  const tmpBase = path.join(os.tmpdir(), `gramlink_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const tmpOut  = `${tmpBase}.mp4`;

  const args = [
    '--format',               formatSelector,
    '--merge-output-format',  'mp4',
    '--remux-video',          'mp4',
    '-o',                     tmpOut,
    ...BASE_ARGS,
    url,
  ];

  console.log(`[download] ${detectPlatform(url)} | ${quality} | ${url}`);

  const ytdlp  = spawn('yt-dlp', args);
  let stderr   = '';
  let finished = false;

  ytdlp.stderr.on('data', d => {
    stderr += d.toString();
    process.stderr.write(`[yt-dlp] ${d}`);
  });

  ytdlp.on('error', err => {
    console.error('[spawn error]', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'yt-dlp not found on this server.' });
  });

  ytdlp.on('close', code => {
    finished = true;

    if (code !== 0) {
      console.error(`[yt-dlp] exit ${code}`);
      cleanup(tmpBase);
      if (!res.headersSent) {
        return res.status(500).json({
          error: 'Download failed. The content may be private, deleted, or unsupported.',
        });
      }
      return;
    }

    const outFile = findOutput(tmpBase, tmpOut);

    if (!outFile) {
      console.error('[download] output file not found');
      cleanup(tmpBase);
      return res.status(500).json({ error: 'Output file missing after download.' });
    }

    const stat = fs.statSync(outFile);
    res.setHeader('Content-Disposition', 'attachment; filename="gramlink-video.mp4"');
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', stat.size);

    const stream = fs.createReadStream(outFile);
    stream.pipe(res);
    stream.on('close', () => fs.unlink(outFile, () => {}));
    stream.on('error', err => {
      console.error('[stream error]', err.message);
      fs.unlink(outFile, () => {});
    });
  });

  req.on('close', () => {
    if (!finished) {
      ytdlp.kill('SIGTERM');
      cleanup(tmpBase);
    }
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function findOutput(tmpBase, preferred) {
  if (fs.existsSync(preferred)) return preferred;
  const dir  = path.dirname(tmpBase);
  const base = path.basename(tmpBase);
  try {
    const files = fs.readdirSync(dir).filter(f => f.startsWith(base));
    const mp4   = files.find(f => f.endsWith('.mp4'));
    if (mp4) return path.join(dir, mp4);
    if (files.length) return path.join(dir, files[0]);
  } catch {}
  return null;
}

function cleanup(tmpBase) {
  const dir  = path.dirname(tmpBase);
  const base = path.basename(tmpBase);
  try {
    fs.readdirSync(dir)
      .filter(f => f.startsWith(base))
      .forEach(f => fs.unlink(path.join(dir, f), () => {}));
  } catch {}
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  execFile('yt-dlp', ['--version'], (err, stdout) => {
    execFile('ffmpeg', ['-version'], (err2, stdout2) => {
      res.json({
        status: 'ok',
        ytdlp:  err  ? 'not found' : stdout.trim(),
        ffmpeg: err2 ? 'not found' : stdout2.split('\n')[0],
      });
    });
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
// Must bind to 0.0.0.0 in Railway/Docker containers (not just localhost)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[gramlink] Server started on 0.0.0.0:${PORT}`);
  console.log(`[gramlink] NODE_ENV=${process.env.NODE_ENV || 'development'}`);

  // Verify yt-dlp and ffmpeg are available at startup
  execFile('yt-dlp', ['--version'], (err, stdout) => {
    if (err) console.error('[gramlink] WARNING: yt-dlp not found!', err.message);
    else console.log(`[gramlink] yt-dlp: ${stdout.trim()}`);
  });
  execFile('ffmpeg', ['-version'], (err, stdout) => {
    if (err) console.error('[gramlink] WARNING: ffmpeg not found!', err.message);
    else console.log(`[gramlink] ffmpeg: ${stdout.split('\n')[0]}`);
  });
});

// Catch unhandled errors so Railway logs them instead of silent exit
process.on('uncaughtException', (err) => {
  console.error('[gramlink] Uncaught exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[gramlink] Unhandled rejection:', reason);
  process.exit(1);
});