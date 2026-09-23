/* ==========================================================================
   RS Soul — GitHub Releases API
   --------------------------------------------------------------------------
   Fetches the releases of a public GitHub repository and turns every
   .mp3 asset into a track object the player understands.

   ► To point RS Soul at your own music repo, change GITHUB_OWNER / GITHUB_REPO
     below (or override them at runtime with
     `SonoraAPI.configure({ owner: '...', repo: '...' })` from the console).
   ========================================================================== */

const SonoraAPI = (() => {
  'use strict';

  const { uid, formatBytes, showToast } = SonoraUtils;

  /* ---------- Configuration ---------- */
  const config = {
    owner: 'Rohitkumarsaw',
    repo: 'Music_Player',
    perPage: 100,        // GitHub API max — 100 releases per page
    maxReleases: 100     // how many of those to actually process
  };

  /** Allow runtime override (useful during dev / from the console). */
  function configure(overrides = {}) {
    Object.assign(config, overrides);
  }

  /* ---------- Helpers ---------- */

  const AUDIO_RE = /\.(mp3|m4a|ogg|wav)$/i;
  const IMAGE_RE = /\.(jpg|jpeg|png|webp|gif)$/i;

  /** Common Indian/old-song artists — helps split title from filename. */
  const KNOWN_ARTISTS = [
    'Kishore Kumar', 'Lata Mangeshkar', 'Mohammed Rafi', 'Asha Bhosle',
    'Mukesh', 'Hemant Kumar', 'Manna Dey', 'Geeta Dutt',
    'Arijit Singh', 'Neha Kakkar', 'Shreya Ghoshal', 'Sonu Nigam',
    'Udit Narayan', 'Alka Yagnik', 'Kumar Sanu', 'Sadhana Sargam',
    'R. D. Burman', 'Ravi Shankar', 'Jagjit Singh', 'Pankaj Udhas'
  ];

  /** Noise words that YouTube-downloaded filenames love to include. */
  const NOISE_PATTERNS = [
    /MP3[_\s-]*\d+K/gi,           // "MP3_160K"
    /_?\d+K\b/gi,                  // "_160K", " 160K"
    /_oldisgoldsongs/gi,           // channel name (with underscore)
    /\boldisgoldsongs\b/gi,        // channel name (standalone)
    /\bold\s*hindi\s*songs?\b/gi,  // category noise
    /\bevergreen\s*(romantic)?\s*songs?\b/gi,
    /\bhit\s*songs?\b/gi,
    /\bbollywood\s*(romantic)?\s*songs?\b/gi,
    /\b\d{2,4}s\b/gi,              // "90s", "80s"
    /\(official\s*(video|audio)\)/gi,
    /\[official\s*(video|audio)\]/gi,
    /\bfull\s*(video|song)\b/gi,
    /\blyrics?\b/gi,
    /_+/g,                         // underscores
    /\.+/g                         // stray dots
  ];

  /**
   * Turn a raw GitHub asset filename into { artist, title }.
   * Handles common YouTube-download naming patterns gracefully.
   */
  function parseAssetName(filename) {
    // 1. Strip extension.
    let base = filename.replace(/\.[^.]+$/, '');

    // 2. Split on " - " FIRST (before we mangle things), because that's
    //    the most reliable artist/title separator.
    let artist = '';
    let title = base;

    if (base.includes(' - ')) {
      const parts = base.split(' - ');
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }

    // 3. Clean up the title piece: remove noise, collapse separators.
    title = cleanTitle(title);

    // 4. If we still don't have an artist, try to detect a known one.
    if (!artist) {
      const detected = detectArtist(title);
      if (detected) {
        artist = detected.artist;
        title = detected.title;
      }
    }

    // 5. Final fallbacks.
    if (!artist) artist = 'Unknown Artist';
    if (!title) title = 'Untitled Track';

    return { artist, title };
  }

  /** Remove download-garbage from a title string. */
  function cleanTitle(raw) {
    let s = raw;

    // Replace "ll", "||", "//", "_" etc. with an em-dash separator.
    s = s.replace(/\s+(?:ll|\|\||\/\/|__)\s+/gi, ' — ');

    // Remove all the noise patterns.
    NOISE_PATTERNS.forEach((re) => { s = s.replace(re, ' '); });

    // Collapse whitespace and stray separators.
    s = s
      .replace(/\s*[—–-]\s*[—–-]+\s*/g, ' — ')   // collapse "— — —"
      .replace(/\s*[—–-]\s*$/g, '')               // trailing dashes
      .replace(/^\s*[—–-]\s*/g, '')               // leading dashes
      .replace(/\s{2,}/g, ' ')
      .trim();

    // Sentence-case the first letter (keeps rest untouched).
    if (s.length > 0) s = s.charAt(0).toUpperCase() + s.slice(1);

    return s;
  }

  /** Look for a known artist name inside the title; strip it out. */
  function detectArtist(title) {
    for (const name of KNOWN_ARTISTS) {
      const re = new RegExp(`^${escapeRegex(name)}\\s*[-–—:]?\\s*`, 'i');
      if (re.test(title)) {
        return { artist: name, title: title.replace(re, '').trim() };
      }
    }
    return null;
  }

  /** Escape regex special chars in a literal string. */
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Strip markdown-ish noise from release bodies; take the first line only. */
  function firstLine(text = '') {
    return String(text).split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '';
  }

  /**
   * Turn one GitHub release into an array of track objects.
   * Cover art preference: explicit `cover.*` asset → first image asset → null.
   */
  function releaseToTracks(release) {
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const releaseLabel = release.name || release.tag_name || 'Untitled Release';
    const releaseBlurb = firstLine(release.body) || releaseLabel;

    // Pick a cover image for the whole release.
    const coverAsset =
      assets.find((a) => /^cover\./i.test(a.name) && IMAGE_RE.test(a.name)) ||
      assets.find((a) => IMAGE_RE.test(a.name));
    const cover = coverAsset ? coverAsset.browser_download_url : null;

    const audioAssets = assets.filter((a) => AUDIO_RE.test(a.name));

    return audioAssets.map((asset, index) => {
      const { artist, title } = parseAssetName(asset.name);
      return {
        id: `gh-${release.id}-${asset.id || index}`,
        title: title || releaseLabel,
        artist,
        album: releaseLabel,
        albumBlurb: releaseBlurb,
        src: asset.browser_download_url,
        cover,                        // may be null — player.js will show a placeholder
        size: asset.size,
        sizeLabel: formatBytes(asset.size),
        releaseTag: release.tag_name || '',
        publishedAt: release.published_at || '',
        source: 'github'
      };
    });
  }

  /* ---------- Public fetch ---------- */

  /**
   * Fetch recent releases and flatten them into a single track list.
   * Throws on network / HTTP / empty-result errors so the caller can decide
   * whether to fall back to FALLBACK_TRACKS.
   */
  async function fetchTracks({ signal } = {}) {
    const { owner, repo, perPage, maxReleases } = config;
    const url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=${perPage}`;

    const res = await fetch(url, {
      signal,
      headers: {
        // Unauthenticated is fine for public repos (60 req/hr/IP).
        Accept: 'application/vnd.github+json'
      }
    });

    if (!res.ok) {
      throw new Error(
        res.status === 404
          ? `Repository ${owner}/${repo} not found`
          : `GitHub API error ${res.status}`
      );
    }

    const releases = await res.json();
    if (!Array.isArray(releases) || releases.length === 0) {
      throw new Error('No releases found in this repository');
    }

    // Newest first (GitHub already returns newest-first, but be explicit).
    const sorted = releases
      .slice()
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
      .slice(0, maxReleases);

    const tracks = sorted.flatMap(releaseToTracks);

    if (tracks.length === 0) {
      throw new Error('No audio assets found in recent releases');
    }

    return { tracks, repoUrl: `https://github.com/${owner}/${repo}` };
  }

  /* ---------- Public API ---------- */
  return {
    configure,
    fetchTracks,
    getConfig: () => ({ ...config })
  };
})();