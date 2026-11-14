import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import heic2any from 'heic2any';
import * as UTIF from 'utif';
import { Camera, ImagePlus, Download, RotateCcw, Check, ChevronDown, ChevronLeft, ChevronRight, Crop, Square, Ruler, Maximize2, ZoomIn, ZoomOut, X, Images, CircleHelp, Settings2, Move, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import './style.css';

const FORMATS = [
  { id: '10x15', label: '10 × 15 cm', ratio: 2 / 3, ratioLabel: '2:3' },
  { id: '15x30', label: '15 × 30 cm', ratio: 1 / 2, ratioLabel: '1:2' },
  { id: '15x15', label: '15 × 15 cm', ratio: 1, ratioLabel: '1:1' },
  { id: 'a4', label: 'A4', ratio: 21 / 29.7, ratioLabel: '21 × 29,7 cm' },
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
    const ctx = canvas.getContext('2d');
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), canvas.width, canvas.height), 0, 0);
    blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  }
  const url = URL.createObjectURL(blob);
  const image = await new Promise((resolve, reject) => {
    const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = url;
  });
  return { url, image, width: image.naturalWidth, height: image.naturalHeight };
}

function cropRectFor(image, ratio, orientation, stageW, stageH, zoom = 1) {
  const portrait = orientation === 'vertical' || (orientation === 'auto' && image.height >= image.width);
  const target = portrait ? ratio : 1 / ratio;
  const maxW = stageW * 0.78, maxH = stageH * 0.78;
  let w = Math.min(maxW, maxH * target), h = w / target;
  w *= zoom; h *= zoom;
  return { x: (stageW - w) / 2, y: (stageH - h) / 2, w, h, target };
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
  const [exportType, setExportType] = useState('jpg');
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [thumbOffset, setThumbOffset] = useState(0);
  const fileRef = useRef(null);
  const stageRef = useRef(null);
  const stripRef = useRef(null);
  const active = photos.find(p => p.id === activeId) || null;
  const currentFormat = FORMATS.find(f => f.id === format);
  const selectedOrientation = active?.orientation ?? orientation;

  useEffect(() => { if (active) { setZoom(active.zoom || 1); setPan(active.pan || {x:0,y:0}); } }, [activeId]);
  useEffect(() => () => photos.forEach(p => URL.revokeObjectURL(p.url)), []);

  const updateActive = useCallback((patch) => {
    setPhotos(prev => prev.map(p => p.id === activeId ? { ...p, ...patch } : p));
  }, [activeId]);

  const addFiles = async (files) => {
    const accepted = Array.from(files).filter(f => /\.(jpe?g|png|webp|bmp|gif|heic|heif|tif|tiff)$/i.test(f.name));
    if (!accepted.length) { setMessage('Pasirink JPG, PNG, WEBP, HEIC arba TIFF nuotraukas.'); return; }
    setBusy(true); setMessage(`Įkeliama ${accepted.length} nuotraukų…`);
    const added = [];
    for (const file of accepted) {
      try {
        const decoded = await decodeFile(file);
        added.push({ id: uid(), name: file.name, originalFile: file, ...decoded, status: 'new', orientation: 'auto', zoom: 1, pan: {x:0,y:0}, mode: 'crop', format });
      } catch (e) { console.error(e); }
    }
    setPhotos(prev => [...prev, ...added]);
    if (!activeId && added[0]) setActiveId(added[0].id);
    setBusy(false); setMessage(added.length ? `Įkelta ${added.length} nuotraukų` : 'Nepavyko atidaryti pasirinktų failų.');
  };

  const setZoomValue = (value) => { const z = clamp(value, 1, 3); setZoom(z); updateActive({ zoom: z, status: 'editing' }); };
  const changePan = (x, y) => { setPan({x,y}); updateActive({ pan:{x,y}, status:'editing' }); };
  const reset = () => { setZoom(1); setPan({x:0,y:0}); setOrientation('auto'); updateActive({ zoom:1, pan:{x:0,y:0}, orientation:'auto', status:'new' }); };
  const setOrientationForActive = value => { setOrientation(value); updateActive({ orientation:value, status:'editing' }); };
  const confirm = () => { if (active) updateActive({ status:'done', zoom, pan, orientation:selectedOrientation, mode, format }); };

  const getCropData = (photo, outCanvas) => {
    const image = photo.image;
    const fmt = FORMATS.find(f => f.id === (photo.format || format)) || currentFormat;
    const orient = photo.orientation || 'auto';
    const portrait = orient === 'vertical' || (orient === 'auto' && image.height >= image.width);
    const target = portrait ? fmt.ratio : 1 / fmt.ratio;
    const srcRatio = image.width / image.height;
    const z = photo.zoom || 1;
    if (photo.mode === 'real') {
      const cm = fmt.id === 'a4' ? [21,29.7] : fmt.id === '15x30' ? [15,30] : fmt.id === '15x15' ? [15,15] : [10,15];
      const [wcm,hcm] = portrait ? cm : [...cm].reverse();
      outCanvas.width = Math.round(wcm / 2.54 * 320); outCanvas.height = Math.round(hcm / 2.54 * 320);
      const ctx = outCanvas.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,outCanvas.width,outCanvas.height);
      const scale = Math.max(outCanvas.width/image.width, outCanvas.height/image.height);
      const sw = outCanvas.width/scale, sh = outCanvas.height/scale;
      ctx.drawImage(image, (image.width-sw)/2, (image.height-sh)/2, sw, sh, 0,0,outCanvas.width,outCanvas.height);
      return;
    }
    if (photo.mode === 'fit') {
      // Keep source pixels at 1:1 and extend the canvas with white pixels to the requested aspect ratio.
      let w=image.width, h=image.height;
      if (w/h > target) h=Math.ceil(w/target); else w=Math.ceil(h*target);
      outCanvas.width=w; outCanvas.height=h;
      const ctx=outCanvas.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h); ctx.drawImage(image, Math.round((w-image.width)/2), Math.round((h-image.height)/2));
      return;
    }
    let sw, sh;
    if (srcRatio > target) { sh=image.height / z; sw=sh*target; } else { sw=image.width / z; sh=sw/target; }
    const maxX=image.width-sw, maxY=image.height-sh;
    const cx=clamp(image.width/2 + (photo.pan?.x||0)*image.width*0.35, sw/2, image.width-sw/2);
    const cy=clamp(image.height/2 + (photo.pan?.y||0)*image.height*0.35, sh/2, image.height-sh/2);
    outCanvas.width=Math.max(1,Math.round(sw)); outCanvas.height=Math.max(1,Math.round(sh));
    const ctx=outCanvas.getContext('2d'); ctx.drawImage(image, cx-sw/2, cy-sh/2, sw, sh, 0,0,outCanvas.width,outCanvas.height);
  };

  const exportOne = async (photo) => {
    const canvas=document.createElement('canvas');
    getCropData(photo, canvas);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.98));
    return { name: photo.name.replace(/\.[^.]+$/, '') + '.jpg', blob };
  };
  const exportAll = async () => {
    if (!photos.length) return;
    setBusy(true); setMessage('Ruošiami JPEG failai…');
    try {
      const zip=new JSZip();
      for (let i=0;i<photos.length;i++) { const result=await exportOne(photos[i]); zip.file(result.name,result.blob); setMessage(`Apdorojama ${i+1} / ${photos.length}`); }
      const blob=await zip.generateAsync({type:'blob'});
      const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='fotokadravimas.zip'; a.click(); URL.revokeObjectURL(url);
      setMessage('ZIP archyvas paruoštas.');
    } catch(e) { console.error(e); setMessage('Eksportuojant įvyko klaida.'); }
    setBusy(false);
  };
  const exportCurrent = async () => { if(!active)return; const r=await exportOne(active); const url=URL.createObjectURL(r.blob); const a=document.createElement('a');a.href=url;a.download=r.name;a.click();URL.revokeObjectURL(url); };

  const stageImageStyle = useMemo(() => {
    if (!active || !stageRef.current) return {};
    return { transform:`translate(calc(-50% + ${pan.x*90}px), calc(-50% + ${pan.y*90}px)) scale(${zoom})` };
  }, [active, pan, zoom, modal]);
  const stage = (large=false) => <div className={`stage ${large?'stage-large':''}`} ref={stageRef} onPointerDown={e=>{if(!active)return; setDragging(true); setDragStart({x:e.clientX,y:e.clientY,pan}); e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(dragging&&dragStart){changePan(clamp(dragStart.pan.x+(e.clientX-dragStart.x)/180,-1,1),clamp(dragStart.pan.y+(e.clientY-dragStart.y)/180,-1,1));}}} onPointerUp={()=>{setDragging(false);setDragStart(null);}} onWheel={e=>{e.preventDefault();setZoomValue(zoom+(e.deltaY<0?0.05:-0.05));}}>
    {active ? <>
      <img className="stage-photo" src={active.url} style={stageImageStyle} draggable="false" />
      {mode==='crop' && <div className={`crop-frame ${selectedOrientation==='vertical'||(selectedOrientation==='auto'&&active.height>=active.width)?'portrait':'landscape'}`} style={{'--crop-ratio': (selectedOrientation==='vertical'||(selectedOrientation==='auto'&&active.height>=active.width)) ? currentFormat.ratio : 1/currentFormat.ratio}}><i/><i/><i/><i/></div>}
      {mode==='fit' && <div className="fit-frame"><span>Balti kraštai bus užpildyti</span></div>}
      {mode==='real' && <div className="real-frame"><span>320 DPI</span></div>}
      <div className="stage-hint"><Move size={14}/> Vilkite nuotrauką norėdami pakeisti jos poziciją</div>
      <div className="zoom-control"><button onClick={()=>setZoomValue(zoom-.1)}><ZoomOut size={17}/></button><span>{Math.round(zoom*100)}%</span><button onClick={()=>setZoomValue(zoom+.1)}><ZoomIn size={17}/></button></div>
    </> : <div className="empty-stage"><Images size={48}/><b>Įkelkite nuotraukas</b><span>Pasirinkite vieną ar daugiau JPG, PNG, HEIC arba TIFF failų</span><button className="primary" onClick={()=>fileRef.current?.click()}><ImagePlus size={17}/> Įkelti nuotraukas</button></div>}
  </div>;

  const sortedPhotos = photos;
  const visiblePhotos = sortedPhotos.slice(thumbOffset, thumbOffset+8);
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-icon"><Camera size={21}/></div><span>FotoKadravimas</span></div><nav className="tabs"><button className="tab active"><Crop size={17}/> Kadravimas</button><button className="tab disabled" title="Šis skirsnis bus kuriamas vėliau"><Images size={17}/> Nuotraukos kokybė</button></nav><div className="top-actions"><span className="batch-count">{photos.length ? `Nuotraukų partija · ${photos.length} fail.` : 'Nauja nuotraukų partija'}</span><button className="icon-button" title="Nustatymai"><Settings2 size={19}/></button><button className="download-button" onClick={exportAll} disabled={!photos.length||busy}><Download size={17}/> Atsisiųsti viską <span className="zip-pill">ZIP</span></button></div></header>
    <main className="workspace">
      <aside className="left-panel">
        <div className="panel-title">1. Spausdinimo formatas</div>
        <div className="format-grid">{FORMATS.map(f=><button key={f.id} className={`format-option ${format===f.id?'selected':''}`} onClick={()=>{setFormat(f.id);setPhotos(prev=>prev.map(p=>({...p,format:f.id,status:p.status==='done'?'editing':p.status})));}}><b>{f.label}</b><small>{f.ratioLabel}</small></button>)}</div>
        <div className="section-divider"/>
        <div className="panel-title">2. Kadravimo tipas</div>
        <div className="mode-list"><button className={mode==='crop'?'mode selected':'mode'} onClick={()=>{setMode('crop');updateActive({mode:'crop',status:'editing'});}}><Crop/><span>Kadravimas</span></button><button className={mode==='fit'?'mode selected':'mode'} onClick={()=>{setMode('fit');updateActive({mode:'fit',status:'editing'});}}><Square/><span>Balti kraštai</span></button><button className={mode==='real'?'mode selected':'mode'} onClick={()=>{setMode('real');updateActive({mode:'real',status:'editing'});}}><Ruler/><span>Real Size<small>320 DPI</small></span></button></div>
        <div className="section-divider"/>
        <div className="panel-title">3. Eksportas</div><div className="select-wrap"><select value={exportType} onChange={e=>setExportType(e.target.value)}><option value="jpg">JPG · Maksimali kokybė</option></select><ChevronDown size={16}/></div>
        <div className="side-note"><CircleHelp size={17}/><span>Originalūs failai lieka nepakeisti. Korekcijos taikomos tik eksportuojamai kopijai.</span></div>
      </aside>
      <section className="editor-column">
        <div className="editor-toolbar"><div className="photo-name">{active?.name || 'Nuotrauka nepasirinkta'}</div><div className="editor-nav"><button onClick={()=>{const i=photos.findIndex(p=>p.id===activeId);if(i>0)setActiveId(photos[i-1].id);}} disabled={!active||photos.findIndex(p=>p.id===activeId)===0}><ChevronLeft size={17}/> Ankstesnė</button><span>{active?`${photos.findIndex(p=>p.id===activeId)+1} iš ${photos.length}`:'0 iš 0'}</span><button onClick={()=>{const i=photos.findIndex(p=>p.id===activeId);if(i<photos.length-1)setActiveId(photos[i+1].id);}} disabled={!active||photos.findIndex(p=>p.id===activeId)===photos.length-1}>Kita <ChevronRight size={17}/></button></div><button className="expand-button" onClick={()=>setModal(true)} disabled={!active}><Maximize2 size={17}/> Didinti</button></div>
        {stage()}
        <div className="editor-footer"><div className="orientation-control"><span>Orientacija</span><div className="segmented"><button className={selectedOrientation==='auto'?'active':''} onClick={()=>setOrientationForActive('auto')}>Automatinė</button><button className={selectedOrientation==='vertical'?'active':''} onClick={()=>setOrientationForActive('vertical')}>Vertikali</button><button className={selectedOrientation==='horizontal'?'active':''} onClick={()=>setOrientationForActive('horizontal')}>Horizontali</button></div></div><div className="footer-actions"><button className="secondary" onClick={reset} disabled={!active}><RotateCcw size={16}/> Atstatyti</button><button className="primary" onClick={confirm} disabled={!active}><Check size={17}/> Patvirtinti</button></div></div>
      </section>
      <aside className="right-panel"><div className="right-heading">Koregavimo informacija</div><div className="summary-card"><span>Pasirinktas formatas</span><b>{currentFormat.label}</b><small>{currentFormat.ratioLabel}</small></div><div className="summary-card"><span>Kadravimo režimas</span><b>{mode==='crop'?'Kadravimas':mode==='fit'?'Balti kraštai':'Real Size'}</b></div><div className="summary-card"><span>Nuotraukos būsena</span><div className="status-line">{active?.status==='done'?<><CheckCircle2 className="green"/> Patvirtinta</>:active?.status==='editing'?<><Circle className="yellow"/> Koreguojama</>:<><Circle className="muted"/> Neatidaryta</>}</div></div><div className="right-spacer"/><button className="outline-wide" onClick={exportCurrent} disabled={!active}><Download size={17}/> Atsisiųsti šią nuotrauką</button><button className="upload-wide" onClick={()=>fileRef.current?.click()}><ImagePlus size={18}/> Įkelti nuotraukas</button></aside>
    </main>
    <section className="filmstrip"><div className="strip-head"><div><b>Nuotraukų eilė</b><span>{photos.length} nuotraukos</span></div><div className="strip-tools"><button onClick={()=>fileRef.current?.click()}><ImagePlus size={16}/> Pridėti</button><button onClick={()=>{setPhotos([]);setActiveId(null);}} disabled={!photos.length}>Išvalyti partiją</button></div></div><div className="strip-body"><button className="strip-arrow" onClick={()=>setThumbOffset(Math.max(0,thumbOffset-1))} disabled={thumbOffset===0}><ChevronLeft/></button><div className="thumb-list" ref={stripRef}>{visiblePhotos.map((p,i)=><button key={p.id} className={`thumb ${p.id===activeId?'active':''}`} onClick={()=>setActiveId(p.id)}><div className="thumb-image"><img src={p.url}/><span className={`status-dot ${p.status}`}>{p.status==='done'?<Check size={12}/>:p.status==='editing'?<span/>:<Circle size={12}/>}</span></div><span className="thumb-label">{String(thumbOffset+i+1).padStart(2,'0')}</span></button>)}</div><button className="strip-arrow" onClick={()=>setThumbOffset(Math.min(Math.max(0,photos.length-8),thumbOffset+1))} disabled={thumbOffset+8>=photos.length}><ChevronRight/></button></div><div className="strip-bottom"><div className="legend"><span><i className="dot muted"/> Neatidaryta</span><span><i className="dot yellow"/> Koreguojama</span><span><i className="dot green"/> Patvirtinta</span></div><div className="strip-message">{busy?<><Loader2 className="spin" size={14}/>{message}</>:message}</div><div className="strip-count">{photos.filter(p=>p.status==='done').length} / {photos.length} patvirtinta</div></div></section>
    <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp,.bmp,.gif,.heic,.heif,.tif,.tiff,image/*" multiple hidden onChange={e=>{addFiles(e.target.files);e.target.value='';}}/>
    {modal&&active&&<div className="modal-backdrop"><div className="modal-window"><div className="modal-top"><div><b>{active.name}</b><span>Didysis kadravimo langas</span></div><div className="modal-tools"><button onClick={reset}><RotateCcw size={16}/> Atstatyti</button><button className="close-modal" onClick={()=>setModal(false)}><X/></button></div></div><div className="modal-content">{stage(true)}<aside className="modal-side"><label>Orientacija</label><div className="segmented vertical"><button className={selectedOrientation==='auto'?'active':''} onClick={()=>setOrientationForActive('auto')}>Automatinė</button><button className={selectedOrientation==='vertical'?'active':''} onClick={()=>setOrientationForActive('vertical')}>Vertikali</button><button className={selectedOrientation==='horizontal'?'active':''} onClick={()=>setOrientationForActive('horizontal')}>Horizontali</button></div><label>Mastelis</label><input type="range" min="1" max="3" step="0.01" value={zoom} onChange={e=>setZoomValue(Number(e.target.value))}/><div className="modal-zoom">{Math.round(zoom*100)}%</div><div className="modal-spacer"/><button className="primary" onClick={()=>{confirm();setModal(false);}}><Check size={17}/> Patvirtinti kadravimą</button></aside></div></div></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
