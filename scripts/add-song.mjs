#!/usr/bin/env node
/* ===== add-song：一行指令加一首歌 =====
 *
 *   node scripts/add-song.mjs "<歌手>" "<歌名>" [選項]
 *
 * 做的事：iTunes Search API 抓 30 秒試聽＋中繼資料 → 下載 600x600 封面
 * 到 covers/<id>.jpg → 從封面取主色壓暗成 bg → 依年份插進 data.js 的
 * ALBUMS（新→舊）。內頁 NOTES 不自動生（沒有內頁站上會優雅降級），
 * 想寫的話照結尾印出的骨架貼進 data.js。
 *
 * 選項：
 *   --country XX   換國家商店重抓（預設 US）。原版錄音室曲在美區常只掛
 *                  專輯封面（兩首同專輯就撞同一張圖），英國歌手換 GB 常
 *                  能撈到正牌單曲封面。
 *   --pick N       候選清單裡選第 N 個（預設 1）
 *   --id slug      自訂 id（預設由歌名轉 slug）
 *   --force        覆蓋既有的同 id 封面／條目
 *   --dry          只查不寫（看候選跟警告用）
 *
 * ⚠️ 自動偵測不了的地雷：remix／acoustic 版的封面圖上常直接印字
 * （「(ACOUSTIC)」之類），抓完務必開站親眼看一次封面。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import jpeg from 'jpeg-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data.js');

/* ---------- 參數 ---------- */
const args = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const k = args[i].slice(2);
    if (['country', 'pick', 'id'].includes(k)) flags[k] = args[++i];
    else flags[k] = true;
  } else pos.push(args[i]);
}
const [ARTIST, SONG] = pos;
if (!ARTIST || !SONG) {
  console.error('用法：node scripts/add-song.mjs "<歌手>" "<歌名>" [--country GB] [--pick N] [--dry]');
  process.exit(1);
}
const COUNTRY = (flags.country || 'US').toUpperCase();
const PICK = Math.max(1, parseInt(flags.pick || '1', 10));

/* ---------- 小工具 ---------- */
const slugify = s => s.normalize('NFKD').toLowerCase()
  .replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'song';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const SUSPECT = /\b(remix|acoustic|live|karaoke|tribute|covers?|renditions?|lullaby|instrumental|hardstyle|nightcore|8d|lo-?fi|edit|versions?)\b|sped.?up|slowed/i; // \b 防「Discovery」誤中 cover

/* ---------- 1. 搜尋 ---------- */
const term = `${ARTIST} ${SONG}`;
const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=25&country=${COUNTRY}`;
const res = await fetch(url);
if (!res.ok) { console.error(`iTunes API ${res.status}`); process.exit(1); }
const { results } = await res.json();
let songs = results.filter(r => r.kind === 'song' && r.previewUrl);
if (!songs.length) { console.error(`找不到「${term}」（${COUNTRY} 商店）。換個寫法或 --country 試試。`); process.exit(1); }
// 排序：歌名跟輸入完全一致的原曲優先，可疑版本（remix/acoustic/...）沉底；同分保持 iTunes 原序
const norm = s => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
songs = songs.map((r, i) => {
  let score = 0;
  if (norm(r.trackName) === norm(SONG)) score += 4;
  if (norm(r.artistName).includes(norm(ARTIST))) score += 2;
  if (SUSPECT.test(r.trackName) || SUSPECT.test(r.collectionName || '')) score -= 3;
  return { r, i, score };
}).sort((a, b) => b.score - a.score || a.i - b.i).map(x => x.r);

console.log(`\n候選（${COUNTRY} 商店）：`);
songs.slice(0, 8).forEach((r, i) => {
  const mark = i === PICK - 1 ? '→' : ' ';
  console.log(` ${mark} ${i + 1}. ${r.trackName} — ${r.artistName}（${r.collectionName}, ${r.releaseDate?.slice(0, 4)}）`);
});
const hit = songs[PICK - 1];
if (!hit) { console.error(`--pick ${PICK} 超出範圍`); process.exit(1); }

/* ---------- 2. 地雷警告 ---------- */
const warns = [];
if (SUSPECT.test(hit.trackName)) warns.push(`版本可疑：「${hit.trackName}」——封面圖可能直接印字，換 --pick 或 --country 比對。`);
if (SUSPECT.test(hit.collectionName || '')) warns.push(`收錄專輯可疑：「${hit.collectionName}」。`);
if (!norm(hit.artistName).includes(norm(ARTIST)))
  warns.push(`歌手對不上：你查「${ARTIST}」，選到的是「${hit.artistName}」——可能是翻唱。這個商店多半沒有原唱，換 --country（歌手母國）再試。`);

/* ---------- 3. 組欄位 ---------- */
const id = flags.id || slugify(hit.trackName);
const d = new Date(hit.releaseDate);
const date = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
const year = String(d.getUTCFullYear());
const secs = Math.round((hit.trackTimeMillis || 0) / 1000);
const meta = `Single · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
// artistName 常是「A & B」「A feat. B」→ 拆成 artist＋collab（站上 collab 淡色顯示）
const parts = hit.artistName.split(/\s*,\s*|\s+(?:&|feat\.?|ft\.?|featuring)\s+/i).filter(Boolean);
const artist = parts[0], collab = parts.slice(1).join(' ');

/* ---------- 4. 重複檢查 ---------- */
let dataText = readFileSync(DATA, 'utf8');
if (!flags.force) {
  if (dataText.includes(`{id:'${id}'`)) { console.error(`\ndata.js 已有 id「${id}」。要覆蓋用 --force，另一首同名曲用 --id。`); process.exit(1); }
  if (dataText.includes(hit.previewUrl)) { console.error('\n這條試聽連結已在 data.js 裡（同一首歌）。'); process.exit(1); }
}

/* ---------- 5. 封面 ---------- */
const artUrl = hit.artworkUrl100.replace(/100x100bb/, '600x600bb');
const jpgBuf = Buffer.from(await (await fetch(artUrl)).arrayBuffer());

/* ---------- 6. 主色 → bg ---------- */
function bgFromCover(buf) {
  const { data: px, width, height } = jpeg.decode(buf, { maxMemoryUsageInMB: 64 });
  let n = 0, satN = 0, R = 0, G = 0, B = 0, hx = 0, hy = 0, sSum = 0;
  const step = 4 * 7; // 每 7 個像素取 1 個
  for (let i = 0; i < px.length; i += step) {
    const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    n++; R += r; G += g; B += b;
    if (l < .06 || l > .94) continue;              // 全黑全白不投票
    const s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
    if (s < .18) continue;                          // 灰不投票
    let h;
    if (mx === r) h = ((g - b) / (mx - mn)) % 6;
    else if (mx === g) h = (b - r) / (mx - mn) + 2;
    else h = (r - g) / (mx - mn) + 4;
    h *= 60; if (h < 0) h += 360;
    const w = s;                                    // 飽和度加權
    hx += Math.cos(h * Math.PI / 180) * w; hy += Math.sin(h * Math.PI / 180) * w;
    sSum += s; satN++;
  }
  const hslToHex = (h, s, l) => {
    const f = k => { const kk = (k + h / 30) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(kk - 3, 9 - kk, 1)); };
    return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  };
  let hue = Math.atan2(hy, hx) * 180 / Math.PI; if (hue < 0) hue += 360;
  if (satN / n > .06) {                            // 有夠多有色像素 → 壓暗的主色
    const s = Math.min(.62, Math.max(.35, (sSum / satN) * 1.05));
    return { bg: hslToHex(hue, s, .22), mono: false };
  }
  // 黑白／單色封面 → 帶一點色相的暗灰（別用死板純灰）
  const ar = R / n, ag = G / n, ab = B / n;
  const mx = Math.max(ar, ag, ab), mn = Math.min(ar, ag, ab);
  let gh = 30;                                      // 撈不到色相就偏暖
  if (mx > mn) {
    if (mx === ar) gh = (((ag - ab) / (mx - mn)) % 6) * 60;
    else if (mx === ag) gh = ((ab - ar) / (mx - mn) + 2) * 60;
    else gh = ((ar - ag) / (mx - mn) + 4) * 60;
    if (gh < 0) gh += 360;
  }
  return { bg: hslToHex(gh, .045, .245), mono: true };
}
const { bg, mono } = bgFromCover(jpgBuf);

/* ---------- 7. 報告（--dry 到此為止） ---------- */
console.log(`\n選定：${hit.trackName} — ${hit.artistName}`);
console.log(`  id      ${id}`);
console.log(`  發行    ${date} ${year}　${meta}`);
console.log(`  bg      ${bg}${mono ? '（單色封面 → 帶色暗灰）' : ''}`);
console.log(`  封面    covers/${id}.jpg（${artUrl.match(/\d+x\d+/)?.[0]}）`);
warns.forEach(w => console.log(`  ⚠️  ${w}`));
if (flags.dry) { console.log('\n--dry：沒有寫入任何檔案。'); process.exit(0); }

/* ---------- 8. 寫檔 ---------- */
mkdirSync(join(ROOT, 'covers'), { recursive: true });
const coverPath = join(ROOT, 'covers', `${id}.jpg`);
if (existsSync(coverPath) && !flags.force) { console.error(`covers/${id}.jpg 已存在，覆蓋用 --force。`); process.exit(1); }
writeFileSync(coverPath, jpgBuf);

const entry = `  {id:'${id}', title:'${esc(hit.trackName)}', artist:'${esc(artist)}', collab:'${esc(collab)}',
   date:'${date}', year:'${year}', bg:'${bg}', meta:'${meta}',
   q:'${esc(hit.artistName)} ${esc(hit.trackName)}', ptrack:null,
   preview:'${hit.previewUrl}'},
`;

if (flags.force && dataText.includes(`{id:'${id}'`)) {
  // 覆蓋：先把舊條目整塊移掉，再算插入點（順序不能反，否則位移會插錯地方）
  dataText = dataText.replace(new RegExp(`  \\{id:'${id}'[\\s\\S]*?'\\},\\n`), '');
}

// ALBUMS 新→舊：插在第一個 year <= 新歌年份 的條目前面
const arrStart = dataText.indexOf('const ALBUMS = [');
const arrEnd = dataText.indexOf('\n];', arrStart);
if (arrStart < 0 || arrEnd < 0) { console.error('data.js 裡找不到 ALBUMS 陣列'); process.exit(1); }
const body = dataText.slice(arrStart, arrEnd);
let insertAt = arrEnd + 1; // 預設：最舊，放最後
const re = /^  \{id:'[^']*'[\s\S]*?year:'(\d{4})'/gm; // 錨在行首兩格縮排，插入點才不會吃掉下一條的縮排
let m;
while ((m = re.exec(body)) !== null) {
  if (+m[1] <= +year) { insertAt = arrStart + m.index; break; }
}
const before = dataText.slice(0, insertAt), after = dataText.slice(insertAt);
writeFileSync(DATA, before + entry + after.replace(/^\n/, m0 => m0), 'utf8');

const count = (readFileSync(DATA, 'utf8').match(/preview:'https/g) || []).length;
console.log(`\n✅ 寫入 data.js（現在 ${count} 首）＋ covers/${id}.jpg`);
console.log(`\n下一步：
  1. 起本機看一眼封面有沒有印字、bg 順不順眼：python -m http.server 8533
  2. 想寫內頁就把這段貼進 data.js 的 NOTES：
'${id}':{
  hook:"",
  story:"",
  meaning:"",
  writers:"",
  source:"${esc(hit.collectionName || '')}, ${year}",
  note:"",
  mine:""},
  3. 上線：vercel --prod`);
