/* ===== /api/report?id=abc（POST）=====
   同一來源（IP 雜湊）對同一面牆只算一次；累積到 FLAG_AT 從展示牆列表撤下
   （直連還看得到），等站主用 scripts/admin.mjs 決定隱藏、刪除或放回。 */

import { send, fail, query, ipKey, allow, run, one, P } from './_lib/util.js';
import { configured } from './_lib/store.js';

const FLAG_AT = 3;

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return fail(res, 405, '不支援這個動作。'); }
  if (!configured) return fail(res, 503, '資料庫還沒接上。');
  try {
    const id = query(req).get('id') || '';
    if (!/^[a-z0-9]{4,12}$/.test(id)) return fail(res, 404, '找不到這面牆。');
    const who = ipKey(req);
    if (!(await allow('report', who, 20, 3600))) return fail(res, 429, '檢舉太多次了，稍後再試。');
    const raw = await one('GET', `${P}wall:${id}`);
    if (!raw) return fail(res, 404, '找不到這面牆。');
    const [, n] = await run([['SADD', `${P}rep:${id}`, who], ['SCARD', `${P}rep:${id}`], ['SADD', `${P}reported`, id]]);
    const w = JSON.parse(raw);
    if (n >= FLAG_AT && !w.flagged) {
      w.flagged = true;
      await run([['SET', `${P}wall:${id}`, JSON.stringify(w)], ['ZREM', `${P}walls`, id]]);
    }
    return send(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    return fail(res, 500, '伺服器出錯了，稍後再試一次。');
  }
}
