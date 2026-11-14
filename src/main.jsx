import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import { heicTo } from 'heic-to';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import * as UTIF from 'utif';
import { Camera, ImagePlus, Download, RotateCcw, ChevronLeft, ChevronRight, Crop, Square, Ruler, ZoomIn, ZoomOut, Images, CircleHelp, Settings2, Move, Loader2, Trash2, Sparkles, BrainCircuit, AlertTriangle, CheckCircle2 } from 'lucide-react';
import * as ort from 'onnxruntime-web';
import './style.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const FORMATS = [
  { id: '9x13', label: '9 × 13 cm', ratioLabel: '8,9 × 12,7 cm', cm: [8.9, 12.7] },
  { id: '10x15', label: '10 × 15 cm', ratioLabel: '10,2 × 15,2 cm', cm: [10.2, 15.2] },
  { id: '13x18', label: '13 × 18 cm', ratioLabel: '12,7 × 17,8 cm', cm: [12.7, 17.8] },
  { id: '15x15', label: '15 × 15 cm', ratioLabel: '15,2 × 15,2 cm', cm: [15.2, 15.2] },
  { id: '13x19', label: '13 × 19 cm', ratioLabel: '12,7 × 19 cm', cm: [12.7, 19] },
  { id: '15x21', label: '15 × 21 cm', ratioLabel: '15,2 × 21 cm', cm: [15.2, 21] },
  { id: '15x23', label: '15 × 23 cm', ratioLabel: '15,2 × 22,8 cm', cm: [15.2, 22.8] },
  { id: '20x30', label: '20 × 30 cm', ratioLabel: '20,3 × 30,5 cm', cm: [20.3, 30.5] },
  { id: 'a4', label: 'A4', ratioLabel: '21 × 29,7 cm', cm: [21, 29.7] },
  { id: '30x30', label: '30 × 30 cm', ratioLabel: '30,5 × 30,5 cm', cm: [30.5, 30.5] },
  { id: '30x40', label: '30 × 40 cm', ratioLabel: '30,5 × 40 cm', cm: [30.5, 40] },
  { id: 'a3', label: 'A3', ratioLabel: '29,7 × 42 cm', cm: [29.7, 42] },
  { id: '30x45', label: '30 × 45 cm', ratioLabel: '30,5 × 45 cm', cm: [30.5, 45] },
];
const DEFAULT_QUALITY_SCALE = [
  { id: '10x15', label: '10 × 15 cm', size: 15, dpi: 200 },
  { id: '20x30', label: '20 × 30 cm', size: 30, dpi: 180 },
  { id: '30x40', label: '30 × 40 cm', size: 40, dpi: 160 },
  { id: '40x60', label: '40 × 60 cm', size: 60, dpi: 140 },
  { id: '60x90', label: '60 × 90 cm', size: 90, dpi: 120 },
  { id: '120x90', label: '120 × 90 cm', size: 120, dpi: 100 },
  { id: '150x100', label: '150 × 100 cm', size: 150, dpi: 90 },
];
const getTargetDpi = (longSideCm, scale) => {
  const rows = [...scale].sort((a, b) => a.size - b.size);
  if (longSideCm <= rows[0].size) return rows[0].dpi;
  if (longSideCm >= rows[rows.length - 1].size) return rows[rows.length - 1].dpi;
  for (let i = 0; i < rows.length - 1; i++) {
    const l = rows[i], r = rows[i + 1];
    if (longSideCm >= l.size && longSideCm <= r.size) return l.dpi + (r.dpi - l.dpi) * ((longSideCm - l.size) / (r.size - l.size));
  }
  return rows[0].dpi;
};
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const round1 = n => Math.round(n * 10) / 10;

async function blobToImage(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Naršyklė negali perskaityti vaizdo failo.'));
      img.src = url;
    });
    return { url, image, width: image.naturalWidth, height: image.naturalHeight };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function decodePdf(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    // 3x scale gives a useful raster source for photo-print cropping while keeping
    // ordinary A4 pages at a manageable pixel size.
    const viewport = page.getViewport({ scale: 3 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport, background: '#ffffff' }).promise;
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      value => value ? resolve(value) : reject(new Error(`Nepavyko paruošti PDF ${pageNumber} puslapio.`)),
      'image/png'
    ));
    const decoded = await blobToImage(blob);
    const stem = file.name.replace(/\.pdf$/i, '');
    pages.push({
      ...decoded,
      name: `${stem} - ${String(pageNumber).padStart(3, '0')}.png`,
      sourceName: file.name,
      pdfPage: pageNumber,
      pdfPageCount: pdf.numPages,
    });
    page.cleanup();
  }
  await pdf.destroy();
  return pages;
}

async function decodeFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  let blob = file;
  if (['heic', 'heif'].includes(ext)) {
    try {
      // heic-to tracks newer libheif releases and supports HEIC variants
      // that the older heic2any decoder cannot read.
      blob = await heicTo({ blob: file, type: 'image/png' });
      if (!(blob instanceof Blob) || !blob.size) throw new Error('HEIC konverteris negrąžino vaizdo.');
    } catch (conversionError) {
      // Try the platform decoder as a secondary route (available in some browsers).
      try {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        bitmap.close?.();
        blob = await new Promise((resolve, reject) => canvas.toBlob(
          value => value ? resolve(value) : reject(new Error('Nepavyko konvertuoti HEIC vaizdo.')),
          'image/png'
        ));
      } catch (nativeError) {
        throw new Error(`Nepavyko perskaityti HEIC/HEIF failo „${file.name}“. Dekoderis: ${conversionError?.message || 'nežinoma klaida'}. Naršyklė: ${nativeError?.message || 'HEIC nepalaikomas'}`.trim());
      }
    }
  } else if (['tif', 'tiff'].includes(ext)) {
    const buffer = await file.arrayBuffer();
    const ifds = UTIF.decode(buffer);
    if (!ifds.length) throw new Error('TIFF faile nerastas vaizdas.');
    UTIF.decodeImage(buffer, ifds[0]);
    const rgba = UTIF.toRGBA8(ifds[0]);
    const canvas = document.createElement('canvas');
    canvas.width = ifds[0].width; canvas.height = ifds[0].height;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), canvas.width, canvas.height), 0, 0);
    blob = await new Promise((resolve, reject) => canvas.toBlob(
      value => value ? resolve(value) : reject(new Error('Nepavyko konvertuoti TIFF failo.')),
      'image/png'
    ));
  }
  return blobToImage(blob);
}

function getFormat(photo) {
  if (photo.format === 'custom' && photo.customCm) {
    const [a, b] = photo.customCm;
    return { id: 'custom', label: `${a} × ${b} cm`, ratioLabel: `${a} : ${b}`, cm: [a, b] };
  }
  return FORMATS.find(f => f.id === photo.format) || FORMATS[0];
}
function getOrientation(photo) {
  if (photo.orientation === 'vertical') return true;
  if (photo.orientation === 'horizontal') return false;
  return photo.height >= photo.width;
}
function getTargetRatio(photo) {
  if (photo.mode === 'free') {
    const freeCrop = photo.freeCrop || { w: photo.width, h: photo.height };
    return freeCrop.w / Math.max(1, freeCrop.h);
  }
  const [a, b] = getFormat(photo).cm;
  const portrait = getOrientation(photo);
  return portrait ? a / b : b / a;
}
function getCrop(photo) {
  if (photo.mode === 'free') {
    const base = photo.freeCrop || { x: 0, y: 0, w: photo.width, h: photo.height };
    const zoom = clamp(Number(photo.zoom || 1), 1, 4);
    const sw = base.w / zoom, sh = base.h / zoom;
    const maxX = Math.max(0, (base.w - sw) / 2), maxY = Math.max(0, (base.h - sh) / 2);
    const cx = base.x + base.w / 2 - clamp(Number(photo.pan?.x || 0), -1, 1) * maxX;
    const cy = base.y + base.h / 2 - clamp(Number(photo.pan?.y || 0), -1, 1) * maxY;
    return { sx: clamp(cx - sw / 2, 0, photo.width - sw), sy: clamp(cy - sh / 2, 0, photo.height - sh), sw, sh, baseW: base.w, baseH: base.h, target: sw / sh };
  }
  const target = getTargetRatio(photo);
  const iw = photo.width, ih = photo.height;
  let baseW, baseH;
  if (iw / ih > target) { baseH = ih; baseW = ih * target; }
  else { baseW = iw; baseH = iw / target; }
  const zoom = clamp(Number(photo.zoom || 1), 1, photo.mode === 'free' ? 4 : 3);
  const sw = baseW / zoom, sh = baseH / zoom;
  const maxX = Math.max(0, (iw - sw) / 2), maxY = Math.max(0, (ih - sh) / 2);
  const cx = iw / 2 - clamp(Number(photo.pan?.x || 0), -1, 1) * maxX;
  const cy = ih / 2 - clamp(Number(photo.pan?.y || 0), -1, 1) * maxY;
  return { sx: cx - sw / 2, sy: cy - sh / 2, sw, sh, baseW, baseH, target };
}
function renderPhoto(photo, canvas, { thumbnail = false } = {}) {
  const fmt = getFormat(photo);
  const portrait = getOrientation(photo);
  const [a, b] = fmt.cm;
  const target = getTargetRatio(photo);
  const ctx = canvas.getContext('2d');
  if (photo.mode === 'real') {
    const wCm = portrait ? a : b, hCm = portrait ? b : a;
    canvas.width = Math.round(wCm / 2.54 * 320);
    canvas.height = Math.round(hCm / 2.54 * 320);
  } else if (photo.mode === 'fit') {
    // Tikslus pasirinkto formato baltas lapas; nuotrauką galima priartinti ir pastumti.
    const sheetW = Math.max(photo.width, Math.ceil(photo.height * target));
    const sheetH = Math.max(photo.height, Math.ceil(photo.width / target));
    const outputScale = thumbnail ? Math.min(360 / sheetW, 360 / sheetH, 1) : 1;
    canvas.width = Math.max(1, Math.round(sheetW * outputScale));
    canvas.height = Math.max(1, Math.round(sheetH * outputScale));
    // Work in the sheet's original pixel coordinate system, then scale the
    // entire composition. This keeps the thumbnail image and white margins
    // in the same positions as the exported print.
    ctx.scale(outputScale, outputScale);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, sheetW, sheetH);
    const fitScale = Math.min(sheetW / photo.width, sheetH / photo.height);
    const z = clamp(Number(photo.zoom || 1), 1, 4);
    const drawW = photo.width * fitScale * z, drawH = photo.height * fitScale * z;
    const maxX = Math.max(0, (drawW - sheetW) / 2), maxY = Math.max(0, (drawH - sheetH) / 2);
    const px = clamp(Number(photo.pan?.x || 0), -1, 1) * maxX;
    const py = clamp(Number(photo.pan?.y || 0), -1, 1) * maxY;
    ctx.drawImage(photo.image, (sheetW - drawW) / 2 + px, (sheetH - drawH) / 2 + py, drawW, drawH);
    return;
  } else {
    const crop = getCrop(photo);
    if (thumbnail) {
      const scale = Math.min(360 / crop.sw, 360 / crop.sh);
      canvas.width = Math.max(1, Math.round(crop.sw * scale));
      canvas.height = Math.max(1, Math.round(crop.sh * scale));
    } else {
      canvas.width = Math.max(1, Math.round(crop.sw));
      canvas.height = Math.max(1, Math.round(crop.sh));
    }
    ctx.drawImage(photo.image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
    return;
  }
  const crop = getCrop(photo);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(photo.image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
}

const IQA_MODELS = {
  dbcnn: { label: 'DBCNN', size: '59 MB', file: 'dbcnn_model.onnx', data: 'dbcnn_model.onnx.data', url: 'https://huggingface.co/86Cao/IQA-ONNX-Models/resolve/main/dbcnn_model.onnx', dataUrl: 'https://huggingface.co/86Cao/IQA-ONNX-Models/resolve/main/dbcnn_model.onnx.data' },
  hyperiqa: { label: 'HyperIQA', size: '105 MB', file: 'hyperiqa_model.onnx', data: 'hyperiqa_model.onnx.data', url: 'https://huggingface.co/86Cao/IQA-ONNX-Models/resolve/main/hyperiqa_model.onnx', dataUrl: 'https://huggingface.co/86Cao/IQA-ONNX-Models/resolve/main/hyperiqa_model.onnx.data' },
  musiq: { label: 'MUSIQ', size: '104 MB', file: 'musiq_model.onnx', data: 'musiq_model.onnx.data', url: 'https://huggingface.co/86Cao/IQA-ONNX-Models/resolve/main/musiq_model.onnx', dataUrl: 'https://huggingface.co/86Cao/IQA-ONNX-Models/resolve/main/musiq_model.onnx.data' },
  maniqa: { label: 'MANIQA', size: '437 MB', file: 'maniqa_model.onnx', url: 'https://huggingface.co/86Cao/IQA-ONNX-Models/resolve/main/maniqa_model.onnx' },
  clipiqa: { label: 'CLIPIQA+', size: '146 MB', file: 'clipiqa_model.onnx', data: 'clipiqa_model.onnx.data', url: 'https://huggingface.co/86Cao/IQA-ONNX-Models/resolve/main/clipiqa_model.onnx', dataUrl: 'https://huggingface.co/86Cao/IQA-ONNX-Models/resolve/main/clipiqa_model.onnx.data' },
};
const IQA_CACHE = 'foto-inspektorius-iqa-models-v2';
const iqaSessionPromises = {};
async function loadIqaModel(id, onProgress) {
  if (!iqaSessionPromises[id]) iqaSessionPromises[id] = (async () => {
    const cfg = IQA_MODELS[id];
    ort.env.wasm.numThreads = Math.min(4, Math.max(1, navigator.hardwareConcurrency || 2));
    const modelBlob = await getCachedModelFile(cfg.url, cfg.file, v => onProgress?.('model', v));
    const options = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
    if (cfg.data) {
      const dataBlob = await getCachedModelFile(cfg.dataUrl, cfg.data, v => onProgress?.('weights', v));
      options.externalData = [{ path: cfg.data, data: dataBlob }];
    }
    return ort.InferenceSession.create(await modelBlob.arrayBuffer(), options);
  })().catch(error => { delete iqaSessionPromises[id]; throw error; });
  return iqaSessionPromises[id];
}

function imageToDbcnnTensor(image) {
  const canvas = document.createElement('canvas'); canvas.width = 224; canvas.height = 224;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, 224, 224);
  const pixels = ctx.getImageData(0, 0, 224, 224).data;
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  const data = new Float32Array(3 * 224 * 224);
  for (let i = 0; i < 224 * 224; i++) {
    data[i] = ((pixels[i * 4] / 255) - mean[0]) / std[0];
    data[224 * 224 + i] = ((pixels[i * 4 + 1] / 255) - mean[1]) / std[1];
    data[2 * 224 * 224 + i] = ((pixels[i * 4 + 2] / 255) - mean[2]) / std[2];
  }
  return new ort.Tensor('float32', data, [1, 3, 224, 224]);
}

function calculateSharpnessGrid(image) {
  const cols = 3, rows = 3, tileW = Math.max(1, Math.floor(image.naturalWidth / cols)), tileH = Math.max(1, Math.floor(image.naturalHeight / rows));
  const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 384;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const scores = [];
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    const x0 = Math.floor(gx * width / cols), x1 = Math.floor((gx + 1) * width / cols);
    const y0 = Math.floor(gy * height / rows), y1 = Math.floor((gy + 1) * height / rows);
    let sum = 0, sum2 = 0, count = 0, edges = 0;
    for (let y = y0 + 1; y < y1 - 1; y += 2) for (let x = x0 + 1; x < x1 - 1; x += 2) {
      const at = (y * width + x) * 4;
      const lum = 0.2126 * data[at] + 0.7152 * data[at + 1] + 0.0722 * data[at + 2];
      const left = (y * width + x - 1) * 4, right = (y * width + x + 1) * 4;
      const up = ((y - 1) * width + x) * 4, down = ((y + 1) * width + x) * 4;
      const l = 0.2126 * data[left] + 0.7152 * data[left + 1] + 0.0722 * data[left + 2];
      const r = 0.2126 * data[right] + 0.7152 * data[right + 1] + 0.0722 * data[right + 2];
      const u = 0.2126 * data[up] + 0.7152 * data[up + 1] + 0.0722 * data[up + 2];
      const d = 0.2126 * data[down] + 0.7152 * data[down + 1] + 0.0722 * data[down + 2];
      const edge = Math.hypot(r - l, d - u);
      sum += edge; sum2 += edge * edge; count++; if (edge > 22) edges++;
    }
    const mean = count ? sum / count : 0;
    const variance = count ? Math.max(0, sum2 / count - mean * mean) : 0;
    scores.push({ x: gx, y: gy, score: Math.sqrt(variance), edgeShare: count ? edges / count : 0 });
  }
  const sorted = scores.map(s => s.score).sort((a,b) => a-b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  // A tile is flagged only when it is clearly weaker than the image's own median;
  // this reduces false alarms on naturally smooth skies and plain backgrounds.
  return scores.map(s => ({ ...s, weak: median > 0 && s.score < median * 0.42 && s.edgeShare < 0.12 }));
}

function App() {
  const [photos, setPhotos] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [format, setFormat] = useState('10x15');
  const [customCm, setCustomCm] = useState([10, 15]);
  const [mode, setMode] = useState('crop');
  const [exportFormat, setExportFormat] = useState('jpg');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [dropZone, setDropZone] = useState('');
  const [message, setMessage] = useState('');
  const [qualityScale, setQualityScale] = useState(() => { try { const saved = JSON.parse(localStorage.getItem('foto-inspektorius-quality-scale')); return Array.isArray(saved) && saved.length ? saved : DEFAULT_QUALITY_SCALE; } catch { return DEFAULT_QUALITY_SCALE; } });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('crop');
  const [qualityImage, setQualityImage] = useState(null);
  const [qualityDimensions, setQualityDimensions] = useState([10.2, 15.2]);
  const [qualityPrintType, setQualityPrintType] = useState('photo');
  const [qualityStatus, setQualityStatus] = useState('idle');
  const [qualityProgress, setQualityProgress] = useState('');
  const [qualityResult, setQualityResult] = useState(null);
  const [qualityCropZoom, setQualityCropZoom] = useState(1);
  const [qualityPan, setQualityPan] = useState({ x: 0, y: 0 });
  const [selectedIqaModels, setSelectedIqaModels] = useState(['dbcnn', 'musiq']);
  const qualityFileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [resizeStart, setResizeStart] = useState(null);
  const [stageSizes, setStageSizes] = useState({ main: { w: 900, h: 420 } });
  const fileRef = useRef(null);
  const stageRef = useRef(null);
  const stripRef = useRef(null);
  const thumbCacheRef = useRef(new Map());
  const active = photos.find(p => p.id === activeId) || null;
  const selectedFormat = active ? getFormat(active) : (FORMATS.find(f => f.id === format) || { ...FORMATS[0], id: 'custom', cm: customCm, label: `${customCm[0]} × ${customCm[1]} cm`, ratioLabel: `${customCm[0]} : ${customCm[1]}` });
  const selectedMode = active?.mode || mode;
  const selectedOrientation = active?.orientation || 'auto';

  useEffect(() => {
    if (active) { setZoom(active.zoom ?? 1); setPan(active.pan || { x: 0, y: 0 }); setMode(active.mode || 'crop'); setFormat(active.format || format); setCustomCm(active.customCm || customCm); }
  }, [activeId]);
  useEffect(() => () => photos.forEach(p => URL.revokeObjectURL(p.url)), []);
  useEffect(() => { localStorage.setItem('foto-inspektorius-quality-scale', JSON.stringify(qualityScale)); }, [qualityScale]);
  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const update = () => { const r = node.getBoundingClientRect(); if (r.width && r.height) setStageSizes({ main: { w: r.width, h: r.height } }); };
    const ro = new ResizeObserver(update); ro.observe(node); update();
    return () => ro.disconnect();
  }, [!!active]);

  const updatePhoto = (id, patch) => setPhotos(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  const deletePhoto = id => {
    const index = photos.findIndex(p => p.id === id);
    if (index < 0) return;
    const removed = photos[index];
    URL.revokeObjectURL(removed.url);
    thumbCacheRef.current.delete(id);
    const remaining = photos.filter(p => p.id !== id);
    setPhotos(remaining);
    if (activeId === id) {
      const next = remaining[Math.min(index, remaining.length - 1)] || remaining[remaining.length - 1] || null;
      setActiveId(next?.id || null);
    }
    setMessage(`Pašalinta: ${removed.name}`);
  };
  const handleDrop = (event, zone) => {
    event.preventDefault();
    event.stopPropagation();
    setDropZone('');
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length) addFiles(files);
  };
  const patchActive = patch => {
    if (!active) return;
    const next = { ...active, ...patch };
    setZoom(next.zoom ?? 1); setPan(next.pan || { x: 0, y: 0 });
    updatePhoto(activeId, { ...patch, status: 'editing' });
  };
  const setZoomValue = value => patchActive({ zoom: clamp(value, 1, selectedMode === 'fit' || selectedMode === 'free' ? 4 : 3) });
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); patchActive({ zoom: 1, pan: { x: 0, y: 0 }, orientation: 'auto' }); };
  const setOrientation = value => patchActive({ orientation: value });
  const navigateTo = id => {
    if (active && active.status !== 'done') updatePhoto(active.id, { status: 'done' });
    setActiveId(id);
  };
  useEffect(() => {
    const onKeyDown = e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const tag = e.target?.tagName?.toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) || e.target?.isContentEditable) return;
      if (!photos.length) return;
      e.preventDefault();
      const index = photos.findIndex(p => p.id === activeId);
      const nextIndex = e.key === 'ArrowRight' ? Math.min(photos.length - 1, index + 1) : Math.max(0, index - 1);
      if (nextIndex !== index && photos[nextIndex]) navigateTo(photos[nextIndex].id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [photos, activeId]);

  const applyModeToAll = nextMode => {
    setMode(nextMode);
    setPhotos(prev => prev.map(p => ({ ...p, mode: nextMode, zoom: 1, pan: { x: 0, y: 0 }, status: 'editing' })));
    setZoom(1); setPan({ x: 0, y: 0 });
    setMessage(`„${nextMode === 'fit' ? 'Įtalpinta' : nextMode === 'real' ? 'Real Size' : nextMode === 'free' ? 'Laisvas' : 'Kadravimas'}“ pritaikyta visoms nuotraukoms. Kiekvieną galima koreguoti atskirai.`);
  };

  const changeFormat = id => {
    setFormat(id);
    const f = FORMATS.find(x => x.id === id);
    if (f) setCustomCm(f.cm);
    setPhotos(prev => prev.map(p => p.mode === 'free' ? p : ({ ...p, format: id, customCm: f?.cm || p.customCm, status: p.status === 'done' ? 'editing' : p.status })));
  };
  const changeCustom = (index, raw) => {
    const value = clamp(Number(raw) || 0.1, 0.1, 300);
    const next = [...customCm]; next[index] = round1(value);
    const matched = FORMATS.find(f =>
      (Math.abs(f.cm[0] - next[0]) < 0.001 && Math.abs(f.cm[1] - next[1]) < 0.001) ||
      (Math.abs(f.cm[1] - next[0]) < 0.001 && Math.abs(f.cm[0] - next[1]) < 0.001)
    );
    const nextFormat = matched?.id || 'custom';
    setCustomCm(matched ? [...matched.cm] : next); setFormat(nextFormat);
    const dimensions = matched ? [...matched.cm] : next;
    setPhotos(prev => prev.map(p => p.mode === 'free' ? p : ({ ...p, format: nextFormat, customCm: dimensions, status: p.status === 'done' ? 'editing' : p.status })));
  };

  const addFiles = async files => {
    const accepted = Array.from(files).filter(f => /\.(jpe?g|png|webp|bmp|gif|heic|heif|tif|tiff|pdf)$/i.test(f.name));
    if (!accepted.length) { setMessage('Pasirink JPG, PNG, WEBP, HEIC, TIFF arba PDF failus.'); return; }
    setBusy(true); setMessage(`Įkeliama ${accepted.length} failų…`);
    const added = [];
    const failed = [];
    for (const file of accepted) {
      try {
        if (/\.pdf$/i.test(file.name)) {
          const pages = await decodePdf(file);
          for (const page of pages) {
            added.push({
              id: uid(), originalFile: file, ...page,
              status: 'new', orientation: 'auto', zoom: 1, pan: { x: 0, y: 0 },
              freeCrop: { x: 0, y: 0, w: page.width, h: page.height },
              copies: 1, mode, format, customCm,
            });
          }
        } else {
          const decoded = await decodeFile(file);
          added.push({
            id: uid(), name: file.name, originalFile: file, ...decoded,
            status: 'new', orientation: 'auto', zoom: 1, pan: { x: 0, y: 0 },
            freeCrop: { x: 0, y: 0, w: decoded.width, h: decoded.height },
            copies: 1, mode, format, customCm,
          });
        }
      } catch (e) {
        console.error(`Nepavyko įkelti ${file.name}:`, e);
        failed.push(`${file.name}: ${e.message || 'nežinoma klaida'}`);
      }
    }
    setPhotos(prev => [...prev, ...added]);
    if (!activeId && added[0]) setActiveId(added[0].id);
    setBusy(false);
    const pageCount = added.filter(p => p.pdfPage).length;
    const summary = `Įkelta ${added.length} vaizdų${pageCount ? ` (iš jų ${pageCount} PDF puslapių)` : ''}.`;
    setMessage(failed.length ? `${summary} Nepavyko: ${failed.join(' | ')}` : summary);
  };

  const exportOne = async photo => {
    const canvas = document.createElement('canvas'); renderPhoto(photo, canvas);
    let blob, extension;
    if (exportFormat === 'tif') {
      const ctx = canvas.getContext('2d');
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const tiff = UTIF.encodeImage(rgba, canvas.width, canvas.height);
      blob = new Blob([tiff], { type: 'image/tiff' });
      extension = 'tif';
    } else {
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.98));
      extension = 'jpg';
    }
    if (!blob) throw new Error(`${extension.toUpperCase()} eksportas nepavyko`);
    const prefix = Number(photo.copies || 1) > 1 ? `${photo.copies}x - ` : '';
    return { name: prefix + photo.name.replace(/\.[^.]+$/, '') + '.' + extension, blob };
  };
  const downloadBlob = (blob, name) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); };
  const exportAll = async () => {
    if (!photos.length || busy) return;
    setBusy(true); setMessage(`Ruošiami ${exportFormat.toUpperCase()} failai…`);
    try {
      const zip = new JSZip();
      for (let i = 0; i < photos.length; i++) { const result = await exportOne(photos[i]); zip.file(result.name, result.blob); setMessage(`Apdorojama ${i + 1} / ${photos.length}`); }
      const now = new Date();
      const stamp = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
      downloadBlob(await zip.generateAsync({ type: 'blob' }), `${stamp}.zip`);
      setPhotos(prev => prev.map(p => ({ ...p, status: 'done' })));
      setMessage('ZIP archyvas paruoštas.');
    } catch (e) { console.error(e); setMessage('Eksportuojant įvyko klaida.'); }
    setBusy(false);
  };
  const exportCurrent = async () => { if (active) { const r = await exportOne(active); downloadBlob(r.blob, r.name); updatePhoto(active.id, { status: 'done' }); } };

  const thumbSources = useMemo(() => {
    const result = new Map();
    const cache = thumbCacheRef.current;
    const liveIds = new Set(photos.map(p => p.id));
    for (const id of cache.keys()) if (!liveIds.has(id)) cache.delete(id);
    photos.forEach(p => {
      const signature = JSON.stringify([p.mode, p.format, p.customCm, p.orientation, p.zoom, p.pan, p.freeCrop]);
      const cached = cache.get(p.id);
      if (cached?.signature === signature) { result.set(p.id, cached.src); return; }
      try {
        const canvas = document.createElement('canvas');
        renderPhoto(p, canvas, { thumbnail: true });
        const src = canvas.toDataURL('image/jpeg', 0.84);
        cache.set(p.id, { signature, src }); result.set(p.id, src);
      } catch { result.set(p.id, p.url); }
    });
    return result;
  }, [photos]);

  const metrics = active ? (() => {
    const crop = getCrop(active);
    let widthPx = Math.max(1, Math.round(crop.sw)), heightPx = Math.max(1, Math.round(crop.sh));
    if (selectedMode === 'free') return { widthPx, heightPx, size: 'Laisvas formatas', dpi: '—', quality: 'Nevertinama', qualityClass: 'neutral', targetDpi: null };
    const [a, b] = getFormat(active).cm;
    const portrait = getOrientation(active);
    const wCm = portrait ? a : b, hCm = portrait ? b : a;
    let dpiX, dpiY;
    if (selectedMode === 'real') {
      // Export is resampled to 320 DPI, but quality must reflect source pixels before upscaling.
      dpiX = crop.sw / (wCm / 2.54); dpiY = crop.sh / (hCm / 2.54);
      widthPx = Math.round(wCm / 2.54 * 320); heightPx = Math.round(hCm / 2.54 * 320);
    } else {
      if (selectedMode === 'fit') { const target = getTargetRatio(active); widthPx = Math.max(active.width, Math.ceil(active.height * target)); heightPx = Math.max(active.height, Math.ceil(active.width / target)); }
      dpiX = widthPx / (wCm / 2.54); dpiY = heightPx / (hCm / 2.54);
    }
    const targetDpi = getTargetDpi(Math.max(wCm, hCm), qualityScale), ratio = Math.min(dpiX, dpiY) / targetDpi;
    const quality = ratio >= 1 ? 'Puiki' : ratio >= .85 ? 'Gera' : ratio >= .65 ? 'Ribinė' : 'Prasta';
    const qualityClass = ratio >= 1 ? 'good' : ratio >= .85 ? 'fair' : ratio >= .65 ? 'warning' : 'bad';
    return { widthPx, heightPx, size: `${wCm} × ${hCm} cm`, dpi: `${Math.round(dpiX)} × ${Math.round(dpiY)} DPI`, quality, qualityClass, targetDpi: Math.round(targetDpi) };
  })() : null;

  const renderStage = () => {
    const stageW = stageSizes.main.w, stageH = stageSizes.main.h;
    let sheetStyle = {}, imageStyle = {};
    if (active) {
      const target = getTargetRatio(active);
      const sheetW = Math.min(stageW * 0.88, stageH * 0.82 * target), sheetH = sheetW / target;
      sheetStyle = { width: sheetW, height: sheetH };
      if (selectedMode === 'fit') {
        const fitScale = Math.min(sheetW / active.width, sheetH / active.height);
        const drawW = active.width * fitScale * zoom, drawH = active.height * fitScale * zoom;
        const maxX = Math.max(0, (drawW - sheetW) / 2), maxY = Math.max(0, (drawH - sheetH) / 2);
        imageStyle = { width: drawW, height: drawH, left: `calc(50% + ${pan.x * maxX}px)`, top: `calc(50% + ${pan.y * maxY}px)`, transform: 'translate(-50%, -50%)', objectFit: 'fill' };
      } else {
        // Identical source crop coordinates are used by the preview and exported canvas.
        const crop = getCrop(active), scale = Math.min(sheetW / crop.sw, sheetH / crop.sh);
        const cx = crop.sx + crop.sw / 2, cy = crop.sy + crop.sh / 2;
        imageStyle = { width: active.width * scale, height: active.height * scale, left: `calc(50% + ${(active.width / 2 - cx) * scale}px)`, top: `calc(50% + ${(active.height / 2 - cy) * scale}px)`, transform: 'translate(-50%, -50%)', objectFit: 'fill' };
      }
    }
    const getMoveLimits = () => {
      const target = getTargetRatio(active), sheetW = Math.min(stageW * 0.88, stageH * 0.82 * target), sheetH = sheetW / target;
      if (selectedMode === 'fit') { const scale = Math.min(sheetW / active.width, sheetH / active.height) * zoom; return { maxX: Math.max(1, (active.width * scale - sheetW) / 2), maxY: Math.max(1, (active.height * scale - sheetH) / 2) }; }
      const crop = getCrop(active), scale = Math.min(sheetW / crop.sw, sheetH / crop.sh);
      return { maxX: Math.max(1, (active.width - crop.sw) / 2 * scale), maxY: Math.max(1, (active.height - crop.sh) / 2 * scale) };
    };
    const pointerDown = e => {
      if (!active || e.target.closest('.zoom-control') || e.target.closest('.free-resize-handle')) return;
      e.preventDefault(); const lim = getMoveLimits();
      setDragging(true); setDragStart({ x: e.clientX, y: e.clientY, pan: { ...pan }, ...lim });
      e.currentTarget.setPointerCapture(e.pointerId);
    };
    const beginFreeResize = e => {
      if (!active || selectedMode !== 'free') return;
      e.preventDefault(); e.stopPropagation();
      const crop = getCrop(active);
      const target = getTargetRatio(active);
      const sheetW = Math.min(stageW * 0.88, stageH * 0.82 * target);
      const scale = sheetW / crop.sw;
      setResizeStart({ x: e.clientX, y: e.clientY, crop, scale });
      e.currentTarget.setPointerCapture(e.pointerId);
    };
    const pointerMove = e => {
      if (resizeStart && active && selectedMode === 'free') {
        const dx = (e.clientX - resizeStart.x) / resizeStart.scale;
        const dy = (e.clientY - resizeStart.y) / resizeStart.scale;
        const { crop } = resizeStart;
        const w = clamp(crop.sw + dx, 40, active.width - crop.sx);
        const h = clamp(crop.sh + dy, 40, active.height - crop.sy);
        patchActive({ freeCrop: { x: crop.sx, y: crop.sy, w, h }, zoom: 1, pan: { x: 0, y: 0 } });
        return;
      }
      if (!dragging || !dragStart || !active) return;
      patchActive({ pan: { x: clamp(dragStart.pan.x + (e.clientX - dragStart.x) / dragStart.maxX, -1, 1), y: clamp(dragStart.pan.y + (e.clientY - dragStart.y) / dragStart.maxY, -1, 1) } });
    };
    return <div className={`stage ${dropZone === 'stage' ? 'drag-over' : ''}`} ref={stageRef}
      onDragEnter={e => { e.preventDefault(); setDropZone('stage'); }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropZone(''); }}
      onDrop={e => handleDrop(e, 'stage')}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => { setDragging(false); setDragStart(null); setResizeStart(null); }} onPointerCancel={() => { setDragging(false); setDragStart(null); setResizeStart(null); }} onWheel={e => { if (active) { e.preventDefault(); setZoomValue(zoom + (e.deltaY < 0 ? .05 : -.05)); } }}>
      {active ? <>
        <div className={`print-sheet mode-${selectedMode}`} style={sheetStyle}>
          <img className="stage-photo" src={active.url} style={imageStyle} draggable="false" />
          {selectedMode !== 'fit' && <div className="crop-shade" aria-hidden="true" />}{selectedMode === 'free' && <button className="free-resize-handle" aria-label="Keisti laisvo kadravimo dydį" onPointerDown={beginFreeResize} onClick={e => e.stopPropagation()} />}
        </div>
        <div className="stage-hint"><Move size={14}/> {selectedMode === 'fit' ? 'Vilkite nuotrauką ir priartinkite, kad sumažintumėte baltus kraštus' : selectedMode === 'free' ? 'Vilkite nuotrauką pozicijai keisti, tempkite apatinį dešinį kampą kadrui keisti' : 'Vilkite nuotrauką norėdami pakeisti jos poziciją'}</div>
        <div className="zoom-control"><button onClick={e => { e.stopPropagation(); setZoomValue(zoom - .1); }}><ZoomOut size={17}/></button><span>{Math.round(zoom * 100)}%</span><button onClick={e => { e.stopPropagation(); setZoomValue(zoom + .1); }}><ZoomIn size={17}/></button></div>
      </> : <div className="empty-stage"><Images size={48}/><b>Įkelkite nuotraukas</b><span>Pasirinkite vieną ar daugiau JPG, PNG, HEIC arba TIFF failų</span><button className="primary" onClick={() => fileRef.current?.click()}><ImagePlus size={17}/> Įkelti nuotraukas</button></div>}
    </div>;
  };

  const loadQualityImage = async file => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|bmp|tiff?)$/i.test(file.type) && !/\.(jpe?g|png|webp|bmp|tif|tiff)$/i.test(file.name)) {
      setMessage('Nuotraukų kokybės bandymui pasirink JPG, PNG, WEBP, BMP arba TIFF failą.'); return;
    }
    try {
      const decoded = await decodeFile(file);
      setQualityImage({ ...decoded, name: file.name });
      setQualityResult(null); setQualityStatus('idle'); setQualityProgress('');
    } catch (error) { setMessage(`Nepavyko įkelti nuotraukos: ${error.message}`); }
  };

  const makeQualityCrop = () => {
    if (!qualityImage) return null;
    const [a,b] = qualityDimensions;
    const ratio = a / b;
    const iw = qualityImage.width, ih = qualityImage.height;
    let cw = iw, ch = ih;
    if (iw / ih > ratio) cw = ih * ratio; else ch = iw / ratio;
    cw /= qualityCropZoom; ch /= qualityCropZoom;
    const maxX = Math.max(0, (iw-cw)/2), maxY = Math.max(0, (ih-ch)/2);
    const cx = iw/2 + qualityPan.x*maxX, cy = ih/2 + qualityPan.y*maxY;
    const sx = clamp(cx-cw/2,0,iw-cw), sy = clamp(cy-ch/2,0,ih-ch);
    const canvas = document.createElement('canvas'); canvas.width=Math.max(1,Math.round(cw)); canvas.height=Math.max(1,Math.round(ch));
    canvas.getContext('2d').drawImage(qualityImage.image,sx,sy,cw,ch,0,0,canvas.width,canvas.height);
    return canvas;
  };

  const runQualityAnalysis = async () => {
    if (!qualityImage || qualityStatus === 'running' || !selectedIqaModels.length) return;
    setQualityStatus('loading'); setQualityProgress('Paruošiamas apkirptas spaudos kadras…');
    try {
      const cropCanvas = makeQualityCrop();
      const croppedImage = await new Promise((resolve,reject)=>cropCanvas.toBlob(async blob=>{ if(!blob) return reject(new Error('Nepavyko paruošti apkirpto vaizdo.')); try { const decoded=await blobToImage(blob); resolve(decoded.image); } catch(e){reject(e);} },'image/png'));
      const results = [];
      for (let i=0;i<selectedIqaModels.length;i++) {
        const id=selectedIqaModels[i], cfg=IQA_MODELS[id];
        setQualityStatus('running');
        setQualityProgress(`${cfg.label}: ${i+1}/${selectedIqaModels.length}. Modelio paruošimas / atsisiuntimas…`);
        const session=await loadIqaModel(id,(part,value)=>setQualityProgress(`${cfg.label}: ${part==='model'?'modelis':'svoriai'} ${value==null?'atsisiunčiami':value+'%'}`));
        setQualityProgress(`${cfg.label}: analizuojamas APKIRPTAS kadras…`);
        const tensor=imageToDbcnnTensor(croppedImage);
        const output=await session.run({[session.inputNames[0]]:tensor});
        const raw=Number(output[session.outputNames[0]].data[0]);
        results.push({id,label:cfg.label,score:raw});
      }
      const grid=calculateSharpnessGrid(croppedImage);
      const [wCm,hCm]=qualityDimensions;
      const dpiX=cropCanvas.width/(wCm/2.54), dpiY=cropCanvas.height/(hCm/2.54);
      setQualityResult({models:results,grid,dpiX,dpiY,width:cropCanvas.width,height:cropCanvas.height,weakTiles:grid.filter(t=>t.weak).length,analyzedAt:new Date().toISOString()});
      setQualityStatus('done'); setQualityProgress('Analizė baigta. Visi pasirinkti modeliai vertino tik apkirptą spaudos kadrą.');
    } catch(error) { console.error('IQA analysis error:',error); setQualityStatus('error'); setQualityProgress(`AI analizė nepavyko: ${error.message||'nežinoma klaida'}`); }
  };

  const qualityTabView = <main className="quality-workspace">
    <section className="quality-control-panel">
      <div className="panel-title">1. Nuotrauka</div>
      <button className="quality-upload" onClick={() => qualityFileRef.current?.click()}><ImagePlus size={19}/><span>{qualityImage ? 'Pakeisti nuotrauką' : 'Įkelti vieną nuotrauką'}</span></button>
      {qualityImage && <div className="quality-file-name">{qualityImage.name}<small>{qualityImage.width.toLocaleString('lt-LT')} × {qualityImage.height.toLocaleString('lt-LT')} px</small></div>}
      <div className="section-divider"/><div className="panel-title">2. Spaudos tipas</div>
      <div className="quality-type-options"><button className={qualityPrintType === 'photo' ? 'selected' : ''} onClick={() => setQualityPrintType('photo')}>Foto spauda</button><button className={qualityPrintType === 'wide' ? 'selected' : ''} onClick={() => setQualityPrintType('wide')}>Platiaformatė spauda</button></div>
      <div className="panel-title quality-subtitle">3. Spaudos matmenys (cm)</div>
      {qualityPrintType === 'photo' && <div className="select-wrap"><select value={FORMATS.find(f => f.cm[0] === qualityDimensions[0] && f.cm[1] === qualityDimensions[1])?.id || 'custom'} onChange={e => { const f = FORMATS.find(x => x.id === e.target.value); if (f) setQualityDimensions([...f.cm]); }}>{FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}<option value="custom">Pagal skaičius</option></select></div>}
      <div className="custom-format-fields quality-dimensions"><input type="number" min="1" max="300" step="0.1" value={qualityDimensions[0]} onChange={e => setQualityDimensions([Math.max(1, Number(e.target.value) || 1), qualityDimensions[1]])}/><span>×</span><input type="number" min="1" max="300" step="0.1" value={qualityDimensions[1]} onChange={e => setQualityDimensions([qualityDimensions[0], Math.max(1, Number(e.target.value) || 1)])}/></div>
      <div className="section-divider"/><div className="panel-title">4. AI modeliai</div><div className="iqa-model-list">{Object.entries(IQA_MODELS).map(([id,m])=><label key={id}><input type="checkbox" checked={selectedIqaModels.includes(id)} onChange={e=>setSelectedIqaModels(prev=>e.target.checked?[...prev,id]:prev.filter(x=>x!==id))}/><span><b>{m.label}</b><small>{m.size}</small></span></label>)}</div><small className="iqa-note">Galima pasirinkti vieną arba kelis. Pasirinkus kelis, jie vykdomi paeiliui. Visų modelių atsisiuntimas gali viršyti 1 GB.</small><div className="panel-title quality-subtitle">5. Kadravimo priartinimas</div><input type="range" min="1" max="3" step="0.05" value={qualityCropZoom} onChange={e=>setQualityCropZoom(Number(e.target.value))}/><small className="iqa-note">{Math.round(qualityCropZoom*100)}% · keiskite kadro padėtį žemiau</small><label className="iqa-pan">Horizontaliai <input type="range" min="-1" max="1" step="0.01" value={qualityPan.x} onChange={e=>setQualityPan(p=>({...p,x:Number(e.target.value)}))}/></label><label className="iqa-pan">Vertikaliai <input type="range" min="-1" max="1" step="0.01" value={qualityPan.y} onChange={e=>setQualityPan(p=>({...p,y:Number(e.target.value)}))}/></label>
      <button className="primary quality-run" onClick={runQualityAnalysis} disabled={!qualityImage || !selectedIqaModels.length || ['loading','running'].includes(qualityStatus)}>{['loading','running'].includes(qualityStatus) ? <Loader2 className="spin" size={16}/> : <Sparkles size={16}/>} {qualityStatus === 'done' ? 'Analizuoti dar kartą' : 'Analizuoti nuotrauką'}</button>
      <div className={`quality-progress ${qualityStatus}`}>{qualityProgress || 'Nuotrauka nebus siunčiama į serverį. Analizė vyksta šiame įrenginyje.'}</div>
    </section>
    <section className="quality-preview-panel">
      <div className="quality-preview-heading"><div><b>Kadras, kuris bus siunčiamas AI analizei</b><span>Formato proporcijomis apkirptas vaizdas · keiskite priartinimą prieš analizę</span></div>{qualityResult && <span className="quality-score">{qualityResult.models.length} modeliai baigė</span>}</div>
      <div className="quality-preview-stage">{qualityImage ? <div className="quality-image-wrap quality-crop-wrap" style={{aspectRatio:`${qualityDimensions[0]}/${qualityDimensions[1]}`}}><img src={qualityImage.url} alt="Apkirpimo peržiūra" style={{width:`${qualityCropZoom*100}%`,height:`${qualityCropZoom*100}%`,maxWidth:'none',maxHeight:'none',objectFit:'cover',transform:`translate(${qualityPan.x*25}%,${qualityPan.y*25}%)`}}/>{qualityResult && <div className="quality-grid-overlay">{qualityResult.grid.map(tile => <div key={`${tile.x}-${tile.y}`} className={tile.weak ? 'weak' : ''} style={{ left: `${tile.x * 33.333}%`, top: `${tile.y * 33.333}%`, width: '33.333%', height: '33.333%' }}>{tile.weak && <span>Galimas ryškumo trūkumas</span>}</div>)}</div>}</div> : <div className="empty-stage"><Images size={48}/><b>Įkelkite nuotrauką analizei</b><span>Šiame bandyme vertinsime vieną nuotrauką vienu metu.</span><button className="primary" onClick={() => qualityFileRef.current?.click()}><ImagePlus size={17}/> Įkelti nuotrauką</button></div>}</div>
      {qualityResult && <><div className="quality-results">{qualityResult.models.map(m=><div className="quality-result-card" key={m.id}><small>{m.label} AI įvertinimas</small><b>{m.score.toFixed(4)}</b><span>Neapdorotas modelio balas. Skirtingų modelių skalės nesulyginamos.</span></div>)}<div className="quality-result-card"><small>Apkirpto kadro raiška</small><b>{Math.round(Math.min(qualityResult.dpiX,qualityResult.dpiY))} DPI</b><span>{qualityResult.width} × {qualityResult.height} px pagal {qualityDimensions.join(' × ')} cm</span></div><div className="quality-result-card"><small>Galimos silpnesnės sritys</small><b>{qualityResult.weakTiles} / 9</b><span>Lokali ryškumo heuristika</span></div></div></>}
      <div className="quality-disclaimer"><AlertTriangle size={15}/> Pirmasis prototipas. Pasirinkti NR-IQA modeliai vertina apkirptą kadrą. Jų balai yra skirtingų skalių, todėl tiesiogiai tarpusavyje nelyginami. Pažymėtos sritys nustatomos papildomu vaizdo ryškumo algoritmu. Tai dar nėra patvirtintas spaudos tinkamumo verdiktas.</div>
    </section>
    <input ref={qualityFileRef} type="file" accept=".jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff,image/*" hidden onChange={e => { loadQualityImage(e.target.files?.[0]); e.target.value = ''; }}/>
  </main>;

  const currentFormatId = active?.format || format;
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-icon"><Camera size={21}/></div><span>Foto inspektorius</span></div><nav className="tabs"><button className={`tab ${activeTab === 'crop' ? 'active' : ''}`} onClick={() => setActiveTab('crop')}><Crop size={17}/> Kadravimas</button><button className={`tab ${activeTab === 'quality' ? 'active' : ''}`} onClick={() => setActiveTab('quality')}><Images size={17}/> Nuotraukos kokybė</button></nav>{activeTab === 'crop' && <div className="top-actions"><span className="batch-count">{photos.length ? `Nuotraukų partija · ${photos.length} fail.` : 'Nauja nuotraukų partija'}</span><button className="icon-button" title="Kokybės nustatymai" onClick={() => setSettingsOpen(true)}><Settings2 size={19}/></button><button className="download-button" onClick={exportAll} disabled={!photos.length || busy}><Download size={17}/> Atsisiųsti viską <span className="zip-pill">ZIP</span></button></div>}</header>
    {activeTab === 'quality' ? qualityTabView : <><main className="workspace">
      <aside className="left-panel"><div className="panel-title">1. Spausdinimo formatas</div><div className="select-wrap format-select"><select value={currentFormatId} disabled={selectedMode === 'free'} onChange={e => changeFormat(e.target.value)}>{FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}<option value="custom">Pagal skaičius</option></select></div>
        <div className="custom-format"><div className="custom-format-title">Rankinis formatas</div><div className="custom-format-fields"><input disabled={selectedMode === "free"} aria-label="Pirmas matmuo centimetrais" type="number" min="0.1" max="300" step="0.1" value={customCm[0]} onChange={e => changeCustom(0, e.target.value)}/><span>×</span><input disabled={selectedMode === "free"} aria-label="Antras matmuo centimetrais" type="number" min="0.1" max="300" step="0.1" value={customCm[1]} onChange={e => changeCustom(1, e.target.value)}/></div></div>
        <div className="section-divider"/><div className="panel-title">2. Kadravimo tipas</div><div className="mode-list"><button className={selectedMode === 'crop' ? 'mode selected' : 'mode'} onClick={() => { setMode('crop'); if (active) patchActive({ mode: 'crop' }); }}><Crop/><span>Kadravimas</span></button><button className={selectedMode === 'fit' ? 'mode selected' : 'mode'} onClick={() => { setMode('fit'); if (active) patchActive({ mode: 'fit' }); }}><Square/><span>Įtalpinta</span></button><button className={selectedMode === 'real' ? 'mode selected' : 'mode'} onClick={() => { setMode('real'); if (active) patchActive({ mode: 'real' }); }}><Ruler/><span>Real Size<small>320 DPI</small></span></button><button className={selectedMode === 'free' ? 'mode selected' : 'mode'} onClick={() => { setMode('free'); if (active) patchActive({ mode: 'free', zoom: 1, pan: { x: 0, y: 0 }, freeCrop: { x: 0, y: 0, w: active.width, h: active.height } }); }}><Crop/><span>Laisvas</span></button></div><button className="apply-all-button" onClick={() => applyModeToAll(selectedMode)} disabled={!photos.length}>Taikyti visoms nuotraukoms</button>
        <div className="section-divider"/><div className="panel-title">3. Eksportas</div><div className="select-wrap"><select value={exportFormat} onChange={e => setExportFormat(e.target.value)}><option value="jpg">JPG</option><option value="tif">TIFF · 8 bitų · Lossless</option></select></div></aside>
      <section className="editor-column"><div className="editor-toolbar"><div className="photo-title-group"><div className="photo-name">{active?.name || 'Nuotrauka nepasirinkta'}</div><div className="image-metrics toolbar-metrics">{metrics && <><span><b>{metrics.widthPx.toLocaleString('lt-LT')} × {metrics.heightPx.toLocaleString('lt-LT')} px</b></span><span>{metrics.size}</span><span><b>{metrics.dpi}</b></span><span className={`quality-indicator ${metrics.qualityClass}`} title={metrics.targetDpi ? `Tikslas: ${metrics.targetDpi} DPI` : 'Laisvam formatui kokybė pagal spaudos dydį neskaičiuojama'}>Kokybė: <b>{metrics.quality}</b></span></>}</div></div><div className="editor-nav"><button onClick={() => { const i = photos.findIndex(p => p.id === activeId); if (i > 0) navigateTo(photos[i - 1].id); }} disabled={!active || photos.findIndex(p => p.id === activeId) === 0}><ChevronLeft size={17}/> Ankstesnė</button><span>{active ? `${photos.findIndex(p => p.id === activeId) + 1} iš ${photos.length}` : '0 iš 0'}</span><button onClick={() => { const i = photos.findIndex(p => p.id === activeId); if (i < photos.length - 1) navigateTo(photos[i + 1].id); }} disabled={!active || photos.findIndex(p => p.id === activeId) === photos.length - 1}>Kita <ChevronRight size={17}/></button></div></div>
        {renderStage()}<div className="editor-footer"><div className="orientation-control"><span>Orientacija</span><div className="segmented"><button className={selectedOrientation === 'auto' ? 'active' : ''} onClick={() => patchActive({ orientation: 'auto' })}>Automatinė</button><button className={selectedOrientation === 'vertical' ? 'active' : ''} onClick={() => patchActive({ orientation: 'vertical' })}>Vertikali</button><button className={selectedOrientation === 'horizontal' ? 'active' : ''} onClick={() => patchActive({ orientation: 'horizontal' })}>Horizontali</button></div></div><div className="footer-actions"><button className="secondary" onClick={reset} disabled={!active}><RotateCcw size={16}/> Atstatyti</button><button className="secondary" onClick={exportCurrent} disabled={!active}><Download size={16}/> Atsisiųsti šią nuotrauką</button></div></div></section>
    </main>
    <section className={`filmstrip ${dropZone === 'strip' ? 'drag-over' : ''}`}
      onDragEnter={e => { e.preventDefault(); setDropZone('strip'); }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropZone(''); }}
      onDrop={e => handleDrop(e, 'strip')}><div className="strip-head"><div><b>Nuotraukų eilė</b><span>{photos.length} nuotraukos</span></div><div className="strip-tools"><button onClick={() => fileRef.current?.click()}><ImagePlus size={16}/> Pridėti</button><button onClick={() => { photos.forEach(p => URL.revokeObjectURL(p.url)); setPhotos([]); setActiveId(null); }}>Išvalyti partiją</button></div></div><div className="strip-body"><button className="strip-arrow" onClick={() => stripRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}><ChevronLeft/></button><div className="thumb-list" ref={stripRef} onWheel={e => { if (stripRef.current) { e.preventDefault(); stripRef.current.scrollLeft += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX; } }}>{photos.map((p, i) => <div key={p.id} className={`thumb-card ${p.id === activeId ? 'active' : ''}`}><button className="thumb-select" onClick={() => navigateTo(p.id)}><div className={`thumb-image status-${p.status}`}><img src={thumbSources.get(p.id) || p.url} /></div><span className="thumb-label">{p.name}</span></button><div className="thumb-copies"><button aria-label={`Mažinti ${p.name} kopijų skaičių`} onClick={() => updatePhoto(p.id, { copies: Math.max(1, (p.copies || 1) - 1) })} disabled={(p.copies || 1) <= 1}>−</button><b>{p.copies || 1}</b><button aria-label={`Didinti ${p.name} kopijų skaičių`} onClick={() => updatePhoto(p.id, { copies: Math.min(99, (p.copies || 1) + 1) })}>＋</button><button className="thumb-delete" title="Pašalinti nuotrauką" aria-label={`Pašalinti ${p.name}`} onClick={() => deletePhoto(p.id)}><Trash2 size={14}/></button></div></div>)}</div><button className="strip-arrow" onClick={() => stripRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}><ChevronRight/></button></div><div className="strip-bottom"><div className="strip-message">{busy ? <><Loader2 className="spin" size={14}/>{message}</> : message}</div></div></section>
    </>}
    {settingsOpen && activeTab === 'crop' && <div className="settings-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSettingsOpen(false); }}>
      <section className="quality-settings" role="dialog" aria-modal="true" aria-label="Kokybės nustatymai">
        <div className="settings-heading"><div><b>Spausdinimo kokybės skalė</b><small>Keiskite tikslinę raišką pagal fizinį spaudinio dydį</small></div><button onClick={() => setSettingsOpen(false)}>✕</button></div>
        <div className="quality-table"><div className="quality-table-head"><span>Formatas</span><span>Ilgoji kraštinė (cm)</span><span>Tikslas (DPI)</span></div>
          {qualityScale.map((row, index) => <div className="quality-table-row" key={row.id || index}><span>{row.label}</span><input type="number" min="1" max="500" value={row.size} onChange={e => setQualityScale(prev => prev.map((r,i) => i === index ? {...r,size: clamp(Number(e.target.value)||1,1,500)} : r))}/><input type="number" min="30" max="600" value={row.dpi} onChange={e => setQualityScale(prev => prev.map((r,i) => i === index ? {...r,dpi: clamp(Number(e.target.value)||30,30,600)} : r))}/></div>)}
        </div>
        <div className="settings-note">Tarp dydžių tikslinė raiška apskaičiuojama tiesine interpoliacija. Vertinimui naudojama mažesnė horizontalios ir vertikalios efektyvios raiškos reikšmė.</div>
        <div className="settings-actions"><button className="secondary" onClick={() => setQualityScale(DEFAULT_QUALITY_SCALE)}>Atkurti pradines reikšmes</button><button className="primary" onClick={() => setSettingsOpen(false)}>Išsaugoti</button></div>
      </section>
    </div>}
    <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp,.bmp,.gif,.heic,.heif,.tif,.tiff,.pdf,application/pdf,image/*" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }}/>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
