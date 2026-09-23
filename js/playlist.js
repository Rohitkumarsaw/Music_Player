/* ==========================================================================
   RS Soul — Playlist / Queue (Release-Grouped)
   --------------------------------------------------------------------------
   Owns the in-memory track list, renders the sidebar grouped by release,
   handles:
     • release-wise grouping (collapsible)
     • search filtering
     • filter tabs (All / Liked / Recent)
     • sort options (title, artist, duration)
     • active filter chips (removable)
     • active-track highlighting
     • per-track like toggle (persisted)
     • queue mutation (remove / reorder)
     • per-track thumbnail (default SVG cover when no image)

   Emits events through a tiny pub/sub so player.js / app.js can react.
   ========================================================================== */

const SonoraPlaylist = (() => {
  'use strict';

  const { $, $$, escapeHtml, storage, showToast, debounce } = SonoraUtils;

  /* ---------- Storage keys ---------- */

  const STORAGE = {
    likes: 'sonora-likes',
    filterTab: 'sonora-filter-tab',
    sortBy: 'sonora-sort',
    recent: 'sonora-recent',
    collapsed: 'sonora-collapsed-releases'
  };

  /* ---------- Filter constants ---------- */

  const FILTER_TABS = ['all', 'liked', 'recent'];

  const SORT_OPTIONS = [
    'default',
    'title-asc',
    'title-desc',
    'artist-asc',
    'artist-desc',
    'duration-asc',
    'duration-desc'
  ];

  const RECENT_LIMIT = 20;

  /* ---------- Default thumbnail (SVG data URI) ----------
     Palette matches RS Soul theme: cyan → violet gradient. */

  const DEFAULT_THUMB =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#2fe0ff"/>
            <stop offset="100%" stop-color="#b16bff"/>
          </linearGradient>
          <radialGradient id="gl" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#b16bff" stop-opacity="0.4"/>
            <stop offset="100%" stop-color="#000" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="50" fill="#0a0b10"/>
        <circle cx="50" cy="50" r="48" fill="url(#gl)"/>
        <circle cx="50" cy="50" r="40" fill="none" stroke="url(#g)" stroke-width="1" opacity="0.4"/>
        <circle cx="50" cy="50" r="30" fill="none" stroke="url(#g)" stroke-width="1" opacity="0.6"/>
        <circle cx="50" cy="50" r="20" fill="none" stroke="url(#g)" stroke-width="1.5" opacity="0.8"/>
        <circle cx="50" cy="50" r="10" fill="none" stroke="url(#g)" stroke-width="2"/>
        <circle cx="50" cy="50" r="3.5" fill="#0a0b10" stroke="url(#g)" stroke-width="1.5"/>
        <path d="M 46 38 L 46 62 L 66 50 Z" fill="url(#g)"/>
      </svg>
    `);

  /* ---------- Tiny event bus ---------- */

  const listeners = new Map();

  function on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
    return () => listeners.get(event)?.delete(handler);
  }

  function emit(event, payload) {
    listeners.get(event)?.forEach((fn) => {
      try { fn(payload); } catch (err) { console.error(err); }
    });
  }

  /* ---------- State ---------- */

  const state = {
    tracks: [],
    filtered: [],
    search: '',
    currentId: null,
    likes: new Set(storage.get(STORAGE.likes, [])),
    activeTab: storage.get(STORAGE.filterTab, 'all'),
    sortBy: storage.get(STORAGE.sortBy, 'default'),
    recent: storage.get(STORAGE.recent, []),
    collapsed: new Set(storage.get(STORAGE.collapsed, [])) // release IDs that are collapsed
  };

  // Validate persisted state
  if (!FILTER_TABS.includes(state.activeTab)) state.activeTab = 'all';
  if (!SORT_OPTIONS.includes(state.sortBy)) state.sortBy = 'default';
  if (!Array.isArray(state.recent)) state.recent = [];
  if (!(state.collapsed instanceof Set)) state.collapsed = new Set();

  /* ---------- DOM refs ---------- */

  let el = {};

  function cacheDom() {
    el = {
      list: $('#playlist'),
      status: $('#queue-status'),
      count: $('#queue-count'),
      search: $('#track-search'),
      filterTabs: $$('.filter-tab'),
      sortSelect: $('#sort-select'),
      chips: $('#filter-chips')
    };
  }

  /* ---------- Release key helper ---------- */

  /**
   * Get a stable key identifying a track's release/group.
   * Falls back to the album name or a generic bucket.
   */
  function getReleaseKey(track) {
    return track.releaseTag
      || track.album
      || track.releaseName
      || 'unknown-release';
  }

  /** Human-readable label for a release group. */
  function getReleaseLabel(track) {
    const tag = track.releaseTag || '';
    const name = track.album || track.releaseName || 'Unknown Release';
    // "v1.0.0 · First Release" — ya sirf ek, agar doosra missing ho
    if (tag && name && tag !== name) return `${tag} · ${name}`;
    return name || tag || 'Unknown Release';
  }

  /**
   * Group an array of tracks by release.
   * Preserves the input order of groups (first-seen wins)
   * and of tracks within a group.
   *
   * @returns {Array<{ key, label, tracks, count }>}
   */
  function groupByRelease(tracks) {
    const groups = new Map();

    for (const track of tracks) {
      const key = getReleaseKey(track);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: getReleaseLabel(track),
          tracks: [],
          cover: track.cover || null
        });
      }
      groups.get(key).tracks.push(track);
    }

    // Turn into array and add count
    return Array.from(groups.values()).map((g) => ({
      ...g,
      count: g.tracks.length
    }));
  }

  /* ---------- Filtering & sorting ---------- */

  /**
   * Apply search + tab filter, then sort, into `state.filtered`.
   */
  function applyFilter() {
    let result = state.tracks.slice();

    // 1) Search
    const q = state.search.trim().toLowerCase();
    if (q) {
      result = result.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        (t.album || '').toLowerCase().includes(q) ||
        (t.releaseTag || '').toLowerCase().includes(q)
      );
    }

    // 2) Tab filter
    if (state.activeTab === 'liked') {
      result = result.filter((t) => state.likes.has(t.id));
    } else if (state.activeTab === 'recent') {
      const recentSet = new Set(state.recent);
      result = result.filter((t) => recentSet.has(t.id));
      result.sort((a, b) => state.recent.indexOf(a.id) - state.recent.indexOf(b.id));
    }

    // 3) Sort
    if (state.activeTab !== 'recent' || state.sortBy !== 'default') {
      result = sortTracks(result, state.sortBy);
    }

    state.filtered = result;
  }

  /** Sort a copy of the tracks array by the given mode. */
  function sortTracks(tracks, mode) {
    const copy = tracks.slice();
    switch (mode) {
      case 'title-asc':
        return copy.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      case 'title-desc':
        return copy.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
      case 'artist-asc':
        return copy.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
      case 'artist-desc':
        return copy.sort((a, b) => (b.artist || '').localeCompare(a.artist || ''));
      case 'duration-asc':
        return copy.sort((a, b) => (a.duration || 0) - (b.duration || 0));
      case 'duration-desc':
        return copy.sort((a, b) => (b.duration || 0) - (a.duration || 0));
      case 'default':
      default:
        return copy;
    }
  }

  /* ---------- Rendering ---------- */

  function renderStatus() {
    if (!el.status) return;
    if (state.tracks.length === 0) {
      el.status.classList.remove('is-hidden');
      el.status.innerHTML =
        '<i class="fa-solid fa-circle-info" aria-hidden="true"></i>' +
        '<span>No tracks available.</span>';
    } else {
      el.status.classList.add('is-hidden');
    }
  }

  function renderCount() {
    if (!el.count) return;
    const total = state.tracks.length;
    const shown = state.filtered.length;
    el.count.textContent = shown === total
      ? `${total} track${total === 1 ? '' : 's'}`
      : `${shown} of ${total} tracks`;
  }

  function renderFilterTabs() {
    if (!el.filterTabs || el.filterTabs.length === 0) return;
    el.filterTabs.forEach((tab) => {
      const isActive = tab.dataset.filter === state.activeTab;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });
  }

  function renderSortSelect() {
    if (el.sortSelect) el.sortSelect.value = state.sortBy;
  }

  function renderChips() {
    if (!el.chips) return;

    const chips = [];

    if (state.activeTab !== 'all') {
      const labels = { liked: 'Liked', recent: 'Recent' };
      chips.push({ key: 'tab', label: labels[state.activeTab] || state.activeTab });
    }

    if (state.sortBy !== 'default') {
      const labels = {
        'title-asc': 'Title A–Z',
        'title-desc': 'Title Z–A',
        'artist-asc': 'Artist A–Z',
        'artist-desc': 'Artist Z–A',
        'duration-asc': 'Duration ↑',
        'duration-desc': 'Duration ↓'
      };
      chips.push({ key: 'sort', label: labels[state.sortBy] || state.sortBy });
    }

    if (state.search.trim()) {
      chips.push({ key: 'search', label: `"${state.search.trim()}"` });
    }

    if (chips.length === 0) {
      el.chips.hidden = true;
      el.chips.innerHTML = '';
      return;
    }

    el.chips.hidden = false;
    el.chips.innerHTML = chips.map((c) => `
      <span class="chip" data-chip-key="${escapeHtml(c.key)}">
        <span>${escapeHtml(c.label)}</span>
        <button type="button"
                class="chip-remove"
                data-chip-key="${escapeHtml(c.key)}"
                aria-label="Remove ${escapeHtml(c.label)} filter">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </span>
    `).join('');
  }

  /* ---------- Track row template ---------- */

  function renderTrackRow(track, displayIndex) {
    const isActive = track.id === state.currentId;
    const isLiked = state.likes.has(track.id);
    const coverSrc = track.cover || DEFAULT_THUMB;
    const indexLabel = String(displayIndex).padStart(2, '0');

    return `
      <li class="track-item ${isActive ? 'is-active' : ''}"
          role="option"
          tabindex="0"
          aria-selected="${isActive}"
          data-track-id="${escapeHtml(track.id)}">
        <span class="track-index" aria-hidden="true">${indexLabel}</span>
        <img class="track-thumb ${isActive ? 'is-spinning' : ''}"
             src="${coverSrc}"
             alt=""
             loading="lazy"
             draggable="false"
             aria-hidden="true">
        <div class="track-info">
          <p class="track-name" title="${escapeHtml(track.title)}">${escapeHtml(track.title)}</p>
          <p class="track-by" title="${escapeHtml(track.artist)}">${escapeHtml(track.artist)}</p>
        </div>
        <button class="icon-btn-sm track-like"
                data-track-id="${escapeHtml(track.id)}"
                aria-label="${isLiked ? 'Remove from favorites' : 'Add to favorites'}"
                aria-pressed="${isLiked}">
          <i class="fa-${isLiked ? 'solid' : 'regular'} fa-heart" aria-hidden="true"></i>
        </button>
      </li>`;
  }

  /* ---------- Group header template ---------- */

  function renderGroupHeader(group) {
    const isCollapsed = state.collapsed.has(group.key);
    const groupId = `group-${escapeHtml(group.key)}`;

    return `
      <li class="release-group-header ${isCollapsed ? 'is-collapsed' : ''}"
          data-release-key="${escapeHtml(group.key)}"
          role="presentation">
        <button type="button"
                class="release-toggle"
                aria-expanded="${!isCollapsed}"
                aria-controls="${groupId}"
                data-release-key="${escapeHtml(group.key)}">
          <span class="release-caret" aria-hidden="true">
            <i class="fa-solid fa-chevron-down"></i>
          </span>
          <span class="release-label" title="${escapeHtml(group.label)}">${escapeHtml(group.label)}</span>
          <span class="release-count">${group.count}</span>
        </button>
      </li>`;
  }

  /* ---------- Main list renderer (grouped) ---------- */

  function renderList() {
    if (!el.list) return;

    // Empty (or all filtered out) state
    if (state.filtered.length === 0) {
      const msg = state.tracks.length === 0
        ? 'No tracks available'
        : 'No matching tracks';
      const hint = state.tracks.length === 0
        ? 'Add tracks to your GitHub release'
        : 'Try a different filter or search';

      el.list.innerHTML = `
        <li class="track-item" style="cursor:default;">
          <span class="track-index">–</span>
          <div class="track-info">
            <p class="track-name">${msg}</p>
            <p class="track-by">${hint}</p>
          </div>
        </li>`;
      return;
    }

    // Group filtered tracks by release
    const groups = groupByRelease(state.filtered);

    // Build DOM: for each group → header + (if not collapsed) its tracks
    let globalIndex = 0;
    const html = groups.map((group) => {
      const isCollapsed = state.collapsed.has(group.key);
      const groupId = `group-${escapeHtml(group.key)}`;

      const headerHtml = renderGroupHeader(group);

      if (isCollapsed) {
        return headerHtml;
      }

      const tracksHtml = group.tracks.map((track) => {
        globalIndex += 1;
        return renderTrackRow(track, globalIndex);
      }).join('');

      return `
        ${headerHtml}
        <li class="release-group-tracks"
            id="${groupId}"
            role="presentation">
          <ul class="release-group-list" role="group">
            ${tracksHtml}
          </ul>
        </li>`;
    }).join('');

    el.list.innerHTML = html;
  }

  function render() {
    applyFilter();
    renderList();
    renderCount();
    renderStatus();
    renderFilterTabs();
    renderSortSelect();
    renderChips();
  }

  /* ---------- Interactions ---------- */

  function handleListClick(e) {
    // 1) Group toggle
    const toggle = e.target.closest('.release-toggle');
    if (toggle) {
      e.stopPropagation();
      const key = toggle.dataset.releaseKey;
      if (!key) return;
      toggleRelease(key);
      return;
    }

    // 2) Like button
    const likeBtn = e.target.closest('.track-like');
    if (likeBtn) {
      e.stopPropagation();
      toggleLike(likeBtn.dataset.trackId);
      return;
    }

    // 3) Track row click
    const item = e.target.closest('.track-item');
    if (!item || !item.dataset.trackId) return;
    selectTrack(item.dataset.trackId);
  }

  function handleListKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const item = e.target.closest('.track-item');
    if (!item || !item.dataset.trackId) return;
    e.preventDefault();
    selectTrack(item.dataset.trackId);
  }

  function selectTrack(id) {
    const index = state.tracks.findIndex((t) => t.id === id);
    if (index === -1) return;
    markAsRecent(id);
    emit('track:select', { id, index, track: state.tracks[index] });
  }

  /* ---------- Release toggle ---------- */

  function toggleRelease(key) {
    if (state.collapsed.has(key)) {
      state.collapsed.delete(key);
    } else {
      state.collapsed.add(key);
    }
    storage.set(STORAGE.collapsed, Array.from(state.collapsed));
    renderList();
  }

  function expandAllReleases() {
    state.collapsed.clear();
    storage.set(STORAGE.collapsed, []);
    renderList();
  }

  function collapseAllReleases() {
    const groups = groupByRelease(state.filtered);
    groups.forEach((g) => state.collapsed.add(g.key));
    storage.set(STORAGE.collapsed, Array.from(state.collapsed));
    renderList();
  }

  /* ---------- Filter handlers ---------- */

  function handleFilterTabClick(e) {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    const next = tab.dataset.filter;
    if (!FILTER_TABS.includes(next) || next === state.activeTab) return;

    state.activeTab = next;
    storage.set(STORAGE.filterTab, next);
    render();
    emit('filter:change', { tab: next });
  }

  function handleSortChange(e) {
    const next = e.target.value;
    if (!SORT_OPTIONS.includes(next) || next === state.sortBy) return;

    state.sortBy = next;
    storage.set(STORAGE.sortBy, next);
    render();
    emit('sort:change', { sortBy: next });
  }

  function handleChipsClick(e) {
    const btn = e.target.closest('.chip-remove');
    if (!btn) return;
    const key = btn.dataset.chipKey;

    if (key === 'tab') {
      state.activeTab = 'all';
      storage.set(STORAGE.filterTab, 'all');
    } else if (key === 'sort') {
      state.sortBy = 'default';
      storage.set(STORAGE.sortBy, 'default');
    } else if (key === 'search') {
      state.search = '';
      if (el.search) el.search.value = '';
    }

    render();
  }

  /* ---------- Recent tracking ---------- */

  function markAsRecent(id) {
    if (!id) return;
    const next = [id, ...state.recent.filter((x) => x !== id)].slice(0, RECENT_LIMIT);
    state.recent = next;
    storage.set(STORAGE.recent, next);
  }

  /* ---------- Mutations ---------- */

  function setTracks(tracks, { preserveCurrent = true } = {}) {
    state.tracks = Array.isArray(tracks) ? tracks.slice() : [];
    if (!preserveCurrent) state.currentId = null;

    state.tracks.forEach((t) => {
      if (state.likes.has(t.id)) t.liked = true;
    });

    render();
    emit('playlist:change', { tracks: state.tracks.slice() });
  }

  function setCurrent(id) {
    if (state.currentId === id) return;
    state.currentId = id;
    renderList();
  }

  function toggleLike(id) {
    const track = state.tracks.find((t) => t.id === id);
    if (!track) return;

    if (state.likes.has(id)) {
      state.likes.delete(id);
      track.liked = false;
      showToast('Removed from favorites', { icon: 'fa-heart-crack' });
    } else {
      state.likes.add(id);
      track.liked = true;
      showToast('Added to favorites', { icon: 'fa-heart' });
    }

    storage.set(STORAGE.likes, Array.from(state.likes));
    render();
    emit('like:change', { id, liked: track.liked });
  }

  function removeTrack(id) {
    const index = state.tracks.findIndex((t) => t.id === id);
    if (index === -1) return;
    const [removed] = state.tracks.splice(index, 1);
    state.recent = state.recent.filter((x) => x !== id);
    storage.set(STORAGE.recent, state.recent);
    render();
    emit('track:remove', { id, index, removed });
    showToast(`Removed "${removed.title}"`, { icon: 'fa-trash' });
  }

  function moveTrack(fromId, toIndex) {
    const fromIndex = state.tracks.findIndex((t) => t.id === fromId);
    if (fromIndex === -1) return;
    if (toIndex < 0 || toIndex >= state.tracks.length) return;
    const [moved] = state.tracks.splice(fromIndex, 1);
    state.tracks.splice(toIndex, 0, moved);
    render();
    emit('track:move', { id: fromId, fromIndex, toIndex });
  }

  /* ---------- Public getters ---------- */

  const getTracks = () => state.tracks.slice();
  const getFilteredTracks = () => state.filtered.slice();
  const getTrackById = (id) => state.tracks.find((t) => t.id === id) || null;
  const getIndexById = (id) => state.tracks.findIndex((t) => t.id === id);
  const isLiked = (id) => state.likes.has(id);
  const getCurrentId = () => state.currentId;
  const getActiveTab = () => state.activeTab;
  const getSortBy = () => state.sortBy;
  const getReleaseGroups = () => groupByRelease(state.tracks);

  /* ---------- Search wiring ---------- */

  function bindSearch() {
    if (!el.search) return;
    const run = debounce(() => {
      state.search = el.search.value;
      render();
    }, 150);
    el.search.addEventListener('input', run);
  }

  /* ---------- Filter wiring ---------- */

  function bindFilters() {
    const tabList = document.querySelector('.filter-tabs');
    if (tabList) tabList.addEventListener('click', handleFilterTabClick);

    if (el.sortSelect) el.sortSelect.addEventListener('change', handleSortChange);

    if (el.chips) el.chips.addEventListener('click', handleChipsClick);
  }

  /* ---------- Init ---------- */

  function init() {
    cacheDom();
    if (el.list) {
      el.list.addEventListener('click', handleListClick);
      el.list.addEventListener('keydown', handleListKeydown);
    }
    bindSearch();
    bindFilters();
    render();
  }

  /* ---------- Public API ---------- */

  return {
    init, on,
    setTracks, setCurrent,
    toggleLike, removeTrack, moveTrack,
    getTracks, getFilteredTracks,
    getTrackById, getIndexById,
    isLiked, getCurrentId,
    getActiveTab, getSortBy,
    getReleaseGroups,
    toggleRelease, expandAllReleases, collapseAllReleases,
    render
  };
})();