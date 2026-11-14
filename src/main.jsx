import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import heic2any from 'heic2any';
import * as UTIF from 'utif';
import { Camera, ImagePlus, Download, RotateCcw, Check, ChevronLeft, ChevronRight, Crop, Square, Ruler, Maximize2, ZoomIn, ZoomOut, X, Images, CircleHelp, Settings2, Move, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import './style.css';

const FORMATS = [
  { id: '10x15', label: '10 × 15 cm', ratio: 2 / 3, ratioLabel: '2:3', cm: [10, 15] },
  { id: '15x30', label: '15 × 30 cm', ratio: 1 / 2, ratioLabel: '1:2', cm: [15, 30] },
  { id: '15x15', label: '15 × 15 cm', ratio: 1, ratioLabel: '1:1', cm: [15, 15] },
  { id: 'a4', label: 'A4', ratio: 21 / 29.7, ratioLabel: '21 × 29,7 cm', cm: [21, 29.7] },
];
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

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

function cropSettings(photo) {
  const fmt = FORMATS.find(f => f.id === photo.format) || FORMATS[0];
  const orientation = photo.orientation || 'auto';
  const portrait = orientation === 'vertical' || (orientation === 'auto' && photo.height >= photo.width);
  return { fmt, portrait, target: portrait ? fmt.ratio : 1 / fmt.ratio };
}

// One source of truth for preview, thumbnails and exported pixels.
function getSourceCrop(photo) {
  const { target } = cropSettings(photo);
  const iw = photo.width, ih = photo.height;
  let baseW, baseH;
  if (iw / ih > target) { baseH = ih; baseW = ih * target; }
  else { baseW = iw; baseH = iw / target; }
  const zoom = clamp(Number(photo.zoom || 1), 1, 3);
  const w = baseW / zoom, h = baseH / zoom;
  const maxX = Math.max(0, (iw - w) / 2), maxY = Math.max(0, (ih - h) / 2);
  const px = clamp(Number(photo.pan?.x || 0), -1, 1);
  const py = clamp(Number(photo.pan?.y || 0), -1, 1);
  const cx = iw / 2 + px * maxX;
  const cy = ih / 2 + py * maxY;
  return { sx: cx - w / 2, sy: cy - h / 2, sw: w, sh: h, baseW, baseH, target };
}

function renderPhoto(photo, canvas, { thumb = false } = {}) {
  const { fmt, portrait, target } = cropSettings(photo);
  const ctx = canvas.getContext('2d');
  if (photo.mode === 'real') {
    const [a, b] = fmt.cm;
    const widthCm = portrait ? a : b;
    const heightCm = portrait ? b : a;
    canvas.width = Math.round(widthCm / 2.54 * 320);
    canvas.height = Math.round(heightCm / 2.54 * 320);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const crop = getSourceCrop(photo);
    ctx.drawImage(photo.image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
    return;
  }
  if (photo.mode === 'fit') {
    const iw = photo.width, ih = photo.height;
    const outW = iw / ih > target ? iw : Math.ceil(ih * target);
    const outH = iw / ih > target ? Math.ceil(iw / target) : ih;
    canvas.width = outW; canvas.height = outH;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(photo.image, Math.round((outW - iw) / 2), Math.round((outH - ih) / 2));
    return;
  }
  const crop = getSourceCrop(photo);
  if (thumb) {
    const max = 320;
    const scale = Math.min(max / crop.sw, max / crop.sh);
    canvas.width = Math.max(1, Math.round(crop.sw * scale));
    canvas.height = Math.max(1, Math.round(crop.sh * scale));
  } else {
    canvas.width = Math.max(1, Math.round(crop.sw));
    canvas.height = Math.max(1, Math.round(crop.sh));
  }
  ctx.drawImage(photo.image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
}

function App() {
  const [photos, setPhotos] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [format, setFormat] = useState('10x15');
  const [mode, setMode] = useState('crop');
  const [orientation, setOrientation] = useState('auto');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [thumbOffset, setThumbOffset] = useState(0);
  const [stageSizes, setStageSizes] = useState({ main: { w: 900, h: 420 }, modal: { w: 1200, h: 650 } });
  const fileRef = useRef(null);
  const stageRef = useRef(null);
  const modalStageRef = useRef(null);
  const stripRef = useRef(null);
  const active = photos.find(p => p.id === activeId) || null;
  const currentFormat = FORMATS.find(f => f.id === format) || FORMATS[0];
  const selectedOrientation = active?.orientation ?? orientation;
  const selectedMode = active?.mode ?? mode;
  const selectedFormat = FORMATS.find(f => f.id === (active?.format || format)) || currentFormat;

  useEffect(() => {
    if (active) { setZoom(active.zoom ?? 1); setPan(active.pan || { x: 0, y: 0 }); setOrientation(active.orientation || 'auto'); setMode(active.mode || 'crop'); }
  }, [activeId]);
  useEffect(() => () => photos.forEach(p => URL.revokeObjectURL(p.url)), []);

  useEffect(() => {
    const observe = (node, key) => {
      if (!node) return () => {};
      const update = () => { const r = node.getBoundingClientRect(); if (r.width && r.height) setStageSizes(s => ({ ...s, [key]: { w: r.width, h: r.height } })); };
      const ro = new ResizeObserver(update); ro.observe(node); update(); return () => ro.disconnect();
    };
    const cleanMain = observe(stageRef.current, 'main');
    const cleanModal = observe(modalStageRef.current, 'modal');
    return () => { cleanMain(); cleanModal(); };
  }, [modal, !!active]);

  const updateActive = useCallback((patch) => {
    setPhotos(prev => prev.map(p => p.id === activeId ? { ...p, ...patch } : p));
  }, [activeId]);

  const addFiles = async files => {
    const accepted = Array.from(files).filter(f => /\.(jpe?g|png|webp|bmp|gif|heic|heif|tif|tiff)$/i.test(f.name));
    if (!accepted.length) { setMessage('Pasirink JPG, PNG, WEBP, HEIC arba TIFF nuotraukas.'); return; }
    setBusy(true); setMessage(`Įkeliama ${accepted.length} nuotraukų…`);
    const added = [];
    for (const file of accepted) {
      try { const decoded = await decodeFile(file); added.push({ id: uid(), name: file.name, originalFile: file, ...decoded, status: 'new', orientation: 'auto', zoom: 1, pan: { x: 0, y: 0 }, mode, format }); }
      catch (e) { console.error(e); }
    }
    setPhotos(prev => [...prev, ...added]);
    if (!activeId && added[0]) setActiveId(added[0].id);
    setBusy(false); setMessage(added.length ? `Įkelta ${added.length} nuotraukų` : 'Nepavyko atidaryti pasirinktų failų.');
  };

  const patchCrop = patch => {
    const next = { ...active, ...patch };
    setZoom(next.zoom ?? 1); setPan(next.pan || { x: 0, y: 0 });
    setPhotos(prev => prev.map(p => p.id === activeId ? { ...p, ...patch, status: 'editing' } : p));
  };
  const setZoomValue = value => patchCrop({ zoom: clamp(value, 1, 3) });
  const changePan = (x, y) => patchCrop({ pan: { x: clamp(x, -1, 1), y: clamp(y, -1, 1) } });
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); setOrientation('auto'); patchCrop({ zoom: 1, pan: { x: 0, y: 0 }, orientation: 'auto' }); };
  const setOrientationForActive = value => { setOrientation(value); patchCrop({ orientation: value }); };
  const confirm = () => { if (active) updateActive({ status: 'done', zoom, pan, orientation: selectedOrientation, mode: selectedMode, format: active.format || format }); };

  const exportOne = async photo => {
    const canvas = document.createElement('canvas'); renderPhoto(photo, canvas);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.98));
    return { name: photo.name.replace(/\.[^.]+$/, '') + '.jpg', blob };
  };
  const downloadBlob = (blob, name) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500); };
  const exportAll = async () => {
    if (!photos.length) return;
    setBusy(true); setMessage('Ruošiami JPEG failai…');
    try { const zip = new JSZip(); for (let i = 0; i < photos.length; i++) { const result = await exportOne(photos[i]); zip.file(result.name, result.blob); setMessage(`Apdorojama ${i + 1} / ${photos.length}`); } downloadBlob(await zip.generateAsync({ type: 'blob' }), 'fotokadravimas.zip'); setMessage('ZIP archyvas paruoštas.'); }
    catch (e) { console.error(e); setMessage('Eksportuojant įvyko klaida.'); }
    setBusy(false);
  };
  const exportCurrent = async () => { if (active) { const r = await exportOne(active); downloadBlob(r.blob, r.name); } };

  const cropPreview = photo => {
    try { const canvas = document.createElement('canvas'); renderPhoto(photo, canvas, { thumb: true }); return canvas.toDataURL('image/jpeg', 0.82); }
    catch { return photo.url; }
  };
  const thumbSources = useMemo(() => {
    const result = new Map();
    photos.forEach(p => result.set(p.id, cropPreview(p)));
    return result;
  }, [photos]);

  const renderStage = (large = false) => {
    const ref = large ? modalStageRef : stageRef;
    const size = stageSizes[large ? 'modal' : 'main'];
    const { w: stageW, h: stageH } = size;
    let imageStyle = {}, frameStyle = {};
    if (active) {
      const { target } = cropSettings({ ...active, orientation: selectedOrientation, format: active.format || format });
      const fitScale = Math.min((stageW * 0.88) / active.width, (stageH * 0.80) / active.height);
      const displayW = active.width * fitScale, displayH = active.height * fitScale;
      const baseCrop = getSourceCrop({ ...active, zoom: 1, pan: { x: 0, y: 0 }, orientation: selectedOrientation, format: active.format || format });
      const cropW = baseCrop.baseW * fitScale, cropH = baseCrop.baseH * fitScale;
      const maxMoveX = Math.max(0, (displayW * zoom - cropW) / 2);
      const maxMoveY = Math.max(0, (displayH * zoom - cropH) / 2);
      imageStyle = { width: displayW, height: displayH, transform: `translate(-50%, -50%) translate(${pan.x * maxMoveX}px, ${pan.y * maxMoveY}px) scale(${zoom})` };
      frameStyle = { width: cropW, height: cropH };
    }
    const pointerDown = e => { if (!active || selectedMode !== 'crop' || e.target.closest('.zoom-control')) return; e.preventDefault(); setDragging(true); setDragStart({ x: e.clientX, y: e.clientY, pan: { ...pan }, rect: e.currentTarget.getBoundingClientRect(), maxX: Math.max(1, (active.width - getSourceCrop(active).sw) / 2), maxY: Math.max(1, (active.height - getSourceCrop(active).sh) / 2) }); e.currentTarget.setPointerCapture(e.pointerId); };
    const pointerMove = e => { if (!dragging || !dragStart || !active) return; const { target } = cropSettings({ ...active, orientation: selectedOrientation, format: active.format || format }); const fitScale = Math.min((stageW * .88) / active.width, (stageH * .8) / active.height); const maxX = Math.max(1, (active.width * fitScale * zoom - frameStyle.width) / 2); const maxY = Math.max(1, (active.height * fitScale * zoom - frameStyle.height) / 2); changePan(dragStart.pan.x + (e.clientX - dragStart.x) / maxX, dragStart.pan.y + (e.clientY - dragStart.y) / maxY); };
    return <div className={`stage ${large ? 'stage-large' : ''}`} ref={ref} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => { setDragging(false); setDragStart(null); }} onPointerCancel={() => { setDragging(false); setDragStart(null); }} onWheel={e => { if (active && selectedMode === 'crop') { e.preventDefault(); setZoomValue(zoom + (e.deltaY < 0 ? .05 : -.05)); } }}>
      {active ? <>
        <img className="stage-photo" src={active.url} style={imageStyle} draggable="false" />
        {selectedMode === 'crop' && <div className="crop-frame" style={frameStyle}><i/><i/><i/><i/></div>}
        {selectedMode === 'fit' && <div className="fit-frame"><span>Visas originalus kadras, šonuose balta spalva</span></div>}
        {selectedMode === 'real' && <div className="real-frame"><span>{selectedFormat.label} · 320 DPI</span></div>}
        <div className="stage-hint"><Move size={14}/> Vilkite nuotrauką norėdami pakeisti jos poziciją</div>
        <div className="zoom-control"><button onClick={e => { e.stopPropagation(); setZoomValue(zoom - .1); }}><ZoomOut size={17}/></button><span>{Math.round(zoom * 100)}%</span><button onClick={e => { e.stopPropagation(); setZoomValue(zoom + .1); }}><ZoomIn size={17}/></button></div>
      </> : <div className="empty-stage"><Images size={48}/><b>Įkelkite nuotraukas</b><span>Pasirinkite vieną ar daugiau JPG, PNG, HEIC arba TIFF failų</span><button className="primary" onClick={() => fileRef.current?.click()}><ImagePlus size={17}/> Įkelti nuotraukas</button></div>}
    </div>;
  };

  const visiblePhotos = photos.slice(thumbOffset, thumbOffset + 8);
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-icon"><Camera size={21}/></div><span>FotoKadravimas</span></div><nav className="tabs"><button className="tab active"><Crop size={17}/> Kadravimas</button><button className="tab disabled" title="Šis skirsnis bus kuriamas vėliau"><Images size={17}/> Nuotraukos kokybė</button></nav><div className="top-actions"><span className="batch-count">{photos.length ? `Nuotraukų partija · ${photos.length} fail.` : 'Nauja nuotraukų partija'}</span><button className="icon-button" title="Nustatymai"><Settings2 size={19}/></button><button className="download-button" onClick={exportAll} disabled={!photos.length || busy}><Download size={17}/> Atsisiųsti viską <span className="zip-pill">ZIP</span></button></div></header>
    <main className="workspace">
      <aside className="left-panel"><div className="panel-title">1. Spausdinimo formatas</div><div className="format-grid">{FORMATS.map(f => <button key={f.id} className={`format-option ${(active?.format || format) === f.id ? 'selected' : ''}`} onClick={() => { setFormat(f.id); if (active) patchCrop({ format: f.id }); setPhotos(prev => prev.map(p => ({ ...p, format: f.id, status: p.status === 'done' ? 'editing' : p.status }))); }}><b>{f.label}</b><small>{f.ratioLabel}</small></button>)}</div>
        <div className="section-divider"/><div className="panel-title">2. Kadravimo tipas</div><div className="mode-list"><button className={selectedMode === 'crop' ? 'mode selected' : 'mode'} onClick={() => { setMode('crop'); if (active) patchCrop({ mode: 'crop' }); }}><Crop/><span>Kadravimas</span></button><button className={selectedMode === 'fit' ? 'mode selected' : 'mode'} onClick={() => { setMode('fit'); if (active) patchCrop({ mode: 'fit' }); }}><Square/><span>Balti kraštai</span></button><button className={selectedMode === 'real' ? 'mode selected' : 'mode'} onClick={() => { setMode('real'); if (active) patchCrop({ mode: 'real' }); }}><Ruler/><span>Real Size<small>320 DPI</small></span></button></div>
        <div className="section-divider"/><div className="panel-title">3. Eksportas</div><div className="select-wrap"><select value="jpg" disabled><option value="jpg">JPG · Maksimali kokybė</option></select></div><div className="side-note"><CircleHelp size={17}/><span>Originalūs failai lieka nepakeisti. Korekcijos taikomos tik eksportuojamai kopijai.</span></div></aside>
      <section className="editor-column"><div className="editor-toolbar"><div className="photo-name">{active?.name || 'Nuotrauka nepasirinkta'}</div><div className="editor-nav"><button onClick={() => { const i = photos.findIndex(p => p.id === activeId); if (i > 0) setActiveId(photos[i - 1].id); }} disabled={!active || photos.findIndex(p => p.id === activeId) === 0}><ChevronLeft size={17}/> Ankstesnė</button><span>{active ? `${photos.findIndex(p => p.id === activeId) + 1} iš ${photos.length}` : '0 iš 0'}</span><button onClick={() => { const i = photos.findIndex(p => p.id === activeId); if (i < photos.length - 1) setActiveId(photos[i + 1].id); }} disabled={!active || photos.findIndex(p => p.id === activeId) === photos.length - 1}>Kita <ChevronRight size={17}/></button></div><button className="expand-button" onClick={() => setModal(true)} disabled={!active}><Maximize2 size={17}/> Didinti</button></div>
        {renderStage()}<div className="editor-footer"><div className="orientation-control"><span>Orientacija</span><div className="segmented"><button className={selectedOrientation === 'auto' ? 'active' : ''} onClick={() => setOrientationForActive('auto')}>Automatinė</button><button className={selectedOrientation === 'vertical' ? 'active' : ''} onClick={() => setOrientationForActive('vertical')}>Vertikali</button><button className={selectedOrientation === 'horizontal' ? 'active' : ''} onClick={() => setOrientationForActive('horizontal')}>Horizontali</button></div></div><div className="footer-actions"><button className="secondary" onClick={reset} disabled={!active}><RotateCcw size={16}/> Atstatyti</button><button className="primary" onClick={confirm} disabled={!active}><Check size={17}/> Patvirtinti</button></div></div></section>
      <aside className="right-panel"><div className="right-heading">Koregavimo informacija</div><div className="summary-card"><span>Pasirinktas formatas</span><b>{selectedFormat.label}</b><small>{selectedFormat.ratioLabel}</small></div><div className="summary-card"><span>Kadravimo režimas</span><b>{selectedMode === 'crop' ? 'Kadravimas' : selectedMode === 'fit' ? 'Balti kraštai' : 'Real Size'}</b></div><div className="summary-card"><span>Nuotraukos būsena</span><div className="status-line">{active?.status === 'done' ? <><CheckCircle2 className="green"/> Patvirtinta</> : active?.status === 'editing' ? <><Circle className="yellow"/> Koreguojama</> : <><Circle className="muted"/> Neatidaryta</>}</div></div><div className="right-spacer"/><button className="outline-wide" onClick={exportCurrent} disabled={!active}><Download size={17}/> Atsisiųsti šią nuotrauką</button><button className="upload-wide" onClick={() => fileRef.current?.click()}><ImagePlus size={18}/> Įkelti nuotraukas</button></aside>
    </main>
    <section className="filmstrip"><div className="strip-head"><div><b>Nuotraukų eilė</b><span>{photos.length} nuotraukos</span></div><div className="strip-tools"><button onClick={() => fileRef.current?.click()}><ImagePlus size={16}/> Pridėti</button><button onClick={() => { setPhotos([]); setActiveId(null); }} disabled={!photos.length}>Išvalyti partiją</button></div></div><div className="strip-body"><button className="strip-arrow" onClick={() => setThumbOffset(Math.max(0, thumbOffset - 1))} disabled={thumbOffset === 0}><ChevronLeft/></button><div className="thumb-list" ref={stripRef}>{visiblePhotos.map((p, i) => <button key={p.id} className={`thumb ${p.id === activeId ? 'active' : ''}`} onClick={() => setActiveId(p.id)}><div className={`thumb-image status-${p.status}`}><img src={thumbSources.get(p.id) || p.url} /></div><span className="thumb-label">{String(thumbOffset + i + 1).padStart(2, '0')}</span></button>)}</div><button className="strip-arrow" onClick={() => setThumbOffset(Math.min(Math.max(0, photos.length - 8), thumbOffset + 1))} disabled={thumbOffset + 8 >= photos.length}><ChevronRight/></button></div><div className="strip-bottom"><div className="legend"><span><i className="dot muted"/> Neatidaryta</span><span><i className="dot yellow"/> Koreguojama</span><span><i className="dot green"/> Patvirtinta</span></div><div className="strip-message">{busy ? <><Loader2 className="spin" size={14}/>{message}</> : message}</div><div className="strip-count">{photos.filter(p => p.status === 'done').length} / {photos.length} patvirtinta</div></div></section>
    <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp,.bmp,.gif,.heic,.heif,.tif,.tiff,image/*" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }}/>
    {modal && active && <div className="modal-backdrop"><div className="modal-window"><div className="modal-top"><div><b>{active.name}</b><span>Didysis kadravimo langas</span></div><div className="modal-tools"><button onClick={reset}><RotateCcw size={16}/> Atstatyti</button><button className="close-modal" onClick={() => setModal(false)}><X/></button></div></div><div className="modal-content">{renderStage(true)}<aside className="modal-side"><label>Orientacija</label><div className="segmented vertical"><button className={selectedOrientation === 'auto' ? 'active' : ''} onClick={() => setOrientationForActive('auto')}>Automatinė</button><button className={selectedOrientation === 'vertical' ? 'active' : ''} onClick={() => setOrientationForActive('vertical')}>Vertikali</button><button className={selectedOrientation === 'horizontal' ? 'active' : ''} onClick={() => setOrientationForActive('horizontal')}>Horizontali</button></div><label>Mastelis</label><input type="range" min="1" max="3" step="0.01" value={zoom} onChange={e => setZoomValue(Number(e.target.value))}/><div className="modal-zoom">{Math.round(zoom * 100)}%</div><div className="modal-spacer"/><button className="primary" onClick={() => { confirm(); setModal(false); }}><Check size={17}/> Patvirtinti kadravimą</button></aside></div></div></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
