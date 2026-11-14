import { useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, Upload, Trash2, ZoomIn, ZoomOut, RotateCcw, ShieldCheck, Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import exifr from 'exifr'
import {
  analyseImage, effectiveDpi, selectPrintProfile, combinedQualityScore,
  qualityLabel, recommendedSize, type Analysis
} from './analysis'

const MAX_FILE_SIZE = 500 * 1024 * 1024
const products = [
  { name: 'Drobė', sizes: [[30,40],[40,60],[50,70],[60,90],[70,100],[100,150]] },
  { name: 'Fotopopierius', sizes: [[10,15],[13,18],[15,21],[20,30],[30,45]] },
  { name: 'Plakatas', sizes: [[30,40],[40,60],[50,70],[60,90],[70,100]] },
]
type Size = { w: number; h: number }

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [dpiMeta, setDpiMeta] = useState<number | null>(null)
  const [product, setProduct] = useState('Drobė')
  const [size, setSize] = useState<Size>({ w: 30, h: 40 })
  const [customW, setCustomW] = useState('30')
  const [customH, setCustomH] = useState('40')
  const [zoom, setZoom] = useState(1)
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const clear = () => {
    if (url) URL.revokeObjectURL(url)
    setFile(null); setUrl(''); setAnalysis(null); setDpiMeta(null); setZoom(1)
    if (inputRef.current) inputRef.current.value = ''
  }
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  const load = async (picked?: File) => {
    if (!picked) return
    if (picked.size > MAX_FILE_SIZE) { alert('Failas per didelis. Maksimalus leidžiamas dydis – 500 MB.'); return }
    const isTiff = /\.tiff?$/i.test(picked.name) || picked.type === 'image/tiff'
    if (!picked.type.startsWith('image/') && !isTiff) { alert('Pasirinkite nuotraukos failą.'); return }
    clear()
    const nextUrl = URL.createObjectURL(picked)
    setFile(picked); setUrl(nextUrl)
    try {
      const meta = await exifr.parse(picked, { pick: ['XResolution', 'YResolution', 'ResolutionUnit'] })
      if (meta?.XResolution) setDpiMeta(Math.round(meta.XResolution * (meta.ResolutionUnit === 3 ? 2.54 : 1)))
    } catch { /* metadata is optional */ }
  }
  const onImageLoad = () => {
    if (imageRef.current) {
      try { setAnalysis(analyseImage(imageRef.current)) }
      catch (e) { alert(e instanceof Error ? e.message : 'Nepavyko išanalizuoti nuotraukos.') }
    }
  }
  const sizes = products.find(p => p.name === product)?.sizes ?? []
  const directDpi = analysis ? Math.min(effectiveDpi(analysis.width, size.w), effectiveDpi(analysis.height, size.h)) : 0
  const rotatedDpi = analysis ? Math.min(effectiveDpi(analysis.height, size.w), effectiveDpi(analysis.width, size.h)) : 0
  const dpi = Math.max(directDpi, rotatedDpi)
  const profile = selectPrintProfile(product, size.w)
  const score = analysis ? combinedQualityScore(dpi, analysis.sharpness, profile) : 0
  const overall = qualityLabel(score)
  const targetGoodPpi = profile.good
  const targetAcceptablePpi = profile.acceptable
  const recommended = useMemo(() => analysis ? recommendedSize(analysis.width, analysis.height, profile, targetGoodPpi) : null, [analysis, profile, targetGoodPpi])
  const maxAcceptable = useMemo(() => analysis ? recommendedSize(analysis.width, analysis.height, profile, targetAcceptablePpi) : null, [analysis, profile, targetAcceptablePpi])
  const useSize = (w: number, h: number) => { setSize({ w, h }); setCustomW(String(w)); setCustomH(String(h)) }
  const handleCustom = () => {
    const w = Number(customW), h = Number(customH)
    if (w > 0 && h > 0 && w <= 500 && h <= 500) setSize({ w, h })
  }
  const changeProduct = (name: string) => {
    setProduct(name)
    const p = products.find(x => x.name === name)!
    useSize(p.sizes[0][0], p.sizes[0][1])
  }

  return <main className="shell">
    <header className="topbar">
      <div className="brand"><div className="brand-icon"><ImagePlus size={21}/></div><div><div className="brand-name">Photo Quality Checker</div><div className="brand-sub">Spaudos kokybės analizė · v0.3 testinė</div></div></div>
      <div className="privacy"><ShieldCheck size={15}/> Apdorojama šiame įrenginyje</div>
    </header>
    <section className="intro"><div><div className="eyebrow">FOTO LABORATORIJOS ĮRANKIS</div><h1>Patikrink nuotrauką<br/><span>prieš gamybą.</span></h1><p>Vertinimas pritaikomas pagal spausdintuvą, medžiagą ir fizinį spaudos plotį.</p></div><div className="intro-mark">PQ<span>•</span></div></section>
    <div className="workspace">
      <section className="panel upload-panel">
        <div className="panel-head"><div><div className="step">01 / NUOTRAUKA</div><h2>Įkelkite failą</h2></div>{file && <button className="icon-button" onClick={clear} title="Pašalinti nuotrauką"><Trash2 size={17}/></button>}</div>
        {!file ? <div className={`dropzone ${drag ? 'dragging' : ''}`} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);void load(e.dataTransfer.files[0])}} onClick={()=>inputRef.current?.click()}>
          <input ref={inputRef} type="file" accept="image/*,.tif,.tiff" hidden onChange={e=>void load(e.target.files?.[0])}/>
          <div className="upload-icon"><Upload size={23}/></div><strong>Nutempkite nuotrauką čia</strong><span>arba pasirinkite iš kompiuterio</span><button className="secondary-button"><ImagePlus size={16}/> Pasirinkti nuotrauką</button><small>JPG, PNG, WebP, TIFF · iki 500 MB</small>
        </div> : <><div className="preview-toolbar"><span className="filename">{file.name}</span><div className="zoom-controls"><button onClick={()=>setZoom(z=>Math.max(.5,z-.25))}><ZoomOut size={15}/></button><span>{Math.round(zoom*100)}%</span><button onClick={()=>setZoom(z=>Math.min(3,z+.25))}><ZoomIn size={15}/></button><button onClick={()=>setZoom(1)}><RotateCcw size={14}/></button></div></div><div className="preview"><img ref={imageRef} src={url} onLoad={onImageLoad} alt="Įkelta nuotrauka" style={{transform:`scale(${zoom})`}}/></div><div className="preview-footer"><span><CheckCircle2 size={14}/> Failas įkeltas lokaliai</span><button onClick={clear}>Pašalinti failą</button></div></>}
        {analysis && <div className="file-stats"><div><span>Plotis</span><b>{analysis.width.toLocaleString('lt-LT')} px</b></div><div><span>Aukštis</span><b>{analysis.height.toLocaleString('lt-LT')} px</b></div><div><span>Megapikseliai</span><b>{analysis.megapixels.toFixed(1)} MP</b></div></div>}
      </section>
      <section className="panel settings-panel">
        <div className="panel-head"><div><div className="step">02 / GAMINYS</div><h2>Pasirinkite dydį</h2></div></div>
        <label className="field-label">Gaminio tipas</label><div className="product-tabs">{products.map(p=><button key={p.name} className={product===p.name?'active':''} onClick={()=>changeProduct(p.name)}>{p.name}</button>)}</div>
        <label className="field-label">Standartiniai dydžiai <span>cm</span></label><div className="size-grid">{sizes.map(([w,h])=><button key={`${w}x${h}`} className={size.w===w&&size.h===h?'selected':''} onClick={()=>useSize(w,h)}>{w} × {h}</button>)}</div>
        <label className="field-label">Individualus dydis <span>cm</span></label><div className="custom-size"><input aria-label="Plotis centimetrais" type="number" min="1" max="500" value={customW} onChange={e=>setCustomW(e.target.value)}/><span>×</span><input aria-label="Aukštis centimetrais" type="number" min="1" max="500" value={customH} onChange={e=>setCustomH(e.target.value)}/><button onClick={handleCustom}>Taikyti</button></div>
        <div className="hint"><Info size={15}/> Spausdintuvas parenkamas pagal fizinį plotį: iki 30,5 cm – Noritsu, daugiau – Mimaki. Pasukimas leidžiamas, apkirpimas neįskaičiuotas.</div>
        <div className="selected-size"><span>Parinktas profilis</span><strong>{profile.printer} · {profile.material}</strong></div>
      </section>
    </div>
    <section className="results">
      <div className="results-heading"><div><div className="step">03 / ANALIZĖ</div><h2>Kokybės rezultatas</h2></div><span className="live-tag">{analysis ? 'ANALIZĖ ATLIKTA' : 'LAUKIAMA NUOTRAUKOS'}</span></div>
      {!analysis ? <div className="empty-result"><div className="empty-symbol"><ImagePlus size={25}/></div><div><strong>Rezultatas bus rodomas čia</strong><p>Įkelkite nuotrauką, kad apskaičiuotume jos tinkamumą gamybai.</p></div></div> : <div className="result-grid">
        <div className={`score-card ${overall.color}`}><div className="score-label">BENDRAS SPAUDOS TINKAMUMAS</div><div className="score-number">{score}<small> / 100 %</small></div><div className="score-status">{overall.label}</div><p>{profile.printer} · {profile.material}</p></div>
        <div className="metrics-card">
          <div className="metric"><span>Efektyvi raiška</span><b>{Math.round(dpi)} PPI</b></div>
          <div className="metric"><span>Raiškos įvertinimas</span><b>{Math.round((dpi / profile.excellent) * 100)} % nuo puikaus profilio</b></div>
          <div className="metric"><span>Ryškumo indikatorius</span><b>{analysis.sharpness}/100 · {analysis.sharpnessLabel}</b></div>
          <div className="metric"><span>Originalo DPI metaduomenys</span><b>{dpiMeta ? `${dpiMeta} DPI` : 'Nenurodyta'}</b></div>
        </div>
        <div className="recommendation"><div className="recommend-icon">{score>=70?<CheckCircle2 size={20}/>:score>=55?<AlertTriangle size={20}/>:<XCircle size={20}/>}</div><div><strong>{score>=80?'Gera spaudai pagal pasirinktą profilį':score>=70?'Spausdinimas turėtų būti priimtinas':score>=55?'Galima spausdinti su kokybės rizika':'Didelė kokybės praradimo rizika'}</strong><p>Raiška vertinama pagal gaminio profilį. Bendrą balą sudaro 70 % raiškos ir 30 % bendro vaizdo Laplaso ryškumo indikatoriaus.</p><p className="sharpness-note">{analysis.warning}</p></div></div>
        <div className="max-size"><span>Rekomenduojamas dydis („gero“ raiškos lygio riba)</span><b>{recommended ? `${recommended.widthCm.toFixed(0)} × ${recommended.heightCm.toFixed(0)} cm` : '–'}</b></div>
        <div className="max-size"><span>Didžiausias orientacinis dydis („priimtina“ riba)</span><b>{maxAcceptable ? `${maxAcceptable.widthCm.toFixed(0)} × ${maxAcceptable.heightCm.toFixed(0)} cm` : '–'}</b></div>
      </div>}
    </section>
    <footer><div className="footer-privacy"><ShieldCheck size={15}/> Nuotrauka neįkeliama į serverį.</div><span>PHOTO QUALITY CHECKER · BETA 0.3</span></footer>
  </main>
}
export default App
