/* ===== 牆會積灰 =====
   rs:care:<id> = { w, t, heard }：w 是 t 那一刻的灰塵量（0–1），之後每天自己變厚，FULL_DAYS 天積滿。
   有人試聽滿 10 秒 → 擦掉 STEP 一層（不是一次全新），heard 記下時間。
   主人改過牆（wall.updated 比 t 新）＝整理過，從 0 重新算。 */

export const FULL_DAYS = 90;
export const STEP = 0.2;
const DAY = 864e5;

export function careOf(raw, wall) {
  const c = raw ? JSON.parse(raw) : null;
  const base = wall.updated || wall.created || Date.now();
  if (!c || base > c.t) return { w: 0, t: base, heard: c ? c.heard : null };
  return c;
}

export function wearAt(c, now = Date.now()) {
  return Math.min(1, Math.max(0, c.w + (now - c.t) / (FULL_DAYS * DAY)));
}

export const publicCare = (c, now = Date.now()) => ({ wear: +wearAt(c, now).toFixed(3), heard: c.heard || null });
