/**
 * YouTube リスト再生 - メインアプリ
 * - URLリストの追加・削除・永続化（localStorage）
 * - YouTube IFrame API で再生・連続再生
 */

const STORAGE_KEY = 'youtube-player-playlist';
const PLAY_MODE_KEY = 'youtube-player-play-mode';
const PLAYBACK_RATE_KEY = 'youtube-player-playback-rate';
const PLAY_MODES = { SEQUENTIAL: 'sequential', SHUFFLE: 'shuffle', SINGLE_LOOP: 'singleLoop' };

// ----- URL解析 -----
function parseYouTubeUrl(input) {
  if (!input || typeof input !== 'string') return null;
  const s = input.trim();
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  return null;
}

// ----- 状態 -----
let playlist = [];
let currentIndex = -1;
let player = null;
let playerReady = false;
let playMode = PLAY_MODES.SEQUENTIAL;
let shuffleOrder = [];
let shufflePosition = 0;
let playbackRate = 1;

// ----- DOM -----
const urlInput = document.getElementById('url-input');
const addBtn = document.getElementById('add-btn');
const playAllBtn = document.getElementById('play-all-btn');
const clearBtn = document.getElementById('clear-btn');
const listEl = document.getElementById('playlist');
const playerContainer = document.getElementById('player-container');
const playerHint = document.getElementById('player-hint');
const watchOnYtEl = document.getElementById('watch-on-yt');
const watchOnYtLink = document.getElementById('watch-on-yt-link');
const saveTxtBtn = document.getElementById('save-txt-btn');
const loadTxtBtn = document.getElementById('load-txt-btn');
const loadTxtInput = document.getElementById('load-txt-input');
const copyListBtn = document.getElementById('copy-list-btn');
const pasteListBtn = document.getElementById('paste-list-btn');
const skipEmbedDisabledCheckbox = document.getElementById('skip-embed-disabled');
const playModeBar = document.getElementById('play-mode-bar');
const playModeBtns = document.querySelectorAll('.play-mode-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const playbackSpeedSelect = document.getElementById('playback-speed');
const openEmbedDisabledInTabCheckbox = document.getElementById('open-embed-disabled-in-tab');
const openEmbedDisabledBtn = document.getElementById('open-embed-disabled-btn');
const instantPlaylistEmbedDisabledBtn = document.getElementById('instant-playlist-embed-disabled-btn');
const instantPlaylistBtn = document.getElementById('instant-playlist-btn');
const copyInstantPlaylistBtn = document.getElementById('copy-instant-playlist-btn');

// ----- 永続化 -----
function loadPlaylist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      playlist = Array.isArray(data) ? data : [];
      return;
    }
  } catch (_) {}
  playlist = [];
}

function savePlaylist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(playlist));
  } catch (_) {}
}

function loadPlayMode() {
  try {
    const m = localStorage.getItem(PLAY_MODE_KEY);
    if (m === PLAY_MODES.SHUFFLE || m === PLAY_MODES.SINGLE_LOOP) playMode = m;
  } catch (_) {}
}

function savePlayMode() {
  try {
    localStorage.setItem(PLAY_MODE_KEY, playMode);
  } catch (_) {}
}

function loadPlaybackRate() {
  try {
    var r = parseFloat(localStorage.getItem(PLAYBACK_RATE_KEY), 10);
    if (r >= 0.5 && r <= 2) playbackRate = r;
  } catch (_) {}
}

function savePlaybackRate() {
  try {
    localStorage.setItem(PLAYBACK_RATE_KEY, String(playbackRate));
  } catch (_) {}
}

function applyPlaybackRate(ytPlayer) {
  if (ytPlayer && ytPlayer.setPlaybackRate) ytPlayer.setPlaybackRate(playbackRate);
}

function buildShuffleOrder() {
  const order = playlist.map(function (_, i) { return i; });
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }
  return order;
}

function setPlayModeUI() {
  if (!playModeBtns || !playModeBtns.length) return;
  playModeBtns.forEach(function (btn) {
    const isActive = btn.getAttribute('data-mode') === playMode;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

// ----- リストUI -----
function getThumbnailUrl(videoId) {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

function formatDuration(seconds) {
  if (typeof seconds !== 'number' || seconds <= 0 || !Number.isFinite(seconds)) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return m + ':' + String(s).padStart(2, '0');
}

function renderPlaylist() {
  if (playlist.length === 0) {
    listEl.innerHTML = '<li class="playlist-empty">まだ動画がありません。上にURLを入力して追加してください。</li>';
    playAllBtn.disabled = true;
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }
  playAllBtn.disabled = false;
  if (prevBtn) prevBtn.disabled = false;
  if (nextBtn) nextBtn.disabled = false;
  listEl.innerHTML = playlist
    .map(
      (item, index) => `
    <li class="playlist-item ${index === currentIndex ? 'current' : ''}" data-index="${index}">
      <div class="thumb">
        <img src="${getThumbnailUrl(item.id)}" alt="" loading="lazy" />
      </div>
        <div class="info">
        <div class="title">${escapeHtml(item.url)}</div>
        <div class="meta">
          <span class="url">${escapeHtml(item.id)}</span>
          ${item.embedDisabled ? '<span class="duration duration--disabled">埋め込み再生不可</span><a href="https://www.youtube.com/watch?v=' + escapeHtml(item.id) + '" target="_blank" rel="noopener noreferrer" class="meta-yt-link">YouTubeで見る</a>' : (formatDuration(item.duration) ? `<span class="duration">${escapeHtml(formatDuration(item.duration))}</span>` : '')}
        </div>
      </div>
      <div class="actions">
        <button type="button" class="btn-remove" data-index="${index}" title="削除">削除</button>
      </div>
    </li>`
    )
    .join('');

  listEl.querySelectorAll('.playlist-item').forEach((el) => {
    const index = parseInt(el.dataset.index, 10);
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-remove') || e.target.classList.contains('meta-yt-link') || e.target.closest('.meta-yt-link')) return;
      playVideo(index);
    });
  });
  listEl.querySelectorAll('.btn-remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeItem(parseInt(btn.dataset.index, 10));
    });
  });

  if (currentIndex >= 0) {
    const currentEl = listEl.querySelector('.playlist-item.current');
    if (currentEl) {
      currentEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  var embedDisabledItems = getEmbedDisabledItems();
  if (openEmbedDisabledBtn) {
    openEmbedDisabledBtn.disabled = embedDisabledItems.length === 0;
    openEmbedDisabledBtn.textContent = embedDisabledItems.length === 0 ? '埋め込み不可の動画を別タブで開く' : '埋め込み不可の動画を別タブで開く (' + embedDisabledItems.length + '件)';
  }
  if (instantPlaylistEmbedDisabledBtn) {
    instantPlaylistEmbedDisabledBtn.disabled = embedDisabledItems.length === 0;
    instantPlaylistEmbedDisabledBtn.textContent = embedDisabledItems.length === 0 ? '埋め込み不可のみ即席プレイリストで開く' : '埋め込み不可のみ即席プレイリストで開く (' + embedDisabledItems.length + '件)';
  }
  if (instantPlaylistBtn) {
    instantPlaylistBtn.disabled = playlist.length === 0;
    instantPlaylistBtn.textContent = playlist.length === 0 ? '即席プレイリストで開く' : '即席プレイリストで開く (' + playlist.length + '件)';
  }
  if (copyInstantPlaylistBtn) copyInstantPlaylistBtn.disabled = playlist.length === 0;
  if (copyListBtn) copyListBtn.disabled = playlist.length === 0;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function getEmbedDisabledItems() {
  return playlist.filter(function (item) { return item.embedDisabled; });
}

function openEmbedDisabledInNewTab() {
  var items = getEmbedDisabledItems();
  if (items.length === 0) return;
  var listHtml = items.map(function (item, i) {
    var url = 'https://www.youtube.com/watch?v=' + escapeHtml(item.id);
    var label = escapeHtml(item.url);
    return '<li><a href="' + url + '" target="_blank" rel="noopener noreferrer">' + (i + 1) + '. ' + label + '</a></li>';
  }).join('');
  var html = '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>埋め込み再生できなかった動画</title><style>body{font-family:sans-serif;max-width:720px;margin:24px auto;padding:0 16px;background:#1a1a1a;color:#eee;}h1{font-size:1.25rem;}ul{list-style:none;padding:0;}li{margin:8px 0;}a{color:#e53935;}a:hover{text-decoration:underline;}</style></head><body><h1>埋め込み再生できなかった動画</h1><p>以下のリンクからYouTubeで視聴できます。</p><ul>' + listHtml + '</ul></body></html>';
  var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
}

function getInstantPlaylistUrlForEmbedDisabled() {
  var items = getEmbedDisabledItems();
  if (!items.length) return null;
  var ids = items.map(function (item) { return item.id; }).join(',');
  return 'https://www.youtube.com/watch_videos?video_ids=' + ids;
}

function openInstantPlaylistForEmbedDisabled() {
  var url = getInstantPlaylistUrlForEmbedDisabled();
  if (url) window.open(url, '_blank', 'noopener');
}

function getInstantPlaylistUrl() {
  if (!playlist.length) return null;
  var ids = playlist.map(function (item) { return item.id; }).join(',');
  return 'https://www.youtube.com/watch_videos?video_ids=' + ids;
}

function openInstantPlaylist() {
  var url = getInstantPlaylistUrl();
  if (url) window.open(url, '_blank', 'noopener');
}

function copyInstantPlaylistToClipboard() {
  var url = getInstantPlaylistUrl();
  if (!url) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function () {
      var btn = copyInstantPlaylistBtn;
      if (btn) {
        var orig = btn.textContent;
        btn.textContent = 'コピーしました';
        setTimeout(function () { btn.textContent = orig; }, 1500);
      }
    }).catch(function () { alert('コピーに失敗しました'); });
  } else {
    alert('このブラウザではクリップボードにコピーできません');
  }
}

// ----- リスト操作 -----
function addUrl() {
  const raw = urlInput.value.trim();
  if (!raw) return;
  const id = parseYouTubeUrl(raw);
  if (!id) {
    alert('有効なYouTubeのURLを入力してください。');
    return;
  }
  if (playlist.some((item) => item.id === id)) {
    alert('この動画はすでにリストに含まれています。');
    return;
  }
  playlist.push({ id, url: raw });
  savePlaylist();
  urlInput.value = '';
  renderPlaylist();
}

function removeItem(index) {
  if (index < 0 || index >= playlist.length) return;
  playlist.splice(index, 1);
  if (currentIndex === index) {
    currentIndex = -1;
    stopPlayer();
  } else if (currentIndex > index) {
    currentIndex--;
  }
  savePlaylist();
  renderPlaylist();
}

function clearList() {
  if (playlist.length === 0) return;
  if (!confirm('リストをすべて削除しますか？')) return;
  playlist = [];
  currentIndex = -1;
  stopPlayer();
  savePlaylist();
  renderPlaylist();
}

// ----- TXT 保存・読み込み -----
function saveListToTxt() {
  if (playlist.length === 0) {
    alert('リストが空です。');
    return;
  }
  const lines = playlist.map((item) => item.url);
  const text = lines.join('\n');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `youtube-playlist-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function copyListToClipboard() {
  if (playlist.length === 0) {
    alert('リストが空です。');
    return;
  }
  var text = playlist.map(function (item) { return item.url; }).join('\n');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      if (copyListBtn) {
        var orig = copyListBtn.textContent;
        copyListBtn.textContent = 'コピーしました';
        setTimeout(function () { copyListBtn.textContent = orig; }, 1500);
      }
    }).catch(function () { alert('コピーに失敗しました'); });
  } else {
    alert('このブラウザではクリップボードにコピーできません');
  }
}

function pasteListFromClipboard() {
  if (!navigator.clipboard || !navigator.clipboard.readText) {
    alert('このブラウザではクリップボードから貼り付けできません');
    return;
  }
  navigator.clipboard.readText().then(function (text) {
    var lines = text.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var added = 0;
    var existingIds = new Set(playlist.map(function (item) { return item.id; }));
    for (var i = 0; i < lines.length; i++) {
      var id = parseYouTubeUrl(lines[i]);
      if (id && !existingIds.has(id)) {
        existingIds.add(id);
        playlist.push({ id: id, url: lines[i] });
        added++;
      }
    }
    savePlaylist();
    renderPlaylist();
    alert(added + '件を追加しました。' + (lines.length - added) + '件はスキップ（重複または無効）しました。');
  }).catch(function () { alert('クリップボードの読み取りに失敗しました'); });
}

function loadListFromTxt(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result;
    const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    let added = 0;
    const existingIds = new Set(playlist.map((item) => item.id));
    for (const line of lines) {
      const id = parseYouTubeUrl(line);
      if (id && !existingIds.has(id)) {
        existingIds.add(id);
        playlist.push({ id, url: line });
        added++;
      }
    }
    savePlaylist();
    renderPlaylist();
    loadTxtInput.value = '';
    alert(`${added}件を追加しました。${lines.length - added}件はスキップ（重複または無効）しました。`);
  };
  reader.readAsText(file, 'UTF-8');
}

// ----- 再生 -----
function stopPlayer() {
  if (player && playerReady) {
    player.stopVideo();
  }
  currentIndex = -1;
  document.querySelector('.player-section')?.classList.remove('playing');
  playerHint.style.display = '';
  if (watchOnYtEl) watchOnYtEl.style.display = 'none';
  renderPlaylist();
}

function playVideo(index) {
  if (index < 0 || index >= playlist.length) return;
  currentIndex = index;
  if (playMode === PLAY_MODES.SHUFFLE) {
    if (shuffleOrder.length !== playlist.length) {
      shuffleOrder = buildShuffleOrder();
    }
    var pos = shuffleOrder.indexOf(index);
    shufflePosition = pos >= 0 ? pos : 0;
  }
  const item = playlist[index];
  document.querySelector('.player-section')?.classList.add('playing');
  playerHint.style.display = 'none';
  if (watchOnYtEl) {
    watchOnYtEl.style.display = 'flex';
    if (watchOnYtLink) {
      watchOnYtLink.href = 'https://www.youtube.com/watch?v=' + item.id;
    }
  }

  if (player && playerReady) {
    player.loadVideoById(item.id);
  } else {
    createPlayer(item.id);
  }
  renderPlaylist();
}

function playNext() {
  if (playlist.length === 0) return;
  if (playMode === PLAY_MODES.SINGLE_LOOP) {
    playVideo(currentIndex);
    return;
  }
  if (playMode === PLAY_MODES.SEQUENTIAL) {
    if (currentIndex >= playlist.length - 1) {
      if (openEmbedDisabledInTabCheckbox && openEmbedDisabledInTabCheckbox.checked && getEmbedDisabledItems().length > 0) {
        endOfListReached();
        return;
      }
      playVideo(0);
    } else {
      playVideo(currentIndex + 1);
    }
    return;
  }
  if (playMode === PLAY_MODES.SHUFFLE) {
    shufflePosition++;
    if (shufflePosition >= shuffleOrder.length) {
      if (openEmbedDisabledInTabCheckbox && openEmbedDisabledInTabCheckbox.checked && getEmbedDisabledItems().length > 0) {
        endOfListReached();
        return;
      }
      shuffleOrder = buildShuffleOrder();
      shufflePosition = 0;
    }
    playVideo(shuffleOrder[shufflePosition]);
  }
}

function endOfListReached() {
  stopPlayer();
  openInstantPlaylistForEmbedDisabled();
}

function playPrevious() {
  if (playlist.length === 0) return;
  if (playMode === PLAY_MODES.SEQUENTIAL) {
    var idx = currentIndex <= 0 ? playlist.length - 1 : currentIndex - 1;
    playVideo(idx);
    return;
  }
  if (playMode === PLAY_MODES.SHUFFLE) {
    if (shuffleOrder.length !== playlist.length) shuffleOrder = buildShuffleOrder();
    shufflePosition = shufflePosition <= 0 ? shuffleOrder.length - 1 : shufflePosition - 1;
    playVideo(shuffleOrder[shufflePosition]);
    return;
  }
  if (playMode === PLAY_MODES.SINGLE_LOOP) {
    var prevIdx = currentIndex <= 0 ? playlist.length - 1 : currentIndex - 1;
    playVideo(prevIdx);
  }
}

// ----- YouTube IFrame API -----
const PLACEHOLDER_VIDEO_ID = 'dQw4w9WgXcQ'; // プレイヤー初期化用

function createPlayer(videoId) {
  if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
    alert('YouTubeを読み込み中です。しばらく待ってから再度お試しください。');
    return;
  }
  if (player) {
    player.loadVideoById(videoId);
    return;
  }
  player = new YT.Player('player-container', {
    videoId: videoId || PLACEHOLDER_VIDEO_ID,
    width: '100%',
    height: '100%',
    playerVars: {
      autoplay: 1,
      rel: 0,
      modestbranding: 1,
    },
    events: {
      onReady(e) {
        playerReady = true;
        if (videoId) e.target.playVideo();
        applyPlaybackRate(e.target);
      },
      onError(e) {
        if (e.data === 101 || e.data === 150) {
          if (currentIndex >= 0 && currentIndex < playlist.length) {
            playlist[currentIndex].embedDisabled = true;
            savePlaylist();
            renderPlaylist();
          }
          if (skipEmbedDisabledCheckbox && skipEmbedDisabledCheckbox.checked) {
            playNext();
          }
        }
      },
      onStateChange(e) {
        if (e.data === YT.PlayerState.ENDED) {
          playNext();
        } else if ((e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.CUED) && currentIndex >= 0 && currentIndex < playlist.length) {
          var sec = e.target.getDuration && e.target.getDuration();
          if (typeof sec === 'number' && sec > 0) {
            playlist[currentIndex].duration = sec;
            savePlaylist();
            renderPlaylist();
          }
          applyPlaybackRate(e.target);
        }
      },
    },
  });
}

function onYouTubeIframeAPIReady() {
  loadPlaylist();
  loadPlayMode();
  loadPlaybackRate();
  setPlayModeUI();
  if (playbackSpeedSelect) playbackSpeedSelect.value = String(playbackRate);
  renderPlaylist();
}

if (typeof YT === 'undefined') {
  window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
} else {
  onYouTubeIframeAPIReady();
}

// ----- イベント -----
addBtn.addEventListener('click', addUrl);
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addUrl();
});
playAllBtn.addEventListener('click', function () {
  if (playMode === PLAY_MODES.SHUFFLE && playlist.length > 0) {
    shuffleOrder = buildShuffleOrder();
    shufflePosition = 0;
    playVideo(shuffleOrder[0]);
  } else {
    playVideo(0);
  }
});
clearBtn.addEventListener('click', clearList);
if (prevBtn) prevBtn.addEventListener('click', playPrevious);
if (nextBtn) nextBtn.addEventListener('click', playNext);
if (openEmbedDisabledBtn) openEmbedDisabledBtn.addEventListener('click', openEmbedDisabledInNewTab);
if (instantPlaylistEmbedDisabledBtn) instantPlaylistEmbedDisabledBtn.addEventListener('click', openInstantPlaylistForEmbedDisabled);
if (instantPlaylistBtn) instantPlaylistBtn.addEventListener('click', openInstantPlaylist);
if (copyInstantPlaylistBtn) copyInstantPlaylistBtn.addEventListener('click', copyInstantPlaylistToClipboard);
if (playbackSpeedSelect) {
  playbackSpeedSelect.addEventListener('change', function () {
    var r = parseFloat(playbackSpeedSelect.value, 10);
    if (!isNaN(r) && r >= 0.5 && r <= 2) {
      playbackRate = r;
      savePlaybackRate();
      if (player && playerReady && player.setPlaybackRate) player.setPlaybackRate(playbackRate);
    }
  });
}
saveTxtBtn.addEventListener('click', saveListToTxt);
loadTxtBtn.addEventListener('click', () => loadTxtInput.click());
if (copyListBtn) copyListBtn.addEventListener('click', copyListToClipboard);
if (pasteListBtn) pasteListBtn.addEventListener('click', pasteListFromClipboard);
loadTxtInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) loadListFromTxt(file);
});
if (playModeBtns && playModeBtns.length) {
  playModeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var mode = btn.getAttribute('data-mode');
      if (mode === PLAY_MODES.SEQUENTIAL || mode === PLAY_MODES.SHUFFLE || mode === PLAY_MODES.SINGLE_LOOP) {
        playMode = mode;
        savePlayMode();
        setPlayModeUI();
      }
    });
  });
}
