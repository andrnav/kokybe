/* Kadruoklis – neprivalomas vietinis AI vertinimas (CLIP-IQA metodas) per Transformers.js.
 * Modelis atsisiunčiamas į naršyklę (be raktų / paskyros) ir veikia jūsų kompiuteryje; nuotraukos niekur nesiunčiamos.
 * CLIP-IQA: vaizdas lyginamas su antonimų poromis ("Sharp photo." / "Blurry photo." ir pan.), rezultatas – softmax tikimybė. */
(function (root) {
  'use strict';

  const LIB_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
  const MODEL = 'Xenova/clip-vit-base-patch16';
  const LOGIT_SCALE = 100; // CLIP logit_scale
  const PAIRS = {
    quality: ['Good photo.', 'Bad photo.'],
    sharp: ['Sharp photo.', 'Blurry photo.'],
    clean: ['Clean photo.', 'Noisy photo.'],
    bright: ['Bright photo.', 'Dark photo.'],
    contrast: ['High contrast photo.', 'Low contrast photo.']
  };
  const KEYS = Object.keys(PAIRS);

  const AI = { ready: false, loading: false, size: 224, model: MODEL };
  let lib, processor, visionModel, textEmb;

  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

  AI.load = async function (onStatus) {
    if (AI.ready) return;
    if (AI.loading) throw new Error('Modelis jau įkeliamas');
    AI.loading = true;
    const say = (text, pct) => onStatus && onStatus({ text, pct });
    try {
      say('Įkeliama Transformers.js biblioteka…', 0);
      lib = await import(LIB_URL);
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
      AI.ready = true;
      say('AI paruoštas', 100);
    } finally {
      AI.loading = false;
    }
  };

  // rgba – Uint8ClampedArray (224×224×4)
  AI.embed = async function (rgba) {
    const { RawImage } = lib;
    const image = new RawImage(rgba, AI.size, AI.size, 4);
    const inputs = await processor(image);
    const { image_embeds } = await visionModel(inputs);
    return image_embeds.normalize().tolist()[0];
  };

  // Grąžina {quality, sharp, clean, bright, contrast} – tikimybės [0..1], kad vaizdas atitinka teigiamą aprašymą
  AI.pairScores = function (emb) {
    const out = {};
    for (const k of KEYS) {
      const s1 = LOGIT_SCALE * dot(textEmb[k][0], emb), s2 = LOGIT_SCALE * dot(textEmb[k][1], emb);
      out[k] = 1 / (1 + Math.exp(s2 - s1));
    }
    return out;
  };

  root.PFAI = AI;
})(typeof window !== 'undefined' ? window : globalThis);
