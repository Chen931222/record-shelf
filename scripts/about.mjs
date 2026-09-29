/* ===== 首頁的「關於」與 <head> 說明：寫給不跑 JS 的讀者 =====
   牆本身靠 JS 長出來；ChatGPT、Claude、Perplexity 的爬蟲不執行 JS，LINE／Threads 的預覽也只看原始 HTML。
   這支依 site.config.js 和 data.js，重寫 index.html 裡兩段標記之間的內容：
     <!-- about:head --> … <!-- /about:head -->   說明、分享預覽、JSON-LD
     <!-- about:body --> … <!-- /about:body -->   頁首「關於」展開的那段話（沒 JS 時附整面牆的歌單）
   add-song 加歌後會自動跑；改了 site.config.js 就手動跑：node scripts/about.mjs
   公開牆 /w/<id> 由 api/page.js 換成那面牆自己的說明，這兩段不會帶過去。
   刻意不放 canonical／og:url：網址跟著模板被複製走，忘了改的人會把自己的站指成別人的正本。 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'github.com/Chen931222/record-shelf';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// site.config.js、data.js 是給瀏覽器的 const 宣告，不是模組：包成函式跑一次，把要的變數回傳出來
const load = (file, ret) => new Function(readFileSync(join(ROOT, file), 'utf8') + `\n;return ${ret};`)();

export function writeAbout() {
  const SITE = load('site.config.js', 'SITE');
  const { ALBUMS, TENDED } = load('data.js', `{ ALBUMS, TENDED: typeof TENDED === 'undefined' ? '' : TENDED }`);
  const n = ALBUMS.length;
  const url = String(SITE.url || '').replace(/\/+$/, '');
  const name = SITE.name, latin = SITE.latin || '';
  const title = latin ? `${name} — ${latin}` : name;

  // 語氣照 PRODUCT.md：短句、數字、限制直寫。沒資料時退回不含數字的通用版。
  // 動作要照實寫：點封面沒有反應，要按播放，唱片才會從封套滑出來（2026-09-29 查過 app.js）
  const sp = /[\x21-\x7e]$/.test(name) ? ' ' : '';   // 英文站名後面接中文，留一個空格
  const lead = `${name}${sp}是一面放單曲的唱片牆。按播放，唱片從封套滑出來，播 30 秒 iTunes 試聽，背景跟著封面換色。`;
  const own = n ? `這面是我的 ${n} 首${n > 1 ? '，新的在前' : ''}${TENDED ? `，上次整理是 ${TENDED}` : ''}。` : '';
  // 日期不在連字號斷行。整句一起包：只包日期的話，defuddle 這類正文抽取工具會把它當「發文日期」整個拿掉（2026-09-29 實測）
  const ownHtml = own && TENDED ? esc(own).replace(`上次整理是 ${esc(TENDED)}`, d => `<span class="nw">${d}</span>`) : esc(own);
  const limits = '試聽和封面來自 iTunes，有些歌台灣商店沒有。';
  const walls = SITE.walls ? '你也可以做一面：不用登入，搜歌名放上去就好；公開的牆越久沒人來聽，封面積的灰越厚。' : '';
  const wallsHtml = esc(walls).replace('做一面', '<a href="make.html">做一面</a>');
  const desc = lead + (n ? `這面有 ${n} 首。` : '') + (SITE.walls ? '不用登入也能做一面自己的。' : '');

  // 分享預覽圖：最新那首的封面。og:image 要完整網址，所以 site.config.js 沒填 url 就不放
  const first = ALBUMS[0];
  const img = !first ? '' : /^https?:/.test(first.cover || '') ? first.cover : url ? `${url}/covers/${first.id}.jpg` : '';

  const ld = { '@context': 'https://schema.org', '@type': 'WebSite', name };
  if (latin) ld.alternateName = latin;
  if (url) ld.url = url + '/';
  Object.assign(ld, { description: desc, inLanguage: 'zh-Hant' });

  const head = [
    `<meta name="description" content="${esc(desc)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(name)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    ...(img ? [`<meta property="og:image" content="${esc(img)}">`] : []),
    `<meta name="twitter:card" content="summary">`,
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
  ];

  // 歌單用中點分隔，跟頁面上的「Single · 3:30」同一套；不用破折號
  const song = a => `${esc(a.title)} · ${esc(a.artist)}${a.collab ? `、${esc(a.collab)}` : ''}${a.year ? ` · ${esc(a.year)}` : ''}`;
  // 放在 <main> 裡的 popover（頁首那顆「關於」按鈕打開它）。放 <header> 會被正文抽取工具當成導覽丟掉
  const body = [
    `<section id="about" class="about-sheet" popover aria-labelledby="about-title">`,
    `  <h2 class="about-label" id="about-title">關於${sp}${esc(name)}</h2>`,
    `  <p>${esc(lead)}${ownHtml}</p>`,
    `  <p>${esc(limits)}${wallsHtml}</p>`,
    `  <p class="about-src">程式碼 MIT 開源，可以自己架（封面和內頁文案不在授權內）：<a href="https://${REPO}">${REPO}</a></p>`,
    ...(n ? [`  <noscript><ol class="about-list">${ALBUMS.map(a => `<li>${song(a)}</li>`).join('')}</ol></noscript>`] : []),
    `</section>`,
  ];

  const file = join(ROOT, 'index.html');
  let html = readFileSync(file, 'utf8');
  const EOL = html.includes('\r\n') ? '\r\n' : '\n';   // 跟著檔案原本的行尾（Windows 上 git 會轉成 CRLF）
  const put = (tag, lines, pad) => {
    const re = new RegExp(`<!-- ${tag} -->[\\s\\S]*?<!-- /${tag} -->`);
    if (!re.test(html)) throw new Error(`index.html 裡找不到 <!-- ${tag} --> 標記`);
    const inner = lines.map(l => pad + l).join(EOL);
    html = html.replace(re, () => `<!-- ${tag} -->${EOL}${inner}${EOL}${pad}<!-- /${tag} -->`);   // 用函式取代，歌名裡的 $ 才不會被當成替換符號
  };
  put('about:head', head, '');
  put('about:body', body, ' ');
  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)}</title>`);
  writeFileSync(file, html, 'utf8');
  return { n, url, img, desc };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = writeAbout();
  console.log(`✅ index.html 的「關於」與 <head> 已更新：${r.n} 首` +
    (r.img ? `，預覽圖 ${r.img}` : '，沒有預覽圖（site.config.js 的 url 沒填）'));
}
