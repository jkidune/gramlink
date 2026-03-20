# GramLink — Setup Guide
## Local Development in TRAE IDE + Deploy to Netlify & Railway

---

## What You're Building

```
Netlify (free)          Railway (free)
┌─────────────┐         ┌──────────────────┐
│  index.html │ ──────► │    server.js     │
│  (frontend) │  fetch  │  Express + yt-dlp│
└─────────────┘         └──────────────────┘
```

Frontend → Netlify | Backend → Railway

---

## Prerequisites — Install These First

Before opening TRAE, install these on your machine:

### 1. Node.js (v18 or higher)
Download from https://nodejs.org → choose the LTS version.

Verify:
```bash
node --version   # should show v18.x.x or higher
npm --version
```

### 2. yt-dlp

**Linux / WSL:**
```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

**macOS (Homebrew):**
```bash
brew install yt-dlp
```

**Windows (without WSL):**
1. Download `yt-dlp.exe` from https://github.com/yt-dlp/yt-dlp/releases
2. Place it in `C:\Windows\System32\` (or any folder that's in your PATH)

Verify:
```bash
yt-dlp --version   # should print something like 2024.xx.xx
```

### 3. Git
Download from https://git-scm.com if not already installed.

### 4. A GitHub account
You'll need this to connect to Netlify and Railway later.

---

## Part 1 — Set Up the Project in TRAE

### Step 1: Open TRAE and create the project folder

1. Open **TRAE IDE**
2. Click **File → Open Folder** (or the folder icon in the sidebar)
3. Navigate to where you keep your projects (e.g. `Documents/projects/`)
4. Create a new folder called **`gramlink`**
5. Open that folder in TRAE

You should now have an empty workspace called `gramlink`.

---

### Step 2: Create the project files

In the TRAE sidebar (Explorer panel), create the following files one by one.
Right-click the explorer → **New File** for each:

```
gramlink/
├── index.html
├── server.js
├── package.json
├── CLAUDE.md
└── README.md
```

Now paste the contents of each file from the downloaded files into TRAE.

> **Tip:** You can also drag and drop the downloaded files directly into the TRAE Explorer panel.

---

### Step 3: Open the integrated terminal in TRAE

- Press **Ctrl + `** (backtick) on Windows/Linux
- Or **Cmd + `** on macOS
- Or go to **Terminal → New Terminal** from the top menu

You should see a terminal at the bottom of TRAE, already inside your `gramlink` folder.

---

### Step 4: Install Node.js dependencies

In the TRAE terminal, run:

```bash
npm install
```

You'll see it download Express and CORS. A `node_modules` folder will appear in your Explorer.

---

### Step 5: Start the backend server

```bash
node server.js
```

You should see:
```
  ╔════════════════════════════════════╗
  ║   GramLink Server — Port 3001     ║
  ╚════════════════════════════════════╝

  Frontend → http://localhost:3001
  Health   → http://localhost:3001/health
```

---

### Step 6: Open the frontend in your browser

Open your browser and go to:
```
http://localhost:3001
```

You should see the GramLink UI. Try pasting an Instagram reel URL and clicking **Fetch**.

To verify yt-dlp is working, also visit:
```
http://localhost:3001/health
```

It should return something like:
```json
{ "status": "ok", "ytdlp": "2024.11.04" }
```

---

### Step 7: Test a download

1. Go to any public Instagram reel (e.g. from a public account)
2. Copy the URL from the browser address bar
3. Paste it into GramLink
4. Click **Fetch** → wait a few seconds
5. Select quality and click **Download MP4**

If it works locally, you're ready to deploy. 🎉

---

## Part 2 — Push to GitHub

### Step 1: Create a .gitignore file

In TRAE, create a new file called `.gitignore` with this content:

```
node_modules/
.env
*.log
.DS_Store
```

---

### Step 2: Initialize git and push

In the TRAE terminal:

```bash
git init
git add .
git commit -m "Initial GramLink build"
```

Now go to **https://github.com/new** and create a new repository called `gramlink`.
Keep it **Public** (required for free Netlify and Railway deploys).

Back in the TRAE terminal, run the two commands GitHub shows you after creating the repo:

```bash
git remote add origin https://github.com/YOUR_USERNAME/gramlink.git
git branch -M main
git push -u origin main
```

Your code is now on GitHub.

---

## Part 3 — Deploy the Backend to Railway

Railway will run your `server.js` continuously (it supports Node.js out of the box).

### Step 1: Sign up / log in to Railway

Go to **https://railway.app** and sign in with your GitHub account.

---

### Step 2: Create a new project

1. Click **New Project**
2. Choose **Deploy from GitHub repo**
3. Select your `gramlink` repository
4. Railway will auto-detect Node.js and start deploying

---

### Step 3: Add yt-dlp to Railway

Railway uses a Docker-like build system. You need to tell it to install `yt-dlp`.

In TRAE, create a new file called **`Dockerfile`** with this content:

```dockerfile
FROM node:20-slim

# Install yt-dlp and its dependency (ffmpeg for merging audio+video)
RUN apt-get update && apt-get install -y \
    curl \
    ffmpeg \
    python3 \
    --no-install-recommends && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3001

CMD ["node", "server.js"]
```

Save, commit, and push:

```bash
git add Dockerfile
git commit -m "Add Dockerfile for Railway deploy"
git push
```

Railway will automatically redeploy when it sees the new commit.

---

### Step 4: Get your Railway URL

Once deployed:
1. In the Railway dashboard, click your service
2. Go to **Settings → Networking**
3. Click **Generate Domain**
4. You'll get a URL like: `https://gramlink-production.up.railway.app`

Copy this URL — you'll need it in the next step.

---

### Step 5: Test your Railway backend

Open in browser:
```
https://your-railway-url.up.railway.app/health
```

You should see:
```json
{ "status": "ok", "ytdlp": "2024.xx.xx" }
```

---

## Part 4 — Update the Frontend with the Railway URL

Back in TRAE, open `index.html`.

Find this line near the bottom (inside the `<script>` tag):

```javascript
const API_BASE = 'http://localhost:3001';
```

Change it to your Railway URL:

```javascript
const API_BASE = 'https://your-railway-url.up.railway.app';
```

Save the file, commit, and push:

```bash
git add index.html
git commit -m "Point frontend to Railway backend"
git push
```

---

## Part 5 — Deploy the Frontend to Netlify

### Step 1: Sign up / log in to Netlify

Go to **https://netlify.com** and sign in with your GitHub account.

---

### Step 2: Create a new site

1. Click **Add new site → Import an existing project**
2. Choose **Deploy with GitHub**
3. Authorize Netlify and select your `gramlink` repository

---

### Step 3: Configure the build settings

Netlify will ask for build settings. Use these:

| Field | Value |
|-------|-------|
| Branch to deploy | `main` |
| Build command | *(leave empty)* |
| Publish directory | `.` (a single dot) |

Click **Deploy site**.

---

### Step 4: Get your Netlify URL

After deploy (takes ~30 seconds), Netlify gives you a URL like:
```
https://gramlink-abc123.netlify.app
```

You can also set a custom domain in **Site settings → Domain management**.

---

### Step 5: Final test

1. Open your Netlify URL
2. Paste an Instagram reel link
3. Click Fetch → Download

Everything should work end to end. ✅

---

## Ongoing Development Workflow

Whenever you make changes in TRAE:

```bash
git add .
git commit -m "Describe your change"
git push
```

- **Netlify** auto-redeploys the frontend within ~30 seconds
- **Railway** auto-redeploys the backend within ~1-2 minutes

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `yt-dlp: command not found` | Install yt-dlp and make sure it's in your PATH |
| `Could not connect to the GramLink server` | Check `API_BASE` in `index.html` points to your Railway URL |
| Video is private / login required | Only public videos are supported in v1 |
| Railway deploy fails | Check the Dockerfile syntax; view build logs in Railway dashboard |
| Netlify shows a blank page | Make sure Publish directory is set to `.` not `dist` or `public` |
| CORS error in browser console | Make sure the Railway backend is running and CORS is enabled (it is by default) |

---

## Stack Summary

| What | Tech | Where |
|------|------|-------|
| Frontend | HTML + CSS + Vanilla JS | Netlify |
| Backend | Node.js + Express | Railway |
| Video extraction | yt-dlp (Python binary) | Railway (via Dockerfile) |
| Fonts | Bebas Neue, DM Sans, DM Mono | Google Fonts CDN |
| Version control | Git + GitHub | github.com |