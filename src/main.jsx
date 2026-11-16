import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import { heicTo } from 'heic-to';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import * as UTIF from 'utif';
import QualityTab from './quality/QualityTab.jsx';
import TestEditorTab from './TestEditorTab.jsx';
import { useQuality } from './quality/useQuality.js';
import { evaluate } from './quality/engine.js';
import { Camera, ImagePlus, Download, RotateCcw, ChevronLeft, ChevronRight, Crop, Square, Ruler, ZoomIn, ZoomOut, Images, CircleHelp, Settings2, Move, Loader2, Trash2, PencilRuler } from 'lucide-react';
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
    // PDF.js uses 72 PDF points per inch. Render at 300 pixels per inch
    // so the resulting raster has true 300 DPI dimensions for print workflows.
    const viewport = page.getViewport({ scale: 300 / 72 });
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
// Fizinis spaudinio dydis ir efektyvi šaltinio raiška. Naudojama kadravimo įrankių juostoje ir skirsnyje „Nuotraukos kokybė“.
function getPhotoPrint(photo, realDpi = 320) {
  const mode = photo.mode || 'crop';
  const crop = getCrop(photo);
  const sourceWidthPx = Math.max(1, Math.round(crop.sw));
  const sourceHeightPx = Math.max(1, Math.round(crop.sh));
  let widthPx = sourceWidthPx, heightPx = sourceHeightPx;
  if (mode === 'free') return { free: true, mode, widthPx, heightPx, sourceWidthPx, sourceHeightPx };
  const [a, b] = getFormat(photo).cm;
  const portrait = getOrientation(photo);
  const wCm = portrait ? a : b, hCm = portrait ? b : a;
  let dpiX, dpiY;
  if (mode === 'real') {
    // Galutinis failas kuriamas pasirinktu DPI; kokybė vertinama pagal šaltinio pikselius prieš didinimą.
    dpiX = crop.sw / (wCm / 2.54); dpiY = crop.sh / (hCm / 2.54);
    widthPx = Math.round(wCm / 2.54 * realDpi); heightPx = Math.round(hCm / 2.54 * realDpi);
  } else if (mode === 'fit') {
    const target = getTargetRatio(photo);
    widthPx = Math.max(photo.width, Math.ceil(photo.height * target)); heightPx = Math.max(photo.height, Math.ceil(photo.width / target));
    // Priartinant nuotrauka lape didinama, todėl šaltinio taškų tankis krinta tiek pat kartų.
    const enlarge = Math.min(widthPx / photo.width, heightPx / photo.height) * clamp(Number(photo.zoom || 1), 1, 4);
    dpiX = widthPx / enlarge / (wCm / 2.54); dpiY = heightPx / enlarge / (hCm / 2.54);
  } else {
    dpiX = widthPx / (wCm / 2.54); dpiY = heightPx / (hCm / 2.54);
  }
  return { free: false, mode, wCm, hCm, widthPx, heightPx, sourceWidthPx, sourceHeightPx, dpiX, dpiY, effDpi: Math.min(dpiX, dpiY) };
}
function renderPhoto(photo, canvas, { thumbnail = false, realDpi = 320 } = {}) {
  const fmt = getFormat(photo);
  const portrait = getOrientation(photo);
  const [a, b] = fmt.cm;
  const target = getTargetRatio(photo);
  const ctx = canvas.getContext('2d');
  if (photo.mode === 'real') {
    const wCm = portrait ? a : b, hCm = portrait ? b : a;
    canvas.width = Math.round(wCm / 2.54 * realDpi);
    canvas.height = Math.round(hCm / 2.54 * realDpi);
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

function App() {
  const [photos, setPhotos] = useState([]);
  const [tab, setTab] = useState('crop');
  const quality = useQuality(photos);
  const [activeId, setActiveId] = useState(null);
  const [format, setFormat] = useState('10x15');
  const [customCm, setCustomCm] = useState([10, 15]);
  const [mode, setMode] = useState('crop');
  const [realDpi, setRealDpi] = useState(320);
  const [exportFormat, setExportFormat] = useState('jpg');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [dropZone, setDropZone] = useState('');
  const [message, setMessage] = useState('');
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
      if (tab !== 'crop' || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
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
  }, [photos, activeId, tab]);

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
              status: 'new', orientation: 'auto', cutLine: false, zoom: 1, pan: { x: 0, y: 0 },
              freeCrop: { x: 0, y: 0, w: page.width, h: page.height },
              copies: 1, mode, format, customCm,
            });
          }
        } else {
          const decoded = await decodeFile(file);
          added.push({
            id: uid(), name: file.name, originalFile: file, ...decoded,
            status: 'new', orientation: 'auto', cutLine: false, zoom: 1, pan: { x: 0, y: 0 },
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

  const setJpegDpiMetadata = async (blob, dpi) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // Canvas JPEG usually starts with a JFIF APP0 segment. Set its density unit to inches.
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes[3] === 0xe0 &&
        bytes[6] === 0x4a && bytes[7] === 0x46 && bytes[8] === 0x49 && bytes[9] === 0x46) {
      bytes[13] = 1;
      bytes[14] = (dpi >> 8) & 255; bytes[15] = dpi & 255;
      bytes[16] = (dpi >> 8) & 255; bytes[17] = dpi & 255;
      return new Blob([bytes], { type: 'image/jpeg' });
    }
    return blob;
  };

  // 1 px pjovimo kontūras įrašomas į galutinį failą tik tada, kai
  // konkrečiai nuotraukai įjungta parinktis. Peržiūros sluoksnio jis nekeičia.
  const drawExportCutLine = (photo, canvas) => {
    if (photo.mode !== 'real' || !photo.cutLine || canvas.width < 2 || canvas.height < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // The exported canvas is the final crop frame. In FIT mode it is the
    // complete paper/frame (including white margins), not the photo rectangle.
    // Paint exact one-pixel edges rather than a centred stroke, which can be
    // clipped or appear thicker/softer at the canvas boundary.
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, 1);
    ctx.fillRect(0, canvas.height - 1, canvas.width, 1);
    ctx.fillRect(0, 0, 1, canvas.height);
    ctx.fillRect(canvas.width - 1, 0, 1, canvas.height);
    ctx.restore();
  };

  const exportOne = async photo => {
    const canvas = document.createElement('canvas'); renderPhoto(photo, canvas, { realDpi });
    drawExportCutLine(photo, canvas);
    let blob, extension;
    if (exportFormat === 'tif') {
      const ctx = canvas.getContext('2d');
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const tiff = UTIF.encodeImage(rgba, canvas.width, canvas.height);
      blob = new Blob([tiff], { type: 'image/tiff' });
      extension = 'tif';
    } else {
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.98));
      if (photo.mode === 'real') blob = await setJpegDpiMetadata(blob, realDpi);
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
    const print = getPhotoPrint(active, realDpi);
    const { widthPx, heightPx } = print;
    if (print.free) return { widthPx, heightPx, size: 'Laisvas formatas', dpi: '—', quality: 'Nevertinama', qualityClass: 'neutral', targetDpi: null };
    const { wCm, hCm, dpiX, dpiY } = print;
    const result = evaluate({ dpi: Math.min(dpiX, dpiY), cmW: wCm, cmH: hCm, metrics: quality.analysis[active.id]?.metrics, ai: quality.analysis[active.id]?.ai }, quality.cfg);
    const qualityClass = result.level >= 4 ? 'good' : result.level === 3 ? 'warning' : 'bad';
    return { widthPx, heightPx, size: `${wCm} × ${hCm} cm`, dpi: `${Math.round(Math.min(dpiX, dpiY))} DPI`, quality: result.label, qualityClass, targetDpi: Math.round(result.reqGood) };
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
      const freeCrop = selectedMode === 'free' ? getCrop(active) : null;
      const target = getTargetRatio(active);
      const sheetW = Math.min(stageW * 0.88, stageH * 0.82 * target);
      const scale = freeCrop ? sheetW / freeCrop.sw : 1;
      setDragging(true); setDragStart({ x: e.clientX, y: e.clientY, pan: { ...pan }, mode: selectedMode, freeCrop, scale, ...lim });
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
      if (dragStart.mode === 'free' && dragStart.freeCrop) {
        const dx = (e.clientX - dragStart.x) / dragStart.scale;
        const dy = (e.clientY - dragStart.y) / dragStart.scale;
        const crop = dragStart.freeCrop;
        patchActive({ freeCrop: { ...active.freeCrop, x: clamp(crop.sx + dx, 0, active.width - crop.sw), y: clamp(crop.sy + dy, 0, active.height - crop.sh) }, zoom: 1, pan: { x: 0, y: 0 } });
        return;
      }
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

  const currentFormatId = active?.format || format;
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-icon"><Camera size={21}/></div><span>Foto inspektorius</span></div><nav className="tabs"><button className={tab === 'crop' ? 'tab active' : 'tab'} onClick={() => setTab('crop')}><Crop size={17}/> Kadravimas</button><button className={tab === 'quality' ? 'tab active' : 'tab'} onClick={() => setTab('quality')}><Images size={17}/> Nuotraukos kokybė</button><button className={tab === 'test-editor' ? 'tab active' : 'tab'} onClick={() => setTab('test-editor')}><PencilRuler size={17}/> Testinis koregavimas</button></nav><div className="top-actions"><span className="batch-count">{photos.length ? `Nuotraukų partija · ${photos.length} fail.` : 'Nauja nuotraukų partija'}</span><button className="icon-button" title="Kokybės vertinimo nustatymai" onClick={() => setTab('quality')}><Settings2 size={19}/></button><button className="download-button" onClick={exportAll} disabled={!photos.length || busy}><Download size={17}/> Atsisiųsti viską <span className="zip-pill">ZIP</span></button></div></header>
    <main className="workspace" style={tab === 'crop' ? undefined : { display: 'none' }}>
      <aside className="left-panel"><div className="panel-title">1. Spausdinimo formatas</div><div className="select-wrap format-select"><select value={currentFormatId} disabled={selectedMode === 'free'} onChange={e => changeFormat(e.target.value)}>{FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}<option value="custom">Pagal skaičius</option></select></div>
        <div className="custom-format"><div className="custom-format-title">Rankinis formatas</div><div className="custom-format-fields"><input disabled={selectedMode === "free"} aria-label="Pirmas matmuo centimetrais" type="number" min="0.1" max="300" step="0.1" value={customCm[0]} onChange={e => changeCustom(0, e.target.value)}/><span>×</span><input disabled={selectedMode === "free"} aria-label="Antras matmuo centimetrais" type="number" min="0.1" max="300" step="0.1" value={customCm[1]} onChange={e => changeCustom(1, e.target.value)}/></div></div>
        <div className="section-divider"/><div className="panel-title">2. Kadravimo tipas</div><div className="mode-list"><button className={selectedMode === 'crop' ? 'mode selected' : 'mode'} onClick={() => { setMode('crop'); if (active) patchActive({ mode: 'crop' }); }}><Crop/><span>Kadravimas</span></button><button className={selectedMode === 'fit' ? 'mode selected' : 'mode'} onClick={() => { setMode('fit'); if (active) patchActive({ mode: 'fit' }); }}><Square/><span>Įtalpinta</span></button><button className={selectedMode === 'real' ? 'mode selected' : 'mode'} onClick={() => { setMode('real'); if (active) patchActive({ mode: 'real' }); }}><Ruler/><span>Real Size</span></button><button className={selectedMode === 'free' ? 'mode selected' : 'mode'} onClick={() => { setMode('free'); if (active) patchActive({ mode: 'free', zoom: 1, pan: { x: 0, y: 0 }, freeCrop: { x: 0, y: 0, w: active.width, h: active.height } }); }}><Crop/><span>Laisvas</span></button></div><button className="apply-all-button" onClick={() => applyModeToAll(selectedMode)} disabled={!photos.length}>Taikyti visoms nuotraukoms</button>
        <div className="section-divider"/><div className="panel-title">3. Eksportas</div><div className="select-wrap"><select value={exportFormat} onChange={e => setExportFormat(e.target.value)}><option value="jpg">JPG</option><option value="tif">TIFF · 8 bitų · Lossless</option></select></div></aside>
      <section className="editor-column"><div className="editor-toolbar"><div className="photo-title-group"><div className="photo-name">{active?.name || 'Nuotrauka nepasirinkta'}</div>{selectedMode === 'real' && <div className="real-dpi-picker" role="group" aria-label="Eksporto raiška"><span>DPI</span><button className={realDpi === 320 ? 'active' : ''} onClick={() => setRealDpi(320)}>320</button><button className={realDpi === 300 ? 'active' : ''} onClick={() => setRealDpi(300)}>300</button></div>}<div className="image-metrics toolbar-metrics">{metrics && <><span><b>{metrics.widthPx.toLocaleString('lt-LT')} × {metrics.heightPx.toLocaleString('lt-LT')} px</b></span><span>{metrics.size}</span><span><b>{metrics.dpi}</b></span><span className={`quality-indicator ${metrics.qualityClass}`} title={metrics.targetDpi ? `Tikslas: ${metrics.targetDpi} DPI` : 'Laisvam formatui kokybė pagal spaudos dydį neskaičiuojama'}>Kokybė: <b>{metrics.quality}</b></span>{selectedMode === 'real' && active && <button type="button" className={`cutline-switch ${active.cutLine ? 'is-on' : 'is-off'}`} role="switch" aria-checked={!!active.cutLine} aria-label="Pjovimo linijos" disabled={busy} onClick={() => patchActive({ cutLine: !active.cutLine })}><span className="cutline-switch-track"><span/></span><span>Pjovimo linijos</span></button>}</>}</div></div><div className="editor-nav"><button onClick={() => { const i = photos.findIndex(p => p.id === activeId); if (i > 0) navigateTo(photos[i - 1].id); }} disabled={!active || photos.findIndex(p => p.id === activeId) === 0}><ChevronLeft size={17}/> Ankstesnė</button><span>{active ? `${photos.findIndex(p => p.id === activeId) + 1} iš ${photos.length}` : '0 iš 0'}</span><button onClick={() => { const i = photos.findIndex(p => p.id === activeId); if (i < photos.length - 1) navigateTo(photos[i + 1].id); }} disabled={!active || photos.findIndex(p => p.id === activeId) === photos.length - 1}>Kita <ChevronRight size={17}/></button></div></div>
        {renderStage()}<div className="editor-footer"><div className="orientation-control"><span>Orientacija</span><div className="segmented"><button className={selectedOrientation === 'auto' ? 'active' : ''} onClick={() => patchActive({ orientation: 'auto' })}>Automatinė</button><button className={selectedOrientation === 'vertical' ? 'active' : ''} onClick={() => patchActive({ orientation: 'vertical' })}>Vertikali</button><button className={selectedOrientation === 'horizontal' ? 'active' : ''} onClick={() => patchActive({ orientation: 'horizontal' })}>Horizontali</button></div></div><div className="footer-actions"><button className="secondary" onClick={reset} disabled={!active}><RotateCcw size={16}/> Atstatyti</button><button className="secondary" onClick={exportCurrent} disabled={!active}><Download size={16}/> Atsisiųsti šią nuotrauką</button></div></div></section>
    </main>
    {tab === 'test-editor' && <TestEditorTab source={active?.url || null} sourceName={active?.name || ''} />}
    {tab === 'quality' && <QualityTab photos={photos} thumbs={thumbSources} getPrint={p => getPhotoPrint(p, realDpi)} quality={quality} activeId={activeId} appMessage={message} onOpen={id => { setTab('crop'); if (id !== activeId) navigateTo(id); }} />}
    <section className={`filmstrip ${dropZone === 'strip' ? 'drag-over' : ''}`} style={tab === 'crop' ? undefined : { display: 'none' }}
      onDragEnter={e => { e.preventDefault(); setDropZone('strip'); }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropZone(''); }}
      onDrop={e => handleDrop(e, 'strip')}><div className="strip-head"><div><b>Nuotraukų eilė</b><span>{photos.length} nuotraukos</span></div><div className="strip-tools"><button onClick={() => fileRef.current?.click()}><ImagePlus size={16}/> Pridėti</button><button onClick={() => { photos.forEach(p => URL.revokeObjectURL(p.url)); setPhotos([]); setActiveId(null); }}>Išvalyti partiją</button></div></div><div className="strip-body"><button className="strip-arrow" onClick={() => stripRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}><ChevronLeft/></button><div className="thumb-list" ref={stripRef} onWheel={e => { if (stripRef.current) { e.preventDefault(); stripRef.current.scrollLeft += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX; } }}>{photos.map((p, i) => <div key={p.id} className={`thumb-card ${p.id === activeId ? 'active' : ''}`}><button className="thumb-select" onClick={() => navigateTo(p.id)}><div className={`thumb-image status-${p.status}`}><img src={thumbSources.get(p.id) || p.url} /></div><span className="thumb-label">{p.name}</span></button><div className="thumb-copies"><button aria-label={`Didinti ${p.name} kopijų skaičių`} onClick={() => updatePhoto(p.id, { copies: Math.min(99, (p.copies || 1) + 1) })}>＋</button><b>{p.copies || 1}</b><button aria-label={`Mažinti ${p.name} kopijų skaičių`} onClick={() => updatePhoto(p.id, { copies: Math.max(1, (p.copies || 1) - 1) })} disabled={(p.copies || 1) <= 1}>−</button><button className="thumb-delete" title="Pašalinti nuotrauką" aria-label={`Pašalinti ${p.name}`} onClick={() => deletePhoto(p.id)}><Trash2 size={14}/></button></div></div>)}</div><button className="strip-arrow" onClick={() => stripRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}><ChevronRight/></button></div><div className="strip-bottom"><div className="strip-message">{busy ? <><Loader2 className="spin" size={14}/>{message}</> : message}</div></div></section>
    <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp,.bmp,.gif,.heic,.heif,.tif,.tiff,.pdf,application/pdf,image/*" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }}/>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
