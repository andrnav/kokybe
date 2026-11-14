import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import heic2any from 'heic2any';
import * as UTIF from 'utif';
import { Camera, ImagePlus, Download, RotateCcw, ChevronLeft, ChevronRight, Crop, Square, Ruler, ZoomIn, ZoomOut, Images, CircleHelp, Settings2, Move, Loader2 } from 'lucide-react';
import './style.css';

const FORMATS = [
  { id: '10x15', label: '10 × 15 cm', ratioLabel: '2:3', cm: [10, 15] },
  { id: '15x30', label: '15 × 30 cm', ratioLabel: '1:2', cm: [15, 30] },
  { id: '15x15', label: '15 × 15 cm', ratioLabel: '1:1', cm: [15, 15] },
  { id: 'a4', label: 'A4', ratioLabel: '21 × 29,7 cm', cm: [21, 29.7] },
];
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const round1 = n => Math.round(n * 10) / 10;

async function decodeFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  let blob = file;
  if (['heic', 'heif'].includes(ext)) {
    const converted = await heic2any({ blob: file, toType: 'image/png' });
    blob = Array.isArray(converted) ? converted[0] : converted;
  } else if (['tif', 'tiff'].includes(ext)) {
    const buffer = await file.arrayBuffer();
    const ifds = UTIF.decode(buffer);
    UTIF.decodeImage(buffer, ifds[0]);
    const rgba = UTIF.toRGBA8(ifds[0]);
    const canvas = document.createElement('canvas');
    canvas.width = ifds[0].width; canvas.height = ifds[0].height;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), canvas.width, canvas.height), 0, 0);
    blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  }
  const url = URL.createObjectURL(blob);
  const image = await new Promise((resolve, reject) => {
    const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = url;
  });
  return { url, image, width: image.naturalWidth, height: image.naturalHeight };
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
  if (photo.mode === 'free') return photo.width / photo.height;
  const [a, b] = getFormat(photo).cm;
  const portrait = getOrientation(photo);
  return portrait ? a / b : b / a;
}
function getCrop(photo) {
  if (photo.mode === 'free') {
    const zoom = clamp(Number(photo.zoom || 1), 1, 4);
    const sw = photo.width / zoom, sh = photo.height / zoom;
    const maxX = Math.max(0, (photo.width - sw) / 2), maxY = Math.max(0, (photo.height - sh) / 2);
    const cx = photo.width / 2 + clamp(Number(photo.pan?.x || 0), -1, 1) * maxX;
    const cy = photo.height / 2 + clamp(Number(photo.pan?.y || 0), -1, 1) * maxY;
    return { sx: cx - sw / 2, sy: cy - sh / 2, sw, sh, baseW: photo.width, baseH: photo.height, target: photo.width / photo.height };
  }
  const target = getTargetRatio(photo);
  const iw = photo.width, ih = photo.height;
  let baseW, baseH;
  if (iw / ih > target) { baseH = ih; baseW = ih * target; }
  else { baseW = iw; baseH = iw / target; }
  const zoom = clamp(Number(photo.zoom || 1), 1, photo.mode === 'free' ? 4 : 3);
  const sw = baseW / zoom, sh = baseH / zoom;
  const maxX = Math.max(0, (iw - sw) / 2), maxY = Math.max(0, (ih - sh) / 2);
  const cx = iw / 2 + clamp(Number(photo.pan?.x || 0), -1, 1) * maxX;
  const cy = ih / 2 + clamp(Number(photo.pan?.y || 0), -1, 1) * maxY;
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
  const [message, setMessage] = useState('');
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
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
    setPhotos(prev => prev.map(p => ({ ...p, format: id, customCm: f?.cm || p.customCm, status: p.status === 'done' ? 'editing' : p.status })));
  };
  const changeCustom = (index, raw) => {
    const value = clamp(Number(raw) || 0.1, 0.1, 300);
    const next = [...customCm]; next[index] = round1(value);
    setCustomCm(next); setFormat('custom');
    setPhotos(prev => prev.map(p => ({ ...p, format: 'custom', customCm: next, status: p.status === 'done' ? 'editing' : p.status })));
  };

  const addFiles = async files => {
    const accepted = Array.from(files).filter(f => /\.(jpe?g|png|webp|bmp|gif|heic|heif|tif|tiff)$/i.test(f.name));
    if (!accepted.length) { setMessage('Pasirink JPG, PNG, WEBP, HEIC arba TIFF nuotraukas.'); return; }
    setBusy(true); setMessage(`Įkeliama ${accepted.length} nuotraukų…`);
    const added = [];
    for (const file of accepted) {
      try { const decoded = await decodeFile(file); added.push({ id: uid(), name: file.name, originalFile: file, ...decoded, status: 'new', orientation: 'auto', zoom: 1, pan: { x: 0, y: 0 }, copies: 1, mode, format, customCm }); }
      catch (e) { console.error(e); }
    }
    setPhotos(prev => [...prev, ...added]);
    if (!activeId && added[0]) setActiveId(added[0].id);
    setBusy(false); setMessage(added.length ? `Įkelta ${added.length} nuotraukų` : 'Nepavyko atidaryti pasirinktų failų.');
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
      downloadBlob(await zip.generateAsync({ type: 'blob' }), 'foto-inspektorius.zip');
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
      const signature = JSON.stringify([p.mode, p.format, p.customCm, p.orientation, p.zoom, p.pan]);
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
    let widthPx = Math.max(1, Math.round(crop.sw));
    let heightPx = Math.max(1, Math.round(crop.sh));
    if (selectedMode === 'free') return { widthPx, heightPx, size: 'Laisvas', dpi: 'Neskaičiuojamas be spausdinimo matmens' };
    const [a, b] = getFormat(active).cm;
    const portrait = getOrientation(active);
    const wCm = portrait ? a : b, hCm = portrait ? b : a;
    if (selectedMode === 'real') {
      widthPx = Math.round(wCm / 2.54 * 320);
      heightPx = Math.round(hCm / 2.54 * 320);
      return { widthPx, heightPx, size: `${wCm} × ${hCm} cm`, dpi: '320 × 320 DPI' };
    }
    if (selectedMode === 'fit') {
      const target = getTargetRatio(active);
      widthPx = Math.max(active.width, Math.ceil(active.height * target));
      heightPx = Math.max(active.height, Math.ceil(active.width / target));
    }
    const dpiX = Math.round(widthPx / (wCm / 2.54));
    const dpiY = Math.round(heightPx / (hCm / 2.54));
    return { widthPx, heightPx, size: `${wCm} × ${hCm} cm`, dpi: `${dpiX} × ${dpiY} DPI` };
  })() : null;

  const renderStage = () => {
    const stageW = stageSizes.main.w, stageH = stageSizes.main.h;
    let sheetStyle = {}, imageStyle = {};
    if (active) {
      const target = getTargetRatio(active);
      const sheetW = Math.min(stageW * 0.88, stageH * 0.82 * target);
      const sheetH = sheetW / target;
      sheetStyle = { width: sheetW, height: sheetH };
      const baseScale = selectedMode === 'fit'
        ? Math.min(sheetW / active.width, sheetH / active.height)
        : Math.max(sheetW / active.width, sheetH / active.height);
      const renderedW = active.width * baseScale, renderedH = active.height * baseScale;
      const maxX = Math.max(0, (renderedW * zoom - sheetW) / 2);
      const maxY = Math.max(0, (renderedH * zoom - sheetH) / 2);
      imageStyle = { width: renderedW, height: renderedH, left: `calc(50% + ${pan.x * maxX}px)`, top: `calc(50% + ${pan.y * maxY}px)`, transform: `translate(-50%, -50%) scale(${zoom})`, objectFit: 'fill' };
    }
    const getMoveLimits = () => {
      const target = getTargetRatio(active);
      const sheetW = Math.min(stageW * 0.88, stageH * 0.82 * target), sheetH = sheetW / target;
      const baseScale = selectedMode === 'fit' ? Math.min(sheetW / active.width, sheetH / active.height) : Math.max(sheetW / active.width, sheetH / active.height);
      return { maxX: Math.max(1, (active.width * baseScale * zoom - sheetW) / 2), maxY: Math.max(1, (active.height * baseScale * zoom - sheetH) / 2) };
    };
    const pointerDown = e => {
      if (!active || e.target.closest('.zoom-control')) return;
      e.preventDefault(); const lim = getMoveLimits();
      setDragging(true); setDragStart({ x: e.clientX, y: e.clientY, pan: { ...pan }, ...lim });
      e.currentTarget.setPointerCapture(e.pointerId);
    };
    const pointerMove = e => {
      if (!dragging || !dragStart || !active) return;
      patchActive({ pan: { x: clamp(dragStart.pan.x + (e.clientX - dragStart.x) / dragStart.maxX, -1, 1), y: clamp(dragStart.pan.y + (e.clientY - dragStart.y) / dragStart.maxY, -1, 1) } });
    };
    return <div className="stage" ref={stageRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => { setDragging(false); setDragStart(null); }} onPointerCancel={() => { setDragging(false); setDragStart(null); }} onWheel={e => { if (active) { e.preventDefault(); setZoomValue(zoom + (e.deltaY < 0 ? .05 : -.05)); } }}>
      {active ? <>
        <div className={`print-sheet mode-${selectedMode}`} style={sheetStyle}>
          <img className="stage-photo" src={active.url} style={imageStyle} draggable="false" />
          {selectedMode !== 'fit' && <div className="crop-shade" aria-hidden="true" />}
        </div>
        <div className="stage-hint"><Move size={14}/> {selectedMode === 'fit' ? 'Vilkite nuotrauką ir priartinkite, kad sumažintumėte baltus kraštus' : 'Vilkite nuotrauką norėdami pakeisti jos poziciją'}</div>
        <div className="zoom-control"><button onClick={e => { e.stopPropagation(); setZoomValue(zoom - .1); }}><ZoomOut size={17}/></button><span>{Math.round(zoom * 100)}%</span><button onClick={e => { e.stopPropagation(); setZoomValue(zoom + .1); }}><ZoomIn size={17}/></button></div>
      </> : <div className="empty-stage"><Images size={48}/><b>Įkelkite nuotraukas</b><span>Pasirinkite vieną ar daugiau JPG, PNG, HEIC arba TIFF failų</span><button className="primary" onClick={() => fileRef.current?.click()}><ImagePlus size={17}/> Įkelti nuotraukas</button></div>}
    </div>;
  };

  const currentFormatId = active?.format || format;
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-icon"><Camera size={21}/></div><span>Foto inspektorius</span></div><nav className="tabs"><button className="tab active"><Crop size={17}/> Kadravimas</button><button className="tab disabled" title="Šis skirsnis bus kuriamas vėliau"><Images size={17}/> Nuotraukos kokybė</button></nav><div className="top-actions"><span className="batch-count">{photos.length ? `Nuotraukų partija · ${photos.length} fail.` : 'Nauja nuotraukų partija'}</span><button className="icon-button" title="Nustatymai"><Settings2 size={19}/></button><button className="download-button" onClick={exportAll} disabled={!photos.length || busy}><Download size={17}/> Atsisiųsti viską <span className="zip-pill">ZIP</span></button></div></header>
    <main className="workspace">
      <aside className="left-panel"><div className="panel-title">1. Spausdinimo formatas</div><div className="select-wrap format-select"><select value={currentFormatId} onChange={e => changeFormat(e.target.value)}>{FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}<option value="custom">Pagal skaičius</option></select></div>
        <div className="custom-format"><div className="custom-format-title">Rankinis formatas</div><div className="custom-format-fields"><input aria-label="Pirmas matmuo centimetrais" type="number" min="0.1" max="300" step="0.1" value={customCm[0]} onChange={e => changeCustom(0, e.target.value)}/><span>×</span><input aria-label="Antras matmuo centimetrais" type="number" min="0.1" max="300" step="0.1" value={customCm[1]} onChange={e => changeCustom(1, e.target.value)}/></div></div>
        <div className="section-divider"/><div className="panel-title">2. Kadravimo tipas</div><div className="mode-list"><button className={selectedMode === 'crop' ? 'mode selected' : 'mode'} onClick={() => { setMode('crop'); if (active) patchActive({ mode: 'crop' }); }}><Crop/><span>Kadravimas</span></button><button className={selectedMode === 'fit' ? 'mode selected' : 'mode'} onClick={() => { setMode('fit'); if (active) patchActive({ mode: 'fit' }); }}><Square/><span>Įtalpinta</span></button><button className={selectedMode === 'real' ? 'mode selected' : 'mode'} onClick={() => { setMode('real'); if (active) patchActive({ mode: 'real' }); }}><Ruler/><span>Real Size<small>320 DPI</small></span></button><button className={selectedMode === 'free' ? 'mode selected' : 'mode'} onClick={() => { setMode('free'); if (active) patchActive({ mode: 'free', zoom: 1, pan: { x: 0, y: 0 } }); }}><Crop/><span>Laisvas</span></button></div><button className="apply-all-button" onClick={() => applyModeToAll(selectedMode)} disabled={!photos.length}>Taikyti visoms nuotraukoms</button>
        <div className="section-divider"/><div className="panel-title">3. Eksportas</div><div className="select-wrap"><select value={exportFormat} onChange={e => setExportFormat(e.target.value)}><option value="jpg">JPG</option><option value="tif">TIFF · 8 bitų · Lossless</option></select></div></aside>
      <section className="editor-column"><div className="editor-toolbar"><div className="photo-title-group"><div className="photo-name">{active?.name || 'Nuotrauka nepasirinkta'}</div>{active && <div className="copies-control"><button onClick={() => patchActive({ copies: Math.max(1, (active.copies || 1) - 1) })} disabled={(active.copies || 1) <= 1}>−</button><b>{active.copies || 1}</b><button onClick={() => patchActive({ copies: Math.min(99, (active.copies || 1) + 1) })}>＋</button></div>}</div><div className="editor-nav"><button onClick={() => { const i = photos.findIndex(p => p.id === activeId); if (i > 0) navigateTo(photos[i - 1].id); }} disabled={!active || photos.findIndex(p => p.id === activeId) === 0}><ChevronLeft size={17}/> Ankstesnė</button><span>{active ? `${photos.findIndex(p => p.id === activeId) + 1} iš ${photos.length}` : '0 iš 0'}</span><button onClick={() => { const i = photos.findIndex(p => p.id === activeId); if (i < photos.length - 1) navigateTo(photos[i + 1].id); }} disabled={!active || photos.findIndex(p => p.id === activeId) === photos.length - 1}>Kita <ChevronRight size={17}/></button></div></div>
        {renderStage()}<div className="editor-footer"><div className="orientation-control"><span>Orientacija</span><div className="segmented"><button className={selectedOrientation === 'auto' ? 'active' : ''} onClick={() => patchActive({ orientation: 'auto' })}>Automatinė</button><button className={selectedOrientation === 'vertical' ? 'active' : ''} onClick={() => patchActive({ orientation: 'vertical' })}>Vertikali</button><button className={selectedOrientation === 'horizontal' ? 'active' : ''} onClick={() => patchActive({ orientation: 'horizontal' })}>Horizontali</button></div></div><div className="image-metrics">{metrics && <><span><b>{metrics.widthPx.toLocaleString('lt-LT')} × {metrics.heightPx.toLocaleString('lt-LT')} px</b></span><span>{metrics.size}</span><span><b>{metrics.dpi}</b></span></>}</div><div className="footer-actions"><button className="secondary" onClick={reset} disabled={!active}><RotateCcw size={16}/> Atstatyti</button><button className="secondary" onClick={exportCurrent} disabled={!active}><Download size={16}/> Atsisiųsti šią nuotrauką</button></div></div></section>
    </main>
    <section className="filmstrip"><div className="strip-head"><div><b>Nuotraukų eilė</b><span>{photos.length} nuotraukos</span></div><div className="strip-tools"><button onClick={() => fileRef.current?.click()}><ImagePlus size={16}/> Pridėti</button><button onClick={() => { photos.forEach(p => URL.revokeObjectURL(p.url)); setPhotos([]); setActiveId(null); }}>Išvalyti partiją</button></div></div><div className="strip-body"><button className="strip-arrow" onClick={() => stripRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}><ChevronLeft/></button><div className="thumb-list" ref={stripRef} onWheel={e => { if (stripRef.current) { e.preventDefault(); stripRef.current.scrollLeft += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX; } }}>{photos.map((p, i) => <button key={p.id} className={`thumb ${p.id === activeId ? 'active' : ''}`} onClick={() => navigateTo(p.id)}><div className={`thumb-image status-${p.status}`}><img src={thumbSources.get(p.id) || p.url} /></div><span className="thumb-label">{String(i + 1).padStart(2, '0')}</span></button>)}</div><button className="strip-arrow" onClick={() => stripRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}><ChevronRight/></button></div><div className="strip-bottom"><div className="strip-message">{busy ? <><Loader2 className="spin" size={14}/>{message}</> : message}</div></div></section>
    <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp,.bmp,.gif,.heic,.heif,.tif,.tiff,image/*" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }}/>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
