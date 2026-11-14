import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AlertTriangle, Cpu, FileImage, Gauge, ImagePlus, Loader2, ScanEye, ShieldCheck, Trash2, Zap, Crop, Calculator, Sparkles } from 'lucide-react'
import type { Mode, Profile } from './analysis'
import { chooseProfile, ppi, profiles, printGrade, qualityWord, runIqa } from './analysis'

type Result = Awaited<ReturnType<typeof runIqa>>
type PrintKind = 'photo' | 'wide'
const photoFormats = [[9,13],[10,15],[13,18],[15,20],[20,30],[30,45]]
const wideFormats = [[30,40],[40,60],[50,70],[50,75],[60,90],[70,100],[100,150]]
const fmt = (w:number,h:number)=>`${w} × ${h} cm`

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
  const [offsetX,setOffsetX] = useState(50)
  const [offsetY,setOffsetY] = useState(50)
  const [progress,setProgress] = useState(0)
  const [busy,setBusy] = useState(false)
  const [result,setResult] = useState<Result|null>(null)
  const [error,setError] = useState('')
  const [status,setStatus] = useState('Pasiruošusi')
  const [mathConfirmed,setMathConfirmed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const profile:Profile = kind === 'photo' ? 'noritsu' : 'mimaki_poster'
  const ratio = width / height
  const imageRatio = image ? image.naturalWidth / image.naturalHeight : 1
  const cropFraction = Math.min(imageRatio/ratio, ratio/imageRatio)
  const effectivePpi = image ? Math.min(ppi(image.naturalWidth, Math.min(width, height) * Math.min(imageRatio,ratio)/Math.min(imageRatio,ratio)), ppi(image.naturalHeight, height)) : 0
  const cropPpi = image ? Math.min((Math.min(image.naturalWidth, image.naturalHeight * ratio))/(width/2.54), (Math.min(image.naturalHeight, image.naturalWidth/ratio))/(height/2.54)) : 0
  const activeFormats = kind === 'photo' ? photoFormats : wideFormats

  useEffect(()=>{ if(!file) return; const next=URL.createObjectURL(file); const img=new Image(); img.onload=()=>{setImage(img);setUrl(next);setOffsetX(50);setOffsetY(50);setResult(null);setMathConfirmed(false)}; img.onerror=()=>setError('Nepavyko atidaryti nuotraukos.'); img.src=next; return ()=>URL.revokeObjectURL(next) },[file])
  function clear(){setFile(null);setImage(null);setUrl('');setResult(null);setError('');setProgress(0);setMathConfirmed(false);setAiEnabled(false)}
  function chooseFormat(w:number,h:number){setWidth(w);setHeight(h);setCustom(false);setResult(null);setMathConfirmed(false);setOffsetX(50);setOffsetY(50)}
  function confirmCrop(){setMathConfirmed(true);setResult(null);setError('')}
  async function analyse(){
    if(!image||!mathConfirmed) return
    setBusy(true);setResult(null);setError('');setProgress(0);setStatus('Paruošiamas AI modelis...')
    try {
      const canvas=document.createElement('canvas')
      const targetRatio=width/height
      const sourceRatio=image.naturalWidth/image.naturalHeight
      let sw=image.naturalWidth, sh=image.naturalHeight, sx=0, sy=0
      if(sourceRatio>targetRatio){sw=sh*targetRatio;sx=(image.naturalWidth-sw)*offsetX/100}
      else {sh=sw/targetRatio;sy=(image.naturalHeight-sh)*offsetY/100}
      canvas.width=Math.round(sw);canvas.height=Math.round(sh)
      canvas.getContext('2d')!.drawImage(image,sx,sy,sw,sh,0,0,canvas.width,canvas.height)
      const cropped=new Image(); cropped.src=canvas.toDataURL('image/jpeg',0.95); await cropped.decode()
      const r=await runIqa(cropped,mode,setProgress);setResult(r);setStatus('AI analizė baigta')
    } catch(e){setError(e instanceof Error?e.message:String(e));setStatus('AI analizė nepavyko')}
    finally{setBusy(false)}
  }
  const cropStyle = useMemo(()=>({aspectRatio:`${width}/${height}`}),[width,height])
  const modes:{id:Mode;title:string;desc:string;icon:typeof Cpu}[]=[
    {id:'light',title:'Mažasis modelis',desc:'DBCNN',icon:Cpu},
    {id:'optimized',title:'Vidutinis modelis',desc:'HyperIQA',icon:Zap},
    {id:'full',title:'Maksimalus modelis',desc:'MUSIQ',icon:ScanEye}
  ]
  const currentMode=modes.find(m=>m.id===mode)!
  const Icon=currentMode.icon
  const dragOver=(e:React.DragEvent)=>{e.preventDefault();e.stopPropagation()}
  const drop=(e:React.DragEvent)=>{dragOver(e);const f=e.dataTransfer.files?.[0];if(f?.type.startsWith('image/'))setFile(f)}
  return <main className="shell">
    <header className="top"><div className="brand"><div className="brandIcon"><ScanEye size={25}/></div><div><div className="eyebrow">FOTOLABORATORIJOS ĮRANKIS</div><h1>Photo Quality <span>AI</span></h1></div></div><div className="local"><ShieldCheck size={16}/> Nuotrauka apdorojama šiame kompiuteryje</div></header>
    <section className="intro"><div><div className="eyebrow">NUOTRAUKŲ DIAGNOSTIKA</div><h2>Patikrink prieš spausdindamas.</h2><p>Pirmiausia matematinis spaudos įvertinimas. AI analizė yra papildomas, pasirenkamas žingsnis.</p></div><div className="introMark"><Activity size={42}/></div></section>
    <div className="layout">
      <section className="panel uploadPanel"><div className="sectionTitle"><FileImage/><div><h3>1. Nuotrauka</h3><p>Įtempk failą į lauką arba pasirink iš kompiuterio</p></div></div>
        {!file?<div className="drop" onDragOver={dragOver} onDrop={drop} onClick={()=>inputRef.current?.click()}><input ref={inputRef} type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(f)setFile(f)}} hidden/><ImagePlus size={34}/><b>Įkelk nuotrauką čia</b><span>Drag & drop arba paspausk pasirinkimui</span><small>JPG, PNG, WebP. Originalas lieka įrenginyje.</small></div>:<div className="preview"><img src={url} alt="Įkelta nuotrauka"/><div className="fileMeta"><b>{file.name}</b><span>{image?`${image.naturalWidth} × ${image.naturalHeight} px`:'Kraunama...'}</span></div><button className="iconBtn" onClick={clear} title="Pašalinti"><Trash2 size={17}/></button></div>}
      </section>
      <section className="panel"><div className="sectionTitle"><Gauge/><div><h3>2. Spaudos tipas ir formatas</h3><p>Įranga parenkama automatiškai</p></div></div>
        <div className="two"><button className={`mode ${kind==='photo'?'selected':''}`} onClick={()=>{setKind('photo');chooseFormat(20,30)}}><b>Premium nuotrauka</b><small>Noritsu</small></button><button className={`mode ${kind==='wide'?'selected':''}`} onClick={()=>{setKind('wide');chooseFormat(40,60)}}><b>Didelio formato spauda</b><small>Mimaki</small></button></div>
        <label className="field">Populiarūs formatai<select value={custom?'custom':`${width}x${height}`} onChange={e=>{if(e.target.value==='custom'){setCustom(true);setMathConfirmed(false)}else{const [w,h]=e.target.value.split('x').map(Number);chooseFormat(w,h)}}}><option value={`${width}x${height}`}>{fmt(width,height)}</option>{activeFormats.filter(([w,h])=>!(w===width&&h===height)).map(([w,h])=><option key={`${w}x${h}`} value={`${w}x${h}`}>{fmt(w,h)}</option>)}<option value="custom">Individualūs matmenys</option></select></label>
        {custom&&<div className="two"><label className="field">Plotis (cm)<input type="number" min="1" max="300" value={width} onChange={e=>{setWidth(Number(e.target.value));setMathConfirmed(false)}}/></label><label className="field">Aukštis (cm)<input type="number" min="1" max="300" value={height} onChange={e=>{setHeight(Number(e.target.value));setMathConfirmed(false)}}/></label></div>}
        <div className="profile"><b>{kind==='photo'?'Noritsu':'Mimaki'}</b><span>{kind==='photo'?'Premium nuotraukų spauda':'Didelio formato spauda'}</span></div>
      </section>
      <section className="panel"><div className="sectionTitle"><Crop/><div><h3>3. Apkirpimas ir kadruotė</h3><p>Pažymėta sritis bus spausdinama</p></div></div>
        {image?<><div className="cropStage"><div className="cropImage" style={cropStyle}><img src={url} alt="Apkirpimo peržiūra" style={{width:imageRatio>ratio?'auto':'100%',height:imageRatio>ratio?'100%':'auto',maxWidth:'none',maxHeight:'none',left:imageRatio>ratio?`${50-offsetX}%`:'50%',top:imageRatio>ratio?'50%':`${50-offsetY}%`,transform:imageRatio>ratio?'translate(-50%,-50%)':'translate(-50%,-50%)'}}/><div className="cropFrame"/></div></div><div className="two"><label className="field">Kadruotė horizontaliai<input type="range" min="0" max="100" value={offsetX} onChange={e=>{setOffsetX(Number(e.target.value));setMathConfirmed(false)}} disabled={imageRatio<=ratio}/></label><label className="field">Kadruotė vertikaliai<input type="range" min="0" max="100" value={offsetY} onChange={e=>{setOffsetY(Number(e.target.value));setMathConfirmed(false)}} disabled={imageRatio>=ratio}/></label></div><p className="hint">Tamsesnė sritis už kadro ribų bus nukirpta. Slankikliu pastumk iškarpą į norimą vietą.</p></>:<p className="hint">Pirmiausia įkelk nuotrauką, tada galėsi keisti jos kadravimą.</p>}
      </section>
      <section className="panel"><div className="sectionTitle"><Calculator/><div><h3>4. Matematinis įvertinimas</h3><p>Atliekamas automatiškai, be AI</p></div></div>
        <div className="mathGrid"><div><span>Apkirptos nuotraukos raiška</span><b>{Math.round(cropPpi||0)} PPI</b></div><div><span>Pasirinktas formatas</span><b>{fmt(width,height)}</b></div><div><span>Spaudos sistema</span><b>{kind==='photo'?'Noritsu':'Mimaki'}</b></div><div><span>Raiškos vertinimas</span><b>{image?printGrade(cropPpi,profile):'Laukiama nuotraukos'}</b></div></div>
        <button className="analyze" disabled={!image||width<=0||height<=0} onClick={confirmCrop}><Crop size={17}/> Patvirtinti kadruotę ir skaičiavimus</button>
        {mathConfirmed&&<p className="successLine"><ShieldCheck size={16}/> Kadruotė patvirtinta. Matematinis įvertinimas atnaujintas.</p>}
      </section>
      <section className="panel"><div className="sectionTitle"><Sparkles/><div><h3>5. Papildoma AI analizė</h3><p>Pasirenkama, jei matematinio įvertinimo nepakanka</p></div></div>
        <label className="toggle"><input type="checkbox" checked={aiEnabled} onChange={e=>{setAiEnabled(e.target.checked);setResult(null);setError('')}}/> Atlikti AI fotografinės kokybės analizę</label>
        {aiEnabled&&<><div className="modeList">{modes.map(m=>{const I=m.icon;return <button key={m.id} className={`mode ${mode===m.id?'selected':''}`} onClick={()=>setMode(m.id)}><I size={20}/><span><b>{m.title}</b><small>{m.desc}</small></span><i/></button>})}</div><div className="modelNote"><ShieldCheck size={16}/><span>AI vertina bendrą suvokiamą kokybę. Modelis pats nepateikia patikimų priežasčių ar objektų paaiškinimų.</span></div></>}
        <div className="actionRow"><span>{status}</span><button className="analyze" disabled={!image||!mathConfirmed||!aiEnabled||busy} onClick={analyse}>{busy?<Loader2 className="spin"/>:<Zap/>}{busy?'Analizuojama...':'Paleisti AI analizę'}</button></div>
        {busy&&<><div className="progress"><div style={{width:`${progress}%`}}/></div><small>Modelio atsisiuntimas / paruošimas: {progress}%</small></>}
        {error&&<div className="alert"><AlertTriangle/><div><b>AI analizė nepavyko</b><p>{error}</p></div></div>}
        {result&&<div className="result"><div className="resultHead"><div><div className="eyebrow">AI KOKYBĖS PROGNOZĖ</div><h3>{qualityWord(result.score)}</h3></div><div className="score">{result.score}<small>/100</small></div></div><div className="bar"><div style={{width:`${result.score}%`}}/></div><div className="resultGrid"><div><span>Modelis</span><b>{result.model}</b></div><div><span>Vykdymas</span><b>{result.provider==='webgpu'?'GPU':'CPU'}</b></div><div><span>Trukmė</span><b>{(result.durationMs/1000).toFixed(1)} s</b></div></div><p className="hint">Šis modelis pateikia bendrą kokybės prognozę. Jis negrąžina paaiškinamų defektų žemėlapių, todėl konkrečių pastabų apie išsiliejimą, triukšmą ar veidų ryškumą neišgalvojame.</p></div>}
      </section>
    </div>
    <footer>PHOTO QUALITY AI <span>•</span> VIETINĖ ANALIZĖ <span>•</span> BETA 3.0</footer>
  </main>
}
