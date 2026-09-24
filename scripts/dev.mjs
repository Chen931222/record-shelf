#!/usr/bin/env node
/* ===== 本機開發伺服器 =====
   node scripts/dev.mjs [port]      預設 8533
   靜態檔＋/api/*（直接載入 api/ 底下的 handler）。沒設 Upstash 金鑰時，
   資料存在根目錄 .dev-store.json（已 gitignore、vercelignore）。 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
process.chdir(ROOT);
const PORT = +(process.argv[2] || 8533);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (/^\/w\/[a-z0-9]{4,12}\/?$/.test(url.pathname)) {   // 同 vercel.json 的 rewrite
      const mod = await import(pathToFileURL(join(ROOT, 'api', 'page.js')).href);
      return await mod.default(req, res);
    }
    const m = url.pathname.match(/^\/api\/([a-z-]+)$/);
    if (m) {
      const mod = await import(pathToFileURL(join(ROOT, 'api', m[1] + '.js')).href);
      return await mod.default(req, res);
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^([\\/])+/, '');
    if (!p || p.endsWith('/') || p.endsWith('\\')) p += 'index.html';
    if (p.includes('..') || p.startsWith('.') || p.startsWith('api') || p.startsWith('scripts')) throw Object.assign(new Error(), { code: 'ENOENT' });
    const file = join(ROOT, p);
    await stat(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'ERR_MODULE_NOT_FOUND') { res.writeHead(404); res.end('not found'); }
    else { console.error(e); res.writeHead(500); res.end('dev server error'); }
  }
}).listen(PORT, () => console.log(`record-shelf dev → http://localhost:${PORT}`));
