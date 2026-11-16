/* Foto inspektorius – pikselių lygio metrikos vienai „plytelei“ (nesumažintam vaizdo fragmentui).
 * Grynos funkcijos be DOM, todėl jas galima tikrinti Node aplinkoje.
 * Viskas skaičiuojama tik diagnostikai – nuotrauka niekada nekeičiama. */

// rgba – Uint8ClampedArray (w×h×4). Plytelės pradžia originale turi būti 8 kartotinis (JPEG blokų fazei).
export function computeTile(rgba, w, h) {
  const n = w * h;
  const g = new Float32Array(n), u = new Float32Array(n), v = new Float32Array(n);
  const hist = new Uint32Array(64);
  let sum = 0, sum2 = 0, clipR = 0, clipG = 0, clipB = 0, lo = 0;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const r = rgba[j], gg = rgba[j + 1], b = rgba[j + 2];
    const y = 0.299 * r + 0.587 * gg + 0.114 * b;
    g[i] = y; u[i] = b - y; v[i] = r - y;
    sum += y; sum2 += y * y;
    hist[(y + 0.5) >> 2 > 63 ? 63 : (y + 0.5) >> 2]++;
    if (r >= 252) clipR++;
    if (gg >= 252) clipG++;
    if (b >= 252) clipB++;
    if (y <= 5) lo++;
  }
  const mean = sum / n, std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));

  let ls = 0, ls2 = 0, aY = 0, aU = 0, aV = 0, cnt = 0;
  let ex = 0, ey = 0, ed1 = 0, ed2 = 0, s1 = 0, s2 = 0, cnt2 = 0;
  const colBin = new Float64Array(8), rowBin = new Float64Array(8);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = g[i - w] + g[i + w] + g[i - 1] + g[i + 1] - 4 * g[i];
      ls += lap; ls2 += lap * lap;
      // Immerkaer triukšmo operatorius – šviesai ir abiem spalvų skirtumams
      aY += Math.abs(g[i - w - 1] - 2 * g[i - w] + g[i - w + 1] - 2 * g[i - 1] + 4 * g[i] - 2 * g[i + 1] + g[i + w - 1] - 2 * g[i + w] + g[i + w + 1]);
      aU += Math.abs(u[i - w - 1] - 2 * u[i - w] + u[i - w + 1] - 2 * u[i - 1] + 4 * u[i] - 2 * u[i + 1] + u[i + w - 1] - 2 * u[i + w] + u[i + w + 1]);
      aV += Math.abs(v[i - w - 1] - 2 * v[i - w] + v[i - w + 1] - 2 * v[i - 1] + 4 * v[i] - 2 * v[i + 1] + v[i + w - 1] - 2 * v[i + w] + v[i + w + 1]);
      cnt++;
      // kryptiniai gradientai (judesio suliejimo kryptingumui)
      const dx = g[i + 1] - g[i], dy = g[i + w] - g[i];
      const d1 = g[i + w + 1] - g[i], d2 = g[i + w - 1] - g[i];
      ex += dx * dx; ey += dy * dy; ed1 += d1 * d1 * 0.5; ed2 += d2 * d2 * 0.5;
      // 1 ir 2 pikselių žingsnio skirtumai (padidinimo požymis)
      if (x < w - 2 && y < h - 2) {
        s1 += Math.abs(dx) + Math.abs(dy);
        s2 += Math.abs(g[i + 2] - g[i]) + Math.abs(g[i + 2 * w] - g[i]);
        cnt2++;
      }
    }
  }
  // JPEG blokų ribos: vidutinis |skirtumas| pagal x%8 ir y%8
  for (let y = 0; y < h; y++) {
    for (let x = 1; x < w; x++) colBin[x & 7] += Math.abs(g[y * w + x] - g[y * w + x - 1]);
  }
  for (let y = 1; y < h; y++) {
    for (let x = 0; x < w; x++) rowBin[y & 7] += Math.abs(g[y * w + x] - g[(y - 1) * w + x]);
  }
  const k = Math.sqrt(Math.PI / 2) / (6 * Math.max(1, cnt));
  const lapVar = cnt ? ls2 / cnt - (ls / cnt) * (ls / cnt) : 0;
  return {
    mean, std, lapVar,
    sigma: aY * k, sigU: aU * k, sigV: aV * k,
    ex, ey, ed1, ed2, s1, s2, cnt2,
    blk: Array.from({ length: 8 }, (_, i) => colBin[i] + rowBin[i]),
    hist: Array.from(hist),
    clipR: clipR / n, clipG: clipG / n, clipB: clipB / n, lo: lo / n,
  };
}
