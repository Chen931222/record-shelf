#!/usr/bin/env node
/* ===== 站主管理：審核公開牆 =====
   線上資料庫：先把金鑰拉到本機（只存在你電腦，已 gitignore／vercelignore）
     vercel env pull .env.local
     node --env-file=.env.local scripts/admin.mjs <指令>
   沒帶金鑰時操作的是本機 .dev-store.json（開發用）。

   指令：
     recent [n]        最近 n 面（預設 20）：站名、署名、首數、每一句話
     reported          被檢舉過的牆：人數、是否已撤下
     show <id>         一面牆的完整內容
     hide <id>         隱藏：直連 404、撤出展示牆（主人的編輯連結仍可用）
     unhide <id>       放回：取消隱藏與檢舉撤下，清空檢舉紀錄
     delete <id>       永久刪除（無法復原） */

import { run, one, P, backend } from '../api/_lib/store.js';

const [cmd, arg] = process.argv.slice(2);
const load = async id => { const r = await one('GET', `${P}wall:${id}`); return r ? JSON.parse(r) : null; };
const need = w => { if (!w) { console.error('找不到這面牆'); process.exit(1); } return w; };
const line = w => `${w.id}  ${w.hidden ? '[隱藏] ' : ''}${w.flagged ? '[檢舉撤下] ' : ''}${w.name}${w.by ? ' / ' + w.by : ''}  ${w.songs.length} 首  ${new Date(w.updated).toISOString().slice(0, 16).replace('T', ' ')}`;

async function save(w) {
  const sum = { id: w.id, name: w.name, by: w.by, n: w.songs.length, bg: w.songs[0]?.bg || '#3d3a38',
    covers: w.songs.slice(0, 4).map(s => s.art.replace('600x600bb', '300x300bb')), updated: w.updated };
  const cmds = [['SET', `${P}wall:${w.id}`, JSON.stringify(w)], ['SET', `${P}sum:${w.id}`, JSON.stringify(sum)]];
  cmds.push(!w.hidden && !w.flagged ? ['ZADD', `${P}walls`, String(w.updated), w.id] : ['ZREM', `${P}walls`, w.id]);
  await run(cmds);
}

console.log(`（資料庫：${backend}）\n`);
switch (cmd) {
  case 'recent': {
    const ids = await one('ZREVRANGE', `${P}walls`, '0', String((+arg || 20) - 1));
    for (const id of ids) {
      const w = await load(id); if (!w) continue;
      console.log(line(w));
      w.songs.filter(s => s.note).forEach(s => console.log(`      「${s.note}」— ${s.title}`));
    }
    if (!ids.length) console.log('展示牆是空的。');
    break;
  }
  case 'reported': {
    const ids = await one('SMEMBERS', `${P}reported`);
    for (const id of ids) {
      const w = await load(id);
      const n = await one('SCARD', `${P}rep:${id}`);
      console.log(w ? `${n} 人檢舉  ${line(w)}` : `${id}  （已刪除）`);
    }
    if (!ids.length) console.log('沒有被檢舉的牆。');
    break;
  }
  case 'show': {
    const w = need(await load(arg));
    const { editHash, ...pub } = w;
    console.log(JSON.stringify(pub, null, 2));
    break;
  }
  case 'hide': { const w = need(await load(arg)); w.hidden = true; await save(w); console.log('已隱藏：' + line(w)); break; }
  case 'unhide': {
    const w = need(await load(arg)); w.hidden = false; w.flagged = false; await save(w);
    await run([['DEL', `${P}rep:${arg}`], ['SREM', `${P}reported`, arg]]);
    console.log('已放回：' + line(w)); break;
  }
  case 'delete': {
    need(await load(arg));
    await run([['DEL', `${P}wall:${arg}`, `${P}sum:${arg}`, `${P}rep:${arg}`], ['ZREM', `${P}walls`, arg], ['SREM', `${P}reported`, arg]]);
    console.log('已刪除 ' + arg); break;
  }
  default:
    console.log('用法：node --env-file=.env.local scripts/admin.mjs recent|reported|show|hide|unhide|delete [id]');
}
