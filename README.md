<div align="center">

# 🎵 RS Soul

### Premium Self-Hosted Music Player

**Stream your music library directly from GitHub Releases — no backend, no subscriptions, no limits.**

[![Live Demo](https://img.shields.io/badge/Live_Demo-Visit_Now-2fe0ff?style=for-the-badge&logo=github)](https://rohitkumarsaw.github.io/Music_Player/)
[![License](https://img.shields.io/badge/License-MIT-b16bff?style=for-the-badge)](LICENSE)
[![Made with JavaScript](https://img.shields.io/badge/Made_with-Vanilla_JS-f7df1e?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

<br />

<img src="https://user-images.githubusercontent.com/placeholder/rs-soul-preview.png" alt="RS Soul Preview" width="100%" />

</div>

---

## ✨ What is RS Soul?

RS Soul is a **modern, self-hosted music player** that streams tracks directly from **GitHub Releases**. No servers to maintain, no database, no monthly fees — just your music, hosted for free on GitHub, played through a beautiful interface.

Built for music lovers who want **full control** over their library with a **premium listening experience**.

> 💡 **Perfect for:** Personal music collections, artist demos, podcast archives, or any audio content you want to stream beautifully.

---

## 🚀 Features

<table>
<tr>
<td width="50%" valign="top">

### 🎧 Core Playback
- ▶️ Play / Pause / Next / Previous
- 🎚️ Waveform scrubber with drag-to-seek
- 🔊 Volume control + mute toggle
- ⏱️ Time display (current / total)
- 🔁 Repeat modes: Off / All / One
- 🔀 Smart shuffle (Fisher–Yates)

</td>
<td width="50%" valign="top">

### 📚 Library Management
- 📦 **Release-wise grouping** (collapsible)
- 🔍 Instant search across tracks
- 🎯 Filter tabs: **All / Liked / Recent**
- 📊 Sort by title, artist, or duration
- ❤️ Favorites (persisted in localStorage)
- 🕐 Recently played tracking

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🎨 Experience
- 🌗 **Dark & Light** theme toggle
- 💎 Glassmorphism UI with depth
- 🎬 Rotating vinyl disc animation
- 🖼️ Auto album art from releases
- 📱 Fully responsive (mobile → desktop)
- ⌨️ Rich keyboard shortcuts

</td>
<td width="50%" valign="top">

### ⚡ Advanced
- 🔐 MediaSession API (lock-screen controls)
- 💾 State persistence (volume, theme, position)
- ⬇️ Download tracks with one click
- 📤 Share via Web Share API
- 📝 Lyrics panel with metadata
- 🎯 Zero dependencies at runtime

</td>
</tr>
</table>

---

## 🎬 Live Demo

<div align="center">

### 👉 [**Try RS Soul Live**](https://rohitkumarsaw.github.io/Music_Player/) 👈

*Streaming real Bollywood classics from GitHub Releases*

</div>

---

## 🛠️ Tech Stack

<div align="center">

| Layer | Technology |
|:---:|:---|
| **Structure** | ![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white) |
| **Styling** | ![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white) ![Tailwind](https://img.shields.io/badge/Tailwind-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white) ![Bootstrap](https://img.shields.io/badge/Bootstrap-7952B3?style=flat-square&logo=bootstrap&logoColor=white) |
| **Logic** | ![JavaScript](https://img.shields.io/badge/Vanilla_JS-F7DF1E?style=flat-square&logo=javascript&logoColor=black) |
| **Icons** | ![Font Awesome](https://img.shields.io/badge/Font_Awesome-528DD7?style=flat-square&logo=fontawesome&logoColor=white) |
| **Data Source** | ![GitHub API](https://img.shields.io/badge/GitHub_Releases_API-181717?style=flat-square&logo=github&logoColor=white) |
| **Hosting** | ![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-222222?style=flat-square&logo=github&logoColor=white) |

**Zero build step. Zero backend. Zero npm install.**

</div>

---

## 📁 Project Structure

```
rs-soul/
│
├── 📄 index.html                 # Main app entry point
│
├── 📁 css/
│   ├── themes.css                # Design tokens (colors, fonts, dark/light)
│   ├── styles.css                # Component styles
│   └── patch-title.css           # Layout patches, filters, releases UI
│
├── 📁 js/
│   ├── utils.js                  # Helpers: time, toast, storage, DOM
│   ├── github-api.js             # GitHub Releases API integration
│   ├── playlist.js               # Queue, filters, release grouping
│   ├── player.js                 # Audio engine, controls, MediaSession
│   └── app.js                    # Bootstrap: theme, keyboard, wiring
│
└── 📄 README.md                  # You are here
```

---

## ⚡ Quick Start

### 1️⃣ Fork & Clone

```bash
git clone https://github.com/Rohitkumarsaw/Music_Player.git
cd Music_Player
```

### 2️⃣ Run Locally

Because the app fetches audio from GitHub, you **must** run it over HTTP (not `file://`).

**Python 3:**
```bash
python -m http.server 8000
```

**Or Node.js:**
```bash
npx serve .
```

**Or VS Code:** Install **Live Server** extension → right-click `index.html` → *Open with Live Server*.

### 3️⃣ Open in Browser

```
http://localhost:8000
```

**That's it.** 🎉

---

## 🎵 Adding Your Music

RS Soul reads `.mp3` files from **GitHub Releases**. Here's the setup:

### Step 1: Create a Release

1. Go to `https://github.com/YOUR-USERNAME/YOUR-REPO/releases/new`
2. **Tag:** `v1.0.0` (or any version)
3. **Title:** `My First Album`
4. **Attach `.mp3` files** (drag & drop)
5. Optional: attach `cover.jpg` for album art
6. Click **Publish release**

### Step 2: Configure RS Soul

Edit `js/github-api.js`:

```javascript
const config = {
  owner: 'YOUR-USERNAME',
  repo:  'YOUR-REPO',
  perPage: 100,
  maxReleases: 100
};
```

### Step 3: Refresh & Enjoy

Reload the page — your tracks appear automatically.

### 📝 Filename Best Practice

| Format | Result |
|:---|:---|
| `Kishore Kumar - Aane Se Uske Aaye Bahar.mp3` | ✅ Perfect — Artist & Title split |
| `Song Title.mp3` | ✅ Works — Artist becomes "Unknown" |
| `song_final_v2(1).mp3` | ❌ Bad — messy metadata |

**Recommended:** `Artist - Title.mp3`

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|:---:|:---|
| <kbd>Space</kbd> | Play / Pause |
| <kbd>←</kbd> / <kbd>→</kbd> | Seek −5s / +5s |
| <kbd>Shift</kbd> + <kbd>←</kbd> / <kbd>→</kbd> | Seek −30s / +30s |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Volume up / down |
| <kbd>M</kbd> | Mute toggle |
| <kbd>S</kbd> | Shuffle toggle |
| <kbd>R</kbd> | Cycle repeat mode |
| <kbd>N</kbd> / <kbd>P</kbd> | Next / Previous track |
| <kbd>L</kbd> | Toggle lyrics panel |
| <kbd>/</kbd> | Focus search |
| <kbd>Esc</kbd> | Close panels |

---

## 🎨 Customization

### Colors

Edit `css/themes.css` — all colors use CSS variables:

```css
:root {
  --accent: #2fe0ff;        /* Electric cyan */
  --accent-2: #b16bff;      /* Violet */
  --accent-warm: #ffab5e;   /* Amber (favorites) */
  --bg: #0a0b10;            /* Deep space */
}
```

### Branding

- **Title:** `index.html` → `<title>` tag
- **Logo:** `index.html` → `.brand-name` span
- **Favicon:** `index.html` → inline SVG data URI
- **Tagline:** `index.html` → `.brand-tagline` span

---

## 🌐 Deploy to GitHub Pages

Already done! Just enable it:

1. **Settings** → **Pages**
2. **Source:** `Deploy from a branch`
3. **Branch:** `main` · **Folder:** `/ (root)`
4. **Save**

Live URL: `https://YOUR-USERNAME.github.io/Music_Player/`

---

## 🚀 Deployment Alternatives

| Platform | Command |
|:---|:---|
| **Netlify** | Drag-drop the folder to [netlify.com/drop](https://app.netlify.com/drop) |
| **Vercel** | `npx vercel --prod` |
| **Cloudflare Pages** | Connect GitHub repo, auto-deploy |
| **Firebase Hosting** | `firebase deploy` |

---

## 🔒 Privacy & Security

- ✅ **Zero tracking** — no analytics, no cookies
- ✅ **Local-first** — state stored in your browser only
- ✅ **No backend** — GitHub serves your files
- ✅ **Open source** — audit every line of code
- ✅ **No external CDNs for logic** — only fonts + icons

---

## 🐛 Known Limitations

| Limitation | Workaround |
|:---|:---|
| Visualizer disabled (Web Audio CORS) | By design — GitHub assets don't send CORS headers |
| No offline caching | Add Service Worker (planned) |
| Lyrics are metadata only | Add `.lrc` support (planned) |
| GitHub API: 60 req/hour unauthenticated | Use token for 5000 req/hour |

---

## 🗺️ Roadmap

- [x] Core playback engine
- [x] Release-wise grouping
- [x] Filter tabs (All/Liked/Recent)
- [x] Dark/Light theme
- [x] Keyboard shortcuts
- [x] MediaSession integration
- [ ] Playback speed control
- [ ] PWA + offline mode
- [ ] Lyrics sync (`.lrc` support)
- [ ] Playlist import/export
- [ ] Drag-and-drop reorder
- [ ] Multi-language support

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the project
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

Free to use, modify, and distribute. Attribution appreciated.

---

## 🙏 Acknowledgements

- **Music:** [SoundHelix](https://www.soundhelix.com/) (demo tracks)
- **Fonts:** [Google Fonts](https://fonts.google.com/) — Syne, DM Sans, JetBrains Mono
- **Icons:** [Font Awesome](https://fontawesome.com/)
- **Hosting:** [GitHub Pages](https://pages.github.com/)
- **Inspiration:** Spotify, Apple Music, Tidal

---

<div align="center">

### ⭐ If you like RS Soul, give it a star!

**Built with ❤️ by [Rohit Kumar Saw](https://github.com/Rohitkumarsaw)**

<br />

[![GitHub](https://img.shields.io/badge/GitHub-Rohitkumarsaw-181717?style=for-the-badge&logo=github)](https://github.com/Rohitkumarsaw)

<br />

*"Feel the music."*

</div>
