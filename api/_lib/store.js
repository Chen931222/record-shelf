/* ===== 儲存層 =====
   線上：Upstash Redis REST（與 CPE 站共用同一個資料庫，所有 key 一律 rs: 前綴）。
   本機：沒有金鑰時改用 .dev-store.json，指令子集與 Redis 同義，方便整條流程離線測。
   線上若沒接資料庫 → configured=false，API 回 503，不假裝成功。 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const URL_ = process.env.RS_KV_REST_API_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.RS_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const ON_VERCEL = !!process.env.VERCEL;
const DEV_FILE = process.env.RS_DEV_STORE || '.dev-store.json';

export const P = 'rs:';
export const configured = !!(URL_ && TOKEN) || !ON_VERCEL;
export const backend = URL_ && TOKEN ? 'upstash' : (ON_VERCEL ? 'none' : 'file');

/** 執行一批 Redis 指令，回傳每一條的結果（陣列）。 */
export async function run(cmds) {
  if (backend === 'upstash') {
    const r = await fetch(URL_.replace(/\/$/, '') + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmds),
    });
    if (!r.ok) throw new Error('store ' + r.status);
    const out = await r.json();
    return out.map(x => { if (x.error) throw new Error('store: ' + x.error); return x.result; });
  }
  if (backend === 'file') return cmds.map(c => fileCmd(c));
  throw new Error('store not configured');
}

export const one = async (...cmd) => (await run([cmd]))[0];

/* ---------- 本機檔案版（只實作用得到的指令） ---------- */
let mem = null;
function load() {
  if (mem) return mem;
  mem = existsSync(DEV_FILE) ? JSON.parse(readFileSync(DEV_FILE, 'utf8')) : { kv: {}, exp: {} };
  return mem;
}
function save() { writeFileSync(DEV_FILE, JSON.stringify(mem)); }
function alive(k) {
  const m = load();
  if (m.exp[k] && m.exp[k] < Date.now()) { delete m.kv[k]; delete m.exp[k]; }
  return k in m.kv;
}
function fileCmd([op, ...a]) {
  const m = load(); op = op.toUpperCase();
  const k = a[0];
  let res = null;
  switch (op) {
    case 'GET': res = alive(k) ? m.kv[k] : null; break;
    case 'MGET': res = a.map(x => alive(x) ? m.kv[x] : null); break;
    case 'SET': {
      const nx = a.map(x => String(x).toUpperCase()).includes('NX');
      if (nx && alive(k)) { res = null; break; }
      m.kv[k] = String(a[1]); delete m.exp[k]; res = 'OK'; break;
    }
    case 'DEL': res = a.filter(x => { const h = alive(x); delete m.kv[x]; delete m.exp[x]; return h; }).length; break;
    case 'INCR': m.kv[k] = String((+(alive(k) ? m.kv[k] : 0)) + 1); res = +m.kv[k]; break;
    case 'EXPIRE': if (alive(k)) { m.exp[k] = Date.now() + (+a[1]) * 1000; res = 1; } else res = 0; break;
    case 'ZADD': {
      const z = alive(k) ? m.kv[k] : {}; const isNew = !(a[2] in z);
      z[a[2]] = +a[1]; m.kv[k] = z; res = isNew ? 1 : 0; break;
    }
    case 'ZREM': { const z = alive(k) ? m.kv[k] : {}; res = a.slice(1).filter(x => { const h = x in z; delete z[x]; return h; }).length; m.kv[k] = z; break; }
    case 'ZCARD': res = alive(k) ? Object.keys(m.kv[k]).length : 0; break;
    case 'ZREVRANGE': {
      const z = alive(k) ? m.kv[k] : {};
      const arr = Object.entries(z).sort((x, y) => y[1] - x[1]).map(e => e[0]);
      const s = +a[1], e = +a[2];
      res = arr.slice(s, e < 0 ? arr.length + e + 1 : e + 1); break;
    }
    case 'SADD': { const s = new Set(alive(k) ? m.kv[k] : []); const before = s.size; a.slice(1).forEach(x => s.add(x)); m.kv[k] = [...s]; res = s.size - before; break; }
    case 'SCARD': res = alive(k) ? m.kv[k].length : 0; break;
    case 'SMEMBERS': res = alive(k) ? [...m.kv[k]] : []; break;
    case 'SREM': { const s = new Set(alive(k) ? m.kv[k] : []); const before = s.size; a.slice(1).forEach(x => s.delete(x)); m.kv[k] = [...s]; res = before - s.size; break; }
    default: throw new Error('dev store: unsupported ' + op);
  }
  save();
  return res;
}
