import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AlertTriangle, Cpu, FileImage, Gauge, ImagePlus, Loader2, ScanEye, ShieldCheck, Trash2, Zap, Crop, Calculator, Sparkles, Download, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import type { Mode, Profile } from './analysis'
import { printGrade, qualityWord, runIqa } from './analysis'

type Result = Awaited<ReturnType<typeof runIqa>>
type PrintKind = 'photo' | 'wide'
const photoFormats = [[9,13],[10,15],[13,18],[15,20],[20,30],[30,45]]
const wideFormats = [[30,40],[40,60],[50,70],[50,75],[60,90],[70,100],[100,150]]
const fmt = (w:number,h:number)=>`${w} × ${h} cm`
type Rect = { x:number;y:number;width:number;height:number;scale:number;left:number;top:number;frameLeft:number;frameTop:number;frameWidth:number;frameHeight:number }

export default function App() {
  const [file,setFile] = useState<File|null>(null)
  const [image,setImage] = useState<HTMLImageElement|null>(null)
  const [url,setUrl] = useState('')
  const [kind,setKind] = useState<PrintKind>('photo')
  const [mode,setMode] = useState<Mode>('optimized')
  const [aiEnabled,setAiEnabled] = useState(false)
  const [width,setWidth] = useState(20)
  const [height,setHeight] = useState(30)
  const [custom,setCustom] = useState(false)
  const [zoom,setZoom] = useState(1)
  const [pan,setPan] = useState({x:0,y:0})
  const [stageSize,setStageSize] = useState({width:900,height:520})
  const [progress,setProgress] = useState(0)
  const [busy,setBusy] = useState(false)
  const [result,setResult] = useState<Result|null>(null)
  const [error,setError] = useState('')
  const [status,setStatus] = useState('Pasiruošusi')
  const [mathConfirmed,setMathConfirmed] = useState(false)
  const [cropBlob,setCropBlob] = useState<Blob|null>(null)
  const [cropUrl,setCropUrl] = useState('')
  const [magnifier,setMagnifier] = useState(false)
  const [pointer,setPointer] = useState({x:0,y:0,visible:false})
  const inputRef = useRef<HTMLInputElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{x:number;y:number;panX:number;panY:number}|null>(null)
  const profile:Profile = kind === 'photo' ? 'noritsu' : 'mimaki_poster'
  const ratio = width / height
  const activeFormats = kind === 'photo' ? photoFormats : wideFormats

  useEffect(()=>{
    if(!stageRef.current) return
    const el=stageRef.current
    const update=()=>setStageSize({width:el.clientWidth,height:el.clientHeight})
    update(); const ro=new ResizeObserver(update);ro.observe(el);return ()=>ro.disconnect()
  },[image])
  useEffect(()=>{ if(!file) return; const next=URL.createObjectURL(file); const img=new Image(); img.onload=()=>{setImage(img);setUrl(next);setZoom(1);setPan({x:0,y:0});setResult(null);setMathConfirmed(false);setCropBlob(null);setCropUrl('')}; img.onerror=()=>setError('Nepavyko atidaryti nuotraukos.'); img.src=next; return ()=>URL.revokeObjectURL(next) },[file])
  useEffect(()=>()=>{if(cropUrl)URL.revokeObjectURL(cropUrl)},[cropUrl])

  const rect:Rect|null=useMemo(()=>{
    if(!image||!stageSize.width||!stageSize.height||width<=0||height<=0)return null
    const fw=Math.min(stageSize.width*.86,stageSize.height*.86*ratio)
    const fh=fw/ratio
    const frameLeft=(stageSize.width-fw)/2,frameTop=(stageSize.height-fh)/2
    const base=Math.max(fw/image.naturalWidth,fh/image.naturalHeight)
    const scale=base*zoom
    const iw=image.naturalWidth*scale,ih=image.naturalHeight*scale
    const left=(stageSize.width-iw)/2+pan.x,top=(stageSize.height-ih)/2+pan.y
    const x=Math.max(0,Math.min(image.naturalWidth,(frameLeft-left)/scale))
    const y=Math.max(0,Math.min(image.naturalHeight,(frameTop-top)/scale))
    const cw=Math.min(image.naturalWidth-x,fw/scale),ch=Math.min(image.naturalHeight-y,fh/scale)
    return {x,y,width:cw,height:ch,scale,left,top,frameLeft,frameTop,frameWidth:fw,frameHeight:fh}
  },[image,stageSize,ratio,zoom,pan])
  const cropPpi=rect?Math.min(rect.width/(width/2.54),rect.height/(height/2.54)):0

  function clear(){setFile(null);setImage(null);setUrl('');setResult(null);setError('');setProgress(0);setMathConfirmed(false);setAiEnabled(false);setCropBlob(null);setCropUrl('')}
  function chooseFormat(w:number,h:number){setWidth(w);setHeight(h);setCustom(false);setResult(null);setMathConfirmed(false);setCropBlob(null);setCropUrl('');setZoom(1);setPan({x:0,y:0})}
  function clampPan(next:{x:number;y:number},nextZoom=zoom){
    if(!image)return next
    const fw=Math.min(stageSize.width*.86,stageSize.height*.86*ratio),fh=fw/ratio
    const s=Math.max(fw/image.naturalWidth,fh/image.naturalHeight)*nextZoom
    const maxX=Math.max(0,(image.naturalWidth*s-fw)/2),maxY=Math.max(0,(image.naturalHeight*s-fh)/2)
    return {x:Math.max(-maxX,Math.min(maxX,next.x)),y:Math.max(-maxY,Math.min(maxY,next.y))}
  }
  function setZoomLevel(z:number){const nz=Math.max(1,Math.min(10000,z));setZoom(nz);setPan(p=>clampPan(p,nz));setMathConfirmed(false);setCropBlob(null);setCropUrl('')}
  function onPointerDown(e:React.PointerEvent){if(!image)return;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);dragRef.current={x:e.clientX,y:e.clientY,panX:pan.x,panY:pan.y}}
  function onPointerMove(e:React.PointerEvent){const bounds=stageRef.current?.getBoundingClientRect();if(bounds)setPointer({x:e.clientX-bounds.left,y:e.clientY-bounds.top,visible:true});if(!dragRef.current)return;const d=dragRef.current;setPan(clampPan({x:d.panX+e.clientX-d.x,y:d.panY+e.clientY-d.y}));setMathConfirmed(false);setCropBlob(null);setCropUrl('')}
  function onPointerUp(){dragRef.current=null}
  function swapOrientation(){setWidth(height);setHeight(width);setMathConfirmed(false);setCropBlob(null);setCropUrl('');setResult(null)}
  function getCropCanvas(){
    if(!image||!rect)throw new Error('Nėra patvirtintos apkirpimo srities')
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(rect.width));canvas.height=Math.max(1,Math.round(rect.height))
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Nepavyko paruošti apkirpimo')
    ctx.drawImage(image,rect.x,rect.y,rect.width,rect.height,0,0,canvas.width,canvas.height)
    return canvas
  }
  async function confirmCrop(){
    if(!image||!rect)return
    try{
      const canvas=getCropCanvas()
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Nepavyko išsaugoti apkirpimo')), 'image/png'))
      const next=URL.createObjectURL(blob);setCropUrl(old=>{if(old)URL.revokeObjectURL(old);return next});setCropBlob(blob);setMathConfirmed(true);setResult(null);setError('');setStatus('Apkirpimas patvirtintas')
    }catch(e){setError(e instanceof Error?e.message:String(e))}
  }
  function downloadCrop(){if(!cropUrl)return;const a=document.createElement('a');a.href=cropUrl;a.download=`${(file?.name||'nuotrauka').replace(/\.[^.]+$/,'')}-crop.png`;a.click()}
  async function analyse(){
    if(!cropBlob||!mathConfirmed)return
    setBusy(true);setResult(null);setError('');setProgress(0);setStatus('Paruošiamas AI modelis...')
    try{
      const cropped=new Image();cropped.src=URL.createObjectURL(cropBlob);await cropped.decode()
      try{const r=await runIqa(cropped,mode,setProgress);setResult(r);setStatus('AI analizė baigta')}finally{URL.revokeObjectURL(cropped.src)}
    }catch(e){setError(e instanceof Error?e.message:String(e));setStatus('AI analizė nepavyko')}
    finally{setBusy(false)}
  }
  const cropFrameStyle=rect?{left:rect.frameLeft,top:rect.frameTop,width:rect.frameWidth,height:rect.frameHeight}:undefined
  const imageStyle=rect&&image?{left:rect.left,top:rect.top,width:image.naturalWidth*rect.scale,height:image.naturalHeight*rect.scale}:undefined
  const modes:{id:Mode;title:string;desc:string;icon:typeof Cpu}[]=[{id:'light',title:'Mažasis modelis',desc:'DBCNN',icon:Cpu},{id:'optimized',title:'Vidutinis modelis',desc:'HyperIQA',icon:Zap},{id:'full',title:'Maksimalus modelis',desc:'MUSIQ',icon:ScanEye}]
  const dragOver=(e:React.DragEvent)=>{e.preventDefault();e.stopPropagation()}
  const drop=(e:React.DragEvent)=>{dragOver(e);const f=e.dataTransfer.files?.[0];if(f?.type.startsWith('image/'))setFile(f)}
  return <main className="shell">
    <header className="top"><div className="brand"><div className="brandIcon"><ScanEye size={25}/></div><div><div className="eyebrow">FOTOLABORATORIJOS ĮRANKIS</div><h1>Photo Quality <span>AI</span></h1></div></div><div className="local"><ShieldCheck size={16}/> Nuotrauka apdorojama šiame kompiuteryje</div></header>
    <section className="intro"><div><div className="eyebrow">NUOTRAUKŲ DIAGNOSTIKA</div><h2>Patikrink prieš spausdindamas.</h2><p>Pirmiausia matematinis spaudos įvertinimas. AI analizė yra papildomas, pasirenkamas žingsnis.</p></div><div className="introMark"><Activity size={42}/></div></section>
    <div className="layout workspaceLayout">
      <section className="panel uploadPanel"><div className="sectionTitle"><FileImage/><div><h3>1. Nuotrauka</h3><p>Įtempk failą į lauką arba pasirink iš kompiuterio</p></div></div>
        {!file?<div className="drop" onDragOver={dragOver} onDrop={drop} onClick={()=>inputRef.current?.click()}><input ref={inputRef} type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(f)setFile(f)}} hidden/><ImagePlus size={34}/><b>Įkelk nuotrauką čia</b><span>Drag & drop arba paspausk pasirinkimui</span><small>JPG, PNG, WebP. Originalas lieka įrenginyje.</small></div>:<div className="preview"><img src={url} alt="Įkelta nuotrauka"/><div className="fileMeta"><b>{file.name}</b><span>{image?`${image.naturalWidth} × ${image.naturalHeight} px`:'Kraunama...'}</span></div><button className="iconBtn" onClick={clear} title="Pašalinti"><Trash2 size={17}/></button></div>}
      </section>
      <section className="panel"><div className="sectionTitle"><Gauge/><div><h3>2. Spaudos tipas ir formatas</h3><p>Įranga parenkama automatiškai</p></div></div>
        <div className="two"><button className={`mode ${kind==='photo'?'selected':''}`} onClick={()=>{setKind('photo');chooseFormat(20,30)}}><b>Premium nuotrauka</b><small>Noritsu</small></button><button className={`mode ${kind==='wide'?'selected':''}`} onClick={()=>{setKind('wide');chooseFormat(40,60)}}><b>Didelio formato spauda</b><small>Mimaki</small></button></div>
        <button className="orientationBtn" onClick={swapOrientation}>↻ Keisti orientaciją: {width>height?'Horizontali':'Vertikali'}</button><label className="field">Spaudos formatas<select value={custom?'custom':`${width}x${height}`} onChange={e=>{if(e.target.value==='custom'){setCustom(true);setMathConfirmed(false)}else{const [w,h]=e.target.value.split('x').map(Number);chooseFormat(w,h)}}}><option value={`${width}x${height}`}>{fmt(width,height)}</option>{[...activeFormats,...activeFormats.map(([w,h])=>[h,w] as [number,number])].filter(([w,h],i,all)=>!(w===width&&h===height)&&all.findIndex(([a,b])=>a===w&&b===h)===i).map(([w,h])=><option key={`${w}x${h}`} value={`${w}x${h}`}>{fmt(w,h)}</option>)}<option value="custom">Individualūs matmenys</option></select></label>
        {custom&&<div className="two"><label className="field">Plotis (cm)<input type="number" min="1" max="300" value={width} onChange={e=>{setWidth(Number(e.target.value));setMathConfirmed(false);setCropBlob(null)}}/></label><label className="field">Aukštis (cm)<input type="number" min="1" max="300" value={height} onChange={e=>{setHeight(Number(e.target.value));setMathConfirmed(false);setCropBlob(null)}}/></label></div>}
        <div className="profile"><b>{kind==='photo'?'Noritsu':'Mimaki'}</b><span>{kind==='photo'?'Premium nuotraukų spauda':'Didelio formato spauda'}</span></div>
      </section>
      <section className="panel cropPanel"><div className="sectionTitle"><Crop/><div><h3>3. Apkirpimas ir kadruotė</h3><p>Tempk nuotrauką po fiksuotu spaudos formato rėmeliu</p></div></div>
        {image&&rect?<><div className="cropEditor"><div className="cropStagePro" ref={stageRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerLeave={()=>setPointer(p=>({...p,visible:false}))}><img className="cropSource" src={url} alt="Nuotraukos kadruotė" draggable={false} style={imageStyle}/><div className="cropShade"/><div className="cropWindow" style={cropFrameStyle}><div className="cropGrid"><i/><i/><i/><i/><i/><i/><i/><i/><i/></div></div><div className="cropZoomDock"><button className="iconBtn" onClick={()=>setZoomLevel(zoom+.2)} title="Priartinti apkirpimą"><ZoomIn size={18}/></button><button className="iconBtn" onClick={()=>setZoomLevel(zoom-.2)} disabled={zoom<=1} title="Atitolinti apkirpimą"><ZoomOut size={18}/></button><button className={`iconBtn ${magnifier?'activeTool':''}`} onClick={()=>setMagnifier(v=>!v)} title="Didinamasis stiklas"><ScanEye size={18}/></button></div><div className="cropHelp">↔ Vilkite nuotrauką · +/- keičia apkirpimo mastelį</div>{magnifier&&pointer.visible&&image&&rect&&<div className="magnifierLens" style={{left:Math.min(stageSize.width-164,Math.max(0,pointer.x+22)),top:Math.min(stageSize.height-164,Math.max(0,pointer.y+22))}}><img src={url} draggable={false} style={{left:82+(rect.left-pointer.x)*2,top:82+(rect.top-pointer.y)*2,width:image.naturalWidth*rect.scale*2,height:image.naturalHeight*rect.scale*2}}/></div>}</div></div>
          <div className="cropTools"><label className="lensToggle"><input type="checkbox" checked={magnifier} onChange={e=>setMagnifier(e.target.checked)}/> Didinamasis stiklas prie kursoriaus</label><button className="iconBtn resetCrop" onClick={()=>{setZoom(1);setPan({x:0,y:0});setMathConfirmed(false);setCropBlob(null);setCropUrl('')}}><RotateCcw size={15}/> Atstatyti apkirpimą</button></div>
          <p className="hint">Rėmelio proporcijos atitinka {fmt(width,height)}. Už rėmelio esanti sritis nebus spausdinama. Priartink vaizdą ir vilk jį, kad pasirinktum tikslią iškarpą.</p>
        </>:<p className="hint">Pirmiausia įkelk nuotrauką, tada galėsi ją apkirpti.</p>}
      </section>
      <section className="panel"><div className="sectionTitle"><Calculator/><div><h3>4. Matematinis įvertinimas</h3><p>Skaičiuojama pagal tikrą apkirptų pikselių kiekį</p></div></div>
        <div className="mathGrid"><div><span>Apkirptos srities raiška</span><b>{rect?`${Math.round(rect.width)} × ${Math.round(rect.height)} px`:'Laukiama nuotraukos'}</b></div><div><span>Efektyvi spaudos raiška</span><b>{image?`${cropPpi.toFixed(1)} PPI`:'–'}</b></div><div><span>Pasirinktas formatas</span><b>{fmt(width,height)}</b></div><div><span>Raiškos vertinimas</span><b>{image?printGrade(cropPpi,profile):'Laukiama nuotraukos'}</b></div></div>
        <button className="analyze" disabled={!image||width<=0||height<=0} onClick={confirmCrop}><Crop size={17}/> Patvirtinti apkirpimą</button>
        {mathConfirmed&&cropBlob&&<div className="successLine"><ShieldCheck size={16}/> Apkirpimas išsaugotas. <button className="downloadBtn" onClick={downloadCrop}><Download size={15}/> Atsisiųsti PNG</button></div>}
      </section>
      <section className="panel"><div className="sectionTitle"><Sparkles/><div><h3>5. Papildoma AI analizė</h3><p>AI tikrina patvirtintą apkirptą vaizdą</p></div></div>
        <label className="toggle"><input type="checkbox" checked={aiEnabled} onChange={e=>{setAiEnabled(e.target.checked);setResult(null);setError('')}}/> Atlikti AI fotografinės kokybės analizę</label>
        {aiEnabled&&<><div className="modeList">{modes.map(m=>{const I=m.icon;return <button key={m.id} className={`mode ${mode===m.id?'selected':''}`} onClick={()=>setMode(m.id)}><I size={20}/><span><b>{m.title}</b><small>{m.desc}</small></span><i/></button>})}</div><div className="modelNote"><ShieldCheck size={16}/><span>AI analizuoja tik patvirtintą apkirptą nuotrauką. Modelio balas neparodo konkrečių defektų vietų.</span></div></>}
        <div className="actionRow"><span>{status}</span><button className="analyze" disabled={!cropBlob||!mathConfirmed||!aiEnabled||busy} onClick={analyse}>{busy?<Loader2 className="spin"/>:<Zap/>}{busy?'Analizuojama...':'Paleisti AI analizę'}</button></div>
        {busy&&<><div className="progress"><div style={{width:`${progress}%`}}/></div><small>Modelio atsisiuntimas / paruošimas: {progress}%</small></>}
        {error&&<div className="alert"><AlertTriangle/><div><b>AI analizė nepavyko</b><p>{error}</p></div></div>}
        {result&&<div className="result"><div className="resultHead"><div><div className="eyebrow">AI KOKYBĖS PROGNOZĖ</div><h3>{result.model==='HyperIQA'?'Modelio regresijos rezultatas':qualityWord(result.score)}</h3></div><div className="score">{result.model==='HyperIQA'?result.rawScore.toFixed(4):result.score}<small>{result.model==='HyperIQA'?' raw':'/100'}</small></div></div>{result.model!=='HyperIQA'&&<div className="bar"><div style={{width:`${result.score}%`}}/></div>}<div className="resultGrid"><div><span>Modelis</span><b>{result.model}</b></div><div><span>Vykdymas</span><b>{result.provider==='webgpu'?'GPU':'CPU'}</b></div><div><span>Trukmė</span><b>{(result.durationMs/1000).toFixed(1)} s</b></div></div><p className="hint">{result.model==='HyperIQA'?'HyperIQA grąžina žalią regresijos reikšmę, kurios negalima interpretuoti kaip procentų. ':''}Modelis pateikia bendrą kokybės prognozę, o ne paaiškinamus defektų žemėlapius.</p></div>}
      </section>
    </div>
    <footer>PHOTO QUALITY AI <span>•</span> VIETINĖ ANALIZĖ <span>•</span> BETA 4.2</footer>
  </main>
}
