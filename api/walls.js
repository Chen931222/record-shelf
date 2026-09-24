/* ===== /api/walls =====
   GET    ?id=abc           一面牆（公開欄位）
   GET    ?cursor=0         展示牆列表（新→舊，每頁 24）
   GET    ?health=1         資料庫有沒有接上
   POST                      發布新牆 → { id, key }（key 只出現這一次）
   PUT    ?id=abc  x-edit-key  修改
   DELETE ?id=abc  x-edit-key  刪除

   資料：rs:wall:<id> 全文、rs:sum:<id> 列表用摘要、rs:walls 有序集合（分數＝更新時間）。 */

import {
  send, fail, query, readJson, ipKey, allow, newKey, hashKey, keyMatches,
  newId, cleanText, COUNTRIES, LIMITS, run, one, P,
} from './_lib/util.js';
import { configured, backend } from './_lib/store.js';
import { lookupAll } from './_lib/itunes.js';

const PAGE = 24;
const validId = id => /^[a-z0-9]{4,12}$/.test(id || '');

export default async function handler(req, res) {
  const q = query(req);
  if (req.method === 'GET' && q.has('health')) {
    if (!configured) return send(res, 503, { ok: false, backend });
    try { await one('GET', P + 'health'); return send(res, 200, { ok: true, backend }); }
    catch { return send(res, 503, { ok: false, backend }); }
  }
  if (!configured) return fail(res, 503, '資料庫還沒接上，發布功能暫停中。');
  try {
    const id = q.get('id');
    switch (req.method) {
      case 'GET': return await (id ? getOne(res, id) : list(res, q));
      case 'POST': return await create(req, res);
      case 'PUT': return await update(req, res, id);
      case 'DELETE': return await remove(req, res, id);
      default:
        res.setHeader('Allow', 'GET, POST, PUT, DELETE');
        return fail(res, 405, '不支援這個動作。');
    }
  } catch (e) {
    if (e && e.status) return send(res, e.status, e.body);
    console.error(e);
    return fail(res, 500, '伺服器出錯了，稍後再試一次。');
  }
}

const bad = (status, error, extra = {}) => Object.assign(new Error(error), { status, body: { error, ...extra } });

async function loadWall(id) {
  const raw = await one('GET', `${P}wall:${id}`);
  return raw ? JSON.parse(raw) : null;
}

function publicWall(w) {
  return { id: w.id, name: w.name, by: w.by, songs: w.songs, created: w.created, updated: w.updated };
}

function summary(w) {
  return {
    id: w.id, name: w.name, by: w.by, n: w.songs.length, bg: w.songs[0]?.bg || '#3d3a38',
    covers: w.songs.slice(0, 4).map(s => s.art.replace('600x600bb', '300x300bb')),
    updated: w.updated,
  };
}

/* ---------- 驗證＋向 iTunes 取權威資料 ---------- */
function validate(body) {
  if (!body || typeof body !== 'object') throw bad(400, '資料格式不對。');
  const name = cleanText(body.name, LIMITS.name) || '我的唱片架';
  const by = cleanText(body.by, LIMITS.by);
  if (!Array.isArray(body.songs) || !body.songs.length) throw bad(400, '至少要有一首歌。');
  if (body.songs.length > LIMITS.songs) throw bad(400, `一面牆最多 ${LIMITS.songs} 首。`);
  const seen = new Set();
  const songs = [];
  for (const s of body.songs) {
    const t = String(s?.t ?? '');
    if (!/^\d{1,12}$/.test(t) || seen.has(t)) continue;
    seen.add(t);
    const c = COUNTRIES.includes(String(s.c).toLowerCase()) ? String(s.c).toLowerCase() : 'tw';
    const bg = /^#[0-9a-f]{6}$/i.test(s.bg || '') ? s.bg.toLowerCase() : '#3d3a38';
    songs.push({ t, c, bg, note: cleanText(s.note, LIMITS.note) });
  }
  if (!songs.length) throw bad(400, '至少要有一首歌。');
  return { name, by, songs };
}

async function build(clean) {
  const found = await lookupAll(clean.songs);
  const missing = clean.songs.filter(s => !found.has(s.t)).map(s => s.t);
  if (missing.length) throw bad(422, `有 ${missing.length} 首在 iTunes 查不到了，可能已下架。拿掉再發布一次。`, { missing });
  return clean.songs
    .map((s, i) => ({ ...found.get(s.t), bg: s.bg, note: s.note, _i: i }))
    .sort((a, b) => (b.released || '').localeCompare(a.released || '') || a._i - b._i)
    .map(({ _i, ...s }) => s);
}

async function persist(w) {
  const cmds = [
    ['SET', `${P}wall:${w.id}`, JSON.stringify(w)],
    ['SET', `${P}sum:${w.id}`, JSON.stringify(summary(w))],
  ];
  if (!w.hidden && !w.flagged) cmds.push(['ZADD', `${P}walls`, String(w.updated), w.id]);
  else cmds.push(['ZREM', `${P}walls`, w.id]);
  await run(cmds);
}

/* ---------- handlers ---------- */
async function getOne(res, id) {
  if (!validId(id)) return fail(res, 404, '找不到這面牆。');
  const w = await loadWall(id);
  if (!w || w.hidden) return fail(res, 404, '找不到這面牆。它可能被主人刪掉了。');
  return send(res, 200, publicWall(w));
}

async function list(res, q) {
  const offset = Math.max(0, parseInt(q.get('cursor') || '0', 10) || 0);
  const [ids, total] = await run([
    ['ZREVRANGE', `${P}walls`, String(offset), String(offset + PAGE - 1)],
    ['ZCARD', `${P}walls`],
  ]);
  let walls = [];
  if (ids.length) {
    const raws = await one('MGET', ...ids.map(i => `${P}sum:${i}`));
    walls = raws.filter(Boolean).map(r => JSON.parse(r));
  }
  return send(res, 200, { walls, total, next: offset + PAGE < total ? offset + PAGE : null });
}

async function create(req, res) {
  if (!(await allow('create', ipKey(req), 8, 3600))) return fail(res, 429, '這一小時發布太多次了，休息一下再來。');
  const clean = validate(await readJson(req));
  const songs = await build(clean);
  const key = newKey();
  const now = Date.now();
  let id = '';
  for (let i = 0; i < 5; i++) {       // 撞號就重抽；SET NX 佔位
    const cand = newId();
    if ((await one('SET', `${P}wall:${cand}`, '{}', 'NX')) === 'OK') { id = cand; break; }
  }
  if (!id) throw new Error('id space');
  const w = { v: 1, id, name: clean.name, by: clean.by, songs, created: now, updated: now,
              editHash: hashKey(key), hidden: false, flagged: false };
  await persist(w);
  return send(res, 201, { id, key });
}

async function authed(req, id) {
  if (!validId(id)) throw bad(404, '找不到這面牆。');
  if (!(await allow('edit', ipKey(req), 60, 3600))) throw bad(429, '改太多次了，休息一下再來。');
  const w = await loadWall(id);
  if (!w) throw bad(404, '找不到這面牆。');
  if (!keyMatches(String(req.headers['x-edit-key'] || ''), w.editHash)) throw bad(403, '編輯連結不對，沒辦法修改這面牆。');
  return w;
}

async function update(req, res, id) {
  const w = await authed(req, id);
  const clean = validate(await readJson(req));
  w.songs = await build(clean);
  w.name = clean.name; w.by = clean.by; w.updated = Date.now();
  await persist(w);
  return send(res, 200, { id });
}

async function remove(req, res, id) {
  await authed(req, id);
  await run([
    ['DEL', `${P}wall:${id}`, `${P}sum:${id}`, `${P}rep:${id}`],
    ['ZREM', `${P}walls`, id],
  ]);
  return send(res, 200, { ok: true });
}
