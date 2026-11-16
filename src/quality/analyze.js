import { computeTile } from './metrics.js';
import { parseJpegInfo } from './jpeg.js';

const TILE = 128;     // plytelės kraštinė originalo taškais (8 kartotinis – JPEG blokų fazei)
const MAX_GRID = 20;  // daugiausia 20×20 plytelių visoje nuotraukoje

/* Vaizdo analizė (matematika). Visos plytelės skaičiuojamos ties tikrais, nesumažintais taškais ir saugomos
 * nepriklausomai nuo kadravimo – kadro sričiai skirtingą suvestinę galima gauti iš karto (žr. engine.summarizeRegion).
 * photo.image – jau dekoduotas HTMLImageElement. */
export async function analyzePhoto(photo) {
  const img = photo.image, W = photo.width, H = photo.height;
  const T = Math.min(TILE, Math.floor(Math.min(W, H) / 8) * 8);
  const tiles = [];
  if (T >= 32) {
    const nx = Math.min(MAX_GRID, Math.max(1, Math.floor(W / T))), ny = Math.min(MAX_GRID, Math.max(1, Math.floor(H / T)));
    const tc = document.createElement('canvas'); tc.width = T; tc.height = T;
    const tx = tc.getContext('2d', { willReadFrequently: true });
    const snap = v => Math.max(0, Math.round(v / 8) * 8);
    let n = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const px = Math.min(snap((W - T) * (nx === 1 ? 0.5 : i / (nx - 1))), W - T);
        const py = Math.min(snap((H - T) * (ny === 1 ? 0.5 : j / (ny - 1))), H - T);
        tx.drawImage(img, px, py, T, T, 0, 0, T, T);
        tiles.push({ x: px, y: py, size: T, ...computeTile(tx.getImageData(0, 0, T, T).data, T, T) });
        if (++n % 40 === 0) await new Promise(r => setTimeout(r, 0)); // nesustabdome sąsajos
      }
    }
    tc.width = tc.height = 0;
  }
  return { W, H, tiles, file: await fileInfo(photo) };
}

// JPEG kokybė iš failo antraštės (tik jei originalas – JPEG) ir baitų kiekis vienam taškui
async function fileInfo(photo) {
  const f = photo.originalFile;
  if (!f || typeof f.slice !== 'function') return null;
  const info = { bytes: f.size, bpp: f.size / Math.max(1, photo.width * photo.height), jpeg: null };
  try {
    const head = new Uint8Array(await f.slice(0, 262144).arrayBuffer());
    info.jpeg = parseJpegInfo(head);
  } catch { /* ignoruojame */ }
  return info;
}

// Vaizdai dirbtinio intelekto vertinimui: bendras kadro vaizdas (sumažintas) + iki 4 tikrų, nesumažintų 224 px fragmentų.
export function buildViews(photo, summary, region, N = 224) {
  const img = photo.image, W = photo.width, H = photo.height;
  const c = document.createElement('canvas'); c.width = N; c.height = N;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high';
  const grab = (sx, sy, size) => { x.drawImage(img, sx, sy, size, size, 0, 0, N, N); return new Uint8ClampedArray(x.getImageData(0, 0, N, N).data); };
  const views = [];
  try {
    const r = region || { x: 0, y: 0, w: W, h: H };
    const side = Math.max(1, Math.min(r.w, r.h));
    views.push({ kind: 'global', data: grab(Math.max(0, Math.min(W - side, r.x + (r.w - side) / 2)), Math.max(0, Math.min(H - side, r.y + (r.h - side) / 2)), side) });
    for (const p of ((summary && summary.patches) || []).slice(0, 4)) {
      const size = Math.min(N, W, H);
      views.push({ kind: 'patch', data: grab(Math.max(0, Math.min(W - size, p.x + (p.size - size) / 2)), Math.max(0, Math.min(H - size, p.y + (p.size - size) / 2)), size) });
    }
  } finally { c.width = c.height = 0; }
  return views;
}

export const regionKey = r => (r ? [r.x, r.y, r.w, r.h].map(v => Math.round(v / 8)).join('_') : 'all');
