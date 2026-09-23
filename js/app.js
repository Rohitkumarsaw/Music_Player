/* ==========================================================================
   RS Soul — App bootstrap
   --------------------------------------------------------------------------
   Wires everything together:
     • theme toggle (persisted, follows OS preference on first visit)
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

  /* ---------- Theme ---------- */

  const THEME_KEY = 'sonora-theme';

  function applyTheme(theme) {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    const btn = $('#theme-toggle');
    const icon = $('#theme-icon');
    if (btn) {
      btn.setAttribute('aria-pressed', String(theme === 'light'));
      btn.setAttribute('aria-label',
        theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
    }
    if (icon) icon.className = theme === 'light' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    storage.set(THEME_KEY, theme);
  }

  function initTheme() {
    // index.html already resolved the initial theme before paint;
    // we just read it back and wire the toggle.
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current);

    $('#theme-toggle')?.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'light'
        ? 'dark' : 'light';
      applyTheme(next);
    });

    // Follow OS changes if the user hasn't explicitly chosen.
    if (window.matchMedia) {
      const mql = window.matchMedia('(prefers-color-scheme: light)');
      const handler = (e) => {
        if (!localStorage.getItem(THEME_KEY)) applyTheme(e.matches ? 'light' : 'dark');
      };
      mql.addEventListener ? mql.addEventListener('change', handler) : mql.addListener(handler);
    }
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

    // Close on Escape and on track selection (feels natural on phones).
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
      // Lyrics aren't shipped with GitHub assets by default. Show the
      // release blurb as a stand-in so the panel isn't empty.
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

    // Re-render when a new track loads.
    player.on('track:loaded', () => { if (!panel.hidden) renderLyrics(); });
  }

  /* ---------- Keyboard shortcuts ---------- */

  function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ignore when the user is typing in a field.
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
    // Playlist row click → player load + autoplay.
    playlist.on('track:select', ({ track, index }) => {
      player.load(track, index);
      player.play();
    });

    // ----------------------------------------------------------------
    // Thumbnail spin sync — only the active row's thumbnail spins
    // while audio is actually playing.
    // ----------------------------------------------------------------
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
      // Resume last track if any; otherwise preload the first.
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
        // No fallback configured — show a clear error in the sidebar.
        playlist.setTracks([]);
        if (status) {
          status.innerHTML =
            '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>' +
            '<span>Could not load tracks. Check your GitHub repo config.</span>';
          status.classList.remove('is-hidden');
        }
      }
    }

    // Hide the loading status once the playlist is populated.
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

    // Kick off the network fetch without blocking first paint.
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