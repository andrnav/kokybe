/* Savo ONNX kokybės modelio įkėlimas iš failo (pvz. DBCNN, HyperIQA, MUSIQ, MANIQA, TReS, CLIP-IQA).
 * Modelio failą vartotojas pasirenka pats (parsisiųstą iš Hugging Face ar kitur); jis išsaugomas šios naršyklės
 * IndexedDB saugykloje ir vėliau kraunamas automatiškai. Nuotraukos niekur nesiunčiamos – vertinama kompiuteryje.
 * Vykdymui naudojama onnxruntime-web (WASM), įkeliama iš CDN tik prireikus.
 * Išvestis normalizuojama į 0–1 (didesnis = geresnė kokybė). */

const ORT_VERSION = '1.22.0';
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const SIZE = 224;

const NORMS = {
  imagenet: { mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225], label: 'ImageNet' },
  half: { mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5], label: '(x − 0,5) / 0,5' },
  clip: { mean: [0.48145466, 0.4578275, 0.40821073], std: [0.26862954, 0.26130258, 0.27577711], label: 'CLIP' },
  none: { mean: [0, 0, 0], std: [1, 1, 1], label: 'tik x / 255' },
};
export const NORM_OPTIONS = Object.entries(NORMS).map(([id, v]) => [id, v.label]);

// Pradinės nuostatos pagal žinomus IQA modelius (KonIQ-10k mokyti). range – kokias išvesties reikšmes laikyti 0 ir 100 %.
export const PRESETS = {
  hyperiqa: { label: 'HyperIQA (0–1, ImageNet)', norm: 'imagenet', lo: 0, hi: 1 },
  dbcnn: { label: 'DBCNN (0–100, ImageNet)', norm: 'imagenet', lo: 0, hi: 100 },
  musiq: { label: 'MUSIQ (0–100, ±0,5)', norm: 'half', lo: 0, hi: 100 },
  maniqa: { label: 'MANIQA (0–1, ±0,5)', norm: 'half', lo: 0, hi: 1 },
  tres: { label: 'TReS (0–100, ImageNet)', norm: 'imagenet', lo: 0, hi: 100 },
  clipiqa: { label: 'CLIP-IQA (0–1, CLIP)', norm: 'clip', lo: 0, hi: 1 },
  custom: { label: 'Kitas (nustatyti rankiniu būdu)', norm: 'imagenet', lo: 0, hi: 1 },
};
export function guessPreset(fileName) {
  const n = String(fileName || '').toLowerCase();
  for (const k of ['hyperiqa', 'dbcnn', 'musiq', 'maniqa', 'tres', 'clipiqa']) if (n.includes(k)) return k;
  if (n.includes('clip')) return 'clipiqa';
  return 'custom';
}

/* ---------- IndexedDB ---------- */

const DB = 'foto-inspektorius-models', STORE = 'files', KEY = 'model';
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode), s = t.objectStore(STORE);
    const req = fn(s);
    t.oncomplete = () => { d.close(); res(req && req.result); };
    t.onerror = t.onabort = () => { d.close(); rej(t.error); };
  });
}

// Saugoma: { name, size, blob, dataName?, dataBlob?, preset, norm, lo, hi, savedAt }
export async function storedModel() {
  try { return (await tx('readonly', s => s.get(KEY))) || null; } catch { return null; }
}
export async function saveModel(file, dataFile, settings) {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch { /* ignoruojame */ }
  const rec = {
    name: file.name, size: file.size, blob: file,
    dataName: dataFile ? dataFile.name : null, dataBlob: dataFile || null,
    ...settings, savedAt: Date.now(),
  };
  await tx('readwrite', s => s.put(rec, KEY));
  return rec;
}
export async function updateSettings(settings) {
  const rec = await storedModel();
  if (!rec) return null;
  Object.assign(rec, settings);
  await tx('readwrite', s => s.put(rec, KEY));
  if (current) Object.assign(current, settings);
  return rec;
}
export async function clearModel() {
  session = null; ort = null; current = null;
  await tx('readwrite', s => s.delete(KEY));
}

/* ---------- Vykdymas ---------- */

let ort = null, session = null, current = null, layout = null;
export const isLoaded = () => !!session;
export const currentModel = () => current;

async function getOrt() {
  if (ort) return ort;
  // @vite-ignore: biblioteka įkeliama paleidimo metu iš CDN, į programos paketą neįtraukiama
  ort = await import(/* @vite-ignore */ ORT_BASE + 'ort.min.mjs');
  ort.env.wasm.wasmPaths = ORT_BASE;
  ort.env.wasm.numThreads = (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated) ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
  return ort;
}

// rec – storedModel() įrašas
export async function loadModel(rec, onStatus) {
  const say = t => onStatus && onStatus(t);
  if (!rec) throw new Error('Modelio failas dar nepasirinktas');
  say('Įkeliama onnxruntime-web biblioteka…');
  const o = await getOrt();
  say(`Skaitomas modelis (${(rec.size / 1048576).toFixed(0)} MB)…`);
  const bytes = new Uint8Array(await rec.blob.arrayBuffer());
  const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
  if (rec.dataBlob) opts.externalData = [{ path: rec.dataName, data: new Uint8Array(await rec.dataBlob.arrayBuffer()) }];
  say('Paruošiamas modelis (tai gali užtrukti iki minutės)…');
  session = await o.InferenceSession.create(bytes, opts);
  current = rec;
  layout = null;
  // Įvesties išdėstymą bandome nustatyti iš metaduomenų: [1,3,H,W] (NCHW) arba [1,H,W,3] (NHWC)
  try {
    const md = session.inputMetadata;
    const m = Array.isArray(md) ? md[0] : md && md[session.inputNames[0]];
    const sh = m && m.shape;
    if (sh && sh.length === 4) layout = sh[3] === 3 && sh[1] !== 3 ? 'nhwc' : 'nchw';
  } catch { /* nustatysime bandymu */ }
  say('Modelis paruoštas.');
  return { inputs: session.inputNames, outputs: session.outputNames, layout };
}

function toTensor(o, rgba, norm, lay) {
  const n = SIZE * SIZE, nm = NORMS[norm] || NORMS.imagenet;
  const f = new Float32Array(3 * n);
  if (lay === 'nhwc') {
    for (let i = 0, j = 0; i < n; i++, j += 4) for (let c = 0; c < 3; c++) f[i * 3 + c] = (rgba[j + c] / 255 - nm.mean[c]) / nm.std[c];
    return new o.Tensor('float32', f, [1, SIZE, SIZE, 3]);
  }
  for (let i = 0, j = 0; i < n; i++, j += 4) for (let c = 0; c < 3; c++) f[c * n + i] = (rgba[j + c] / 255 - nm.mean[c]) / nm.std[c];
  return new o.Tensor('float32', f, [1, 3, SIZE, SIZE]);
}

// Vieno 224×224 vaizdo įvertis, normalizuotas į 0–1
async function runOne(rgba) {
  const o = await getOrt(), rec = current;
  const feeds = lay => ({ [session.inputNames[0]]: toTensor(o, rgba, rec.norm, lay) });
  let out;
  try {
    out = await session.run(feeds(layout || 'nchw'));
    layout = layout || 'nchw';
  } catch (e) {
    if (layout) throw e;
    out = await session.run(feeds('nhwc')); // jei NCHW netiko, bandome NHWC
    layout = 'nhwc';
  }
  const t = out[session.outputNames[0]];
  const v = Number(t.data[0]);
  if (!Number.isFinite(v)) throw new Error('Modelis grąžino neskaitinę reikšmę');
  return { raw: v, score: Math.min(1, Math.max(0, (v - rec.lo) / ((rec.hi - rec.lo) || 1))) };
}

// views – [{data: Uint8ClampedArray(224*224*4)}]. Grąžina vidurkį ir blogiausią fragmentą.
export async function scoreViews(views) {
  if (!session) throw new Error('Modelis neįkeltas');
  const res = [];
  for (const v of views) { res.push(await runOne(v.data)); await new Promise(r => setTimeout(r, 0)); }
  const sc = res.map(r => r.score);
  return {
    name: current.name.replace(/\.onnx$/i, ''),
    score: sc.reduce((a, b) => a + b, 0) / sc.length,
    min: Math.min(...sc), max: Math.max(...sc),
    raw: res.reduce((a, b) => a + b.raw, 0) / res.length, n: res.length,
  };
}
export const MODEL_SIZE = SIZE;
