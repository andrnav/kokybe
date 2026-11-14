import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AlertTriangle, Cpu, FileImage, Gauge, ImagePlus, Loader2, ScanEye, ShieldCheck, Trash2, Zap, Crop, Calculator, Sparkles, Download, Move, ZoomIn } from 'lucide-react'
import type { Mode, Profile } from './analysis'
import { printGrade, qualityWord, runIqa } from './analysis'

type Result = Awaited<ReturnType<typeof runIqa>>
type PrintKind = 'photo' | 'wide'
const photoFormats = [[9,13],[10,15],[13,18],[15,20],[20,30],[30,45]]
const wideFormats = [[30,40],[40,60],[50,70],[50,75],[60,90],[70,100],[100,150]]
const fmt = (w:number,h:number)=>`${w} × ${h} cm`

function cropRect(iw:number, ih:number, ratio:number, zoom:number, x:number, y:number) {
  const baseW = iw / ih > ratio ? ih * ratio : iw
  const baseH = iw / ih > ratio ? ih : iw / ratio
  const cw = baseW / zoom, ch = baseH / zoom
  return { sx: (iw-cw)*x/100, sy: (ih-ch)*y/100, sw:cw, sh:ch }
}

export default function App() {
  const [file,setFile] = useState<File|null>(null)
  const [image,setImage] = useState<HTMLImageElement|null>(null)
  const [url,setUrl] = useState('')
  const [kind,setKind] = useState<PrintKind>('photo')
  const [mode,setMode] = useState<Mode>('optimized')
  const [aiEnabled,setAiEnabled] = useState(false)
  const [width,setWidth] = useState(13)
  const [height,setHeight] = useState(18)
  const [custom,setCustom] = useState(false)
  const [cropX,setCropX] = useState(50)
  const [cropY,setCropY] = useState(50)
  const [zoom,setZoom] = useState(1)
  const [progress,setProgress] = useState(0)
  const [busy,setBusy] = useState(false)
  const [result,setResult] = useState<Result|null>(null)
  const [error,setError] = useState('')
  const [status,setStatus] = useState('Pasiruošusi')
  const [mathConfirmed,setMathConfirmed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{x:number;y:number;cx:number;cy:number}|null>(null)
  const profile:Profile = kind === 'photo' ? 'noritsu' : 'mimaki_poster'
  const ratio = width / height
  const rect = image ? cropRect(image.naturalWidth,image.naturalHeight,ratio,zoom,cropX,cropY) : null
  const cropPpi = image && rect ? Math.min(rect.sw/(width/2.54),rect.sh/(height/2.54)) : 0
  const activeFormats = kind === 'photo' ? photoFormats : wideFormats
  const cropUrl = useMemo(()=>{
    if(!image||!rect) return ''
    const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(rect.sw)); canvas.height=Math.max(1,Math.round(rect.sh))
    const ctx=canvas.getContext('2d'); if(!ctx) return ''
    ctx.drawImage(image,rect.sx,rect.sy,rect.sw,rect.sh,0,0,canvas.width,canvas.height)
    return canvas.toDataURL('image/jpeg',0.98)
  },[image,rect?.sx,rect?.sy,rect?.sw,rect?.sh])
  useEffect(()=>{ if(!file) return; const next=URL.createObjectURL(file); const img=new Image(); img.onload=()=>{setImage(img);setUrl(next);setCropX(50);setCropY(50);setZoom(1);setResult(null);setMathConfirmed(false)}; img.onerror=()=>setError('Nepavyko atidaryti nuotraukos.'); img.src=next; return ()=>URL.revokeObjectURL(next) },[file])
  function invalidate(){setMathConfirmed(false);setResult(null);setError('')}
  function clear(){setFile(null);setImage(null);setUrl('');setResult(null);setError('');setProgress(0);setMathConfirmed(false);setAiEnabled(false)}
  function chooseFormat(w:number,h:number){setWidth(w);setHeight(h);setCustom(false);invalidate();setCropX(50);setCropY(50);setZoom(1)}
  function confirmCrop(){setMathConfirmed(true);setResult(null);setError('')}
  function onPointerDown(e:React.PointerEvent<HTMLDivElement>){if(!image)return; e.currentTarget.setPointerCapture(e.pointerId);dragRef.current={x:e.clientX,y:e.clientY,cx:cropX,cy:cropY}}
  function onPointerMove(e:React.PointerEvent<HTMLDivElement>){const d=dragRef.current;if(!d||!stageRef.current||!rect||!image)return;const box=stageRef.current.getBoundingClientRect();const dx=e.clientX-d.x,dy=e.clientY-d.y;const overflowX=image.naturalWidth-rect.sw,overflowY=image.naturalHeight-rect.sh;setCropX(Math.max(0,Math.min(100,d.cx-(dx/box.width)*overflowX/Math.max(1,overflowX)*100)));setCropY(Math.max(0,Math.min(100,d.cy-(dy/box.height)*overflowY/Math.max(1,overflowY)*100)))}
  function onPointerUp(){dragRef.current=null}
  function saveCrop(){if(!cropUrl)return;const a=document.createElement('a');a.href=cropUrl;a.download=`${file?.name.replace(/\.[^.]+$/,'')||'nuotrauka'}-${width}x${height}cm-crop.jpg`;a.click()}
  async function analyse(){
    if(!cropUrl||!mathConfirmed)return
    setBusy(true);setResult(null);setError('');setProgress(0);setStatus('Paruošiamas AI modelis...')
    try {const cropped=new Image();cropped.src=cropUrl;await cropped.decode();const r=await runIqa(cropped,mode,setProgress);setResult(r);setStatus('AI analizė baigta')}
    catch(e){setError(e instanceof Error?e.message:String(e));setStatus('AI analizė nepavyko')}finally{setBusy(false)}
  }
  const modes:{id:Mode;title:string;desc:string;icon:typeof Cpu}[]=[{id:'light',title:'Mažasis modelis',desc:'DBCNN',icon:Cpu},{id:'optimized',title:'Vidutinis modelis',desc:'HyperIQA',icon:Zap},{id:'full',title:'Maksimalus modelis',desc:'MUSIQ',icon:ScanEye}]
  const dragOver=(e:React.DragEvent)=>{e.preventDefault();e.stopPropagation()}
  const drop=(e:React.DragEvent)=>{dragOver(e);const f=e.dataTransfer.files?.[0];if(f?.type.startsWith('image/'))setFile(f)}
  return <main className="shell">
    <header className="top"><div className="brand"><div className="brandIcon"><ScanEye size={25}/></div><div><div className="eyebrow">FOTOLABORATORIJOS ĮRANKIS</div><h1>Photo Quality <span>AI</span></h1></div></div><div className="local"><ShieldCheck size={16}/> Nuotrauka apdorojama šiame kompiuteryje</div></header>
    <section className="intro"><div><div className="eyebrow">NUOTRAUKŲ DIAGNOSTIKA</div><h2>Patikrink prieš spausdindamas.</h2><p>Pirmiausia matematinis spaudos įvertinimas. AI analizė yra papildomas, pasirenkamas žingsnis.</p></div><div className="introMark"><Activity size={42}/></div></section>
    <div className="workspace">
      <aside className="sidebar">
        <section className="panel"><div className="sectionTitle"><FileImage/><div><h3>1. Nuotrauka</h3><p>Įkelk arba nutempk failą</p></div></div>
          <div className="drop compact" onDragOver={dragOver} onDrop={drop} onClick={()=>inputRef.current?.click()}><input ref={inputRef} type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(f)setFile(f)}} hidden/><ImagePlus size={27}/><b>{file?'Pakeisti nuotrauką':'Įkelti nuotrauką'}</b><span>Drag & drop arba pasirink failą</span></div>
          {file&&<div className="fileMeta sideMeta"><b>{file.name}</b><span>{image?`${image.naturalWidth} × ${image.naturalHeight} px`:'Kraunama...'}</span><button className="textBtn" onClick={clear}><Trash2 size={14}/> Pašalinti</button></div>}
        </section>
        <section className="panel"><div className="sectionTitle"><Gauge/><div><h3>2. Spaudos formatas</h3><p>Pasirink spaudos tipą ir dydį</p></div></div>
          <div className="stack"><button className={`mode ${kind==='photo'?'selected':''}`} onClick={()=>{setKind('photo');chooseFormat(13,18)}}><b>Premium nuotrauka</b><small>Noritsu</small></button><button className={`mode ${kind==='wide'?'selected':''}`} onClick={()=>{setKind('wide');chooseFormat(40,60)}}><b>Didelio formato spauda</b><small>Mimaki</small></button></div>
          <label className="field">Formatas<select value={custom?'custom':`${width}x${height}`} onChange={e=>{if(e.target.value==='custom'){setCustom(true);invalidate()}else{const [w,h]=e.target.value.split('x').map(Number);chooseFormat(w,h)}}}><option value={`${width}x${height}`}>{fmt(width,height)}</option>{activeFormats.filter(([w,h])=>!(w===width&&h===height)).map(([w,h])=><option key={`${w}x${h}`} value={`${w}x${h}`}>{fmt(w,h)}</option>)}<option value="custom">Individualūs matmenys</option></select></label>
          {custom&&<div className="two"><label className="field">Plotis (cm)<input type="number" min="1" max="300" value={width} onChange={e=>{setWidth(Number(e.target.value));invalidate()}}/></label><label className="field">Aukštis (cm)<input type="number" min="1" max="300" value={height} onChange={e=>{setHeight(Number(e.target.value));invalidate()}}/></label></div>}
        </section>
        <section className="panel"><div className="sectionTitle"><Calculator/><div><h3>3. Raiška realiu laiku</h3><p>Formatas nekinta, PPI persiskaičiuoja</p></div></div>
          <div className="livePpi"><b>{image?cropPpi.toFixed(1):'–'}</b><span>PPI</span></div>
          <div className="mathGrid"><div><span>Originalas</span><b>{image?`${image.naturalWidth} × ${image.naturalHeight}`:'–'}</b></div><div><span>Apkirpta sritis</span><b>{rect?`${Math.round(rect.sw)} × ${Math.round(rect.sh)} px`:'–'}</b></div><div><span>Galutinis formatas</span><b>{fmt(width,height)} cm</b></div><div><span>Vertinimas</span><b>{image?printGrade(cropPpi,profile):'Laukiama'}</b></div></div>
          <button className="analyze fullBtn" disabled={!image||width<=0||height<=0} onClick={confirmCrop}><ShieldCheck size={16}/> Patvirtinti apkirpimą</button>
          {mathConfirmed&&<p className="successLine"><ShieldCheck size={15}/> Apkirpimas patvirtintas</p>}
        </section>
      </aside>
      <section className="mainColumn">
        <section className="panel editorPanel"><div className="sectionTitle"><Crop/><div><h3>4. Apkirpimas</h3><p>Tempk nuotrauką pele arba pirštu. Spaudos formatas lieka toks pats.</p></div></div>
          {image&&rect?<><div className="editorStage"><div ref={stageRef} className="cropViewport" style={{aspectRatio:`${width}/${height}`}} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
              <img src={url} alt="Apkirpimo redaktorius" draggable={false} style={{width:`${(image.naturalWidth/rect.sw)*100}%`,height:`${(image.naturalHeight/rect.sh)*100}%`,left:`-${cropX*(image.naturalWidth-rect.sw)/Math.max(1,rect.sw)}%`,top:`-${cropY*(image.naturalHeight-rect.sh)/Math.max(1,rect.sh)}%`}}/><div className="cropGrid"><i/><i/><i/><i/></div><div className="cropHint"><Move size={14}/> Vilkite vaizdą kadruotei keisti</div>
            </div></div>
            <div className="cropTools"><label className="field zoomField"><span><ZoomIn size={15}/> Priartinimas: {zoom.toFixed(1)}×</span><input type="range" min="1" max="4" step="0.05" value={zoom} onChange={e=>{setZoom(Number(e.target.value));invalidate()}}/></label><button className="secondary" onClick={()=>{setZoom(1);setCropX(50);setCropY(50);invalidate()}}>Atstatyti kadrą</button><button className="secondary" onClick={saveCrop} disabled={!cropUrl}><Download size={15}/> Išsaugoti crop</button></div>
            <p className="hint">Apkirpimas išsaugomas iš originalių pikselių, JPEG kokybe 98 %. Raiška nedidinama dirbtinai ir DPI neprirašomas.</p>
          </>:<div className="emptyEditor"><ImagePlus size={44}/><b>Įkelk nuotrauką, kad pradėtum apkirpimą</b><span>Pasirink formatą kairėje, tada galėsi laisvai koreguoti kadrą.</span></div>}
        </section>
        <section className="panel"><div className="sectionTitle"><Sparkles/><div><h3>5. AI patikrinimas</h3><p>AI analizuoja tik galutinę apkirptą sritį</p></div></div>
          <label className="toggle"><input type="checkbox" checked={aiEnabled} onChange={e=>{setAiEnabled(e.target.checked);setResult(null);setError('')}}/> Atlikti papildomą AI analizę</label>
          {aiEnabled&&<><div className="modeList">{modes.map(m=>{const I=m.icon;return <button key={m.id} className={`mode ${mode===m.id?'selected':''}`} onClick={()=>setMode(m.id)}><I size={19}/><span><b>{m.title}</b><small>{m.desc}</small></span><i/></button>})}</div><div className="modelNote"><ShieldCheck size={16}/><span>Modeliai pateikia bendrą kokybės prognozę, bet nepatikimai neidentifikuoja konkrečių defektų vietų.</span></div></>}
          <div className="actionRow"><span>{status}</span><button className="analyze" disabled={!image||!mathConfirmed||!aiEnabled||busy} onClick={analyse}>{busy?<Loader2 className="spin"/>:<Zap/>}{busy?'Analizuojama...':'Paleisti AI patikrą'}</button></div>
          {busy&&<><div className="progress"><div style={{width:`${progress}%`}}/></div><small>Modelio paruošimas: {progress}%</small></>}
          {error&&<div className="alert"><AlertTriangle/><div><b>AI analizė nepavyko</b><p>{error}</p></div></div>}
          {result&&<div className="result"><div className="resultHead"><div><div className="eyebrow">AI KOKYBĖS PROGNOZĖ</div><h3>{result.model==='HyperIQA'?'HyperIQA modelio išvestis':qualityWord(result.score)}</h3></div><div className="score">{result.model==='HyperIQA'?result.rawScore.toFixed(4):result.score}<small>{result.model==='HyperIQA'?' raw':'/100'}</small></div></div>{result.model!=='HyperIQA'&&<div className="bar"><div style={{width:`${result.score}%`}}/></div>}<div className="resultGrid"><div><span>Modelis</span><b>{result.model}</b></div><div><span>Vykdymas</span><b>{result.provider==='webgpu'?'GPU':'CPU'}</b></div><div><span>Trukmė</span><b>{(result.durationMs/1000).toFixed(1)} s</b></div><div><span>Analizuotas vaizdas</span><b>Apkirpta sritis</b></div></div><p className="hint">HyperIQA reikšmė rodoma neapdorota, nes jos skalė šiame eksportuotame modelyje nėra patikimai patvirtinta kaip 0–1 ar 0–100. Nelygink jos tiesiogiai su kitais modeliais.</p></div>}
        </section>
      </section>
    </div>
    <footer>PHOTO QUALITY AI <span>•</span> VIETINĖ ANALIZĖ <span>•</span> BETA 4.0</footer>
  </main>
}
