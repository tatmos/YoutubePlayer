/**
 * YouTube リスト再生 - メインアプリ
 * - URLリストの追加・削除・永続化（localStorage）
 * - YouTube IFrame API で再生・連続再生
 */

const STORAGE_KEY = 'youtube-player-playlist';

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
    return;
  }
  playAllBtn.disabled = false;
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
          ${formatDuration(item.duration) ? `<span class="duration">${escapeHtml(formatDuration(item.duration))}</span>` : ''}
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
      if (e.target.classList.contains('btn-remove')) return;
      playVideo(index);
    });
  });
  listEl.querySelectorAll('.btn-remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeItem(parseInt(btn.dataset.index, 10));
    });
  });
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
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
  const item = playlist[index];
  document.querySelector('.player-section')?.classList.add('playing');
  playerHint.style.display = 'none';
  if (watchOnYtEl) {
    watchOnYtEl.style.display = 'flex';
    if (watchOnYtLink) {
      watchOnYtLink.href = `https://www.youtube.com/watch?v=${item.id}`;
    }
  }

  if (player && playerReady) {
    player.loadVideoById(item.id);
  } else {
    createPlayer(item.id);
  }
  renderPlaylist();
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
        }
      },
    },
  });
}

function onYouTubeIframeAPIReady() {
  loadPlaylist();
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
playAllBtn.addEventListener('click', () => playVideo(0));
clearBtn.addEventListener('click', clearList);
saveTxtBtn.addEventListener('click', saveListToTxt);
loadTxtBtn.addEventListener('click', () => loadTxtInput.click());
loadTxtInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) loadListFromTxt(file);
});
