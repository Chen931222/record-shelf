/* ===== 封面 → 背景色（共用） =====
   瀏覽器（make.html，canvas getImageData）與 Node（scripts/add-song.mjs，jpeg-js）
   吃同一支函式，兩邊算出來的顏色才會一致。
   px：RGBA 平鋪陣列（Uint8ClampedArray／Buffer 皆可）。
   回傳 { bg: '#rrggbb', mono: boolean }：
   有色封面 → 飽和度加權的主色相，壓到 22% 亮度；
   黑白／單色封面 → 帶一點色相的暗灰（別用死板純灰）。 */

export function bgFromPixels(px) {
  let n = 0, satN = 0, R = 0, G = 0, B = 0, hx = 0, hy = 0, sSum = 0;
  const step = 4 * 7; // 每 7 個像素取 1 個
  for (let i = 0; i < px.length; i += step) {
    const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    n++; R += r; G += g; B += b;
    if (l < .06 || l > .94) continue;              // 全黑全白不投票
    const s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
    if (s < .18) continue;                          // 灰不投票
    let h;
    if (mx === r) h = ((g - b) / (mx - mn)) % 6;
    else if (mx === g) h = (b - r) / (mx - mn) + 2;
    else h = (r - g) / (mx - mn) + 4;
    h *= 60; if (h < 0) h += 360;
    hx += Math.cos(h * Math.PI / 180) * s; hy += Math.sin(h * Math.PI / 180) * s;
    sSum += s; satN++;
  }
  if (!n) return { bg: '#3d3a38', mono: true };
  let hue = Math.atan2(hy, hx) * 180 / Math.PI; if (hue < 0) hue += 360;
  if (satN / n > .06) {
    const s = Math.min(.62, Math.max(.35, (sSum / satN) * 1.05));
    return { bg: hslToHex(hue, s, .22), mono: false };
  }
  const ar = R / n, ag = G / n, ab = B / n;
  const mx = Math.max(ar, ag, ab), mn = Math.min(ar, ag, ab);
  let gh = 30;                                      // 撈不到色相就偏暖
  if (mx > mn) {
    if (mx === ar) gh = (((ag - ab) / (mx - mn)) % 6) * 60;
    else if (mx === ag) gh = ((ab - ar) / (mx - mn) + 2) * 60;
    else gh = ((ar - ag) / (mx - mn) + 4) * 60;
    if (gh < 0) gh += 360;
  }
  return { bg: hslToHex(gh, .045, .245), mono: true };
}

export function hslToHex(h, s, l) {
  const f = k => {
    const kk = (k + h / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(kk - 3, 9 - kk, 1));
  };
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}
