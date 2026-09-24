/* ===== 開機：先決定資料來源，再載入頁面主程式 =====
   /w/<id>（或 ?w=<id>）→ 向 /api/walls 取那面公開牆，轉成 ALBUMS／NOTES；
   否則載入 data.js（站主自己的牆）。
   主程式（app.js／intro.js）只認 ALBUMS、NOTES、SITE，不管資料打哪來。 */
(function () {
  var me = document.currentScript;
  var app = me.getAttribute('data-app');
  var wid = new URLSearchParams(location.search).get('w') ||
            (location.pathname.match(/^\/w\/([a-z0-9]{4,12})/) || [])[1] || null;

  function load(src) {
    return new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = function () { no(new Error('load ' + src)); };
      document.body.appendChild(s);
    });
  }

  function fromWall(wall) {
    window.WALL = wall;
    window.ALBUMS = wall.songs.map(function (s) {
      return {
        id: 't' + s.t, title: s.title, artist: s.artist, collab: s.collab || '',
        date: s.date, year: s.year, bg: s.bg, meta: s.meta,
        q: (s.artist + ' ' + s.title).trim(), ptrack: null,
        preview: s.preview, cover: s.art,
      };
    });
    window.NOTES = {};
    wall.songs.forEach(function (s) {
      // 主人寫的那一句話當內頁標題；沒寫就只留收錄資訊
      window.NOTES['t' + s.t] = {
        hook: s.note || '', story: '', meaning: '', writers: '',
        source: s.album ? s.album + '，' + s.year : s.year, note: '', mine: '',
      };
    });
    SITE.name = wall.name;
    SITE.latin = wall.by ? 'by ' + wall.by : 'Record Shelf';
  }

  function notFound(msg) {
    document.title = '找不到這面牆 — 唱片架';
    document.body.style.overflow = 'auto';
    document.body.innerHTML =
      '<main style="min-height:100vh;display:grid;place-content:center;gap:18px;padding:24px;' +
      'font:500 16px/1.7 Inter,\'Noto Sans TC\',sans-serif;color:#F4EEE3;background:#262626;text-align:center">' +
      '<p style="font-weight:800;font-style:italic;font-size:28px">找不到這面牆</p>' +
      '<p style="opacity:.75;max-width:26em"></p>' +
      '<p style="display:flex;gap:22px;justify-content:center;font-size:13px;letter-spacing:.08em">' +
      '<a href="walls.html" style="color:inherit">逛唱片牆</a><a href="make.html" style="color:inherit">做一面你的</a></p></main>';
    document.querySelector('main p:nth-child(2)').textContent = msg;
  }

  function wireWallMode() {
    document.querySelectorAll('a[href="intro.html"], a[href="index.html"]').forEach(function (a) {
      a.setAttribute('href', a.getAttribute('href') + '?w=' + encodeURIComponent(wid));
    });
    document.querySelectorAll('.logo').forEach(function (a) { a.setAttribute('href', '/w/' + encodeURIComponent(wid)); });
    document.querySelectorAll('[data-own-only]').forEach(function (el) { el.hidden = true; });
    var rep = document.getElementById('reportBtn');
    if (!rep) return;
    rep.hidden = false;
    rep.addEventListener('click', function () {
      if (!confirm('要檢舉這面牆嗎？\n只在內容冒犯、騷擾或侵權時使用。')) return;
      rep.disabled = true;
      fetch('/api/report?id=' + encodeURIComponent(wid), { method: 'POST' })
        .then(function (r) { rep.textContent = r.ok ? '已檢舉，謝謝' : '檢舉失敗'; })
        .catch(function () { rep.textContent = '檢舉失敗'; rep.disabled = false; });
    });
  }

  (async function () {
    if (wid) {
      var r;
      try { r = await fetch('/api/walls?id=' + encodeURIComponent(wid)); }
      catch (e) { return notFound('連不上伺服器，等一下再重新整理看看。'); }
      if (!r.ok) {
        var err = {};
        try { err = await r.json(); } catch (e) {}
        return notFound(err.error || '這面牆不存在，或已經被主人刪掉了。');
      }
      fromWall(await r.json());
    } else {
      await load('data.js');
    }
    await load(app);
    if (wid) wireWallMode();
  })();
})();
