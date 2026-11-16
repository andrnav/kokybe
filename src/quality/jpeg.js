/* JPEG failo antraštės analizė: kvantavimo lentelės -> apytikslė JPEG kokybė (IJG skalė) ir spalvų pavyzdžiavimas.
 * Skaitomi tik pirmieji failo baitai, vaizdas nedekoduojamas. */

// Standartinė IJG šviesumo kvantavimo lentelė (kokybė 50), natūralia tvarka
const STD_LUMA = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const STD_SUM = STD_LUMA.reduce((a, b) => a + b, 0);

export function qualityFromLumaTable(t) {
  const sum = t.reduce((a, b) => a + b, 0);
  // IJG: lentelė = (std × scale + 50) / 100, scale = 5000/q (q<50) arba 200 − 2q (q≥50)
  const scale = (sum / STD_SUM) * 100;
  const q = scale > 100 ? 5000 / scale : (200 - scale) / 2;
  return Math.max(1, Math.min(100, Math.round(q)));
}

// bytes – Uint8Array (pradžia pakanka). Grąžina null, jei tai ne JPEG.
export function parseJpegInfo(bytes) {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let p = 2, luma = null, subsampling = null, progressive = false;
  while (p + 4 <= bytes.length) {
    if (bytes[p] !== 0xff) { p++; continue; }
    const m = bytes[p + 1];
    if (m === 0xff) { p++; continue; }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01 || m === 0x00) { p += 2; continue; }
    if (m === 0xd9) break;
    const len = (bytes[p + 2] << 8) | bytes[p + 3];
    const seg = p + 4;
    if (m === 0xdb) { // DQT
      let q = seg;
      while (q < p + 2 + len) {
        const pq = bytes[q] >> 4, tq = bytes[q] & 15;
        q++;
        const t = [];
        for (let i = 0; i < 64; i++) { t.push(pq ? (bytes[q] << 8) | bytes[q + 1] : bytes[q]); q += pq ? 2 : 1; }
        if (tq === 0 && !luma) luma = t;
      }
    } else if (m === 0xc0 || m === 0xc1 || m === 0xc2) { // SOF
      progressive = m === 0xc2;
      const nc = bytes[seg + 5];
      if (nc >= 3) {
        const f = bytes[seg + 6 + 1]; // pirmojo komponento (Y) pavyzdžiavimo koeficientai
        const h = f >> 4, v = f & 15;
        subsampling = h === 2 && v === 2 ? '4:2:0' : h === 2 && v === 1 ? '4:2:2' : h === 1 && v === 1 ? '4:4:4' : `${h}×${v}`;
      } else subsampling = 'pilkas';
    } else if (m === 0xda) break; // SOS – toliau tik vaizdo duomenys
    p += 2 + len;
  }
  if (!luma) return { q: null, subsampling, progressive };
  return { q: qualityFromLumaTable(luma), subsampling, progressive };
}
