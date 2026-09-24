/* ===== 做一面你的唱片架 =====
   資料流：iTunes 搜尋（瀏覽器直連，對方開放跨域）→ 放上曲目表 → 封面取色（color.js，
   與 scripts/add-song.mjs 同一支）→ 草稿存在這台裝置 → 發布／修改走 /api/walls。
   伺服器發布時會自己再查一次 iTunes，這裡送出的只有曲目 ID、商店、顏色、一句話、站名、署名。 */

import { bgFromPixels } from './color.js';

const $ = id => document.getElementById(id);
const LIMIT = 60, NOTE_MAX = 80;
const SUSPECT = /\b(remix|acoustic|live|karaoke|tribute|covers?|renditions?|lullaby|instrumental|hardstyle|nightcore|8d|lo-?fi|edit|versions?)\b|sped.?up|slowed|翻唱|伴奏|純音樂|鋼琴版/i;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

/* ---------- 狀態 ---------- */
let state = { name: '', by: '', songs: [] };   // songs：{t,c,title,artist,album,year,released,ms,art,preview,bg,note,added}
let editing = null;                             // { id, key }
let results = [];
let missing = new Set();
let fresh = null;                               // 剛放上的那首：只有它播進場動畫

/* ---------- 小工具 ---------- */
const art = (url, px) => url.replace(/\d+x\d+bb/, `${px}x${px}bb`);
const sorted = () => [...state.songs].sort((a, b) => (b.released || '').localeCompare(a.released || '') || a.added - b.added);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const len = s => [...s].length;
const side = (i, n) => { const a = Math.ceil(n / 2); return i < a ? `A${i + 1}` : `B${i - a + 1}`; };
const clock = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const catalog = id => 'RS-' + id.toUpperCase();
function setBg(hex) {
  if (!hex) return;
  document.body.style.backgroundColor = hex;
  const v = parseInt(hex.slice(1), 16);
  document.documentElement.style.setProperty('--hdr', `rgba(${[(v >> 16) & 255, (v >> 8) & 255, v & 255].join(',')},.94)`);
}
function status(msg) { $('status').textContent = msg || ''; }

/* ---------- 試聽（全頁共用一個播放器，永不自動播） ---------- */
const audio = new Audio();
audio.preload = 'none';
let playingBtn = null;
function playBtn(url, label) {
  const b = el('button', 'play');
  b.type = 'button';
  b.setAttribute('aria-pressed', 'false');
  b.setAttribute('aria-label', '試聽 30 秒：' + label);
  b.innerHTML = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1l7 4-7 4z"/></svg>';
  b.addEventListener('click', () => {
    if (playingBtn === b) { audio.pause(); return; }
    audio.src = url; audio.play().catch(() => {});
    if (playingBtn) playingBtn.setAttribute('aria-pressed', 'false');
    playingBtn = b; b.setAttribute('aria-pressed', 'true');
  });
  return b;
}
audio.addEventListener('pause', () => { if (playingBtn) playingBtn.setAttribute('aria-pressed', 'false'); playingBtn = null; });
audio.addEventListener('ended', () => audio.dispatchEvent(new Event('pause')));

/* ---------- 取色：600px 封面（mzstatic 開放跨域）→ canvas → color.js ---------- */
function colorOf(url) {
  return new Promise(ok => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        ok(bgFromPixels(g.getImageData(0, 0, c.width, c.height).data).bg);
      } catch { ok('#3d3a38'); }
    };
    img.onerror = () => ok('#3d3a38');
    img.src = url;
  });
}

/* ---------- 搜尋 ---------- */
$('searchForm').addEventListener('submit', async e => {
  e.preventDefault();
  const term = $('searchIn').value.trim();
  const c = $('storeIn').value;
  if (!term) { $('searchIn').focus(); return; }
  $('searchHelp').textContent = '找找看……';
  try {
    const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=25&country=${c}`);
    if (!r.ok) throw 0;
    const { results: raw = [] } = await r.json();
    results = raw.filter(x => x.kind === 'song' && x.previewUrl)
      .map((x, i) => ({ x, i, sus: SUSPECT.test(x.trackName) || SUSPECT.test(x.collectionName || '') }))
      .sort((a, b) => a.sus - b.sus || a.i - b.i)      // 原曲在前，特殊版本沉底
      .slice(0, 8)
      .map(({ x, sus }) => ({ ...toSong(x, c), sus }));
    renderResults();
    $('searchHelp').textContent = results.length
      ? `${results.length} 個結果。按 ▶ 先聽 30 秒，確認是你擁有的那個版本。`
      : `${$('storeIn').selectedOptions[0].text}商店找不到「${term}」。換個寫法，或換一個商店試試。`;
  } catch {
    $('searchHelp').textContent = '連不上 iTunes，等一下再搜一次。';
  }
});

function toSong(x, c) {
  const d = new Date(x.releaseDate);
  return {
    t: String(x.trackId), c,
    title: x.trackName || '', artist: x.artistName || '', album: x.collectionName || '',
    year: isNaN(d) ? '' : String(d.getUTCFullYear()),
    released: isNaN(d) ? '' : d.toISOString().slice(0, 10),
    ms: x.trackTimeMillis || 0,
    art: art(x.artworkUrl100 || '', 600), preview: x.previewUrl || '',
  };
}

function placedAt(t) {   // 這首現在排在哪一面第幾首
  const list = sorted(); const i = list.findIndex(s => s.t === t);
  return i < 0 ? '' : side(i, list.length);
}

function renderResults() {
  const box = $('results');
  box.replaceChildren();
  box.hidden = !results.length;
  const have = new Set(state.songs.map(s => s.t));
  results.forEach(s => {
    const row = el('div', 'res');
    const im = el('img'); im.src = art(s.art, 100); im.alt = ''; im.loading = 'lazy';
    const txt = el('div');
    const t = el('div', 't', s.title);
    if (s.sus) t.append(el('span', 'tag', '特殊版本'));
    txt.append(t, el('div', 's', `${s.artist}　${s.album}${s.year ? '，' + s.year : ''}`));
    const acts = el('div', 'acts');
    const add = el('button', 'btn small', have.has(s.t) ? `已放上 · ${placedAt(s.t)}` : '放上去');
    add.type = 'button';
    add.dataset.t = s.t;
    add.disabled = have.has(s.t) || state.songs.length >= LIMIT;
    add.addEventListener('click', () => addSong(s));
    acts.append(playBtn(s.preview, s.title), add);
    row.append(im, txt, acts);
    box.append(row);
  });
}

/* ---------- 曲目表 ---------- */
let seq = 0;
async function addSong(s) {
  if (state.songs.some(x => x.t === s.t) || state.songs.length >= LIMIT) return;
  const song = { t: s.t, c: s.c, title: s.title, artist: s.artist, album: s.album, year: s.year, released: s.released,
                 ms: s.ms || 0, art: s.art, preview: s.preview, bg: '', note: '', added: Date.now() + (seq++) };
  state.songs.push(song);
  fresh = song.t;
  render(); save();
  renderResults();   // 每一顆「已放上」都更新成現在的位置（重排可能讓別首換面）
  $('results').querySelector(`button[data-t="${CSS.escape(song.t)}"]`)?.focus();
  song.bg = await colorOf(song.art);
  setBg(song.bg);
  save();
}

function removeSong(t) {
  state.songs = state.songs.filter(s => s.t !== t);
  missing.delete(t);
  render(); renderResults(); save();
  const last = [...state.songs].sort((a, b) => b.added - a.added)[0];
  setBg(last ? last.bg : '#262626');
}

function render() {
  const list = sorted();
  const n = list.length;
  const ol = $('tracks');
  const focusT = document.activeElement?.dataset?.t;
  const caret = document.activeElement?.selectionStart;
  const focusIsNote = document.activeElement?.classList?.contains('note-in');
  ol.replaceChildren();
  const a = Math.ceil(n / 2);
  const total = arr => arr.reduce((x, s) => x + (s.ms || 0), 0);

  if (!n) {   // 空的封底：先把 A1–A4 的曲目線畫出來，結構第一眼就在
    for (let i = 0; i < 4; i++) {
      const g = el('li', 'track ghost');
      g.setAttribute('aria-hidden', 'true');
      g.append(el('span', 'no', `A${i + 1}`), el('span', 'ghost-art'), el('span', 'ghost-line'));
      ol.append(g);
    }
  }

  list.forEach((s, i) => {
    if (n > 1 && (i === 0 || i === a)) {
      const part = i === 0 ? list.slice(0, a) : list.slice(a);
      const h = el('li', 'side');
      h.setAttribute('aria-hidden', 'true');
      h.append(el('span', null, i === 0 ? 'A 面' : 'B 面'));
      const tot = total(part);
      if (tot) h.append(el('span', null, clock(tot)));
      ol.append(h);
    }
    const li = el('li', 'track' + (missing.has(s.t) ? ' missing' : '') + (fresh === s.t && !reduce ? ' fresh' : ''));
    const im = el('img'); im.src = art(s.art, 100); im.alt = '';
    const txt = el('div', 'txt');
    const line = el('div', 't');
    line.append(el('span', 'tt', s.title), el('span', 'lead'), el('span', 'dur', s.ms ? clock(s.ms) : ''));
    const meta = el('div', 's');
    meta.append(document.createTextNode(s.artist + '　'), el('span', 'mono', s.year));
    txt.append(line, meta);
    const acts = el('div', 'acts');
    const rm = el('button', 'remove', '拿掉'); rm.type = 'button';
    rm.setAttribute('aria-label', '拿掉 ' + s.title);
    rm.addEventListener('click', () => removeSong(s.t));
    acts.append(playBtn(s.preview, s.title), rm);

    const nw = el('div', 'note-wrap');
    const inp = el('input', 'note-in');
    inp.placeholder = '寫一句話（選填）：這首歌跟你的關係';
    inp.maxLength = NOTE_MAX * 2;          // 以「字」計，emoji 佔兩個 code unit，JS 端再截
    inp.value = s.note;
    inp.dataset.t = s.t;
    inp.setAttribute('aria-label', `${s.title} 的一句話`);
    const cnt = el('span', 'note-len mono', `${len(s.note)}/${NOTE_MAX}`);
    inp.addEventListener('input', () => {
      if (len(inp.value) > NOTE_MAX) inp.value = [...inp.value].slice(0, NOTE_MAX).join('');
      s.note = inp.value; cnt.textContent = `${len(s.note)}/${NOTE_MAX}`; save();
    });
    nw.append(inp, cnt);

    li.append(el('span', 'no', side(i, n)), im, txt, acts, nw);
    ol.append(li);
  });
  fresh = null;
  if (focusT && focusIsNote) {
    const again = ol.querySelector(`input[data-t="${CSS.escape(focusT)}"]`);
    if (again) { again.focus(); if (caret != null) again.setSelectionRange(caret, caret); }
  }
  $('empty').hidden = n > 0;
  $('songCount').textContent = `${String(n).padStart(2, '0')} / ${LIMIT}`;
  $('sideCount').textContent = n ? `A 面 ${Math.min(a, n)}　B 面 ${n - a}` : 'A 面 0　B 面 0';
  $('pressBtn').disabled = n === 0;
  renderMosaic(list);
}

function renderObi() {
  const o = $('obi');
  o.querySelector('b').textContent = (state.name || '').trim() || '我的唱片架';
  o.querySelector('i').textContent = editing ? catalog(editing.id) : `${state.songs.length} 首`;
}

function renderMosaic(list) {
  const m = $('mosaic');
  [...m.querySelectorAll('img,.blank,.hint')].forEach(x => x.remove());
  const four = list.slice(0, 4);
  m.classList.toggle('one', four.length === 1);
  const add = x => m.insertBefore(x, $('obi'));
  if (four.length === 1) {
    const im = el('img'); im.src = four[0].art; im.alt = ''; add(im);
  } else {
    for (let i = 0; i < 4; i++) {
      if (four[i]) { const im = el('img'); im.src = art(four[i].art, 300); im.alt = ''; add(im); }
      else add(el('div', 'blank'));
    }
  }
  if (!four.length) {   // 收縮膜上的貼紙
    const h = el('div', 'hint');
    const sticker = el('div', 'sticker');
    sticker.append(el('b', null, '發行日最新的四首會拼成封面'), el('i', null, '01 · 02 · 03 · 04'));
    h.append(sticker);
    add(h);
  }
  renderObi();
}

/* ---------- 站名、署名、草稿 ---------- */
$('titleIn').addEventListener('input', e => { state.name = e.target.value; save(); renderObi(); });
$('byIn').addEventListener('input', e => { state.by = e.target.value; save(); });
function save() { if (!editing) store.set('rs:draft', state); else store.set('rs:edit:' + editing.id, state); }

/* ---------- 發布／修改／刪除 ---------- */
const origin = location.origin;
const pubUrl = id => `${origin}/w/${id}`;
const editUrl = (id, key) => `${origin}/make.html#edit=${id}.${key}`;

$('pressBtn').addEventListener('click', async () => {
  if (!state.songs.length) return;
  await Promise.all(state.songs.filter(s => !s.bg).map(async s => { s.bg = await colorOf(s.art); }));
  const body = {
    name: state.name, by: state.by,
    songs: state.songs.map(s => ({ t: s.t, c: s.c, bg: s.bg, note: s.note })),
  };
  const btn = $('pressBtn');
  btn.disabled = true;
  status(editing ? '存檔中……' : '壓片中……伺服器會再跟 iTunes 核對一次每首歌。');
  try {
    const r = await fetch('/api/walls' + (editing ? `?id=${editing.id}` : ''), {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(editing ? { 'x-edit-key': editing.key } : {}) },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 422 && data.missing) { missing = new Set(data.missing); render(); }
      status(data.error || '沒有成功，再試一次。');
      btn.disabled = false;
      return;
    }
    const id = editing ? editing.id : data.id;
    const key = editing ? editing.key : data.key;
    const mine = store.get('rs:mine', []).filter(w => w.id !== id);
    mine.unshift({ id, key, name: state.name || '我的唱片架', at: Date.now() });
    store.set('rs:mine', mine.slice(0, 30));
    const updated = !!editing;
    if (!editing) { store.del('rs:draft'); enterEdit(id, key, true); }
    else store.del('rs:edit:' + id);
    showDone(id, key, updated);
    status('');
    btn.disabled = false;
    renderMine();
  } catch {
    status('連不上伺服器，等一下再按一次。草稿還在這台裝置上。');
    btn.disabled = false;
  }
});

function showDone(id, key, updated) {
  $('doneTitle').textContent = updated ? '改好了。' : '壓好了。';
  $('doneLede').textContent = updated ? '公開連結不變，重新整理就看得到。' : '把公開連結貼給朋友，或貼到 Threads。貼出去會帶封面預覽。';
  $('doneCat').textContent = catalog(id);
  $('pubOut').textContent = pubUrl(id);
  $('pubOpen').href = pubUrl(id);
  $('editOut').textContent = editUrl(id, key);
  $('done').hidden = false;
  if (!updated && !reduce) {       // 壓好的那一下：CD 從封套裡滑出來一次
    const f = $('front');
    f.classList.remove('pressed'); void f.offsetWidth; f.classList.add('pressed');
  }
  $('done').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

$('deleteBtn').addEventListener('click', async () => {
  if (!editing || !confirm('刪掉這面牆？公開連結會失效，無法復原。')) return;
  status('刪除中……');
  try {
    const r = await fetch(`/api/walls?id=${editing.id}`, { method: 'DELETE', headers: { 'x-edit-key': editing.key } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { status(data.error || '沒有刪掉，再試一次。'); return; }
    store.set('rs:mine', store.get('rs:mine', []).filter(w => w.id !== editing.id));
    store.del('rs:edit:' + editing.id);
    location.replace('make.html');
  } catch { status('連不上伺服器，等一下再試。'); }
});

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  const text = $(b.dataset.copy).textContent;
  try { await navigator.clipboard.writeText(text); b.textContent = '已複製'; }
  catch {
    const r = document.createRange(); r.selectNodeContents($(b.dataset.copy));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    b.textContent = '已選取，按複製';
  }
  setTimeout(() => { b.textContent = '複製'; }, 1800);
});

/* ---------- 這台裝置發布過的 ---------- */
function renderMine() {
  const mine = store.get('rs:mine', []);
  $('mine').hidden = !mine.length;
  const ul = $('mineList');
  ul.replaceChildren();
  mine.forEach(w => {
    const li = el('li');
    const name = el('span');
    name.append(el('span', 'mono cat', catalog(w.id)), document.createTextNode(w.name));
    li.append(name);
    const nav = el('nav');
    const see = el('a', 'link', '看'); see.href = pubUrl(w.id);
    const ed = el('a', 'link', '改'); ed.href = editUrl(w.id, w.key);
    nav.append(see, ed);
    li.append(nav);
    ul.append(li);
  });
}

/* ---------- 修改模式：make.html#edit=<id>.<key> ---------- */
function enterEdit(id, key, freshPublish) {
  editing = { id, key };
  if (freshPublish) history.replaceState(null, '', `#edit=${id}.${key}`);
  $('editingNote').hidden = false;
  $('editingNote').textContent = `${catalog(id)}　你正在修改已發布的牆。改完按「存下修改」，公開連結不變。`;
  $('pressBtn').textContent = '存下修改';
  $('deleteBtn').hidden = false;
  $('backTitle').textContent = '修改這面牆';
  renderObi();
}

async function boot() {
  const m = location.hash.match(/^#edit=([a-z0-9]{4,12})\.([A-Za-z0-9_-]{10,64})$/);
  if (m) {
    const [, id, key] = m;
    enterEdit(id, key, false);
    const local = store.get('rs:edit:' + id, null);   // 上次沒存完的修改優先
    if (local) state = local;
    else {
      status('讀取中……');
      try {
        const r = await fetch(`/api/walls?id=${id}`);
        if (!r.ok) { status('找不到這面牆，可能已經刪掉了。'); return; }
        const w = await r.json();
        state = {
          name: w.name, by: w.by,
          songs: w.songs.map((s, i) => ({ t: s.t, c: s.c, title: s.title, artist: s.artist + (s.collab ? ' & ' + s.collab : ''),
            album: s.album, year: s.year, released: s.released, ms: s.ms || 0, art: s.art, preview: s.preview,
            bg: s.bg, note: s.note || '', added: i })),
        };
        status('');
      } catch { status('連不上伺服器，重新整理試試。'); return; }
    }
  } else {
    state = store.get('rs:draft', state);
  }
  state.songs.forEach((s, i) => { if (s.added == null) s.added = i; });
  $('titleIn').value = state.name || '';
  $('byIn').value = state.by || '';
  render();
  renderMine();
  const last = [...state.songs].sort((a, b) => b.added - a.added)[0];
  if (last?.bg) setBg(last.bg);
}
window.addEventListener('hashchange', () => location.reload());
boot();
