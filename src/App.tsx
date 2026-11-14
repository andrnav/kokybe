import { useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, Upload, Trash2, ZoomIn, ZoomOut, RotateCcw, ShieldCheck, Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import exifr from 'exifr'
import { analyseImage, dpiLevel, effectiveDpi, type Analysis } from './analysis'

const MAX_FILE_SIZE = 500 * 1024 * 1024
const presets = [
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
      if (meta?.XResolution) {
        const factor = meta.ResolutionUnit === 3 ? 2.54 : 1
        setDpiMeta(Math.round(meta.XResolution * factor))
      }
    } catch { /* Missing or unreadable metadata is normal. */ }
  }
  const onImageLoad = () => {
    if (imageRef.current) setAnalysis(analyseImage(imageRef.current))
  }
  const sizes = presets.find(p => p.name === product)?.sizes ?? []
  // Try both orientations and choose the one that preserves the most pixels.
  // The image is not cropped; the limiting axis determines effective DPI.
  const directW = analysis ? effectiveDpi(analysis.width, size.w) : 0
  const directH = analysis ? effectiveDpi(analysis.height, size.h) : 0
  const rotatedW = analysis ? effectiveDpi(analysis.height, size.w) : 0
  const rotatedH = analysis ? effectiveDpi(analysis.width, size.h) : 0
  const directDpi = Math.min(directW, directH)
  const rotatedDpi = Math.min(rotatedW, rotatedH)
  const useRotated = rotatedDpi > directDpi
  const dpiW = useRotated ? rotatedW : directW
  const dpiH = useRotated ? rotatedH : directH
  const dpi = Math.max(directDpi, rotatedDpi)
  const rating = dpiLevel(dpi)
  const maxSize = useMemo(() => {
    if (!analysis) return null
    return Math.floor(Math.min(analysis.width, analysis.height) / (150 / 2.54))
  }, [analysis])
  const useSize = (w: number, h: number) => { setSize({ w, h }); setCustomW(String(w)); setCustomH(String(h)) }
  const handleCustom = () => {
    const w = Number(customW), h = Number(customH)
    if (w > 0 && h > 0 && w <= 500 && h <= 500) setSize({ w, h })
  }
  return <main className="shell">
    <header className="topbar">
      <div className="brand"><div className="brand-icon"><ImagePlus size={21}/></div><div><div className="brand-name">Photo Quality Checker</div><div className="brand-sub">Spaudos kokybės analizė</div></div></div>
      <div className="privacy"><ShieldCheck size={15}/> Apdorojama šiame įrenginyje</div>
    </header>
    <section className="intro"><div><div className="eyebrow">FOTO LABORATORIJOS ĮRANKIS</div><h1>Patikrink nuotrauką<br/><span>prieš gamybą.</span></h1><p>Įkelkite kliento failą ir akimirksniu įvertinkite jo tinkamumą pasirinktam spaudos dydžiui.</p></div><div className="intro-mark">PQ<span>•</span></div></section>
    <div className="workspace">
      <section className="panel upload-panel">
        <div className="panel-head"><div><div className="step">01 / NUOTRAUKA</div><h2>Įkelkite failą</h2></div>{file && <button className="icon-button" onClick={clear} title="Pašalinti nuotrauką"><Trash2 size={17}/></button>}</div>
        {!file ? <div className={`dropzone ${drag ? 'dragging' : ''}`} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);void load(e.dataTransfer.files[0])}} onClick={()=>inputRef.current?.click()}>
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={e=>void load(e.target.files?.[0])}/>
          <div className="upload-icon"><Upload size={23}/></div><strong>Nutempkite nuotrauką čia</strong><span>arba pasirinkite iš kompiuterio</span><button className="secondary-button"><ImagePlus size={16}/> Pasirinkti nuotrauką</button><small>JPG, PNG, WebP, TIFF · iki 500 MB</small>
        </div> : <><div className="preview-toolbar"><span className="filename">{file.name}</span><div className="zoom-controls"><button onClick={()=>setZoom(z=>Math.max(.5,z-.25))}><ZoomOut size={15}/></button><span>{Math.round(zoom*100)}%</span><button onClick={()=>setZoom(z=>Math.min(3,z+.25))}><ZoomIn size={15}/></button><button onClick={()=>setZoom(1)}><RotateCcw size={14}/></button></div></div><div className="preview"><img ref={imageRef} src={url} onLoad={onImageLoad} alt="Įkelta nuotrauka" style={{transform:`scale(${zoom})`}}/></div><div className="preview-footer"><span><CheckCircle2 size={14}/> Failas įkeltas lokaliai</span><button onClick={clear}>Pašalinti failą</button></div></>}
        {analysis && <div className="file-stats"><div><span>Plotis</span><b>{analysis.width.toLocaleString('lt-LT')} px</b></div><div><span>Aukštis</span><b>{analysis.height.toLocaleString('lt-LT')} px</b></div><div><span>Megapikseliai</span><b>{analysis.megapixels.toFixed(1)} MP</b></div></div>}
      </section>
      <section className="panel settings-panel">
        <div className="panel-head"><div><div className="step">02 / GAMINYS</div><h2>Pasirinkite dydį</h2></div></div>
        <label className="field-label">Gaminio tipas</label><div className="product-tabs">{presets.map(p=><button key={p.name} className={product===p.name?'active':''} onClick={()=>{setProduct(p.name);useSize(p.sizes[0][0],p.sizes[0][1])}}>{p.name}</button>)}</div>
        <label className="field-label">Standartiniai dydžiai <span>cm</span></label><div className="size-grid">{sizes.map(([w,h])=><button key={`${w}x${h}`} className={size.w===w&&size.h===h?'selected':''} onClick={()=>useSize(w,h)}>{w} × {h}</button>)}</div>
        <label className="field-label">Individualus dydis <span>cm</span></label><div className="custom-size"><input aria-label="Plotis centimetrais" type="number" min="1" max="500" value={customW} onChange={e=>setCustomW(e.target.value)}/><span>×</span><input aria-label="Aukštis centimetrais" type="number" min="1" max="500" value={customH} onChange={e=>setCustomH(e.target.value)}/><button onClick={handleCustom}>Taikyti</button></div>
        <div className="hint"><Info size={15}/> Skaičiavimas atliekamas pagal visą nuotrauką, jos neapkerpant. Jei proporcijos skiriasi, reikės apkirpti arba palikti paraštes.</div>
        <div className="selected-size"><span>Pasirinktas gaminys</span><strong>{product} · {size.w} × {size.h} cm</strong></div>
      </section>
    </div>
    <section className="results">
      <div className="results-heading"><div><div className="step">03 / ANALIZĖ</div><h2>Kokybės rezultatas</h2></div><span className="live-tag">{analysis ? 'ANALIZĖ ATLIKTA' : 'LAUKIAMA NUOTRAUKOS'}</span></div>
      {!analysis ? <div className="empty-result"><div className="empty-symbol"><ImagePlus size={25}/></div><div><strong>Rezultatas bus rodomas čia</strong><p>Įkelkite nuotrauką, kad apskaičiuotume jos tinkamumą gamybai.</p></div></div> : <div className="result-grid">
        <div className={`score-card ${rating.color}`}><div className="score-label">EFEKTYVI RAIŠKA</div><div className="score-number">{Math.round(dpi)} <small>DPI</small></div><div className="score-status">{rating.label}</div><p>Pagal pasirinktą {size.w} × {size.h} cm dydį, išlaikant visą nuotrauką.</p></div>
        <div className="metrics-card"><div className="metric"><span>Horizontali raiška</span><b>{Math.round(dpiW)} DPI</b></div><div className="metric"><span>Vertikali raiška</span><b>{Math.round(dpiH)} DPI</b></div><div className="metric"><span>Originalo DPI metaduomenys</span><b>{dpiMeta ? `${dpiMeta} DPI` : 'Nenurodyta'}</b></div><div className="metric"><span>Ryškumo indikatorius</span><b>{analysis.sharpness}/100 · {analysis.sharpnessLabel}</b></div></div>
        <div className="recommendation"><div className="recommend-icon">{dpi>=150?<CheckCircle2 size={20}/>:dpi>=100?<AlertTriangle size={20}/>:<XCircle size={20}/>}</div><div><strong>{dpi>=150?'Raiška tinkama pagal pasirinktą ribą':dpi>=100?'Kokybė gali būti ribinė':'Didelė kokybės praradimo rizika'}</strong><p>{dpi>=200?'Spaudiniui turėtų pakakti pikselių geram rezultatui.':dpi>=150?'Tikėtinas priimtinas rezultatas, ypač žiūrint įprastu atstumu.':dpi>=100?'Galimas matomas detalumo praradimas. Rekomenduojama peržiūrėti vaizdą 100 % masteliu.':'Failas turi per mažai pikselių pasirinktam dydžiui. Rekomenduojama prašyti didesnės originalios nuotraukos.'}</p><p className="sharpness-note">{analysis.warning}</p></div></div>
        <div className="max-size"><span>Apytikslis trumpiausios kraštinės maksimalus dydis prie 150 DPI</span><b>{maxSize} cm</b></div>
      </div>}
    </section>
    <footer><div className="footer-privacy"><ShieldCheck size={15}/> Privatumas: nuotrauka neįkeliama į serverį ir nėra išsaugoma aplikacijoje.</div><span>PHOTO QUALITY CHECKER · BETA 0.1</span></footer>
  </main>
}
export default App
