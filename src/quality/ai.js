/* Neprivalomas vietinis AI vertinimas (CLIP-IQA metodas) per Transformers.js.
 * Biblioteka ir modelis atsisiunčiami į naršyklę tik paspaudus „Atsisiųsti ir įjungti AI“ (be raktų / paskyros),
 * vertinimas vyksta jūsų kompiuteryje; nuotraukos niekur nesiunčiamos.
 * CLIP-IQA: vaizdas lyginamas su antonimų poromis ("Sharp photo." / "Blurry photo." ir pan.), rezultatas – softmax tikimybė. */

const LIB_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
export const MODEL = 'Xenova/clip-vit-base-patch16';
const LOGIT_SCALE = 100; // CLIP logit_scale
const SIZE = 224;
const PAIRS = {
  quality: ['Good photo.', 'Bad photo.'],
  sharp: ['Sharp photo.', 'Blurry photo.'],
  clean: ['Clean photo.', 'Noisy photo.'],
  bright: ['Bright photo.', 'Dark photo.'],
  contrast: ['High contrast photo.', 'Low contrast photo.'],
};
const KEYS = Object.keys(PAIRS);

let ready = false, loading = false;
let lib, processor, visionModel, textEmb;

export const isReady = () => ready;
export const isLoading = () => loading;

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function loadAi(onStatus) {
  if (ready) return;
  if (loading) throw new Error('Modelis jau įkeliamas');
  loading = true;
  const say = (text, pct) => onStatus && onStatus({ text, pct });
  try {
    say('Įkeliama Transformers.js biblioteka…', 0);
    // @vite-ignore: biblioteka įkeliama paleidimo metu iš CDN, į programos paketą neįtraukiama
    lib = await import(/* @vite-ignore */ LIB_URL);
    const { AutoTokenizer, CLIPTextModelWithProjection, AutoProcessor, CLIPVisionModelWithProjection } = lib;

    const files = {};
    const progress = p => {
      if (!p) return;
      if (p.status === 'progress' && p.file) {
        files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
        let l = 0, t = 0;
        for (const k in files) { l += files[k].loaded; t += files[k].total; }
        const pct = t ? Math.min(99, Math.round(l / t * 100)) : 0;
        say(`Siunčiamas modelis: ${(l / 1048576).toFixed(0)} / ${(t / 1048576).toFixed(0)} MB`, pct);
      }
    };
    const opts = { dtype: 'q8', device: 'wasm', progress_callback: progress };

    say('Siunčiamas tekstų modelis…', 1);
    const tokenizer = await AutoTokenizer.from_pretrained(MODEL, { progress_callback: progress });
    const textModel = await CLIPTextModelWithProjection.from_pretrained(MODEL, opts);
    say('Siunčiamas vaizdo modelis…', 40);
    processor = await AutoProcessor.from_pretrained(MODEL, { progress_callback: progress });
    visionModel = await CLIPVisionModelWithProjection.from_pretrained(MODEL, opts);

    say('Ruošiami aprašymai…', 98);
    const labels = [];
    KEYS.forEach(k => labels.push(PAIRS[k][0], PAIRS[k][1]));
    const inputs = tokenizer(labels, { padding: true, truncation: true });
    const { text_embeds } = await textModel(inputs);
    const all = text_embeds.normalize().tolist();
    textEmb = {};
    KEYS.forEach((k, i) => (textEmb[k] = [all[i * 2], all[i * 2 + 1]]));
    ready = true;
    say('AI paruoštas', 100);
  } finally {
    loading = false;
  }
}

// rgba – Uint8ClampedArray (224×224×4)
async function embed(rgba) {
  const { RawImage } = lib;
  const image = new RawImage(rgba, SIZE, SIZE, 4);
  const inputs = await processor(image);
  const { image_embeds } = await visionModel(inputs);
  return image_embeds.normalize().tolist()[0];
}

// {quality, sharp, clean, bright, contrast} – tikimybės [0..1], kad vaizdas atitinka teigiamą aprašymą
function pairScores(emb) {
  const out = {};
  for (const k of KEYS) {
    const s1 = LOGIT_SCALE * dot(textEmb[k][0], emb), s2 = LOGIT_SCALE * dot(textEmb[k][1], emb);
    out[k] = 1 / (1 + Math.exp(s2 - s1));
  }
  return out;
}

function drawSquare(img, sx, sy, size, ctx) {
  ctx.drawImage(img, sx, sy, size, size, 0, 0, SIZE, SIZE);
  return ctx.getImageData(0, 0, SIZE, SIZE).data;
}

// metrics – iš analyzePhoto (naudojami tikri detaliausi fragmentai ryškumui ir triukšmui)
export async function scorePhoto(photo, metrics) {
  const img = photo.image, W = photo.width, H = photo.height, N = SIZE;
  const c = document.createElement('canvas'); c.width = N; c.height = N;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high';
  try {
    const views = [];
    // 1) bendras vaizdas (centrinis kvadratas, sumažintas)
    const side = Math.min(W, H);
    views.push({ kind: 'global', data: drawSquare(img, (W - side) / 2, (H - side) / 2, side, x) });
    // 2) tikri (nesumažinti) detaliausi fragmentai – ryškumui ir triukšmui
    const ps = ((metrics && metrics.patches) || []).slice(0, 4);
    for (const p of ps) {
      const size = Math.min(N, W, H);
      const sx = Math.max(0, Math.min(W - size, p.x + (p.size - size) / 2));
      const sy = Math.max(0, Math.min(H - size, p.y + (p.size - size) / 2));
      views.push({ kind: 'patch', data: drawSquare(img, sx, sy, size, x) });
    }
    const per = [];
    for (const v of views) {
      const emb = await embed(new Uint8ClampedArray(v.data));
      per.push({ kind: v.kind, s: pairScores(emb) });
      await sleep(0);
    }
    const avg = (arr, k) => arr.reduce((a, b) => a + b.s[k], 0) / arr.length;
    const glob = per.filter(p => p.kind === 'global'), patches = per.filter(p => p.kind === 'patch');
    const detail = patches.length ? patches : glob;
    return {
      quality: avg(per, 'quality'),
      sharp: avg(detail, 'sharp'),
      clean: avg(detail, 'clean'),
      bright: avg(glob, 'bright'),
      contrast: avg(glob, 'contrast'),
      n: per.length,
    };
  } finally {
    c.width = c.height = 0;
  }
}
