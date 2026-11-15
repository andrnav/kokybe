/* Foto inspektorius – spaudos kokybės vertinimas (be AI): efektyvus dpi pagal spausdintuvą ir žiūrėjimo atstumą,
 * ryškumas, triukšmas, ekspozicija. Visos funkcijos grynos: nustatymai (cfg) perduodami parametru.
 * Ribos yra pradinės vertės – jas galima keisti skirsnyje „Nuotraukos kokybė“. */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const humanLevel = (value, thresholds) => value >= thresholds[0] ? 'Puiki' : value >= thresholds[1] ? 'Gera' : value >= thresholds[2] ? 'Tinka' : value >= thresholds[3] ? 'Ribinė' : 'Prasta';
export const fmt1 = n => String(Math.round(n * 10) / 10).replace('.', ',');

export const LEVELS = {
  5: { label: 'Puiki', cls: 'lv5' },
  4: { label: 'Gera', cls: 'lv4' },
  3: { label: 'Tinka', cls: 'lv3' },
  2: { label: 'Ribinė', cls: 'lv2' },
  1: { label: 'Prasta', cls: 'lv1' },
};

export const DEFAULT_CONFIG = {
  printerOverride: 'auto',   // auto | noritsu | mimaki
  maxMinilabCm: 30.5,        // trumpesnė kraštinė ≤ šios ribos -> Noritsu (popieriaus plotis 30,5 cm)
  maxMinilabLongCm: 91.4,    // ilgesnė kraštinė ≤ šios ribos -> Noritsu (maksimalus ilgis ~91,4 cm)
  k: 1.25,                   // žiūrėjimo atstumas = k × įstrižainė
  minCm: 30,                 // artimiausias žiūrėjimo atstumas (rankoje laikoma nuotrauka)
  maxCm: 60,                 // tolimiausias (prie didelių atspaudų vis tiek prieinama arčiau)
  fractions: { puiki: 0.9, gera: 0.7, tinka: 0.5, ribine: 0.35 }, // dalis nuo „reikiamo“ dpi
  printers: {
    noritsu: { name: 'Noritsu QSS-3701 (lazeris, Fuji DP II)', nativeDpi: 300 },
    mimaki: { name: 'Mimaki JV100-160 (eco-solvent)', nativeDpi: 360 },
  },
  sharp: { veryBlurry: 25, blurry: 80, sharp: 200 }, // triukšmo pataisytas detalumas (Laplaso dispersija)
  noise: { moderate: 2.5, high: 4.5 },               // σ pilkumo lygiais (0–255)
  exposure: { brightClipBad: 8, darkMean: 35, brightMean: 220 }, // % ir vidurkis
  aiBad: 0.30,               // AI tikimybė, žemiau kurios laikoma problema
};

export const cloneConfig = c => JSON.parse(JSON.stringify(c));

const STORAGE_KEY = 'foto-inspektorius-quality-v1';

function merge(t, s) {
  for (const k in s) {
    if (!(k in t)) continue;
    if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) merge(t[k], s[k]);
    else if (typeof s[k] === typeof t[k] && (typeof s[k] !== 'number' || Number.isFinite(s[k]))) t[k] = s[k];
  }
}
export function loadConfig() {
  const cfg = cloneConfig(DEFAULT_CONFIG);
  try { const s = localStorage.getItem(STORAGE_KEY); if (s) merge(cfg, JSON.parse(s)); } catch { /* ignoruojame */ }
  return cfg;
}
export function saveConfig(cfg) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch { /* ignoruojame */ }
}

/* ---------- Spausdintuvas ir reikiamas dpi ---------- */

export function printerFor(S, L, cfg) {
  if (cfg.printerOverride !== 'auto') return cfg.printerOverride;
  return Math.min(S, L) <= cfg.maxMinilabCm && Math.max(S, L) <= cfg.maxMinilabLongCm ? 'noritsu' : 'mimaki';
}

export function viewingCm(cmW, cmH, cfg) {
  return clamp(cfg.k * Math.hypot(cmW, cmH), cfg.minCm, cfg.maxCm);
}

// „Tipinis“ reikalingas dpi ≈ 3438 / žiūrėjimo atstumas coliais (akies skiriamoji geba ~1 lanko minutė; tipinėms
// sąlygoms – perpus mažiau nei teorinis maksimumas 6876/d).
export function requiredPpi(cmW, cmH, printer, cfg) {
  const d = viewingCm(cmW, cmH, cfg) / 2.54;
  return Math.min(3438 / d, cfg.printers[printer].nativeDpi);
}

function resolutionLevel(dpiEff, cmW, cmH, cfg) {
  const S = Math.min(cmW, cmH), L = Math.max(cmW, cmH);
  const printer = printerFor(S, L, cfg);
  const R = requiredPpi(cmW, cmH, printer, cfg);
  const ratio = dpiEff / R, f = cfg.fractions;
  const resLevel = ratio >= f.puiki ? 5 : ratio >= f.gera ? 4 : ratio >= f.tinka ? 3 : ratio >= f.ribine ? 2 : 1;
  return { printer, R, ratio, resLevel };
}

/* ---------- Vaizdo metrikos (pagal RGBA duomenis) ---------- */

export function grayFromRgba(d, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
  return g;
}

// Vienos „plytelės“ statistika: vidurkis, std, Laplaso dispersija, Immerkaer triukšmo σ
export function tileStats(rgba, w, h) {
  const g = grayFromRgba(rgba, w, h);
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
}

// Ekspozicija iš sumažinto vaizdo
export function exposureStats(rgba) {
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
}

const quantile = (arr, q) => {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * q)))];
};

// tiles: [{x,y,size,mean,std,lapVar,sigma}], exposure: exposureStats()
export function summarize(tiles, exposure) {
  const noise = quantile(tiles.map(t => t.sigma), 0.25);
  const nv = (noise || 0) * (noise || 0);
  tiles.forEach(t => (t.corr = Math.max(0, t.lapVar - 20 * nv)));
  let textured = tiles.filter(t => t.std >= 8);
  const sharp = textured.length >= 2 ? quantile(textured.map(t => t.corr), 0.9) : null;
  textured = textured.sort((a, b) => b.corr - a.corr);
  const patches = textured.slice(0, 4).map(t => ({ x: t.x, y: t.y, size: t.size }));
  return { sharp, noise, exposure, tiles: tiles.length, patches };
}

/* ---------- Vertinimas ---------- */

// Nominalūs dydžiai, iš kurių siūlomas „artimiausias standartinis“ formatas (cm)
export const STANDARD = [[9, 13], [10, 15], [13, 18], [13, 19], [15, 15], [15, 21], [15, 23], [20, 30], [21, 29.7], [30, 30],
  [30, 40], [29.7, 42], [30, 45], [40, 60], [50, 70], [60, 90], [100, 150]];

// Neryški nuotrauka elgiasi kaip mažesnės skiriamosios gebos: didinant formatą suliejimas didėja
function sharpFactorOf(m, cfg) {
  if (!m || m.sharp == null) return 1;
  return m.sharp < cfg.sharp.veryBlurry ? 0.5 : m.sharp < cfg.sharp.blurry ? 0.75 : 1;
}

// Ryškumo, triukšmo, ekspozicijos ir AI pastabos. pen – įvertinimo sumažinimas, kurio formato mažinimas nepašalina.
function imageFindings(m, a, cfg, dpiEff) {
  const reasons = [];
  let pen = 0;
  const eff = dpiEff != null ? ` (~${Math.round(dpiEff)} dpi)` : '';
  if (m) {
    if (m.sharp == null) reasons.push({ tone: 'warn', text: 'Ryškumo įvertinti nepavyko – nuotraukoje per mažai detalių (lygūs plotai).' });
    else if (m.sharp < cfg.sharp.veryBlurry) reasons.push({ tone: 'bad', text: `Aštrumas: Prasta` + (dpiEff != null ? ` – efektyvi skiriamoji geba laikoma perpus mažesnė${eff}.` : '.') });
    else if (m.sharp < cfg.sharp.blurry) reasons.push({ tone: 'warn', text: `Aštrumas: Ribinė` + (dpiEff != null ? ` – efektyvi skiriamoji geba sumažinta${eff}.` : '.') });
    else reasons.push({ tone: 'ok', text: `Aštrumas ir detalumas: ${humanLevel(m.sharp, [cfg.sharp.sharp, cfg.sharp.blurry * 1.4, cfg.sharp.blurry, cfg.sharp.veryBlurry])}.` });

    if (m.noise != null) {
      if (m.noise >= cfg.noise.high) { pen += 1; reasons.push({ tone: 'warn', text: `Triukšmas: Prasta – ant spaudinio gali matytis grūdėtumas.` }); }
      else reasons.push({ tone: 'ok', text: `Triukšmo lygis: ${m.noise >= cfg.noise.moderate ? 'Tinka' : 'Gera'}.` });
    }
    const e = m.exposure;
    if (e) {
      const txt = [];
      if (e.bright >= cfg.exposure.brightClipBad) txt.push(`išdegę šviesūs plotai (${fmt1(e.bright)} %)`);
      if (e.mean <= cfg.exposure.darkMean) txt.push('labai tamsi');
      if (e.mean >= cfg.exposure.brightMean) txt.push('labai šviesi');
      if (txt.length) { pen += 1; reasons.push({ tone: 'warn', text: 'Ekspozicija: ' + (e.bright >= cfg.exposure.brightClipBad * 1.5 || e.mean <= cfg.exposure.darkMean * .8 || e.mean >= cfg.exposure.brightMean * 1.08 ? 'Prasta' : 'Ribinė') + ' (' + txt.join(', ') + ').' }); }
      else reasons.push({ tone: 'ok', text: `Ekspozicija: Gera.` });
    }
  }
  if (a) {
    const bad = cfg.aiBad;
    const sharpAlready = m && m.sharp != null && m.sharp < cfg.sharp.blurry;
    const noiseAlready = m && m.noise != null && m.noise >= cfg.noise.high;
    let aiPen = 0;
    if (a.sharp < bad && !sharpAlready) aiPen = 1;
    if (a.clean < bad && !noiseAlready) aiPen = 1;
    if (a.quality < bad) aiPen = 1;
    pen += aiPen;
  }
  return { reasons, pen };
}

// o: { dpi, cmW, cmH, metrics?, ai?, noMax? }
export function evaluate(o, cfg) {
  const f = cfg.fractions;
  const S = Math.min(o.cmW, o.cmH), L = Math.max(o.cmW, o.cmH);
  const sf = sharpFactorOf(o.metrics, cfg);
  const dpiEff = o.dpi * sf;
  const { printer, R, ratio, resLevel } = resolutionLevel(dpiEff, o.cmW, o.cmH, cfg);
  const pr = cfg.printers[printer], dCm = viewingCm(o.cmW, o.cmH, cfg);
  const reasons = [{
    tone: resLevel >= 4 ? 'ok' : resLevel === 3 ? 'warn' : 'bad',
    text: `Numatomas žiūrėjimo atstumas ${Math.round(dCm)} cm, gerai kokybei reikia bent ≥ ${Math.round(R * f.gera)} dpi.`,
  }];
  const found = imageFindings(o.metrics, o.ai, cfg, dpiEff);
  reasons.push(...found.reasons);
  const level = clamp(resLevel - Math.min(found.pen, 2), 1, 5);
  const out = {
    level, label: LEVELS[level].label, cls: LEVELS[level].cls, resLevel, printer, printerName: pr.name,
    req: R, reqGood: R * f.gera, reqBest: R * f.puiki, viewCm: dCm, dpi: o.dpi, dpiEff, sharpFactor: sf, ratio,
    reasons, analyzed: !!o.metrics, ai: !!o.ai, S, L,
  };
  if (!o.noMax) {
    out.max = resLevel <= 3 ? recommendMax(o, cfg) : null;
    out.advice = advice(level, resLevel, out.max);
  }
  return out;
}

// Laisvo kadro nuotraukai spaudos dydis nenustatytas – vertinama tik vaizdo kokybė
export function evaluateFree(metrics, ai, cfg) {
  const found = imageFindings(metrics, ai, cfg, null);
  const reasons = found.reasons.length ? found.reasons : [{ tone: 'warn', text: 'Ryškumas, triukšmas ir ekspozicija dar neįvertinti – spauskite „Analizuoti nuotraukas“.' }];
  return {
    level: null, label: 'Laisvas', cls: 'neutral', free: true, reasons, analyzed: !!metrics, ai: !!ai,
    advice: 'Laisvam kadrui spaudos formatas nenustatytas, todėl vertinama tik vaizdo kokybė. Pasirinkite formatą, kad būtų įvertintas ir dpi.',
  };
}

// Didžiausias dydis (ta pačia proporcija), kuriam skiriamoji geba dar bent „Gera“
export function recommendMax(o, cfg) {
  const sf = sharpFactorOf(o.metrics, cfg);
  let best = null, passed = false;
  for (let s = 0.2; s <= 3.001; s += 0.02) {
    const r = resolutionLevel(o.dpi * sf / s, o.cmW * s, o.cmH * s, cfg);
    if (r.resLevel >= 4) { best = s; passed = true; }
    else if (passed) break;
  }
  if (best == null) return null;
  const w = o.cmW * best, h = o.cmH * best;
  const S = Math.min(w, h), L = Math.max(w, h);
  let std = null;
  for (const [a, b] of STANDARD) {
    if (a <= S + 0.01 && b <= L + 0.01 && (!std || a * b > std[0] * std[1])) std = [a, b];
  }
  return { scale: best, cmW: w, cmH: h, S, L, std };
}

export function advice(level, resLevel, max) {
  const resLimited = resLevel <= 3;
  const tail = max
    ? ` Gerai kokybei tinka iki ~${fmt1(max.S)}×${fmt1(max.L)} cm${max.std ? ` (artimiausias standartinis: ${fmt1(max.std[0])}×${fmt1(max.std[1])} cm)` : ''}.`
    : ' Net mažame formate kokybė būtų menka.';
  if (level >= 4) return 'Galima gaminti šiuo formatu.';
  if (level === 3) return resLimited
    ? 'Galima gaminti, bet smulkių detalių bus mažiau – iš arti matysis minkštumas.' + tail
    : 'Skiriamoji geba pakanka, bet verta atkreipti dėmesį į pastabas aukščiau.';
  if (level === 2) return resLimited
    ? 'Ribinė kokybė – verta sumažinti formatą arba įspėti klientą.' + tail
    : 'Skiriamoji geba pakanka, bet vaizdo trūkumai (žr. aukščiau) gali būti matomi – verta įspėti klientą.';
  return resLimited
    ? 'Nerekomenduojama gaminti šiuo formatu.' + tail
    : 'Nerekomenduojama gaminti – vaizdo trūkumai per dideli.';
}
