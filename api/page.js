/* ===== /w/<id> → 公開牆頁面（帶分享預覽卡） =====
   LINE／Threads／FB 的爬蟲不跑 JS，只看伺服器回的 <head>。這支把 index.html 讀出來，
   塞進 og:title（站名 — by 署名）、og:description（第一句話）、og:image（第一首封面），
   再加 <base href="/"> 讓 /w/<id> 底下的相對路徑照樣指回根目錄。頁面本身照舊由 boot.js 開機。 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { one, P, configured } from './_lib/store.js';

let shell = null;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function loadShell(req) {
  if (shell) return shell;
  try { shell = readFileSync(join(process.cwd(), 'index.html'), 'utf8'); }
  catch {
    const r = await fetch(`https://${req.headers.host}/index.html`);
    shell = await r.text();
  }
  return shell;
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const id = url.searchParams.get('w') || (url.pathname.match(/^\/w\/([a-z0-9]{4,12})/) || [])[1] || '';
  let html = await loadShell(req);
  const head = ['<base href="/">'];
  let found = false;
  try {
    if (configured && /^[a-z0-9]{4,12}$/.test(id)) {
      const raw = await one('GET', `${P}wall:${id}`);
      const w = raw ? JSON.parse(raw) : null;
      if (w && !w.hidden && w.songs?.length) {
        found = true;
        const title = w.name + (w.by ? ' — by ' + w.by : '');
        const noted = w.songs.find(s => s.note);
        const desc = noted ? `「${noted.note}」— ${noted.title}` : `${w.songs.length} 首歌的唱片牆。`;
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        head.push(
          `<meta property="og:type" content="music.playlist">`,
          `<meta property="og:site_name" content="唱片架">`,
          `<meta property="og:title" content="${esc(title)}">`,
          `<meta property="og:description" content="${esc(desc)}">`,
          `<meta property="og:image" content="${esc(w.songs[0].art)}">`,
          `<meta property="og:url" content="https://${esc(host)}/w/${id}">`,
          `<meta name="twitter:card" content="summary">`,
          `<meta name="description" content="${esc(desc)}">`,
        );
        html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
      }
    }
  } catch (e) { console.error(e); }
  html = html.replace(/<meta charset="UTF-8">/i, m => m + '\n' + head.join('\n'));   // 編碼宣告維持第一個
  res.statusCode = 200;   // 找不到的牆也回頁面，由 boot.js 顯示「找不到這面牆」
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', found ? 'public, s-maxage=120, stale-while-revalidate=600' : 'no-store');
  res.end(html);
}
