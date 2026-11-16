import { tileStats, exposureStats, summarize } from './engine.js';

/* Vaizdo analizė (matematika) – ryškumas ir triukšmas matuojami ties tikrais, nesumažintais taškais iš iki 49 fragmentų,
 * ekspozicija – iš sumažinto vaizdo. photo.image – jau dekoduotas HTMLImageElement. */
export async function analyzePhoto(photo) {
  const img = photo.image, W = photo.width, H = photo.height;

  // Ekspozicija
  const s = Math.min(1, 512 / Math.max(W, H));
  const sw = Math.max(1, Math.round(W * s)), sh = Math.max(1, Math.round(H * s));
  const sc = document.createElement('canvas'); sc.width = sw; sc.height = sh;
  const sx = sc.getContext('2d', { willReadFrequently: true });
  sx.imageSmoothingQuality = 'high'; sx.drawImage(img, 0, 0, sw, sh);
  const exposure = exposureStats(sx.getImageData(0, 0, sw, sh).data);
  sc.width = sc.height = 0;

  // Ryškumas ir triukšmas
  const T = Math.min(256, W, H);
  const tiles = [];
  if (T >= 24) {
    const nx = Math.min(7, Math.max(1, Math.floor(W / T))), ny = Math.min(7, Math.max(1, Math.floor(H / T)));
    const tc = document.createElement('canvas'); tc.width = T; tc.height = T;
    const tx = tc.getContext('2d', { willReadFrequently: true });
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const px = Math.round((W - T) * (nx === 1 ? 0.5 : i / (nx - 1)));
        const py = Math.round((H - T) * (ny === 1 ? 0.5 : j / (ny - 1)));
        tx.drawImage(img, px, py, T, T, 0, 0, T, T);
        tiles.push({ x: px, y: py, size: T, ...tileStats(tx.getImageData(0, 0, T, T).data, T, T) });
      }
    }
    tc.width = tc.height = 0;
  }
  const m = summarize(tiles, exposure);
  m.w = W; m.h = H;
  return m;
}
