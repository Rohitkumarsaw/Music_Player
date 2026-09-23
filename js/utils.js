/* ==========================================================================
   RS Soul — Utilities
   --------------------------------------------------------------------------
   Shared helpers: time formatting, toast notifications, debounce,
   localStorage wrapper, DOM shortcuts, and the offline fallback playlist.
   No dependencies on other RS Soul modules.
   ========================================================================== */

const SonoraUtils = (() => {
  'use strict';

  /* ---------- Time formatting ---------- */

  /**
   * Convert seconds → "mm:ss" (or "h:mm:ss" if over an hour).
   * Non-finite / negative values are safely clamped to 00:00.
   */
  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  /* ---------- Debounce ---------- */

  /**
   * Delay `fn` until `wait` ms have passed without another call.
   * Used for the search input so we don't re-render on every keystroke.
   */
  function debounce(fn, wait = 200) {
    let timer = null;
    return function debounced(...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn.apply(this, args);
      }, wait);
    };
  }

  /* ---------- Throttle (rAF based) ---------- */

  /**
   * Coalesce rapid calls into one per animation frame.
   * Used by the waveform scrubber while dragging.
   */
  function rafThrottle(fn) {
    let scheduled = false;
    let lastArgs = null;
    return function throttled(...args) {
      lastArgs = args;
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        fn.apply(this, lastArgs);
      });
    };
  }

  /* ---------- DOM shortcuts ---------- */

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  /* ---------- Toast notifications ---------- */

  /**
   * Show a Bootstrap toast inside #toast-container.
   * Falls back silently if Bootstrap isn't loaded yet.
   * Default title reflects the RS Soul brand.
   */
  function showToast(message, { title = 'RS Soul', delay = 2600, icon = 'fa-circle-info' } = {}) {
    const container = $('#toast-container');
    if (!container) return;

    const toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    toastEl.setAttribute('aria-atomic', 'true');
    toastEl.innerHTML = `
      <div class="toast-header">
        <i class="fa-solid ${icon} me-2" aria-hidden="true"></i>
        <strong class="me-auto">${title}</strong>
        <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
      <div class="toast-body">${message}</div>
    `;
    container.appendChild(toastEl);

    // Use Bootstrap's Toast API when available, otherwise manual timeout removal.
    if (window.bootstrap && window.bootstrap.Toast) {
      const instance = new window.bootstrap.Toast(toastEl, { delay, autohide: true });
      toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
      instance.show();
    } else {
      toastEl.classList.add('show');
      setTimeout(() => toastEl.remove(), delay);
    }
  }

  /* ---------- LocalStorage wrapper (JSON-safe, quota-safe) ---------- */

  const storage = {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        // Quota exceeded / private mode — fail quietly.
        return false;
      }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    }
  };

  /* ---------- Small misc helpers ---------- */

  /** Stable unique id generator for track objects that lack one. */
  function uid(prefix = 'id') {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
  }

  /** Escape untrusted strings before dropping them into innerHTML. */
  function escapeHtml(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Build a human-readable file size (used for GitHub assets). */
  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  /* ---------- Offline fallback playlist ----------
     Played when the GitHub API fails (network, rate limit, no releases).
     These are public-domain demos so RS Soul is never empty. */
  const FALLBACK_TRACKS = [
    {
      id: 'rsoul-fallback-1',
      title: 'Neon Horizon',
      artist: 'RS Soul Demo',
      album: 'Offline Fallback',
      src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      cover: 'https://picsum.photos/seed/rsoul1/500/500',
      duration: 372
    },
    {
      id: 'rsoul-fallback-2',
      title: 'Midnight Circuit',
      artist: 'RS Soul Demo',
      album: 'Offline Fallback',
      src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
      cover: 'https://picsum.photos/seed/rsoul2/500/500',
      duration: 425
    },
    {
      id: 'rsoul-fallback-3',
      title: 'Violet Static',
      artist: 'RS Soul Demo',
      album: 'Offline Fallback',
      src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
      cover: 'https://picsum.photos/seed/rsoul3/500/500',
      duration: 298
    },
    {
      id: 'rsoul-fallback-4',
      title: 'Afterglow Drive',
      artist: 'RS Soul Demo',
      album: 'Offline Fallback',
      src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
      cover: 'https://picsum.photos/seed/rsoul4/500/500',
      duration: 341
    }
  ];

  /* ---------- Public API ---------- */
  return {
    formatTime,
    debounce,
    rafThrottle,
    $,
    $$,
    showToast,
    storage,
    uid,
    escapeHtml,
    formatBytes,
    FALLBACK_TRACKS
  };
})();