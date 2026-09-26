/* ===== /api/care?id=abc（POST）=====
   有人在這面牆試聽滿 10 秒時由前端呼叫，擦掉一層灰。
   同一來源（IP 雜湊）對同一面牆 30 分鐘只算一次；沒算到也回 200，前端照常顯示目前狀態。 */

import { send, fail, query, ipKey, allow, run, one, P } from './_lib/util.js';
import { configured } from './_lib/store.js';
import { careOf, wearAt, publicCare, STEP } from './_lib/care.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return fail(res, 405, '不支援這個動作。'); }
  if (!configured) return fail(res, 503, '資料庫還沒接上。');
  try {
    const id = query(req).get('id') || '';
    if (!/^[a-z0-9]{4,12}$/.test(id)) return fail(res, 404, '找不到這面牆。');
    const [rawWall, rawCare] = await one('MGET', `${P}wall:${id}`, `${P}care:${id}`);
    const wall = rawWall ? JSON.parse(rawWall) : null;
    if (!wall || !wall.id || wall.hidden) return fail(res, 404, '找不到這面牆。');
    const c = careOf(rawCare, wall);

    const who = ipKey(req);
    const counted = (await allow('careall', who, 120, 3600)) && (await allow('care:' + id, who, 1, 1800));
    if (!counted) return send(res, 200, { counted: false, ...publicCare(c) });

    const now = Date.now();
    const next = { w: +Math.max(0, wearAt(c, now) - STEP).toFixed(4), t: now, heard: now };
    await run([['SET', `${P}care:${id}`, JSON.stringify(next)]]);
    return send(res, 200, { counted: true, ...publicCare(next, now) });
  } catch (e) {
    console.error(e);
    return fail(res, 500, '伺服器出錯了，稍後再試一次。');
  }
}
