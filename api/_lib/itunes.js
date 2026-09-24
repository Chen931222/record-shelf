/* ===== 伺服器端 iTunes 查詢 =====
   發布時由伺服器自己查，歌名／歌手／封面／試聽一律以 iTunes 為準；
   使用者只能給曲目 ID、商店、顏色、一句話。 */

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function normalize(r, country) {
  const d = new Date(r.releaseDate);
  const ok = !isNaN(d);
  const secs = Math.round((r.trackTimeMillis || 0) / 1000);
  const parts = String(r.artistName || '').split(/\s*,\s*|\s+(?:&|feat\.?|ft\.?|featuring)\s+/i).filter(Boolean);
  return {
    t: String(r.trackId),
    c: country,
    title: r.trackName || '',
    artist: parts[0] || r.artistName || '',
    collab: parts.slice(1).join(' '),
    album: r.collectionName || '',
    year: ok ? String(d.getUTCFullYear()) : '',
    date: ok ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` : '',
    released: ok ? d.toISOString().slice(0, 10) : '',
    // 只有真的是單曲發行才標 Single；收錄在專輯裡的歌只寫時長，不自相矛盾
    meta: [(String(r.collectionName || '').match(/ - (Single|EP)$/i) || [])[1] || '', secs ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '']
      .filter(Boolean).join(' · '),
    ms: r.trackTimeMillis || 0,
    art: String(r.artworkUrl100 || '').replace(/100x100bb/, '600x600bb'),
    preview: r.previewUrl || '',
  };
}

/** songs: [{t, c}] → Map(t → normalized)。同商店一次查完，缺的就不在 Map 裡。 */
export async function lookupAll(songs) {
  const byC = {};
  songs.forEach(s => (byC[s.c] ||= []).push(s.t));
  const found = new Map();
  await Promise.all(Object.entries(byC).map(async ([c, ids]) => {
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const url = `https://itunes.apple.com/lookup?id=${chunk.join(',')}&country=${c}&entity=song`;
      const r = await fetch(url, { headers: { 'User-Agent': 'record-shelf' } });
      if (!r.ok) throw new Error('itunes ' + r.status);
      const { results = [] } = await r.json();
      results.filter(x => x.wrapperType === 'track' && x.kind === 'song')
        .forEach(x => found.set(String(x.trackId), normalize(x, c)));
    }
  }));
  return found;
}
