/* ===== 捲動開場 =====
   由 boot.js 在資料備妥後載入。 */

document.title = SITE.name + ' — 開場';
document.querySelectorAll('.logo').forEach(l => {
  l.firstChild.textContent = SITE.name;
  const s = l.querySelector('span'); if (s) s.textContent = SITE.latin.toUpperCase();
});
const introH1 = document.querySelector('.hero-copy h1, h1');
if (introH1) {
  introH1.textContent = SITE.name;
  const L = [...SITE.name].length;   // 站名最長 24 字：字越多字越小，最多兩三行
  if (L > 5) introH1.style.fontSize = `clamp(40px, ${Math.min(13, 70 / L).toFixed(2)}vw, 168px)`;
  introH1.style.textWrap = 'balance';
}
const openBtn = document.querySelector('.btn.solid'); if (openBtn) openBtn.textContent = '打開' + SITE.name + ' →';
if (!ALBUMS.length) {
  document.body.innerHTML = '<p style="color:#fff;font:500 15px/1.8 system-ui;padding:40vh 24px 0;text-align:center">' +
    'data.js 還是空的。先加一首歌：<br><code>node scripts/add-song.mjs "歌手" "歌名"</code></p>';
  throw new Error('ALBUMS is empty');
}
const A = ALBUMS.map(x => ({id: x.id, t: x.title, a: x.collab ? x.artist + ' ' + x.collab : x.artist, y: x.year, bg: x.bg, p: x.preview,
                         cover: x.cover || `covers/${x.id}.jpg`}));   // 轉自共用 data.js

const $ = id => document.getElementById(id);
const wall = $('wall'), stage = $('stage'), track = $('track'), hero = $('hero');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ROOM = [20,19,18];

const years = A.map(a => +a.y);
$('lede').textContent =
  `${A.length} 張${window.WALL ? '' : '單曲'}封面，從 ${Math.max(...years)} 排回 ${Math.min(...years)}。往下捲，鏡頭會隨機停在其中一張。`;

// 歌少的牆循環補到 30 格，開場那面牆才像一面牆；前 A.length 格是本尊，鏡頭只停在本尊上
const CELLS = A.length >= 30 ? A : Array.from({ length: 30 }, (_, i) => A[i % A.length]);
CELLS.forEach(a => {
  const d = document.createElement('div');
  d.className = 'sleeve';
  d.style.background = a.bg;   // 封面還沒解碼前先給它自己的取色，不留黑格
  const im = document.createElement('img'); im.src = a.cover; im.alt = ''; d.appendChild(im);
  wall.appendChild(d);
});
const sleeves = [...wall.children];

let T = Math.floor(Math.random() * A.length);
let G = {};        // 版面幾何，resize 時重算
let audio = null;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const ease = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;   // 推鏡頭：慢起慢停
const out = t => 1 - Math.pow(1 - t, 4);                              // 進場：快出慢收
const lerp = (a, b, t) => a + (b - a) * t;
const hex = h => [1,3,5].map(i => parseInt(h.slice(i, i+2), 16));

function layout(){
  const vw = innerWidth, vh = stage.clientHeight;
  const narrow = vw < 700;
  const cols = narrow ? 5 : 6, rows = Math.ceil(CELLS.length / cols);
  const C = 150, gap = 16;
  const W = cols*C + (cols-1)*gap, H = rows*C + (rows-1)*gap;
  wall.style.setProperty('--cols', cols);
  wall.style.setProperty('--cell', C + 'px');
  wall.style.setProperty('--gap', gap + 'px');

  const S = Math.round(Math.min(320, vw * .62, vh * .42));
  const cx = vw/2 - S * (narrow ? .17 : .2);
  const cy = vh * (narrow ? .36 : .4);
  document.documentElement.style.setProperty('--S', S + 'px');
  hero.style.transform = `translate(${cx - S/2}px, ${cy - S/2}px)`;
  $('info').style.top = (cy + S/2 + 30) + 'px';

  G = { vw, vh, cols, C, gap, W, H, S, cx, cy,
        s0: Math.max(vw / W, vh / H) * 1.06,   // 開場：整面牆塞滿畫面
        s1: S / C };                            // 定格：目標封面剛好 S
  render();
}

function target(){
  const col = T % G.cols, row = Math.floor(T / G.cols);
  return [col*(G.C+G.gap) + G.C/2, row*(G.C+G.gap) + G.C/2];
}

function setAlbum(){
  const a = A[T];
  $('heroImg').src = a.cover;
  $('artist').textContent = a.a;
  $('title').textContent = a.t;
  $('meta').textContent = `${a.y} · 第 ${T + 1} 張，共 ${A.length} 張`;
  stopAudio();
  $('playBtn').disabled = !a.p;
  $('playLabel').textContent = a.p ? '試聽 30 秒' : '這首沒有試聽';
}

function render(){
  const max = track.offsetHeight - stage.clientHeight;
  const p = clamp(scrollY / max);
  const step = t => reduce ? (t > 0 ? 1 : 0) : t;

  // 1 推鏡頭：焦點從牆中心移到目標，畫面中心移到定格位置，順便把側角轉正
  const e = step(ease(seg(p, .1, .55)));
  const [tx, ty] = target();
  const fx = lerp(G.W/2, tx, e), fy = lerp(G.H/2, ty, e);
  const vx = lerp(G.vw/2, G.cx, e), vy = lerp(G.vh/2, G.cy, e);
  const s = lerp(G.s0, G.s1, e);
  const ry = lerp(-16, 0, e), rx = lerp(7, 0, e);
  wall.style.transformOrigin = `${fx}px ${fy}px`;
  wall.style.transform = `translate3d(${vx - fx}px, ${vy - fy}px, 0) scale(${s}) rotateX(${rx}deg) rotateY(${ry}deg)`;
  const dim = 1 - .965 * step(seg(p, .14, .5));
  sleeves.forEach((el, i) => el.style.opacity = i === T ? 1 : dim);

  // 開場字先退
  const o = step(seg(p, .06, .22));
  $('opening').style.opacity = 1 - o;
  $('opening').style.transform = `translateY(${-40 * o}px)`;
  $('scrim').style.opacity = 1 - step(seg(p, .1, .4));

  // 2 房間換成這張封面的顏色
  const c = step(seg(p, .3, .55)), to = hex(A[T].bg);
  const rgb = ROOM.map((v, i) => Math.round(lerp(v, to[i], c)));
  document.documentElement.style.setProperty('--bg', `rgb(${rgb})`);

  // 3 CD 滑出；捲動＝轉盤
  hero.classList.toggle('on', p >= .55);
  const d = step(out(seg(p, .58, .78)));
  $('cdPos').style.transform = `translateX(${G.S * .46 * d}px)`;
  $('cdDisc').style.transform = `rotate(${reduce ? 0 : p * 900}deg)`;

  // 4 字與按鈕
  const t1 = step(out(seg(p, .72, .86))), t2 = step(out(seg(p, .84, .96)));
  const info = $('info');
  info.style.opacity = t1;
  info.style.visibility = t1 > 0 ? 'visible' : 'hidden';
  $('title').style.clipPath = `inset(0 0 ${100 - 100 * t1}% 0)`;
  $('actions').style.opacity = t2;
  $('actions').style.transform = `translateY(${16 * (1 - t2)}px)`;
  $('shuffleBtn').style.opacity = .6 * t2;
}

function stopAudio(){
  if (audio){ audio.pause(); audio = null; }
  hero.classList.remove('playing');
  $('playBtn').classList.remove('playing-btn');
  $('playLabel').textContent = '試聽 30 秒';
}

$('playBtn').addEventListener('click', () => {
  if (audio){ stopAudio(); return; }
  const a = A[T];
  audio = new Audio(a.p);
  audio.addEventListener('ended', stopAudio);
  audio.play().then(() => {
    hero.classList.add('playing');
    $('playBtn').classList.add('playing-btn');
    $('playLabel').textContent = '暫停';
  }).catch(() => {
    audio = null;
    $('playLabel').textContent = '試聽載入失敗，再按一次';
  });
});

$('shuffleBtn').addEventListener('click', () => {
  let n; do { n = Math.floor(Math.random() * A.length); } while (n === T && A.length > 1);
  T = n; setAlbum();
  scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
});

let ticking = false;
addEventListener('scroll', () => {
  if (!ticking){ ticking = true; requestAnimationFrame(() => { ticking = false; render(); }); }
}, { passive: true });
addEventListener('resize', layout);

setAlbum();
layout();
