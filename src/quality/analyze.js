const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
};
const mean = values => values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;

function getPrintGeometry(photo, format, mode, getCrop, getOrientation, getTargetRatio) {
  const [a, b] = format.cm;
  const portrait = getOrientation(photo);
  const widthCm = portrait ? a : b;
  const heightCm = portrait ? b : a;
  const crop = getCrop(photo);
  if (mode === 'fit') {
    const target = getTargetRatio(photo);
    const sheetW = Math.max(photo.width, Math.ceil(photo.height * target));
    const sheetH = Math.max(photo.height, Math.ceil(photo.width / target));
    const scale = Math.min(sheetW / photo.width, sheetH / photo.height);
    const drawnW = photo.width * scale;
    const drawnH = photo.height * scale;
    return {
      crop,
      widthCm, heightCm,
      effectiveDpiX: photo.width / ((drawnW / sheetW) * (widthCm / 2.54)),
      effectiveDpiY: photo.height / ((drawnH / sheetH) * (heightCm / 2.54)),
      imageCoverage: (drawnW * drawnH) / (sheetW * sheetH),
      sheetPixels: [sheetW, sheetH],
    };
  }
  return {
    crop, widthCm, heightCm,
    effectiveDpiX: crop.sw / (widthCm / 2.54),
    effectiveDpiY: crop.sh / (heightCm / 2.54),
    imageCoverage: 1,
    sheetPixels: [Math.round(crop.sw), Math.round(crop.sh)],
  };
}

function sampleCrop(photo, geometry, mode, getTargetRatio) {
  const canvas = document.createElement('canvas');
  const maxSide = 900;
  let sx, sy, sw, sh;
  if (mode === 'fit') {
    const [sheetW, sheetH] = geometry.sheetPixels;
    sx = 0; sy = 0; sw = sheetW; sh = sheetH;
  } else {
    ({ sx, sy, sw, sh } = geometry.crop);
  }
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Nepavyko sukurti analizės drobės.');
  if (mode === 'fit') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const target = getTargetRatio(photo);
    const sheetW = geometry.sheetPixels[0], sheetH = geometry.sheetPixels[1];
    const fit = Math.min(sheetW / photo.width, sheetH / photo.height);
    const z = clamp(Number(photo.zoom || 1), 1, 4);
    const drawW = photo.width * fit * z;
    const drawH = photo.height * fit * z;
    const maxX = Math.max(0, (drawW - sheetW) / 2);
    const maxY = Math.max(0, (drawH - sheetH) / 2);
    const px = clamp(Number(photo.pan?.x || 0), -1, 1) * maxX;
    const py = clamp(Number(photo.pan?.y || 0), -1, 1) * maxY;
    ctx.drawImage(photo.image,
      ((sheetW - drawW) / 2 + px) * scale,
      ((sheetH - drawH) / 2 + py) * scale,
      drawW * scale, drawH * scale);
  } else {
    ctx.drawImage(photo.image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  }
  return { canvas, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
}

function calculateImageMetrics(data, width, height) {
  const count = width * height;
  const luma = new Float32Array(count);
  const saturation = new Float32Array(count);
  const rValues = [], gValues = [], bValues = [], lumaValues = [];
  let clippedHighlights = 0, clippedShadows = 0, saturatedPixels = 0;
  for (let i = 0, p = 0; i < count; i++, p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    luma[i] = y;
    saturation[i] = max ? (max - min) / max : 0;
    rValues.push(r); gValues.push(g); bValues.push(b); lumaValues.push(y);
    if (y >= 250) clippedHighlights++;
    if (y <= 5) clippedShadows++;
    if (saturation[i] > 0.85) saturatedPixels++;
  }
  const p02 = percentile(lumaValues, .02), p98 = percentile(lumaValues, .98);
  let lapSum = 0, lapSq = 0, lapN = 0, gradSum = 0, edgeN = 0;
  let blockBoundary = 0, blockInterior = 0, blockBoundaryN = 0, blockInteriorN = 0;
  const lapValues = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = 4 * luma[i] - luma[i - 1] - luma[i + 1] - luma[i - width] - luma[i + width];
      lapValues.push(Math.abs(lap));
      lapSum += lap; lapSq += lap * lap; lapN++;
      const gx = luma[i + 1] - luma[i - 1];
      const gy = luma[i + width] - luma[i - width];
      const grad = Math.hypot(gx, gy);
      gradSum += grad;
      if (grad > 35) edgeN++;
      const diff = Math.abs(luma[i] - luma[i - 1]);
      if (x % 8 === 0) { blockBoundary += diff; blockBoundaryN++; }
      else { blockInterior += diff; blockInteriorN++; }
    }
  }
  const lapVariance = lapN ? Math.max(0, lapSq / lapN - (lapSum / lapN) ** 2) : 0;
  const avgEdge = lapN ? gradSum / lapN : 0;
  const edgeDensity = lapN ? edgeN / lapN : 0;
  const boundaryMean = blockBoundaryN ? blockBoundary / blockBoundaryN : 0;
  const interiorMean = blockInteriorN ? blockInterior / blockInteriorN : 0;
  const blockiness = interiorMean > 0.01 ? boundaryMean / interiorMean : 1;
  const sortedLap = percentile(lapValues, .75);
  const chromaSpread = Math.sqrt(mean(rValues.map((v, i) => (v - gValues[i]) ** 2)) + mean(bValues.map((v, i) => (v - gValues[i]) ** 2))) / 255;
  const meanR = mean(rValues), meanG = mean(gValues), meanB = mean(bValues);
  const colorCast = Math.max(meanR, meanG, meanB) - Math.min(meanR, meanG, meanB);
  // A robust high-pass residual proxy. It is not a camera-ISO or pure sensor-noise measurement.
  const residuals = [];
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const i = y * width + x;
      const local = (luma[i - 1] + luma[i + 1] + luma[i - width] + luma[i + width]) / 4;
      residuals.push(Math.abs(luma[i] - local));
    }
  }
  return {
    contrast: p98 - p02,
    p02, p98,
    highlights: clippedHighlights / count * 100,
    shadows: clippedShadows / count * 100,
    sharpness: lapVariance,
    edgeStrength: avgEdge,
    edgeDensity: edgeDensity * 100,
    highFrequency: sortedLap,
    noise: percentile(residuals, .5) * 1.4826,
    blockiness,
    saturation: mean(saturation) * 100,
    colorCast,
    chromaSpread,
    meanLuma: mean(lumaValues),
  };
}

function makeFindings(m, dpi, targetDpi, printer, formatCm) {
  const findings = [];
  const ratio = dpi / targetDpi;
  if (ratio < .65) findings.push({ level: 'bad', title: 'Per maža raiška šiam spaudos dydžiui', text: 'Spausdinant gali matytis pikseliai arba prarastos smulkios detalės. Sumažinus formatą rezultatas gali pagerėti.' });
  else if (ratio < .9) findings.push({ level: 'warning', title: 'Raiška ribinė', text: 'Įprastu atstumu vaizdas gali atrodyti gerai, tačiau žiūrint iš arti smulkios detalės gali būti minkštos.' });
  else findings.push({ level: 'good', title: 'Raiškos pakanka', text: 'Pagal pasirinktą formatą ir numatytą žiūrėjimo atstumą pikselių tankis yra pakankamas.' });

  if (m.sharpness < 45) findings.push({ level: 'bad', title: 'Nuotrauka atrodo išplaukusi', text: 'Silpnas smulkių kraštų aiškumas. Tai gali būti fokusavimo, judesio arba stipraus apdorojimo pasekmė.' });
  else if (m.sharpness < 115) findings.push({ level: 'warning', title: 'Aštrumas vidutinis', text: 'Kai kurios smulkios detalės gali atrodyti minkštos, ypač mažame spaudinyje žiūrint iš arti.' });
  else findings.push({ level: 'good', title: 'Detalės pakankamai aiškios', text: 'Analizėje aptikta pakankamai ryškių smulkių kontūrų. Tai nėra vien raiškos įvertinimas.' });

  if (m.noise > 13) findings.push({ level: 'warning', title: 'Pastebimas skaitmeninis triukšmas', text: 'Lygiose vietose gali matytis grūdėtumas, ypač šešėliuose.' });
  if (m.blockiness > 1.65 && m.edgeDensity < 30) findings.push({ level: 'warning', title: 'Galimi JPEG suspaudimo artefaktai', text: 'Matomas blokų arba kontūrų suspaudimo požymis. Tikslaus pakartotinio išsaugojimų skaičiaus nustatyti neįmanoma.' });
  if (m.contrast < 55) findings.push({ level: 'warning', title: 'Mažas kontrastas', text: 'Vaizdas gali atrodyti pilkas arba blankus.' });
  if (m.highlights > 2) findings.push({ level: 'warning', title: 'Prarastos šviesios detalės', text: 'Dalis labai šviesių plotų gali būti visiškai balti, todėl ten nebelieka tekstūros.' });
  if (m.shadows > 3) findings.push({ level: 'warning', title: 'Prarastos tamsios detalės', text: 'Dalis šešėlių beveik juodi, todėl tamsiose vietose gali nesimatyti detalių.' });
  if (m.colorCast > 16) findings.push({ level: 'warning', title: 'Galimas spalvų atspalvio poslinkis', text: 'Bendras spalvų balansas ryškiai krypsta į vieną kanalą. Įvertinkite, ar toks atspalvis nuotraukoje natūralus.' });
  if (m.saturation < 5) findings.push({ level: 'info', title: 'Mažas spalvų sodrumas', text: 'Nuotrauka gali atrodyti blanki, nebent tai sąmoningas nespalvotas ar prislopintų spalvų vaizdas.' });
  if (findings.length === 1 && findings[0].level === 'good') findings.push({ level: 'good', title: `${printer} spausdinimui tinkamas dydis`, text: `${formatCm[0]} × ${formatCm[1]} cm spaudiniui pagal dabartinius nustatymus reikšmingų techninių kliūčių nenustatyta.` });
  return findings;
}

export async function createQualityCropBlob(photo, options) {
  const { format, mode, getCrop, getOrientation, getTargetRatio } = options;
  const geometry = getPrintGeometry(photo, format, mode, getCrop, getOrientation, getTargetRatio);
  const { canvas } = sampleCrop(photo, geometry, mode, getTargetRatio);
  return await new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('Nepavyko paruošti apkirpto kadro AI analizei.')),
    'image/jpeg', 0.94
  ));
}

export function analyzePhoto(photo, options) {
  const { format, mode, getCrop, getOrientation, getTargetRatio, targetDpi } = options;
  const geometry = getPrintGeometry(photo, format, mode, getCrop, getOrientation, getTargetRatio);
  const dpi = Math.min(geometry.effectiveDpiX, geometry.effectiveDpiY);
  const { canvas, data } = sampleCrop(photo, geometry, mode, getTargetRatio);
  const metrics = calculateImageMetrics(data, canvas.width, canvas.height);
  const printer = geometry.widthCm <= 30.5 ? 'Noritsu QSS-3701' : 'Mimaki JV100-160';
  const findings = makeFindings(metrics, dpi, targetDpi, printer, [geometry.widthCm, geometry.heightCm]);
  const bad = findings.filter(f => f.level === 'bad').length;
  const warnings = findings.filter(f => f.level === 'warning').length;
  let verdict = 'Tinkama spaudai';
  let verdictClass = 'good';
  if (bad) { verdict = 'Prasta spaudos kokybė'; verdictClass = 'bad'; }
  else if (warnings >= 2) { verdict = 'Rekomenduojama patikrinti'; verdictClass = 'warning'; }
  else if (warnings === 1) { verdict = 'Tinkama su pastabomis'; verdictClass = 'fair'; }
  return {
    verdict, verdictClass, printer, dpi: Math.round(dpi), targetDpi: Math.round(targetDpi),
    printSize: `${geometry.widthCm} × ${geometry.heightCm} cm`,
    viewing: geometry.widthCm <= 30.5 ? 'Žiūrima iš arti' : 'Žiūrima iš didesnio atstumo',
    imageCoverage: geometry.imageCoverage,
    metrics, findings,
    analyzedAt: Date.now(),
  };
}
