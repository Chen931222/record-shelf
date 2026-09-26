/* ===== 會變老的唱片牆：外觀層 =====
   一個數字 age（0＝剛被照顧過，1＝很久沒人理）決定這面牆積了多少灰。
   age 從哪來：
     公開牆 /w/<id>  伺服器算好的 WALL.wear（有人試聽滿 10 秒就擦掉一層，見 api/care.js）
     自己的牆        data.js 的 TENDED（上次整理的日期；add-song 會自動更新），90 天積滿
     ?age=0..1       demo：出現調整面板，另可用 &wear=sun|yellow 看另外兩種老法
   文字對比有下限：老了也不得低於原本的對比，且內文不低於 4.5:1（WCAG AA）。
   不想要這個效果：site.config.js 設 aging:false。 */
(function () {
  var qs = new URLSearchParams(location.search);
  var DEMO = qs.has('age');
  var WEARS = { sun: '日曬', dust: '積灰', yellow: '泛黃' };
  var FULL_DAYS = 90, CARE_STEP = 0.2, DAY = 864e5;
  var BASE_INK = [244, 238, 227], BASE_FG = [255, 255, 255];
  var root = document.documentElement;

  var state = null;   // 第一次被 app.js 呼叫時才決定（那時資料已經載好）
  function init() {
    if (state) return state;
    var cfg = window.SITE || (typeof SITE !== 'undefined' ? SITE : {});
    var tended = typeof TENDED === 'string' ? TENDED : null;
    if (DEMO) {
      state = { mode: 'demo', age: clamp(parseFloat(qs.get('age')) || 0, 0, 1), wear: WEARS[qs.get('wear')] ? qs.get('wear') : 'dust', heard: null };
    } else if (cfg.aging === false) {
      state = { mode: 'off' };
    } else if (window.WALL && typeof WALL.wear === 'number') {
      state = { mode: 'wall', age: clamp(WALL.wear, 0, 1), wear: 'dust', heard: WALL.heard || null };
    } else if (tended && !isNaN(Date.parse(tended))) {
      var t = Date.parse(tended + 'T00:00:00');
      state = { mode: 'own', age: clamp((Date.now() - t) / (FULL_DAYS * DAY), 0, 1), wear: 'dust', heard: t };
    } else {
      state = { mode: 'off' };
    }
    if (state.mode !== 'off') { root.dataset.wear = state.wear; root.style.setProperty('--age', state.age.toFixed(3)); }
    return state;
  }

  /* ---------- 色彩工具 ---------- */
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function hex2rgb(h) { var v = parseInt(h.replace('#', ''), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  function rgb2hex(c) { return '#' + c.map(function (x) { return Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0'); }).join(''); }
  function mix(a, b, t) { return a.map(function (x, i) { return x + (b[i] - x) * t; }); }
  function grey(c) { var y = .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; return [y, y, y]; }
  function lum(c) {
    var s = c.map(function (x) { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); });
    return .2126 * s[0] + .7152 * s[1] + .0722 * s[2];
  }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
  function over(fg, alpha, bg) { return mix(bg, fg, alpha); }

  /* ---------- 各種老法：房間底色、墨色往哪裡走 ---------- */
  var RECIPES = {
    sun:    { bg: function (c, a) { return mix(c, mix(grey(c), [70, 74, 76], .35), .85 * a); }, ink: [236, 240, 238], fg: [240, 246, 246] },
    dust:   { bg: function (c, a) { return mix(c, [58, 55, 51], .62 * a); },                     ink: [206, 202, 194], fg: [222, 219, 212] },
    yellow: { bg: function (c, a) { return mix(c, [52, 42, 30], .5 * a); },                      ink: [232, 212, 168], fg: [240, 224, 186] },
  };

  // 在對比守得住的範圍內，盡量讓它老。k 從 1 往下退，直到內文與小字都過關
  function solve(bgHex) {
    var base = hex2rgb(bgHex), r = RECIPES[state.wear], a = state.age;
    var need = function (alpha) { return Math.min(4.5, contrast(over(BASE_INK, alpha, base), base)); };
    var needBody = need(.86), needLabel = need(.72);
    for (var k = 1; k >= 0; k -= .05) {
      var bg = r.bg(base, a * k), ink = mix(BASE_INK, r.ink, a * k), fg = mix(BASE_FG, r.fg, a * k);
      var body = contrast(over(ink, .86, bg), bg), label = contrast(over(ink, .72, bg), bg);
      if (body >= needBody && label >= needLabel) return { bg: bg, ink: ink, fg: fg, body: body, k: k };
    }
    return { bg: base, ink: BASE_INK, fg: BASE_FG, body: contrast(over(BASE_INK, .86, base), base), k: 0 };
  }

  /* ---------- 給 app.js 的掛鉤 ---------- */
  var last = null, rawBg = '#262626';
  window.AGING = {
    bg: function (hex) {           // 每換一首歌呼叫：原色進來，老過的顏色出去
      rawBg = hex;
      if (init().mode === 'off') return hex;
      last = solve(hex);
      root.style.setProperty('--ink', last.ink.map(Math.round).join(','));
      root.style.setProperty('--fg', rgb2hex(last.fg));
      readout();
      return rgb2hex(last.bg);
    },
    mount: mount,
    heard: heard,                  // 試聽滿 10 秒時呼叫
  };

  function repaint() {
    root.style.setProperty('--age', state.age.toFixed(3));
    root.dataset.wear = state.wear;
    var bg = AGING.bg(rawBg);
    document.body.style.backgroundColor = bg;
    var cd = document.querySelector('.cd'); if (cd) cd.style.setProperty('--hole', bg);
    stamp();
  }

  /* ---------- 印章 ---------- */
  var stampEl;
  function ymd(ms) {
    var t = new Date(ms);
    return t.getFullYear() + '.' + String(t.getMonth() + 1).padStart(2, '0') + '.' + String(t.getDate()).padStart(2, '0');
  }
  function daysAgo(ms) {   // 以日曆日算，不以 24 小時算：昨天晚上聽的，今天就是「1 天前」
    var a = new Date(ms), b = new Date();
    return Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / DAY);
  }
  function stamp() {
    if (!stampEl) return;
    var label = state.mode === 'own' ? '上次整理' : '上次有人來聽';
    var when = state.heard;
    if (state.mode === 'demo' && when === null) when = Date.now() - Math.round(state.age * FULL_DAYS) * DAY;
    var b, small;
    if (!when) { b = '還沒有人'; small = '第一個來聽的會留下日期'; }
    else {
      var d = daysAgo(when);
      b = d === 0 ? '今天' : ymd(when);
      small = d === 0 ? ymd(when) : d + ' 天前';
    }
    stampEl.querySelector('span').textContent = label;
    stampEl.querySelector('b').textContent = b;
    stampEl.querySelector('small').textContent = small;
  }

  function mount() {
    if (init().mode === 'off') return;
    document.querySelectorAll('.cover').forEach(function (c) {
      var f = document.createElement('div'); f.className = 'age-film'; c.insertBefore(f, c.querySelector('.sheen'));
    });
    stampEl = document.createElement('p');
    stampEl.className = 'last-heard';
    stampEl.innerHTML = '<span></span><b></b><small></small>';
    document.body.appendChild(stampEl);
    document.body.classList.add('has-stamp');
    if (DEMO) buildPanel();
    repaint();
  }

  /* ---------- 照顧：擦掉一層（殘影從左往右被抹掉） ---------- */
  var cared = false;
  function heard() {
    if (!state || state.mode === 'off' || state.mode === 'own' || cared) return;
    if (state.mode === 'demo') { if (state.age > 0) wipeTo(Math.max(0, +(state.age - CARE_STEP).toFixed(2))); return; }
    cared = true;   // 一次開頁只送一次；伺服器另有 30 分鐘的同源限制
    fetch('/api/care?id=' + encodeURIComponent(WALL.id), { method: 'POST' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.counted) wipeTo(d.wear, d.heard); })
      .catch(function () {});
  }

  function wipeTo(age, heardAt) {
    var cov = document.querySelector('.cover.active');
    if (cov && !matchMedia('(prefers-reduced-motion: reduce)').matches && age < state.age) {
      var ghost = cov.cloneNode(true);
      ghost.classList.add('age-ghost');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.style.setProperty('--a', state.age);
      cov.parentNode.appendChild(ghost);
      requestAnimationFrame(function () { requestAnimationFrame(function () { ghost.classList.add('wiping'); }); });
      ghost.addEventListener('transitionend', function () { ghost.remove(); }, { once: true });
      setTimeout(function () { ghost.remove(); }, 1600);
    }
    state.age = age;
    state.heard = heardAt || Date.now();
    repaint();
    if (panel) { panel.querySelector('input').value = age; syncPanel(); }
  }

  /* ---------- demo 面板（只在 ?age= 時出現） ---------- */
  var panel;
  function readout() {
    if (!panel || !last) return;
    panel.querySelector('[data-v=age]').textContent = state.age.toFixed(2);
    panel.querySelector('.age-h i').textContent = WEARS[state.wear] + ' ' + state.age.toFixed(2);
    panel.querySelector('[data-v=days]').textContent = state.age >= 1 ? FULL_DAYS + ' 天以上' : '約 ' + Math.round(state.age * FULL_DAYS) + ' 天';
    panel.querySelector('[data-v=ratio]').textContent = last.body.toFixed(1) + ':1 ' + (last.body >= 4.5 ? 'AA' : '未達 AA');
    panel.querySelector('[data-v=held]').hidden = last.k > .999 || state.age === 0;
  }
  function buildPanel() {
    panel = document.createElement('section');
    panel.className = 'age-panel';
    panel.setAttribute('aria-label', '老化調整（demo）');
    panel.innerHTML =
      '<button type="button" class="age-h" aria-expanded="true">老化 demo<span>只在網址有 ?age= 時出現</span><i aria-hidden="true"></i></button>' +
      '<div class="age-body">' +
      '<div class="age-wears" role="radiogroup" aria-label="老法">' +
      Object.keys(WEARS).map(function (k) { return '<button type="button" role="radio" data-wear="' + k + '">' + WEARS[k] + '</button>'; }).join('') +
      '</div>' +
      '<label class="age-row"><span>年齡 <output data-v="age"></output></span>' +
      '<input type="range" min="0" max="1" step="0.01" aria-label="年齡"></label>' +
      '<dl class="age-dl"><dt>相當於</dt><dd data-v="days"></dd><dt>內文對比</dt><dd data-v="ratio"></dd></dl>' +
      '<p class="age-held" data-v="held" hidden>對比到下限了，墨色停在這裡不再變淡。</p>' +
      '<button type="button" class="age-care">有人來聽了一首</button></div>';
    document.body.appendChild(panel);

    var head = panel.querySelector('.age-h');
    function fold(closed) { panel.classList.toggle('folded', closed); head.setAttribute('aria-expanded', String(!closed)); }
    head.addEventListener('click', function () { fold(!panel.classList.contains('folded')); });
    fold(matchMedia('(max-width: 480px)').matches);   // 手機預設收起，不擋封面

    var range = panel.querySelector('input');
    range.value = state.age;
    range.addEventListener('input', function () { state.age = +range.value; state.heard = null; syncPanel(); repaint(); });
    panel.querySelectorAll('[data-wear]').forEach(function (b) {
      b.addEventListener('click', function () { state.wear = b.dataset.wear; syncPanel(); repaint(); });
    });
    panel.querySelector('.age-care').addEventListener('click', function () { if (state.age > 0) wipeTo(Math.max(0, +(state.age - CARE_STEP).toFixed(2))); });
    syncPanel();
  }
  function syncPanel() {
    panel.querySelectorAll('[data-wear]').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.wear === state.wear)); });
    var u = new URL(location.href);
    u.searchParams.set('age', state.age.toFixed(2)); u.searchParams.set('wear', state.wear);
    history.replaceState(null, '', u);
    readout();
  }
})();
