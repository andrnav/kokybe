/* Kadruoklis – spaudos kokybės vertinimas (be AI): efektyvus dpi pagal spausdintuvą ir žiūrėjimo atstumą,
 * ryškumas, triukšmas, ekspozicija. Visos ribos yra pradinės vertės – jas galima keisti skirsnyje „Nuotraukos kokybė“. */
(function (root) {
  'use strict';
  const PQ = {};
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fmt = n => String(Math.round(n * 10) / 10).replace('.', ',');

  PQ.LEVELS = {
    5: { label: 'Puiki', cls: 'lv5' },
    4: { label: 'Gera', cls: 'lv4' },
    3: { label: 'Tinka', cls: 'lv3' },
    2: { label: 'Ribinė', cls: 'lv2' },
    1: { label: 'Bloga', cls: 'lv1' }
  };

  PQ.DEFAULTS = {
    printerOverride: 'auto',           // auto | noritsu | mimaki
    maxMinilabCm: 30.5,                // trumpesnė kraštinė > šios ribos -> plačiaformatis
    k: 1.25,                           // žiūrėjimo atstumas = k × įstrižainė
    minCm: 30,                         // artimiausias žiūrėjimo atstumas (rankoje laikoma nuotrauka)
    maxCm: 60,                         // tolimiausias (prie didelių atspaudų prieinama arčiau)
    fractions: { puiki: 0.9, gera: 0.7, tinka: 0.5, ribine: 0.35 }, // dalis nuo „reikiamo“ dpi
    printers: {
      noritsu: { name: 'Noritsu QSS-3701 (lazeris, Fuji DP II)', nativeDpi: 300 },
      mimaki: { name: 'Mimaki JV100-160 (eco-solvent)', nativeDpi: 360 }
    },
    sharp: { veryBlurry: 25, blurry: 80, sharp: 200 }, // triukšmo pataisytas detalumo rodiklis (Laplaso dispersija)
    noise: { moderate: 2.5, high: 4.5 },               // σ pilkumo lygiais (0–255)
    exposure: { brightClipBad: 8, darkMean: 35, brightMean: 220 }, // % ir vidurkis
    aiBad: 0.30                        // AI tikimybė, žemiau kurios laikoma problema
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  PQ.cfg = clone(PQ.DEFAULTS);

  function merge(t, s) {
    for (const k in s) {
      if (!(k in t)) continue;
      if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) merge(t[k], s[k]);
      else t[k] = s[k];
    }
  }
  PQ.loadCfg = function () {
    try { const s = localStorage.getItem('kadruoklis.pq.v1'); if (s) merge(PQ.cfg, JSON.parse(s)); } catch (e) { /* ignoruojame */ }
  };
  PQ.saveCfg = function () {
    try { localStorage.setItem('kadruoklis.pq.v1', JSON.stringify(PQ.cfg)); } catch (e) { /* ignoruojame */ }
  };
  PQ.resetCfg = function () { PQ.cfg = clone(PQ.DEFAULTS); PQ.saveCfg(); };

  /* ---------- Spausdintuvas ir reikiamas dpi ---------- */

  PQ.printerFor = function (S, L) {
    const c = PQ.cfg;
    if (c.printerOverride !== 'auto') return c.printerOverride;
    return Math.min(S, L) <= c.maxMinilabCm ? 'noritsu' : 'mimaki';
  };

  PQ.viewingCm = function (cmW, cmH) {
    const c = PQ.cfg;
    return clamp(c.k * Math.hypot(cmW, cmH), c.minCm, c.maxCm);
  };

  // „Tipinis“ reikalingas dpi: 3438 / atstumas coliais (akies skiriamoji geba ~1 lanko minutė, kaip
  // Northlight Images: maksimalus naudingas ppi = 6876/d, tipinėms sąlygoms – perpus mažiau).
  PQ.requiredPpi = function (cmW, cmH, printer) {
    const d = PQ.viewingCm(cmW, cmH) / 2.54;
    return Math.min(3438 / d, PQ.cfg.printers[printer].nativeDpi);
  };

  /* ---------- Vaizdo metrikos (pagal RGBA duomenis) ---------- */

  PQ.grayFromRgba = function (d, w, h) {
    const g = new Float32Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    return g;
  };

  // Vienos 'plytelės' statistika: vidurkis, std, Laplaso dispersija, Immerkaer triukšmo σ
  PQ.tileStats = function (rgba, w, h) {
    const g = PQ.grayFromRgba(rgba, w, h);
    let sum = 0, sum2 = 0;
    for (let i = 0; i < g.length; i++) { sum += g[i]; sum2 += g[i] * g[i]; }
    const mean = sum / g.length, std = Math.sqrt(Math.max(0, sum2 / g.length - mean * mean));
    let ls = 0, ls2 = 0, acc = 0, n = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const lap = g[i - w] + g[i + w] + g[i - 1] + g[i + 1] - 4 * g[i];
        ls += lap; ls2 += lap * lap;
        const s = g[i - w - 1] - 2 * g[i - w] + g[i - w + 1] - 2 * g[i - 1] + 4 * g[i] - 2 * g[i + 1] +
                  g[i + w - 1] - 2 * g[i + w] + g[i + w + 1];
        acc += Math.abs(s); n++;
      }
    }
    const lapVar = n ? ls2 / n - (ls / n) * (ls / n) : 0;
    const sigma = n ? Math.sqrt(Math.PI / 2) * acc / (6 * n) : 0;
    return { mean, std, lapVar, sigma };
  };

  // Ekspozicija iš sumažinto vaizdo
  PQ.exposureStats = function (rgba) {
    const hist = new Uint32Array(256);
    let n = 0, sum = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      const y = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
      hist[y]++; sum += y; n++;
    }
    let dark = 0, bright = 0;
    for (let v = 0; v <= 8; v++) dark += hist[v];
    for (let v = 247; v <= 255; v++) bright += hist[v];
    const pct = q => { let c = 0; for (let v = 0; v < 256; v++) { c += hist[v]; if (c >= q * n) return v; } return 255; };
    return { mean: sum / n, dark: dark / n * 100, bright: bright / n * 100, p2: pct(0.02), p98: pct(0.98) };
  };

  const quantile = (arr, q) => {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * q)))];
  };

  // tiles: [{x,y,size,mean,std,lapVar,sigma}], exposure: exposureStats()
  PQ.summarize = function (tiles, exposure) {
    const noise = quantile(tiles.map(t => t.sigma), 0.25);
    const nv = (noise || 0) * (noise || 0);
    tiles.forEach(t => (t.corr = Math.max(0, t.lapVar - 20 * nv)));
    let textured = tiles.filter(t => t.std >= 8);
    const sharp = textured.length >= 2 ? quantile(textured.map(t => t.corr), 0.9) : null;
    textured = textured.sort((a, b) => b.corr - a.corr);
    const patches = textured.slice(0, 4).map(t => ({ x: t.x, y: t.y, size: t.size }));
    return { sharp, noise, exposure, tiles: tiles.length, patches };
  };

  /* ---------- Vertinimas ---------- */

  PQ.STANDARD = [[9, 13], [10, 15], [13, 18], [15, 21], [20, 30], [21, 29.7], [30, 40], [30, 45], [40, 60], [50, 70], [50, 75], [60, 90]];

  PQ.evaluate = function (o) {
    const c = PQ.cfg, f = c.fractions;
    const S = Math.min(o.cmW, o.cmH), L = Math.max(o.cmW, o.cmH);
    const printer = PQ.printerFor(S, L), pr = c.printers[printer];
    const dCm = PQ.viewingCm(o.cmW, o.cmH);
    const R = PQ.requiredPpi(o.cmW, o.cmH, printer);
    const m = o.metrics;
    // Neryški nuotrauka elgiasi kaip mažesnės skiriamosios gebos: didinant formatą suliejimas didėja
    let sharpFactor = 1;
    if (m && m.sharp != null) sharpFactor = m.sharp < c.sharp.veryBlurry ? 0.5 : m.sharp < c.sharp.blurry ? 0.75 : 1;
    const dpiEff = o.dpi * sharpFactor;
    const ratio = dpiEff / R;
    const resLevel = ratio >= f.puiki ? 5 : ratio >= f.gera ? 4 : ratio >= f.tinka ? 3 : ratio >= f.ribine ? 2 : 1;
    const reasons = [];
    reasons.push({
      tone: resLevel >= 4 ? 'ok' : resLevel === 3 ? 'warn' : 'bad',
      text: `Efektyvus ${Math.round(o.dpi)} dpi. ${pr.name}, žiūrima ~${Math.round(dCm)} cm atstumu: gerai kokybei reikia ≥ ${Math.round(R * f.gera)} dpi, puikiai ≥ ${Math.round(R * f.puiki)} dpi.`
    });
    let pen = 0; // pataisos, kurių formato mažinimas nepašalina (triukšmas, ekspozicija, AI)
    if (m) {
      if (m.sharp == null) reasons.push({ tone: 'warn', text: 'Ryškumo įvertinti nepavyko – nuotraukoje per mažai detalių (lygūs plotai).' });
      else if (m.sharp < c.sharp.veryBlurry) reasons.push({ tone: 'bad', text: `Labai neryški (detalumas ${Math.round(m.sharp)}) – efektyvi skiriamoji geba laikoma perpus mažesnė (~${Math.round(dpiEff)} dpi).` });
      else if (m.sharp < c.sharp.blurry) reasons.push({ tone: 'warn', text: `Neryški (detalumas ${Math.round(m.sharp)}) – efektyvi skiriamoji geba sumažinta iki ~${Math.round(dpiEff)} dpi.` });
      else reasons.push({ tone: 'ok', text: `Ryškumas ${m.sharp >= c.sharp.sharp ? 'geras' : 'vidutinis'} (detalumas ${Math.round(m.sharp)}).` });

      if (m.noise != null) {
        if (m.noise >= c.noise.high) { pen += 1; reasons.push({ tone: 'warn', text: `Didelis triukšmas (σ ${fmt(m.noise)}) – ant popieriaus matysis grūdėtumas.` }); }
        else reasons.push({ tone: 'ok', text: `Triukšmas ${m.noise >= c.noise.moderate ? 'vidutinis' : 'mažas'} (σ ${fmt(m.noise)}).` });
      }
      const e = m.exposure;
      if (e) {
        let ep = 0, txt = [];
        if (e.bright >= c.exposure.brightClipBad) { ep = 1; txt.push(`išdegę šviesūs plotai (${fmt(e.bright)} %)`); }
        if (e.mean <= c.exposure.darkMean) { ep = 1; txt.push('labai tamsi'); }
        if (e.mean >= c.exposure.brightMean) { ep = 1; txt.push('labai šviesi'); }
        if (ep) { pen += 1; reasons.push({ tone: 'warn', text: 'Ekspozicija: ' + txt.join(', ') + '.' }); }
        else reasons.push({ tone: 'ok', text: `Ekspozicija normali (vidurkis ${Math.round(e.mean)}).` });
      }
    }
    const a = o.ai;
    if (a) {
      const bad = c.aiBad;
      const sharpAlready = m && m.sharp != null && m.sharp < c.sharp.blurry;
      const noiseAlready = m && m.noise != null && m.noise >= c.noise.high;
      let aiPen = 0;
      if (a.sharp < bad && !sharpAlready) { aiPen = 1; reasons.push({ tone: 'warn', text: `AI mato neryškų vaizdą (ryškumas ${Math.round(a.sharp * 100)} %).` }); }
      if (a.clean < bad && !noiseAlready) { aiPen = 1; reasons.push({ tone: 'warn', text: `AI mato triukšmą (švara ${Math.round(a.clean * 100)} %).` }); }
      if (a.quality < bad) { aiPen = 1; reasons.push({ tone: 'warn', text: `AI bendrą kokybę vertina žemai (${Math.round(a.quality * 100)} %).` }); }
      if (!aiPen) reasons.push({ tone: 'ok', text: `AI antra nuomonė nepriekaištų nerado (kokybė ${Math.round(a.quality * 100)} %, ryškumas ${Math.round(a.sharp * 100)} %).` });
      pen += aiPen;
    }
    const level = clamp(resLevel - Math.min(pen, 2), 1, 5);
    const out = { level, label: PQ.LEVELS[level].label, cls: PQ.LEVELS[level].cls, resLevel, printer, printerName: pr.name,
      req: R, reqGood: R * f.gera, reqBest: R * f.puiki, viewCm: dCm, dpi: o.dpi, dpiEff, sharpFactor, ratio, reasons, analyzed: !!m, ai: !!a };
    if (!o.noMax) {
      out.max = PQ.recommendMax(o);
      out.advice = PQ.advice(level, out.max);
    }
    return out;
  };

  // Didžiausias dydis (ta pačia proporcija), kuriam kokybė dar bent „Gera“
  PQ.recommendMax = function (o) {
    let best = null, passed = false;
    for (let s = 0.2; s <= 3.001; s += 0.02) {
      const r = PQ.evaluate({ dpi: o.dpi / s, cmW: o.cmW * s, cmH: o.cmH * s, metrics: o.metrics, ai: o.ai, noMax: true });
      if (r.resLevel >= 4) { best = s; passed = true; }
      else if (passed) break;
    }
    if (best == null) return null;
    const w = o.cmW * best, h = o.cmH * best;
    const S = Math.min(w, h), L = Math.max(w, h);
    let std = null;
    for (const [a, b] of PQ.STANDARD) {
      if (a <= S + 0.01 && b <= L + 0.01 && (!std || a * b > std[0] * std[1])) std = [a, b];
    }
    return { scale: best, cmW: w, cmH: h, S, L, std };
  };

  PQ.advice = function (level, max) {
    const tail = max
      ? ` Gerai kokybei tinka iki ~${fmt(max.S)}×${fmt(max.L)} cm${max.std ? ` (artimiausias standartinis: ${fmt(max.std[0])}×${fmt(max.std[1])} cm)` : ''}.`
      : ' Net mažame formate kokybė būtų menka.';
    if (level >= 4) return 'Galima gaminti šiuo formatu.';
    if (level === 3) return 'Galima gaminti, bet smulkių detalių bus mažiau – iš arti matysis minkštumas.' + tail;
    if (level === 2) return 'Ribinė kokybė – verta sumažinti formatą arba įspėti klientą.' + tail;
    return 'Nerekomenduojama gaminti šiuo formatu.' + tail;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = PQ;
  else root.PQ = PQ;
})(typeof window !== 'undefined' ? window : globalThis);
