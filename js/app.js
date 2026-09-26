/* ==========================================================================
   RS Soul — App bootstrap
   --------------------------------------------------------------------------
   Wires everything together:
     • base theme toggle (dark / light) — persisted, follows OS on first visit
     • accent color picker (8 palettes) — persisted
     • theme picker modal (gear icon → modal)
     • sidebar drawer (mobile) + backdrop
     • lyrics panel toggle
     • keyboard shortcuts (Space, ←/→, ↑/↓, M, S, R, N, P, L)
     • fetches tracks from GitHub → falls back to bundled playlist
     • hooks SonoraPlayer to SonoraPlaylist events
   ========================================================================== */

(function () {
  'use strict';

  const { $, showToast, storage, debounce } = SonoraUtils;
  const playlist = SonoraPlaylist;
  const player = SonoraPlayer;
  const api = SonoraAPI;

  /* ---------- Theme constants ---------- */

  const THEME_KEY = 'sonora-theme';
  const ACCENT_KEY = 'sonora-accent';

  const DEFAULT_THEME = 'dark';
  const DEFAULT_ACCENT = 'cyan';

  const VALID_THEMES = ['dark', 'light'];
  const VALID_ACCENTS = [
    'cyan', 'violet', 'emerald', 'amber',
    'rose', 'indigo', 'gold', 'pink'
  ];

  /* ---------- Base theme ---------- */

  function applyTheme(theme) {
    if (!VALID_THEMES.includes(theme)) theme = DEFAULT_THEME;

    const root = document.documentElement;
    root.setAttribute('data-theme', theme);

    const btn = $('#theme-toggle');
    const icon = $('#theme-icon');
    if (btn) {
      btn.setAttribute('aria-pressed', String(theme === 'light'));
      btn.setAttribute('aria-label',
        theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
    }
    if (icon) {
      icon.className = theme === 'light' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }

    storage.set(THEME_KEY, theme);
    syncThemeModalSelection();
  }

  /* ---------- Accent color ---------- */

  function applyAccent(accent) {
    if (!VALID_ACCENTS.includes(accent)) accent = DEFAULT_ACCENT;

    document.documentElement.setAttribute('data-accent', accent);
    storage.set(ACCENT_KEY, accent);
    syncThemeModalSelection();
  }

  /* ---------- Theme picker modal ---------- */

  function openThemeModal() {
    const modal = $('#theme-modal');
    if (!modal) return;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => modal.classList.add('is-open'));
    setTimeout(() => modal.querySelector('button')?.focus(), 100);
  }

  function closeThemeModal() {
    const modal = $('#theme-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    setTimeout(() => { modal.hidden = true; }, 250);
  }

  function syncThemeModalSelection() {
    const modal = $('#theme-modal');
    if (!modal) return;

    const currentTheme = document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;
    const currentAccent = document.documentElement.getAttribute('data-accent') || DEFAULT_ACCENT;

    // Base theme radios
    modal.querySelectorAll('[data-base]').forEach((btn) => {
      const active = btn.dataset.base === currentTheme;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-checked', String(active));
    });

    // Accent radios
    modal.querySelectorAll('[data-accent]').forEach((btn) => {
      const active = btn.dataset.accent === currentAccent;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-checked', String(active));
    });
  }

  function initThemePicker() {
    // Open modal — palette button
    $('#theme-picker-btn')?.addEventListener('click', openThemeModal);

    // Close modal — backdrop + close button
    document.querySelectorAll('[data-close-theme-modal]').forEach((el) => {
      el.addEventListener('click', closeThemeModal);
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      const modal = $('#theme-modal');
      if (e.key === 'Escape' && modal && !modal.hidden) closeThemeModal();
    });

    // Base theme selection
    document.querySelectorAll('[data-base]').forEach((btn) => {
      btn.addEventListener('click', () => {
        applyTheme(btn.dataset.base);
        showToast(
          `Theme: ${btn.dataset.base === 'light' ? 'Light' : 'Dark'}`,
          { icon: btn.dataset.base === 'light' ? 'fa-sun' : 'fa-moon' }
        );
      });
    });

    // Accent selection
    document.querySelectorAll('[data-accent]').forEach((btn) => {
      btn.addEventListener('click', () => {
        applyAccent(btn.dataset.accent);
        const label = btn.dataset.accent.charAt(0).toUpperCase() + btn.dataset.accent.slice(1);
        showToast(`Accent: ${label}`, { icon: 'fa-palette' });
      });
    });

    // Reset to defaults
    $('#theme-reset-btn')?.addEventListener('click', () => {
      applyTheme(DEFAULT_THEME);
      applyAccent(DEFAULT_ACCENT);
      showToast('Appearance reset to default', { icon: 'fa-rotate-left' });
    });
  }

  /* ---------- Theme init ---------- */

  function initTheme() {
    // Base theme — index.html already resolved this before paint.
    const current = document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;
    applyTheme(current);

    // Accent — read from localStorage (or default).
    const storedAccent = storage.get(ACCENT_KEY, DEFAULT_ACCENT);
    applyAccent(storedAccent);

    // Simple toggle button flips base mode only.
    $('#theme-toggle')?.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'light'
        ? 'dark' : 'light';
      applyTheme(next);
    });

    // Follow OS changes if the user hasn't explicitly chosen a theme.
    if (window.matchMedia) {
      const mql = window.matchMedia('(prefers-color-scheme: light)');
      const handler = (e) => {
        if (!localStorage.getItem(THEME_KEY)) applyTheme(e.matches ? 'light' : 'dark');
      };
      mql.addEventListener ? mql.addEventListener('change', handler) : mql.addListener(handler);
    }

    // Wire up the picker modal.
    initThemePicker();
  }

  /* ---------- Sidebar (mobile drawer) ---------- */

  function initSidebar() {
    const sidebar = $('#sidebar');
    const backdrop = $('#sidebar-backdrop');
    const toggle = $('#sidebar-toggle');

    const close = () => {
      sidebar?.classList.remove('is-open');
      backdrop?.classList.remove('is-visible');
      toggle?.setAttribute('aria-expanded', 'false');
    };
    const open = () => {
      sidebar?.classList.add('is-open');
      backdrop?.classList.add('is-visible');
      toggle?.setAttribute('aria-expanded', 'true');
    };

    toggle?.addEventListener('click', () => {
      const isOpen = sidebar.classList.contains('is-open');
      isOpen ? close() : open();
    });
    backdrop?.addEventListener('click', close);

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    playlist.on('track:select', close);
  }

  /* ---------- Lyrics panel ---------- */

  function initLyrics() {
    const panel = $('#lyrics-panel');
    const toggle = $('#lyrics-toggle');
    const close = $('#lyrics-close');
    const body = $('#app-body');
    const content = $('#lyrics-content');

    function setOpen(open) {
      if (!panel) return;
      panel.hidden = !open;
      toggle?.setAttribute('aria-pressed', String(open));
      body?.classList.toggle('lyrics-open', open);
      if (open) renderLyrics();
    }

    toggle?.addEventListener('click', () => setOpen(panel.hidden));
    close?.addEventListener('click', () => setOpen(false));

    function renderLyrics() {
      if (!content) return;
      const track = player.getCurrent();
      if (!track) {
        content.innerHTML = '<p class="lyrics-empty">Load a track to see its lyrics.</p>';
        return;
      }
      content.innerHTML = `
        <p class="lyrics-empty" style="margin-bottom:.6rem;">
          ${SonoraUtils.escapeHtml(track.artist)} — ${SonoraUtils.escapeHtml(track.title)}
        </p>
        <p class="lyrics-empty">
          ${track.albumBlurb
            ? SonoraUtils.escapeHtml(track.albumBlurb)
            : 'No lyrics available for this track.'}
        </p>
      `;
    }

    player.on('track:loaded', () => { if (!panel.hidden) renderLyrics(); });
  }

  /* ---------- Keyboard shortcuts ---------- */

  function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          player.toggle();
          break;
        case 'ArrowRight':
          if (e.shiftKey) {
            e.preventDefault();
            player.seekSeconds((player.audio?.currentTime || 0) + 30);
          } else {
            e.preventDefault();
            player.seekSeconds((player.audio?.currentTime || 0) + 5);
          }
          break;
        case 'ArrowLeft':
          if (e.shiftKey) {
            e.preventDefault();
            player.seekSeconds(Math.max(0, (player.audio?.currentTime || 0) - 30));
          } else {
            e.preventDefault();
            player.seekSeconds(Math.max(0, (player.audio?.currentTime || 0) - 5));
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          player.setVolume(Math.min(100, Number($('#volume-slider')?.value || 80) + 5));
          break;
        case 'ArrowDown':
          e.preventDefault();
          player.setVolume(Math.max(0, Number($('#volume-slider')?.value || 80) - 5));
          break;
        case 'm': case 'M':
          player.toggleMute();
          break;
        case 's': case 'S':
          player.setShuffle(!player.getShuffle());
          break;
        case 'r': case 'R':
          $('#repeat-btn')?.click();
          break;
        case 'n': case 'N':
          player.next();
          break;
        case 'p': case 'P':
          player.prev();
          break;
        case 'l': case 'L':
          $('#lyrics-toggle')?.click();
          break;
        case '/':
          e.preventDefault();
          $('#track-search')?.focus();
          break;
        default:
          break;
      }
    });
  }

  /* ---------- Track selection plumbing ---------- */

  function initSelection() {
    playlist.on('track:select', ({ track, index }) => {
      player.load(track, index);
      player.play();
    });

    // Thumbnail spin sync
    function syncThumbSpins() {
      const list = document.getElementById('playlist');
      if (!list) return;

      const playing = player.isPlaying();
      list.querySelectorAll('.track-item').forEach((li) => {
        const img = li.querySelector('.track-thumb');
        if (!img) return;
        const isActive = li.classList.contains('is-active');
        img.classList.toggle('is-spinning', playing && isActive);
      });
    }

    player.on('playback:change', syncThumbSpins);
    player.on('track:loaded', syncThumbSpins);
    playlist.on('playlist:change', syncThumbSpins);
  }

  /* ---------- Load tracks ---------- */

  async function loadTracks() {
    const status = $('#queue-status');
    if (status) {
      status.classList.remove('is-hidden');
      status.innerHTML =
        '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>' +
        '<span>Loading tracks from GitHub…</span>';
    }

    try {
      const { tracks } = await api.fetchTracks();
      playlist.setTracks(tracks);
      showToast(
        `Loaded ${tracks.length} track${tracks.length === 1 ? '' : 's'} from GitHub`,
        { icon: 'fa-github' }
      );
      if (!player.restoreLastTrack()) {
        if (tracks[0]) player.load(tracks[0], 0);
      }
    } catch (err) {
      console.warn('[RS Soul] GitHub fetch failed:', err.message);

      const fallback = SonoraUtils.FALLBACK_TRACKS;
      if (Array.isArray(fallback) && fallback.length > 0) {
        playlist.setTracks(fallback);
        showToast(
          `GitHub unavailable — playing ${fallback.length} demo tracks instead.`,
          { icon: 'fa-cloud-arrow-down', delay: 4200 }
        );
        if (!player.restoreLastTrack() && fallback[0]) player.load(fallback[0], 0);
      } else {
        playlist.setTracks([]);
        if (status) {
          status.innerHTML =
            '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>' +
            '<span>Could not load tracks. Check your GitHub repo config.</span>';
          status.classList.remove('is-hidden');
        }
      }
    }

    if (status && playlist.getTracks().length > 0) {
      status.classList.add('is-hidden');
    }
  }

  /* ---------- Boot ---------- */

  function boot() {
    initTheme();
    playlist.init();
    player.init();
    initSidebar();
    initLyrics();
    initKeyboardShortcuts();
    initSelection();

    loadTracks();

    // Persist scroll position of the queue across reloads.
    const list = $('#playlist');
    if (list) {
      const savedScroll = storage.get('sonora-queue-scroll', 0);
      requestAnimationFrame(() => { list.scrollTop = savedScroll; });
      list.addEventListener('scroll', debounce(() => {
        storage.set('sonora-queue-scroll', list.scrollTop);
      }, 300));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();