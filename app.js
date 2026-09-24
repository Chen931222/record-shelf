/* ===== 唱片架主程式 =====
   由 boot.js 在資料備妥後載入（ALBUMS／NOTES 來自 data.js，或 ?w= 的公開牆）。 */

/* ================= site.config 套用＋空資料防呆 ================= */
document.title = SITE.name + ' — ' + SITE.latin;
document.querySelectorAll('.logo').forEach(l => {
  l.firstChild.textContent = SITE.name;
  const s = l.querySelector('span'); if (s) s.textContent = SITE.latin.toUpperCase();
});
if (!ALBUMS.length) {
  document.body.innerHTML = '<p style="color:#fff;font:500 15px/1.8 system-ui;padding:40vh 24px 0;text-align:center">' +
    'data.js 還是空的。先加一首歌：<br><code>node scripts/add-song.mjs "歌手" "歌名"</code></p>';
  throw new Error('ALBUMS is empty');
}

const escHtml = s => String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const coverOf = a => a.cover || `covers/${a.id}.jpg`;   // 公開牆用 iTunes 封面網址，自己的站用本地檔

/* ================= build DOM ================= */
const stack = document.getElementById('coverStack');
const dock = document.getElementById('dock');
ALBUMS.forEach((a, i) => {
  const c = document.createElement('div');
  c.className = 'cover';
  c.innerHTML = `<img src="${escHtml(coverOf(a))}" alt="${escHtml(a.title)}"><div class="sheen"></div>`;
  stack.appendChild(c);

  const d = document.createElement('button');
  d.className = 'dock-item';
  d.setAttribute('aria-label', a.title);
  d.style.border = 'none';
  d.style.background = 'transparent';
  d.style.padding = '0';
  d.innerHTML = `<img src="${escHtml(coverOf(a))}" alt=""><span class="tip">${escHtml(a.title)}</span>`;
  d.addEventListener('click', () => go(i));
  dock.appendChild(d);
});
const covers = [...stack.children];
const dockItems = [...dock.children];

/* ================= state ================= */
let idx = 0;
let locked = false;
const audio = new Audio();
audio.preload = 'none';

const $ = id => document.getElementById(id);

function rollSwap(el, text){
  el.classList.add('out');
  setTimeout(() => { el.textContent = text; el.classList.remove('out'); }, 300);
}

// 抽屜底色＝當首曲目的顏色壓暗，保住「隨曲換色」這個既有裝置
const darkTint = hex => {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(c => Math.round(c * .42)).join(',');
};

function renderNotes(dir){
  const a = ALBUMS[idx], n = NOTES[a.id];
  const pad = v => String(v).padStart(2, '0');
  $('notesNo').textContent = 'NO. ' + pad(idx + 1) + ' / ' + pad(ALBUMS.length);

  $('notesHook').textContent = n ? n.hook : '這首還沒有內頁。';
  const sign = $('notesSign');
  if (sign) {
    sign.hidden = !(window.WALL && n && n.hook);
    sign.textContent = window.WALL && window.WALL.by ? '— ' + window.WALL.by : '— 這面牆的主人';
  }
  $('notesStory').textContent = n ? n.story : '';
  $('notesMeaning').textContent = n ? n.meaning : '';
  document.querySelectorAll('.notes-block').forEach((b, i) => {
    b.hidden = !n || !(i === 0 ? n.story : n.meaning);
  });

  const dl = $('notesCredits');
  dl.textContent = '';
  if (n) [['詞曲', n.writers], ['收錄', n.source], ['註', n.note]].forEach(([k, v]) => {
    if (!v) return;
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  });
  dl.hidden = !dl.childElementCount;

  const mine = n && n.mine && n.mine.trim();
  $('notesPersonal').hidden = !mine;
  if (mine) $('notesPersonalText').textContent = n.mine.trim();

  const inner = $('notesInner');           // 內頁翻頁：唯一一段編排過的動態
  inner.classList.remove('turn');
  inner.classList.toggle('back', dir < 0); // 往新的翻，紙從上面進來
  void inner.offsetWidth;
  inner.classList.add('turn');
  $('notes').scrollTop = 0;
}

function updateNotesFade(){
  const n = $('notes');
  n.classList.toggle('has-more', n.scrollTop + n.clientHeight < n.scrollHeight - 4);
}

function render(dir){ // dir: 1 = 往舊的, -1 = 往新的, 0 = 初始
  const a = ALBUMS[idx];
  document.body.style.backgroundColor = a.bg;
  document.querySelector('.cd').style.setProperty('--hole', a.bg);
  document.body.style.setProperty('--sheet', darkTint(a.bg));

  covers.forEach((c, i) => {
    c.classList.remove('active','leaving-up','leaving-down','entering-up');
    if (i === idx) return;
    c.classList.add(dir >= 0 ? 'leaving-up' : 'leaving-down');
  });
  const inc = covers[idx];
  if (dir < 0) inc.classList.add('entering-up'); // 往新的：從上方進場；往舊的：用預設下方姿勢
  void inc.offsetWidth; // reflow so the transition runs from the offset pose
  inc.classList.remove('entering-up');
  inc.classList.add('active');

  $('artistName').textContent = a.artist;
  $('collabName').textContent = a.collab;
  $('albumTitle').textContent = a.title;
  $('albumMeta').textContent = a.meta + (a.ptrack ? '   ·   ▶ ' + a.ptrack : '');
  const own = window.WALL ? ((NOTES[a.id] || {}).hook || '') : '';   // 公開牆主人的那一句話
  const on = $('ownerNote');
  if (on) {
    on.hidden = !own;
    on.textContent = own;
    if (own && window.WALL.by) { const by = document.createElement('span'); by.className = 'by'; by.textContent = '— ' + window.WALL.by; on.append(by); }
  }
  $('spotifyBtn').href = 'https://open.spotify.com/search/' + encodeURIComponent(a.q) + '/tracks';
  rollSwap($('footDate'), a.date);
  rollSwap($('footYear'), a.year);
  dockItems.forEach((d, i) => d.classList.toggle('current', i === idx));
  dockItems[idx].scrollIntoView({behavior:'smooth', block:'nearest', inline:'center'});
  renderNotes(dir);

  if (!document.body.classList.contains('playing')) return;
  if (a.preview){ audio.src = a.preview; audio.play().catch(stop); }
  else { audio.pause(); }
}

function go(i, dir){
  if (i === idx || i < 0 || i >= ALBUMS.length) return;
  const d = dir !== undefined ? dir : (i > idx ? 1 : -1);
  idx = i;
  render(d);
}

/* ================= player ================= */
function stop(){
  document.body.classList.remove('playing');
  audio.pause();
}
$('playBtn').addEventListener('click', () => {
  if (document.body.classList.contains('playing')){ stop(); return; }
  document.body.classList.add('playing');
  const a = ALBUMS[idx];
  if (a.preview){ audio.src = a.preview; audio.play().catch(()=>{}); }
});
audio.addEventListener('ended', stop);
$('prevBtn').addEventListener('click', () => go(idx - 1));
$('nextBtn').addEventListener('click', () => go(idx + 1));

/* ================= volume ================= */
const volSlider = $('volSlider');
function setVol(v){ // v: 0-100
  audio.volume = v / 100;
  volSlider.value = v;
  volSlider.style.setProperty('--vol', v + '%');
  document.body.classList.toggle('muted', v === 0 || audio.muted);
  localStorage.setItem('shelf-vol', v);
}
volSlider.addEventListener('input', () => {
  audio.muted = false;
  setVol(+volSlider.value);
});
$('volBtn').addEventListener('click', () => {
  audio.muted = !audio.muted;
  document.body.classList.toggle('muted', audio.muted || +volSlider.value === 0);
});
setVol(+(localStorage.getItem('shelf-vol') ?? 80));

/* ================= 內頁（窄螢幕抽出／收合） ================= */
function openNotes(open){
  document.body.classList.toggle('notes-open', open);
  $('notesToggle').setAttribute('aria-expanded', String(open));
  if (open) $('notes').scrollTop = 0;
}
$('notesToggle').addEventListener('click', () =>
  openNotes(!document.body.classList.contains('notes-open')));
$('notesClose').addEventListener('click', () => openNotes(false));
$('notesScrim').addEventListener('click', () => openNotes(false));
$('notes').addEventListener('scroll', updateNotesFade, {passive:true});
window.addEventListener('resize', updateNotesFade);
// 高度會因換頁、字體載入、視窗縮放而變；翻頁動畫結束才是最終版面
new ResizeObserver(updateNotesFade).observe($('notesInner'));
$('notesInner').addEventListener('animationend', updateNotesFade);
if (document.fonts) document.fonts.ready.then(updateNotesFade);

/* ================= scroll timeline ================= */
function step(dir){
  if (locked) return;
  const t = idx + dir;
  if (t < 0 || t >= ALBUMS.length) return;
  locked = true;
  go(t, dir);
  setTimeout(() => locked = false, 620);
}
const notesEl = $('notes');
window.addEventListener('wheel', e => {
  if (notesEl.contains(e.target)){   // 內頁自己捲得動時，先讓它捲完再換曲
    const room = e.deltaY > 0
      ? notesEl.scrollTop + notesEl.clientHeight < notesEl.scrollHeight - 1
      : notesEl.scrollTop > 1;
    if (room) return;
  }
  if (Math.abs(e.deltaY) < 20) return;
  step(e.deltaY > 0 ? 1 : -1);
}, {passive:true});
window.addEventListener('keydown', e => {
  if (e.key === 'Escape'){ openNotes(false); return; }
  // 焦點在內頁且內頁還捲得動時，方向鍵交還給瀏覽器捲動（否則鍵盤使用者讀不到溢出的部分）
  if (notesEl.contains(document.activeElement) && (e.key === 'ArrowDown' || e.key === 'ArrowUp')){
    const room = e.key === 'ArrowDown'
      ? notesEl.scrollTop + notesEl.clientHeight < notesEl.scrollHeight - 1
      : notesEl.scrollTop > 1;
    if (room) return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') step(1);
  if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') step(-1);
  if (e.key === ' ' && e.target.tagName !== 'BUTTON'){ e.preventDefault(); $('playBtn').click(); }
});
let touchY = null, touchX = null;
window.addEventListener('touchstart', e => {
  if (e.target.closest('.dock') || e.target.closest('.notes')) return;
  if (document.body.classList.contains('notes-open')) return;
  touchY = e.touches[0].clientY; touchX = e.touches[0].clientX;
}, {passive:true});
window.addEventListener('touchend', e => {
  if (touchY === null) return;
  const dy = touchY - e.changedTouches[0].clientY;
  const dx = touchX - e.changedTouches[0].clientX;
  touchY = touchX = null;
  const d = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
  if (Math.abs(d) < 40) return;
  step(d > 0 ? 1 : -1);
}, {passive:true});

/* ================= dock magnification ================= */
const MAG_RANGE = 90, MAG_MAX = .55;
dock.addEventListener('mousemove', e => {
  dockItems.forEach(item => {
    const r = item.getBoundingClientRect();
    const dist = Math.abs(e.clientX - (r.left + r.width / 2));
    const s = dist < MAG_RANGE ? 1 + MAG_MAX * Math.cos((dist / MAG_RANGE) * Math.PI / 2) ** 2 : 1;
    item.style.transform = `scale(${s.toFixed(3)})`;
  });
});
dock.addEventListener('mouseleave', () => {
  dockItems.forEach(item => item.style.transform = '');
});

/* ================= init ================= */
$('footDate').textContent = ALBUMS[0].date;
$('footYear').textContent = ALBUMS[0].year;
render(0);
