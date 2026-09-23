/* ==========================================================================
   RS Soul — Player
   --------------------------------------------------------------------------
   Wraps the <audio> element and exposes a small API:
     • load(track, index)   • play() / pause() / toggle()
     • next() / prev()      • seekRatio(0..1) / seekSeconds(s)
     • setVolume(0..100)    • toggleMute()
     • setShuffle(bool)     • cycleRepeat()

   Also owns:
     • progress / duration readouts
     • waveform scrubber interaction
     • default cover art (SVG) when a track has no image
     • mediaSession metadata (lock-screen controls on mobile)

   NOTE ON WEB AUDIO:
   We do NOT route audio through a Web Audio graph, because GitHub
   release assets don't send the CORS headers required by
   createMediaElementSource(). Doing so would mute the audio (the
   browser emits "MediaElementAudioSource outputs zeroes" and the
   track plays silently). The visualizer is therefore disabled by
   design — reliability > eye-candy.
   ========================================================================== */

const SonoraPlayer = (() => {
  'use strict';

  const { $, formatTime, storage, showToast, rafThrottle } = SonoraUtils;
  const playlist = SonoraPlaylist;

  /* ---------- Constants ---------- */

  const STORAGE = {
    volume: 'sonora-volume',
    muted: 'sonora-muted',
    shuffle: 'sonora-shuffle',
    repeat: 'sonora-repeat',
    lastId: 'sonora-last-track'
  };

  const REPEAT_ORDER = ['off', 'all', 'one'];

  /**
   * Default album art — an SVG "vinyl disc" rendered as a data URI.
   * Used whenever a track has no `cover`. Works offline, no external
   * request, and scales crisply at any size.
   *
   * Palette matches RS Soul theme: cyan → violet gradient.
   */
  const DEFAULT_COVER =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#0a0b10"/>
            <stop offset="100%" stop-color="#1a1030"/>
          </linearGradient>
          <linearGradient id="disc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#2fe0ff"/>
            <stop offset="100%" stop-color="#b16bff"/>
          </linearGradient>
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#b16bff" stop-opacity="0.45"/>
            <stop offset="70%" stop-color="#2fe0ff" stop-opacity="0.05"/>
            <stop offset="100%" stop-color="#000" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect width="500" height="500" fill="url(#bg)"/>
        <circle cx="250" cy="250" r="220" fill="url(#glow)"/>
        <circle cx="250" cy="250" r="180" fill="none" stroke="url(#disc)" stroke-width="1" opacity="0.35"/>
        <circle cx="250" cy="250" r="150" fill="none" stroke="url(#disc)" stroke-width="1" opacity="0.45"/>
        <circle cx="250" cy="250" r="120" fill="none" stroke="url(#disc)" stroke-width="1" opacity="0.55"/>
        <circle cx="250" cy="250" r="90"  fill="none" stroke="url(#disc)" stroke-width="1" opacity="0.7"/>
        <circle cx="250" cy="250" r="60"  fill="none" stroke="url(#disc)" stroke-width="1.5" opacity="0.85"/>
        <circle cx="250" cy="250" r="35"  fill="none" stroke="url(#disc)" stroke-width="2"/>
        <circle cx="250" cy="250" r="12"  fill="#0a0b10" stroke="url(#disc)" stroke-width="2"/>
        <g fill="url(#disc)" opacity="0.9">
          <path d="M 235 195 L 235 305 L 330 250 Z"/>
        </g>
      </svg>
    `);

  /* ---------- Element refs ---------- */

  let el = {};

  function cacheDom() {
    el = {
      audio: $('#audio-player'),
      title: $('#track-title'),
      artist: $('#track-artist'),
      album: $('#track-album'),
      art: $('#album-art'),
      artPlaceholder: $('#deck-art-placeholder'),
      disc: $('#deck-disc'),
      glow: $('#deck-glow'),

      playBtn: $('#play-btn'),
      playIcon: $('#play-icon'),
      prevBtn: $('#prev-btn'),
      nextBtn: $('#next-btn'),
      shuffleBtn: $('#shuffle-btn'),
      repeatBtn: $('#repeat-btn'),
      muteBtn: $('#mute-btn'),
      volumeIcon: $('#volume-icon'),
      volumeSlider: $('#volume-slider'),

      likeBtn: $('#like-btn'),
      downloadBtn: $('#download-btn'),
      shareBtn: $('#share-btn'),

      currentTime: $('#current-time'),
      duration: $('#duration-time'),
      waveform: $('#waveform-track'),
      fill: $('#waveform-fill'),
      handle: $('#waveform-handle')
    };
  }

  /* ---------- State ---------- */

  const state = {
    current: null,
    index: -1,
    shuffle: false,
    repeat: 'off',
    shuffleOrder: [],
    shufflePos: -1,
    isDragging: false
  };

  /* ---------- Event bus (minimal pub/sub) ---------- */

  const bus = new Map();

  function on(event, handler) {
    if (!bus.has(event)) bus.set(event, new Set());
    bus.get(event).add(handler);
    return () => bus.get(event)?.delete(handler);
  }

  function emit(event, payload) {
    bus.get(event)?.forEach((fn) => {
      try { fn(payload); } catch (err) { console.error(err); }
    });
  }

  /* ---------- Track loading ---------- */

  /**
   * Load a track into the audio element and reflect it in the UI.
   * @param {object} track
   * @param {number} index  index in the visible playlist
   */
  function load(track, index = -1) {
    if (!track) return;

    state.current = track;
    state.index = index >= 0 ? index : playlist.getIndexById(track.id);
    playlist.setCurrent(track.id);

    // Metadata text
    el.title.textContent = track.title || 'Untitled';
    el.artist.textContent = track.artist || 'Unknown Artist';
    el.album.textContent = track.album || '';
    updateLikeButton();

    // Album art (always show something)
    el.art.src = track.cover || DEFAULT_COVER;
    el.art.alt = `${track.title} cover art`;
    el.art.hidden = false;
    el.artPlaceholder.hidden = true;

    // Media
    el.audio.src = track.src;
    el.audio.load();

    // Reset transport UI
    setWaveformRatio(0);
    el.currentTime.textContent = '00:00';
    el.duration.textContent = formatTime(track.duration || 0);

    // Persist selection
    storage.set(STORAGE.lastId, track.id);

    // Lock-screen metadata
    updateMediaSession(track);

    emit('track:loaded', track);
  }

  function updateLikeButton() {
    if (!el.likeBtn || !state.current) return;
    const liked = playlist.isLiked(state.current.id);
    el.likeBtn.setAttribute('aria-pressed', String(liked));
    el.likeBtn.classList.toggle('is-liked', liked);
    const icon = el.likeBtn.querySelector('i');
    if (icon) icon.className = `${liked ? 'fa-solid' : 'fa-regular'} fa-heart`;
  }

  function updateMediaSession(track) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album || '',
        artwork: [{
          src: track.cover || DEFAULT_COVER,
          sizes: '500x500',
          type: track.cover ? 'image/jpeg' : 'image/svg+xml'
        }]
      });
    } catch { /* not critical */ }
  }

  /* ---------- Transport ---------- */

  function play() {
    if (!state.current) {
      const first = playlist.getTracks()[0];
      if (first) load(first, 0);
      else return;
    }
    const p = el.audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch((err) => {
        console.warn('Playback failed:', err);
        showToast('Could not play this track. Check the file URL.',
          { icon: 'fa-triangle-exclamation' });
      });
    }
  }

  function pause() { el.audio.pause(); }
  function toggle() { el.audio.paused ? play() : pause(); }

  function next({ auto = false } = {}) {
    const tracks = playlist.getTracks();
    if (tracks.length === 0) return;

    if (auto && state.repeat === 'one') {
      el.audio.currentTime = 0;
      play();
      return;
    }

    let nextIndex;
    if (state.shuffle) {
      nextIndex = advanceShuffle(+1);
      if (nextIndex === -1) {
        if (state.repeat === 'all') {
          reshuffle();
          nextIndex = advanceShuffle(+1);
        } else {
          pause();
          return;
        }
      }
    } else {
      nextIndex = state.index + 1;
      if (nextIndex >= tracks.length) {
        if (state.repeat === 'all') nextIndex = 0;
        else { pause(); el.audio.currentTime = 0; return; }
      }
    }

    load(tracks[nextIndex], nextIndex);
    play();
  }

  function prev() {
    const tracks = playlist.getTracks();
    if (tracks.length === 0) return;

    if (el.audio.currentTime > 3) {
      el.audio.currentTime = 0;
      return;
    }

    let prevIndex;
    if (state.shuffle) {
      prevIndex = advanceShuffle(-1);
      if (prevIndex === -1) prevIndex = 0;
    } else {
      prevIndex = state.index - 1;
      if (prevIndex < 0) prevIndex = state.repeat === 'all' ? tracks.length - 1 : 0;
    }

    load(tracks[prevIndex], prevIndex);
    play();
  }

  /* ---------- Shuffle ---------- */

  function reshuffle() {
    const n = playlist.getTracks().length;
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const currentPos = order.indexOf(state.index);
    if (currentPos > 0) {
      order.splice(currentPos, 1);
      order.unshift(state.index);
    }
    state.shuffleOrder = order;
    state.shufflePos = 0;
  }

  function advanceShuffle(dir) {
    if (state.shuffleOrder.length === 0) reshuffle();
    const nextPos = state.shufflePos + dir;
    if (nextPos < 0 || nextPos >= state.shuffleOrder.length) return -1;
    state.shufflePos = nextPos;
    return state.shuffleOrder[nextPos];
  }

  function setShuffle(on) {
    state.shuffle = !!on;
    el.shuffleBtn?.setAttribute('aria-pressed', String(state.shuffle));
    if (state.shuffle) reshuffle();
    storage.set(STORAGE.shuffle, state.shuffle);
  }

  /* ---------- Repeat ---------- */

  function cycleRepeat() {
    const idx = REPEAT_ORDER.indexOf(state.repeat);
    setRepeat(REPEAT_ORDER[(idx + 1) % REPEAT_ORDER.length]);
  }

  function setRepeat(mode) {
    state.repeat = mode;
    const btn = el.repeatBtn;
    if (!btn) return;
    btn.dataset.mode = mode;
    btn.setAttribute('aria-pressed', String(mode !== 'off'));
    btn.setAttribute('aria-label',
      mode === 'off' ? 'Repeat off' :
      mode === 'all' ? 'Repeat all' : 'Repeat one'
    );
    btn.innerHTML = mode === 'one'
      ? '<i class="fa-solid fa-repeat" aria-hidden="true"></i>' +
        '<span style="position:absolute;font-size:.55rem;font-weight:700;transform:translate(14px,8px);">1</span>'
      : '<i class="fa-solid fa-repeat" aria-hidden="true"></i>';
    storage.set(STORAGE.repeat, mode);
  }

  /* ---------- Seeking ---------- */

  function seekRatio(ratio) {
    const d = el.audio.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    const clamped = Math.min(1, Math.max(0, ratio));
    el.audio.currentTime = clamped * d;
    setWaveformRatio(clamped);
  }

  function seekSeconds(seconds) {
    const d = el.audio.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    el.audio.currentTime = Math.min(d, Math.max(0, seconds));
  }

  function setWaveformRatio(ratio) {
    const pct = Math.min(100, Math.max(0, ratio * 100));
    if (el.fill) el.fill.style.width = pct + '%';
    if (el.handle) el.handle.style.left = pct + '%';
    el.waveform?.setAttribute('aria-valuenow', String(Math.round(pct)));
  }

  /* ---------- Volume ---------- */

  function setVolume(value) {
    const v = Math.min(100, Math.max(0, Number(value)));
    el.audio.volume = v / 100;
    if (v > 0 && el.audio.muted) el.audio.muted = false;
    storage.set(STORAGE.volume, v);
    updateVolumeIcon();
  }

  function toggleMute() {
    el.audio.muted = !el.audio.muted;
    storage.set(STORAGE.muted, el.audio.muted);
    updateVolumeIcon();
  }

  function updateVolumeIcon() {
    if (!el.volumeIcon) return;
    const v = el.audio.muted ? 0 : el.audio.volume;
    let cls = 'fa-volume-high';
    if (v === 0) cls = 'fa-volume-xmark';
    else if (v < 0.5) cls = 'fa-volume-low';
    el.volumeIcon.className = `fa-solid ${cls}`;
    el.muteBtn?.setAttribute('aria-label', el.audio.muted ? 'Unmute' : 'Mute');
    if (el.volumeSlider) el.volumeSlider.value = Math.round(v * 100);
  }

  /* ---------- Waveform scrubber ---------- */

  function ratioFromEvent(e) {
    const rect = el.waveform.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    return Math.min(1, Math.max(0, x / rect.width));
  }

  const onDragMove = rafThrottle((e) => {
    if (!state.isDragging) return;
    const r = ratioFromEvent(e);
    setWaveformRatio(r);
    const d = el.audio.duration;
    if (Number.isFinite(d) && d > 0) el.currentTime.textContent = formatTime(r * d);
  });

  function endDrag(e) {
    if (!state.isDragging) return;
    state.isDragging = false;
    const r = ratioFromEvent(e.changedTouches ? e.changedTouches[0] : e);
    seekRatio(r);
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', endDrag);
    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('touchend', endDrag);
  }

  function beginDrag(e) {
    if (!el.audio.duration) return;
    state.isDragging = true;
    onDragMove(e);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchmove', onDragMove, { passive: false });
    document.addEventListener('touchend', endDrag);
  }

  function bindScrubber() {
    if (!el.waveform) return;
    el.waveform.addEventListener('mousedown', beginDrag);
    el.waveform.addEventListener('touchstart',
      (e) => { e.preventDefault(); beginDrag(e); }, { passive: false });

    el.waveform.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 30 : 5;
      if (e.key === 'ArrowRight') { e.preventDefault(); seekSeconds(el.audio.currentTime + step); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); seekSeconds(el.audio.currentTime - step); }
      else if (e.key === 'Home') { e.preventDefault(); seekSeconds(0); }
      else if (e.key === 'End') { e.preventDefault(); seekSeconds(el.audio.duration || 0); }
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
    });
  }

  /* ---------- Audio events ---------- */

  function bindAudioEvents() {
    const a = el.audio;

    a.addEventListener('play', () => {
      el.playIcon.className = 'fa-solid fa-pause';
      el.playBtn?.setAttribute('aria-label', 'Pause');
      el.disc?.classList.add('is-spinning');
      el.glow?.classList.add('is-active');
      emit('playback:change', { playing: true });
    });

    a.addEventListener('pause', () => {
      el.playIcon.className = 'fa-solid fa-play';
      el.playBtn?.setAttribute('aria-label', 'Play');
      el.disc?.classList.remove('is-spinning');
      el.glow?.classList.remove('is-active');
      emit('playback:change', { playing: false });
    });

    a.addEventListener('timeupdate', () => {
      if (state.isDragging) return;
      const d = a.duration;
      if (Number.isFinite(d) && d > 0) setWaveformRatio(a.currentTime / d);
      el.currentTime.textContent = formatTime(a.currentTime);
    });

    a.addEventListener('loadedmetadata', () => {
      el.duration.textContent = formatTime(a.duration);
      updateMediaSession(state.current);
    });

    a.addEventListener('ended', () => next({ auto: true }));

    a.addEventListener('error', () => {
      if (!a.src) return;
      showToast('Track failed to load. Trying the next one…',
        { icon: 'fa-triangle-exclamation' });
      setTimeout(() => next({ auto: true }), 400);
    });
  }

  /* ---------- Media Session actions ---------- */

  function bindMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler('play', () => play());
      navigator.mediaSession.setActionHandler('pause', () => pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => next());
      navigator.mediaSession.setActionHandler('previoustrack', () => prev());
      navigator.mediaSession.setActionHandler('seekbackward',
        (d) => seekSeconds(el.audio.currentTime - (d.seekOffset || 10)));
      navigator.mediaSession.setActionHandler('seekforward',
        (d) => seekSeconds(el.audio.currentTime + (d.seekOffset || 10)));
    } catch { /* not all actions supported everywhere */ }
  }

  /* ---------- Controls wiring ---------- */

  function bindControls() {
    el.playBtn?.addEventListener('click', toggle);
    el.prevBtn?.addEventListener('click', prev);
    el.nextBtn?.addEventListener('click', () => next());
    el.shuffleBtn?.addEventListener('click', () => setShuffle(!state.shuffle));
    el.repeatBtn?.addEventListener('click', cycleRepeat);
    el.muteBtn?.addEventListener('click', toggleMute);
    el.volumeSlider?.addEventListener('input', (e) => setVolume(e.target.value));

    el.likeBtn?.addEventListener('click', () => {
      if (!state.current) return;
      playlist.toggleLike(state.current.id);
      updateLikeButton();
    });

    el.downloadBtn?.addEventListener('click', () => {
      if (!state.current) return;
      const a = document.createElement('a');
      a.href = state.current.src;
      a.download = (state.current.title || 'track') + '.mp3';
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('Download started', { icon: 'fa-download' });
    });

    el.shareBtn?.addEventListener('click', async () => {
      if (!state.current) return;
      const data = {
        title: state.current.title,
        text: `${state.current.title} — ${state.current.artist}`,
        url: state.current.src
      };
      try {
        if (navigator.share) await navigator.share(data);
        else {
          await navigator.clipboard.writeText(data.url);
          showToast('Link copied to clipboard', { icon: 'fa-link' });
        }
      } catch (err) {
        if (err && err.name !== 'AbortError') {
          showToast('Could not share this track',
            { icon: 'fa-triangle-exclamation' });
        }
      }
    });
  }

  /* ---------- Restore persisted state ---------- */

  function restore() {
    setVolume(storage.get(STORAGE.volume, 80));
    el.audio.muted = !!storage.get(STORAGE.muted, false);
    updateVolumeIcon();
    setShuffle(storage.get(STORAGE.shuffle, false));
    setRepeat(storage.get(STORAGE.repeat, 'off'));
  }

  function restoreLastTrack() {
    const id = storage.get(STORAGE.lastId, null);
    if (!id) return false;
    const track = playlist.getTrackById(id);
    if (!track) return false;
    load(track, playlist.getIndexById(id));
    return true;
  }

  /* ---------- Init ---------- */

  function init() {
    cacheDom();
    if (!el.audio) {
      console.error('[RS Soul Player] audio element missing');
      return;
    }
    bindControls();
    bindScrubber();
    bindAudioEvents();
    bindMediaSession();
    restore();

    // Keep index in sync when playlist mutates
    playlist.on('playlist:change', () => {
      if (!state.current) return;
      const idx = playlist.getIndexById(state.current.id);
      if (idx === -1) {
        const tracks = playlist.getTracks();
        if (tracks.length > 0) load(tracks[Math.min(state.index, tracks.length - 1)]);
      } else {
        state.index = idx;
      }
    });

    playlist.on('like:change', () => updateLikeButton());
  }

  /* ---------- Public API ---------- */

  return {
    init, on, load, play, pause, toggle, next, prev,
    seekRatio, seekSeconds, setVolume, toggleMute,
    setShuffle, setRepeat, restoreLastTrack,
    getCurrent: () => state.current,
    isPlaying: () => !el.audio.paused,
    getShuffle: () => state.shuffle,
    getRepeat: () => state.repeat
  };
})();