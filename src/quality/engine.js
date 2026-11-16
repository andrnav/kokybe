/* Foto inspektorius – spaudos kokybės vertinimas (be AI): efektyvus dpi pagal spausdintuvą ir žiūrėjimo atstumą,
 * ryškumas, triukšmas, ekspozicija. Visos funkcijos grynos: nustatymai (cfg) perduodami parametru.
 * Ribos yra pradinės vertės – jas galima keisti skirsnyje „Nuotraukos kokybė“. */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
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
  distance: 'normal',        // arti | normal | far – kaip žiūrima į atspaudą
  distMult: { near: 0.7, normal: 1, far: 1.6 },
  sharp: { veryBlurry: 25, blurry: 80, sharp: 200 }, // triukšmo pataisytas detalumas (Laplaso dispersija)
  motion: { anisotropy: 2.5 },                       // krypčių gradientų santykis, nuo kurio neryškumas laikomas judesio
  upscale: { warn: 1.5 },                            // apskaičiuotas „padidinimo“ koeficientas, nuo kurio įspėjama
  noise: { moderate: 2.5, high: 4.5, chromaHigh: 4, dark: 5 }, // σ pilkumo lygiais (0–255)
  jpeg: { warn: 70, bad: 50, blockWarn: 1.15, blockBad: 1.3 },  // JPEG kokybė (0–100) ir blokelių rodiklis
  exposure: { brightClipBad: 8, darkMean: 35, brightMean: 220, channelClip: 3, shadowClip: 15, lowContrast: 90 }, // % ir lygiai
  aiBad: 0.30,               // CLIP AI tikimybė, žemiau kurios laikoma problema
  model: { bad: 0.40, veryBad: 0.25, affects: true }, // įkelto ONNX modelio įvertis (0–1) ir ar jis keičia įvertinimą
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
  const mult = (cfg.distMult && cfg.distMult[cfg.distance]) || 1;
  return clamp(cfg.k * Math.hypot(cmW, cmH), cfg.minCm, cfg.maxCm) * mult;
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

/* ---------- Vaizdo metrikos: suvestinė pagal kadro sritį ---------- */

const quantile = (arr, q) => {
  if (!arr.length) return null;
  const s = arr.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * q)))];
};
const median = arr => quantile(arr, 0.5);

// Santykio rho = (1 px žingsnio gradientas) / (2 px žingsnio) -> apytikslis padidinimo koeficientas.
// Lentelė gauta iš sintetinių bandymų (ryški tekstūra, sumažinta ir bikubiškai padidinta k kartų).
const RHO_TABLE = [[0.51, 4], [0.525, 3], [0.545, 2], [0.58, 1.5], [0.68, 1]];
export function scaleFromRho(rho) {
  if (rho == null || !Number.isFinite(rho)) return 1;
  if (rho <= RHO_TABLE[0][0]) return RHO_TABLE[0][1];
  for (let i = 1; i < RHO_TABLE.length; i++) {
    if (rho <= RHO_TABLE[i][0]) {
      const [r0, s0] = RHO_TABLE[i - 1], [r1, s1] = RHO_TABLE[i];
      return s0 + (s1 - s0) * (rho - r0) / (r1 - r0);
    }
  }
  return 1;
}

// Plytelės, kurių centras patenka į kadro sritį (region: {x,y,w,h} originalo taškais). Jei sritis maža – artimiausios.
export function tilesInRegion(grid, region) {
  const all = grid.tiles;
  if (!region) return all;
  const inside = all.filter(t => {
    const cx = t.x + t.size / 2, cy = t.y + t.size / 2;
    return cx >= region.x && cx <= region.x + region.w && cy >= region.y && cy <= region.y + region.h;
  });
  if (inside.length >= 3) return inside;
  const rcx = region.x + region.w / 2, rcy = region.y + region.h / 2;
  return all.slice().sort((p, q) =>
    Math.hypot(p.x + p.size / 2 - rcx, p.y + p.size / 2 - rcy) - Math.hypot(q.x + q.size / 2 - rcx, q.y + q.size / 2 - rcy)).slice(0, Math.max(3, inside.length));
}

function globalNoiseVar(tiles) {
  const n = quantile(tiles.map(t => t.sigma), 0.25) || 0;
  return n * n;
}

// grid: {W,H,tiles,file}; region – kadro sritis arba null (visa nuotrauka)
export function summarizeRegion(grid, region, cfg) {
  const tiles = tilesInRegion(grid, region);
  if (!tiles.length) return null;
  const noise = quantile(tiles.map(t => t.sigma), 0.25);
  const nv = (noise || 0) * (noise || 0);
  const corr = t => Math.max(0, t.lapVar - 20 * nv);
  const textured = tiles.filter(t => t.std >= 8).map(t => ({ t, c: corr(t) })).sort((a, b) => b.c - a.c);
  const sharp = textured.length >= 2 ? quantile(textured.map(x => x.c), 0.9) : null;
  const patches = textured.slice(0, 4).map(x => ({ x: x.t.x, y: x.t.y, size: x.t.size }));
  const sharpFrac = textured.length ? textured.filter(x => x.c >= cfg.sharp.blurry).length / textured.length : null;

  // visa nuotrauka (palyginimui: ar ryški dalis liko už kadro ribų)
  const gv = globalNoiseVar(grid.tiles);
  const gt = grid.tiles.filter(t => t.std >= 8).map(t => Math.max(0, t.lapVar - 20 * gv));
  const sharpAll = gt.length >= 2 ? quantile(gt, 0.9) : null;

  // padidinimas ir judesio suliejimas – iš ryškiausios pusės teksturuotų plytelių
  const top = textured.slice(0, Math.max(2, Math.ceil(textured.length / 2))).map(x => x.t);
  let rho = null, aniso = null, dir = null;
  if (textured.length >= 2) {
    const S = k => top.reduce((a, t) => a + t[k], 0);
    rho = S('s1') / Math.max(1e-9, S('s2'));
    const E = { h: S('ex'), v: S('ey'), d1: S('ed1'), d2: S('ed2') };
    const vals = Object.values(E);
    aniso = Math.max(...vals) / Math.max(1e-9, Math.min(...vals));
    const lo = Object.keys(E).reduce((a, k) => (E[k] < E[a] ? k : a), 'h');
    dir = { h: 'horizontali', v: 'vertikali', d1: 'įstriža (\\)', d2: 'įstriža (/)' }[lo];
  }
  const trueScale = rho == null ? 1 : scaleFromRho(rho);

  // ekspozicija ir šešėliai / šviesūs plotai
  const hist = new Array(64).fill(0);
  let total = 0, meanSum = 0, lo = 0, cR = 0, cG = 0, cB = 0;
  for (const t of tiles) {
    for (let i = 0; i < 64; i++) { hist[i] += t.hist[i]; total += t.hist[i]; }
    meanSum += t.mean; lo += t.lo; cR += t.clipR; cG += t.clipG; cB += t.clipB;
  }
  const nT = tiles.length;
  const pct = q => { let c = 0; for (let i = 0; i < 64; i++) { c += hist[i]; if (c >= q * total) return i * 4 + 2; } return 255; };
  const p2 = pct(0.02), p98 = pct(0.98);
  const exposure = {
    mean: meanSum / nT, dark: lo / nT * 100, bright: (hist[62] + hist[63]) / Math.max(1, total) * 100,
    hiR: cR / nT * 100, hiG: cG / nT * 100, hiB: cB / nT * 100, p2, p98, contrast: p98 - p2,
  };
  const darkTiles = tiles.filter(t => t.mean < 60);
  const darkNoise = darkTiles.length >= 2 ? median(darkTiles.map(t => t.sigma)) : null;
  const darkShare = darkTiles.length / nT, brightShare = tiles.filter(t => t.mean > 200).length / nT;
  const backlit = darkShare >= 0.25 && brightShare >= 0.2 && exposure.bright >= 3;

  const chroma = quantile(tiles.map(t => (t.sigU + t.sigV) / 2), 0.25);

  // JPEG blokeliai: didžiausias fazės (x%8, y%8) kintamumas / kitų fazių vidurkis
  const b = new Array(8).fill(0);
  for (const t of tiles) for (let i = 0; i < 8; i++) b[i] += t.blk[i];
  const mx = Math.max(...b);
  const rest = (b.reduce((a, v) => a + v, 0) - mx) / 7;
  const blk = rest > 0 ? mx / rest : 1;

  return {
    sharp, noise, chroma, darkNoise, exposure, backlit, rho, trueScale, aniso, motionDir: dir,
    sharpFrac, sharpAll, blk, file: grid.file || null, tiles: nT, patches,
  };
}

// Ryškumo žemėlapis: kiekvienai plytelei – triukšmo pataisytas detalumas ir klasė (0 – lygus plotas, 1 – labai neryšku … 3 – ryšku)
export function sharpnessCells(grid, cfg) {
  const gv = globalNoiseVar(grid.tiles);
  return grid.tiles.map(t => {
    const c = Math.max(0, t.lapVar - 20 * gv);
    const cls = t.std < 8 ? 0 : c < cfg.sharp.veryBlurry ? 1 : c < cfg.sharp.blurry ? 2 : 3;
    return { x: t.x, y: t.y, size: t.size, c, cls };
  });
}

/* ---------- Vertinimas ---------- */

// Nominalūs dydžiai, iš kurių siūlomas „artimiausias standartinis“ formatas (cm)
export const STANDARD = [[9, 13], [10, 15], [13, 18], [13, 19], [15, 15], [15, 21], [15, 23], [20, 30], [21, 29.7], [30, 30],
  [30, 40], [29.7, 42], [30, 45], [40, 60], [50, 70], [60, 90], [100, 150]];

// Neryški arba padidinta nuotrauka elgiasi kaip mažesnės skiriamosios gebos: didinant formatą suliejimas didėja.
// Imamas griežtesnis iš dviejų koeficientų (kad to paties trūkumo neskaičiuotume dukart).
function upscaleActive(m, cfg) {
  return !!m && m.trueScale >= cfg.upscale.warn && m.sharp != null && m.sharp < cfg.sharp.sharp;
}
function sharpFactorOf(m, cfg) {
  if (!m) return 1;
  const blur = m.sharp == null ? 1 : m.sharp < cfg.sharp.veryBlurry ? 0.5 : m.sharp < cfg.sharp.blurry ? 0.75 : 1;
  const up = upscaleActive(m, cfg) ? 1 / Math.min(4, m.trueScale) : 1;
  return Math.min(blur, up);
}

const pc = v => `${fmt1(v)} %`;

// Vaizdo pastabos. pen – įvertinimo sumažinimas, kurio formato mažinimas nepašalina. Kiekviena trūkumų grupė mažina ne daugiau kaip vienu laipsniu.
function imageFindings(m, a, md, cfg, dpiEff) {
  const reasons = [];
  let pen = 0;
  const eff = dpiEff != null ? ` (~${Math.round(dpiEff)} dpi)` : '';
  if (m) {
    // --- Ryškumas, neryškumo tipas, padidinimas
    const blurry = m.sharp != null && m.sharp < cfg.sharp.blurry;
    if (m.sharp == null) reasons.push({ tone: 'warn', text: 'Ryškumo įvertinti nepavyko – kadre per mažai detalių (lygūs plotai).' });
    else if (m.sharp < cfg.sharp.veryBlurry) reasons.push({ tone: 'bad', text: `Labai neryški (detalumas ${Math.round(m.sharp)})` + (dpiEff != null ? ` – efektyvi skiriamoji geba laikoma perpus mažesnė${eff}.` : '.') });
    else if (m.sharp < cfg.sharp.blurry) reasons.push({ tone: 'warn', text: `Neryški (detalumas ${Math.round(m.sharp)})` + (dpiEff != null ? ` – efektyvi skiriamoji geba sumažinta${eff}.` : '.') });
    else reasons.push({ tone: 'ok', text: `Ryškumas ${m.sharp >= cfg.sharp.sharp ? 'geras' : 'vidutinis'} (detalumas ${Math.round(m.sharp)}).` });
    if (blurry && m.aniso != null) {
      if (m.aniso >= cfg.motion.anisotropy) reasons.push({ tone: 'warn', text: `Panašu į judesio suliejimą (kryptis ${m.motionDir}, kryptingumas ${fmt1(m.aniso)}×) – tai fokusavimu nepataisoma.` });
      else reasons.push({ tone: 'warn', text: 'Neryškumas vienodas visomis kryptimis – panašu į nefokusavimą arba per mažą skiriamąją gebą.' });
    }
    if (blurry && m.sharpAll != null && m.sharpAll >= cfg.sharp.sharp && m.sharpFrac != null && m.sharpFrac < 0.3) {
      reasons.push({ tone: 'warn', text: 'Kitose nuotraukos vietose ryškumas geras, bet pasirinktame kadre ryškių vietų beveik nėra – patikrinkite kadravimą.' });
    }
    if (!blurry && m.sharp != null && m.sharpFrac != null && m.sharpFrac < 0.6) {
      reasons.push({ tone: 'ok', text: `Ryški tik ~${Math.round(m.sharpFrac * 100)} % kadro detalių vietų (likusi dalis neryški – gali būti sąmoninga fono neryškumas).` });
    }
    if (upscaleActive(m, cfg)) {
      reasons.push({ tone: 'warn', text: `Tikroji detalių skiriamoji geba atrodo ~${fmt1(Math.min(4, m.trueScale))}× mažesnė nei taškų skaičius – nuotrauka greičiausiai padidinta, suliesinta arba stipriai suglaudinta.` });
    }

    // --- JPEG glaudinimas
    const j = m.file && m.file.jpeg, jp = cfg.jpeg;
    let jpegPen = 0;
    if (j && j.q != null) {
      const sub = j.subsampling ? `, ${j.subsampling}` : '';
      if (j.q < jp.bad) { jpegPen = 1; reasons.push({ tone: 'bad', text: `Stipriai suglaudinta JPEG (kokybė ~${j.q}${sub}) – matysis blokeliai ir apnašos.` }); }
      else if (j.q < jp.warn) reasons.push({ tone: 'warn', text: `JPEG glaudinimas vidutinis (kokybė ~${j.q}${sub}).` });
      else reasons.push({ tone: 'ok', text: `JPEG glaudinimas silpnas (kokybė ~${j.q}${sub}).` });
    }
    if (m.blk >= jp.blockBad) { jpegPen = 1; reasons.push({ tone: 'warn', text: `Matomi JPEG blokeliai (rodiklis ${fmt1(m.blk)}) – vaizdas buvo stipriai suglaudintas.` }); }
    else if (m.blk >= jp.blockWarn && !(j && j.q != null && j.q < jp.bad)) reasons.push({ tone: 'warn', text: `Silpni JPEG blokeliai (rodiklis ${fmt1(m.blk)}).` });
    pen += jpegPen;

    // --- Triukšmas: šviesos, spalvų, šešėlių
    let noisePen = 0;
    if (m.noise != null) {
      if (m.noise >= cfg.noise.high) { noisePen = 1; reasons.push({ tone: 'warn', text: `Didelis šviesos triukšmas (σ ${fmt1(m.noise)}) – ant popieriaus matysis grūdėtumas.` }); }
      else reasons.push({ tone: 'ok', text: `Šviesos triukšmas ${m.noise >= cfg.noise.moderate ? 'vidutinis' : 'mažas'} (σ ${fmt1(m.noise)}).` });
    }
    if (m.chroma != null && m.chroma >= cfg.noise.chromaHigh) { noisePen = 1; reasons.push({ tone: 'warn', text: `Spalvų triukšmas (σ ${fmt1(m.chroma)}) – matysis spalvotos dėmelės, ypač tamsiuose plotuose.` }); }
    if (m.darkNoise != null && m.darkNoise >= cfg.noise.dark) { noisePen = 1; reasons.push({ tone: 'warn', text: `Šešėliuose triukšmas didelis (σ ${fmt1(m.darkNoise)}) – tamsios vietos atrodys grūdėtos.` }); }
    pen += noisePen;

    // --- Ekspozicija: šviesūs plotai, šešėliai, kontrastas
    const e = m.exposure, ex = cfg.exposure;
    let expPen = 0;
    if (e) {
      const txt = [];
      if (e.bright >= ex.brightClipBad) txt.push(`išdegę šviesūs plotai (${pc(e.bright)})`);
      if (e.mean <= ex.darkMean) txt.push('labai tamsi');
      if (e.mean >= ex.brightMean) txt.push('labai šviesi');
      if (txt.length) { expPen = 1; reasons.push({ tone: 'warn', text: 'Ekspozicija: ' + txt.join(', ') + '.' }); }
      else reasons.push({ tone: 'ok', text: `Ekspozicija normali (vidurkis ${Math.round(e.mean)}, tonų ribos ${e.p2}–${e.p98}).` });
      const ch = [['raudonas', e.hiR], ['žalias', e.hiG], ['mėlynas', e.hiB]].filter(x => x[1] >= ex.channelClip);
      if (ch.length && e.bright < ex.brightClipBad) reasons.push({ tone: 'warn', text: 'Išdegę kanalai: ' + ch.map(x => `${x[0]} (${pc(x[1])})`).join(', ') + ' – šiose vietose detalių nebelieka.' });
      if (e.dark >= ex.shadowClip) reasons.push({ tone: 'warn', text: `Šešėliai „užstrigę“ (${pc(e.dark)} kadro visiškai juoda) – tamsiose vietose detalių nebelieka.` });
      if (e.contrast < ex.lowContrast) reasons.push({ tone: 'warn', text: `Žemas kontrastas (tonų ribos ${e.p2}–${e.p98}) – vaizdas gali atrodyti plokščias.` });
      if (m.backlit) reasons.push({ tone: 'warn', text: 'Panašu į kontrajutę: kadre yra didelių tamsių ir išdegusių plotų vienu metu.' });
    }
    pen += expPen;
  }
  if (a) {
    const bad = cfg.aiBad;
    const sharpAlready = m && m.sharp != null && m.sharp < cfg.sharp.blurry;
    const noiseAlready = m && m.noise != null && m.noise >= cfg.noise.high;
    let aiPen = 0;
    if (a.sharp < bad && !sharpAlready) { aiPen = 1; reasons.push({ tone: 'warn', text: `CLIP AI mato neryškų vaizdą (ryškumas ${Math.round(a.sharp * 100)} %).` }); }
    if (a.clean < bad && !noiseAlready) { aiPen = 1; reasons.push({ tone: 'warn', text: `CLIP AI mato triukšmą (švara ${Math.round(a.clean * 100)} %).` }); }
    if (a.quality < bad) { aiPen = 1; reasons.push({ tone: 'warn', text: `CLIP AI bendrą kokybę vertina žemai (${Math.round(a.quality * 100)} %).` }); }
    if (!aiPen) reasons.push({ tone: 'ok', text: `CLIP AI antra nuomonė nepriekaištų nerado (kokybė ${Math.round(a.quality * 100)} %, ryškumas ${Math.round(a.sharp * 100)} %).` });
    pen += aiPen;
  }
  if (md) {
    const sc = md.score, mc = cfg.model;
    const txt = `${md.name || 'Modelis'}: ${Math.round(sc * 100)} / 100 (blogiausias fragmentas ${Math.round(md.min * 100)})`;
    if (sc < mc.veryBad) { if (mc.affects) pen += 2; reasons.push({ tone: 'bad', text: `Įkeltas modelis vertina labai žemai – ${txt}.` }); }
    else if (sc < mc.bad) { if (mc.affects) pen += 1; reasons.push({ tone: 'warn', text: `Įkeltas modelis vertina žemai – ${txt}.` }); }
    else reasons.push({ tone: 'ok', text: `Įkeltas modelis nepriekaištų nerado – ${txt}.` });
  }
  return { reasons, pen };
}

// o: { dpi, cmW, cmH, metrics?, ai?, model?, noMax? }
export function evaluate(o, cfg) {
  const f = cfg.fractions;
  const S = Math.min(o.cmW, o.cmH), L = Math.max(o.cmW, o.cmH);
  const sf = sharpFactorOf(o.metrics, cfg);
  const dpiEff = o.dpi * sf;
  const { printer, R, ratio, resLevel } = resolutionLevel(dpiEff, o.cmW, o.cmH, cfg);
  const pr = cfg.printers[printer], dCm = viewingCm(o.cmW, o.cmH, cfg);
  const reasons = [{
    tone: resLevel >= 4 ? 'ok' : resLevel === 3 ? 'warn' : 'bad',
    text: `Efektyvus ${Math.round(o.dpi)} dpi. ${pr.name}, žiūrima ~${Math.round(dCm)} cm atstumu: gerai kokybei reikia ≥ ${Math.round(R * f.gera)} dpi, puikiai ≥ ${Math.round(R * f.puiki)} dpi.`,
  }];
  const found = imageFindings(o.metrics, o.ai, o.model, cfg, dpiEff);
  reasons.push(...found.reasons);
  const level = clamp(resLevel - Math.min(found.pen, 2), 1, 5);
  const out = {
    level, label: LEVELS[level].label, cls: LEVELS[level].cls, resLevel, printer, printerName: pr.name,
    req: R, reqGood: R * f.gera, reqBest: R * f.puiki, viewCm: dCm, dpi: o.dpi, dpiEff, sharpFactor: sf, ratio,
    reasons, analyzed: !!o.metrics, ai: !!o.ai, model: !!o.model, S, L,
  };
  if (!o.noMax) {
    out.max = resLevel <= 3 ? recommendMax(o, cfg) : null;
    out.advice = advice(level, resLevel, out.max);
  }
  return out;
}

// Laisvo kadro nuotraukai spaudos dydis nenustatytas – vertinama tik vaizdo kokybė
export function evaluateFree(metrics, ai, model, cfg) {
  const found = imageFindings(metrics, ai, model, cfg, null);
  const reasons = found.reasons.length ? found.reasons : [{ tone: 'warn', text: 'Ryškumas, triukšmas ir ekspozicija dar neįvertinti – spauskite „Analizuoti nuotraukas“.' }];
  return {
    level: null, label: 'Laisvas', cls: 'neutral', free: true, reasons, analyzed: !!metrics, ai: !!ai, model: !!model,
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
