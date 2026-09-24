/* ===== API 共用：回應、讀 body、限流、祕鑰、文字清洗 ===== */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { one, run, P } from './store.js';

export function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

export const fail = (res, code, msg) => send(res, code, { error: msg });

export function query(req) {
  return new URL(req.url, 'http://x').searchParams;
}

/** Vercel 會先把 JSON body 解析到 req.body；本機伺服器不會，自己讀。上限 64KB。 */
export async function readJson(req) {
  if (req.body !== undefined && req.body !== null && req.body !== '') {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 65536) throw new Error('body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

const sha = s => createHash('sha256').update(s).digest('hex');

/** IP 只拿來限流：加鹽雜湊、截短、跟著 key 一起過期，不落地原值。 */
export function ipKey(req) {
  // Vercel 會覆寫 x-real-ip／x-forwarded-for 成真實來源，客戶端偽造不了
  const fwd = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = fwd || req.socket?.remoteAddress || 'unknown';
  return sha((process.env.RS_SALT || 'record-shelf') + ip).slice(0, 16);
}

/** 固定窗口限流：key 第一次出現才設過期。回傳 true＝放行。 */
export async function allow(bucket, id, limit, windowSec) {
  const k = `${P}rl:${bucket}:${id}`;
  const n = await one('INCR', k);
  if (n === 1) await one('EXPIRE', k, windowSec);
  return n <= limit;
}

export const newKey = () => randomBytes(18).toString('base64url');   // 24 字，編輯連結的祕密
export const hashKey = k => sha('rs-edit:' + k);
export function keyMatches(key, hash) {
  if (!key || !hash) return false;
  const a = Buffer.from(hashKey(key)), b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';  // 去掉易混的 i l o 0 1
export function newId(len = 7) {
  const b = randomBytes(len);
  return [...b].map(x => ALPHA[x % ALPHA.length]).join('');
}

/** 使用者文字：去控制字元、收斂空白、依「字」計長度（emoji／中文都算一個）。 */
export function cleanText(v, max) {
  const s = String(v ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [...s].slice(0, max).join('');
}

export const COUNTRIES = ['tw', 'us', 'jp', 'gb', 'kr', 'hk'];
export const LIMITS = { songs: 60, note: 80, name: 24, by: 24 };

export { run, one, P };
