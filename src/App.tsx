import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Cpu, FileImage, Gauge, ImagePlus, Loader2, ScanEye, ShieldCheck, Trash2, Zap } from 'lucide-react'
import { Mode, Profile, chooseProfile, ppi, profiles, printGrade, qualityWord, runIqa } from './analysis'

type Result = Awaited<ReturnType<typeof runIqa>>
const modes: { id: Mode; title: string; desc: string; icon: typeof Cpu }[] = [
  { id:'full', title:'Pilna AI analizė', desc:'MUSIQ modelis. Išsamiausias bendros vaizdo kokybės režimas.', icon: ScanEye },
  { id:'optimized', title:'Optimizuota AI analizė', desc:'HyperIQA modelis. Kasdieniam darbui ir greitesnei analizei.', icon: Zap },
  { id:'light', title:'Mažesnis AI modelis + bazinė analizė', desc:'DBCNN modelis. Silpnesniems kompiuteriams.', icon: Cpu }
]
export default function App() {
  const [file,setFile] = useState<File|null>(null)
  const [image,setImage] = useState<HTMLImageElement|null>(null)
  const [url,setUrl] = useState('')
  const [mode,setMode] = useState<Mode>('optimized')
  const [product,setProduct] = useState('Fotopopierius')
  const [width,setWidth] = useState(20)
  const [height,setHeight] = useState(30)
  const [progress,setProgress] = useState(0)
  const [busy,setBusy] = useState(false)
  const [result,setResult] = useState<Result|null>(null)
  const [error,setError] = useState('')
  const [status,setStatus] = useState('Pasiruošusi analizei')
  const profile = useMemo(()=>chooseProfile(product,width),[product,width])
  const effectivePpi = image ? Math.min(ppi(image.naturalWidth,width),ppi(image.naturalHeight,height)) : 0

  useEffect(()=>{ if(!file) return; const next=URL.createObjectURL(file); setUrl(next); const img=new Image(); img.onload=()=>setImage(img); img.onerror=()=>setError('Nepavyko atidaryti šio vaizdo formato.'); img.src=next; return ()=>URL.revokeObjectURL(next) },[file])
  function clear(){setFile(null);setImage(null);setUrl('');setResult(null);setError('');setProgress(0);setStatus('Pasiruošusi analizei')}
  async function analyse(){
    if(!image) return
    setBusy(true);setResult(null);setError('');setProgress(0);setStatus('Paruošiamas vietinis AI modelis...')
    try { const r=await runIqa(image,mode,setProgress);setResult(r);setStatus('AI analizė baigta') }
    catch(e){setError(e instanceof Error?e.message:String(e));setStatus('Analizė nepavyko')}
    finally{setBusy(false)}
  }
  const currentMode=modes.find(m=>m.id===mode)!
  const Icon=currentMode.icon
  return <main className="shell">
    <header className="top"><div className="brand"><div className="brandIcon"><ScanEye size={25}/></div><div><div className="eyebrow">FOTOLABORATORIJOS ĮRANKIS</div><h1>Photo Quality <span>AI</span></h1></div></div><div className="local"><ShieldCheck size={16}/> Analizė vyksta šiame kompiuteryje</div></header>
    <section className="intro"><div><div className="eyebrow">NUOTRAUKŲ DIAGNOSTIKA</div><h2>Patikrink prieš spausdindamas.</h2><p>AI modelis įvertina bendrą fotografinę kokybę. Spaudos raiška apskaičiuojama atskirai pagal pasirinktą formatą.</p></div><div className="introMark"><Activity size={42}/></div></section>
    <div className="layout">
      <section className="panel uploadPanel"><div className="sectionTitle"><FileImage/><div><h3>1. Nuotrauka</h3><p>Originalas lieka tavo įrenginyje</p></div></div>
        {!file?<label className="drop"><input type="file" accept="image/*,.tif,.tiff" onChange={e=>{const f=e.target.files?.[0];if(f){setFile(f);setResult(null);setError('')}}}/><ImagePlus size={34}/><b>Pasirink nuotrauką</b><span>JPG, PNG, WebP arba naršyklės palaikomas formatas</span><small>TIFF analizė šiame leidime dar nepalaikoma</small></label>:<div className="preview"><img src={url} alt="Įkelta nuotrauka"/><div className="fileMeta"><b>{file.name}</b><span>{image?`${image.naturalWidth} × ${image.naturalHeight} px`:'Kraunama...'}</span></div><button className="iconBtn" onClick={clear} title="Pašalinti"><Trash2 size={17}/></button></div>}
      </section>
      <section className="panel"><div className="sectionTitle"><Cpu/><div><h3>2. AI analizės režimas</h3><p>Modelis vykdomas naršyklėje</p></div></div><div className="modeList">{modes.map(m=>{const I=m.icon;return <button key={m.id} className={`mode ${mode===m.id?'selected':''}`} onClick={()=>{setMode(m.id);setResult(null);setError('')}}><I size={20}/><span><b>{m.title}</b><small>{m.desc}</small></span><i/></button>})}</div><div className="modelNote"><ShieldCheck size={16}/><span>Modelis atsisiunčiamas pirmą kartą. Vėliau naudojama naršyklės talpykla.</span></div></section>
      <section className="panel"><div className="sectionTitle"><Gauge/><div><h3>3. Spaudos nustatymai</h3><p>Profilis parenkamas automatiškai</p></div></div><label className="field">Gaminys<select value={product} onChange={e=>setProduct(e.target.value)}><option>Fotopopierius</option><option>Plakatas</option><option>Drobė</option></select></label><div className="two"><label className="field">Plotis (cm)<input type="number" min="1" max="300" value={width} onChange={e=>setWidth(Number(e.target.value))}/></label><label className="field">Aukštis (cm)<input type="number" min="1" max="300" value={height} onChange={e=>setHeight(Number(e.target.value))}/></label></div><div className="profile"><b>{profiles[profile].printer}</b><span>{profiles[profile].material}</span><small>{profiles[profile].label}</small></div>{image&&<div className="ppiLine"><span>Efektyvi raiška</span><b>{Math.round(effectivePpi)} PPI</b><small>{printGrade(effectivePpi,profile)}</small></div>}</section>
      <section className="panel actionPanel"><div><div className="sectionTitle"><ScanEye/><div><h3>4. Analizė</h3><p>{status}</p></div></div><div className="modelSelected"><Icon size={17}/><span>{currentMode.title}</span></div>{busy&&<div className="progress"><div style={{width:`${progress}%`}}/></div>}{busy&&<small>Modelio atsisiuntimas / paruošimas: {progress}%</small>}</div><button className="analyze" disabled={!image||busy} onClick={analyse}>{busy?<Loader2 className="spin"/>:<Zap/>}{busy?'Analizuojama...':'Pradėti AI analizę'}</button></section>
      {error&&<section className="alert"><AlertTriangle/><div><b>Analizė nepavyko</b><p>{error}</p></div></section>}
      {result&&<section className="result panel"><div className="resultHead"><div><div className="eyebrow">AI KOKYBĖS ĮVERTINIMAS</div><h3>{qualityWord(result.score)}</h3></div><div className="score">{result.score}<small>/100</small></div></div><div className="bar"><div style={{width:`${result.score}%`}}/></div><div className="resultGrid"><div><span>AI modelis</span><b>{result.model}</b></div><div><span>Vykdymas</span><b>{result.provider==='webgpu'?'GPU / WebGPU':'CPU / WASM'}</b></div><div><span>Analizės laikas</span><b>{(result.durationMs/1000).toFixed(1)} s</b></div><div><span>Spaudos raiška</span><b>{Math.round(effectivePpi)} PPI</b></div></div><p className="caveat"><AlertTriangle size={16}/> AI balas yra bendros vaizdo kokybės prognozė, ne garantija spaudos rezultatui. Šiame pradiniame leidime dar nėra atskiro veidų / akių ryškumo modelio ir triukšmo lokalizavimo.</p></section>}
    </div>
    <footer>PHOTO QUALITY AI <span>•</span> VIETINĖ ANALIZĖ <span>•</span> BETA 1.0</footer>
  </main>
}
