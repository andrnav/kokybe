import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AlertTriangle, Cpu, FileImage, Gauge, ImagePlus, Loader2, ScanEye, ShieldCheck, Trash2, Zap, Crop, Calculator, Sparkles, Download, RotateCcw, Layers, Images } from 'lucide-react'
import type { Mode, Profile } from './analysis'
import { printGrade, qualityWord, runIqa } from './analysis'

type Result = Awaited<ReturnType<typeof runIqa>>
type PrintKind = 'photo' | 'wide'
const photoFormats = [[9,13],[10,15],[13,18],[15,20],[20,30],[30,45]]
const wideFormats = [[30,40],[40,60],[50,70],[50,75],[60,90],[70,100],[100,150]]
const fmt = (w:number,h:number)=>`${w} × ${h} cm`
type Rect = { x:number;y:number;width:number;height:number;scale:number;left:number;top:number;frameLeft:number;frameTop:number;frameWidth:number;frameHeight:number }


type BatchOutput = 'jpg' | 'tif'
type BatchItem = { id:string; file:File; previewUrl:string; status:'waiting'|'done'|'error'; message?:string; output?:Blob; outputName?:string; width?:number;height?:number }
async function decodeBatchFile(file:File):Promise<HTMLImageElement>{
  let source:Blob=file
  if(/\.heic$/i.test(file.name)||file.type==='image/heic'||file.type==='image/heif'){
    const mod=await import('heic2any')
    const converted=await mod.default({blob:file,toType:'image/png'})
    source=Array.isArray(converted)?converted[0]:converted
  }
  const url=URL.createObjectURL(source)
  try{const img=new Image();img.src=url;await img.decode();return img}catch{throw new Error('Šio formato nepavyko iškoduoti šiame kompiuteryje.')}finally{URL.revokeObjectURL(url)}
}
function encodeTiff(canvas:HTMLCanvasElement):Blob{
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Nepavyko nuskaityti vaizdo')
  const {width,height}=canvas,rgba=ctx.getImageData(0,0,width,height).data
  const pixels=new Uint8Array(width*height*3)
  for(let i=0,j=0;i<rgba.length;i+=4){pixels[j++]=rgba[i];pixels[j++]=rgba[i+1];pixels[j++]=rgba[i+2]}
  const entries=11,ifdOffset=8,ifdSize=2+entries*12+4,bitsOffset=ifdOffset+ifdSize,pixelOffset=bitsOffset+6
  const buffer=new ArrayBuffer(pixelOffset+pixels.length),view=new DataView(buffer),bytes=new Uint8Array(buffer)
  view.setUint8(0,0x49);view.setUint8(1,0x49);view.setUint16(2,42,true);view.setUint32(4,ifdOffset,true)
  view.setUint16(ifdOffset,entries,true)
  let o=ifdOffset+2
  const entry=(tag:number,type:number,count:number,value:number)=>{view.setUint16(o,tag,true);view.setUint16(o+2,type,true);view.setUint32(o+4,count,true);view.setUint32(o+8,value,true);o+=12}
  entry(256,4,1,width);entry(257,4,1,height);entry(258,3,3,bitsOffset);entry(259,3,1,1);entry(262,3,1,2);entry(273,4,1,pixelOffset);entry(277,3,1,3);entry(278,4,1,height);entry(279,4,1,pixels.length);entry(284,3,1,1);entry(296,3,1,2)
  view.setUint32(o,0,true)
  view.setUint16(bitsOffset,8,true);view.setUint16(bitsOffset+2,8,true);view.setUint16(bitsOffset+4,8,true)
  bytes.set(pixels,pixelOffset)
  return new Blob([buffer],{type:'image/tiff'})
}
function BatchProcessor(){
  const [items,setItems]=useState<BatchItem[]>([])
  const [ratio,setRatio]=useState('original')
  const [output,setOutput]=useState<BatchOutput>('jpg')
  const [quality,setQuality]=useState(1)
  const [copies,setCopies]=useState(1)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [selected,setSelected]=useState<string|null>(null)
  const input=useRef<HTMLInputElement>(null)
  const addFiles=(files:FileList|null)=>{if(!files)return;const accepted=Array.from(files).filter(f=>f.type.startsWith('image/')||/\.(heic|heif|tif|tiff|bmp|avif|gif)$/i.test(f.name));setItems(prev=>[...prev,...accepted.map((file)=>({id:`${file.name}-${file.size}-${Math.random()}`,file,previewUrl:URL.createObjectURL(file),status:'waiting' as const}))]);setMessage('')}
  const aspect=ratio==='original'?null:ratio==='3:2'?3/2:ratio==='2:3'?2/3:ratio==='4:3'?4/3:ratio==='1:1'?1:16/9
  async function processAll(){
    if(!items.length||busy)return
    setBusy(true);setMessage('Apdorojamos nuotraukos...')
    const next=[...items]
    for(let i=0;i<next.length;i++){
      const item=next[i]
      try{
        const img=await decodeBatchFile(item.file)
        let sx=0,sy=0,sw=img.naturalWidth,sh=img.naturalHeight
        if(aspect){const source=sw/sh;if(source>aspect){sw=sh*aspect;sx=(img.naturalWidth-sw)/2}else{sh=sw/aspect;sy=(img.naturalHeight-sh)/2}}
        const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(sw));canvas.height=Math.max(1,Math.round(sh))
        const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas neprieinamas')
        ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,sx,sy,sw,sh,0,0,canvas.width,canvas.height)
        const blob=output==='tif'?encodeTiff(canvas):await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('JPG eksportas nepavyko')),'image/jpeg',quality))
        const base=item.file.name.replace(/\.[^.]+$/,'')
        const prefix=copies>1?`${copies}x - `:''
        const ext=output==='tif'?'tif':'jpg'
        next[i]={...item,status:'done',output:blob,outputName:`${prefix}${base}.${ext}`,width:canvas.width,height:canvas.height}
      }catch(e){next[i]={...item,status:'error',message:e instanceof Error?e.message:String(e)}}
      setItems([...next]);setMessage(`Apdorota ${i+1} iš ${next.length}`)
    }
    setBusy(false);setMessage('Apdorojimas baigtas. Pažymėtos nuotraukos paruoštos eksportui.')
  }
  async function downloadAll(){
    const ready=items.filter(i=>i.output&&i.outputName);if(!ready.length)return
    const {default:JSZip}=await import('jszip');const zip=new JSZip()
    ready.forEach(i=>zip.file(i.outputName!,i.output!))
    const blob=await zip.generateAsync({type:'blob',compression:'STORE'})
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='photo-batch.zip';a.click();URL.revokeObjectURL(url)
  }
  function downloadOne(item:BatchItem){if(!item.output||!item.outputName)return;const url=URL.createObjectURL(item.output),a=document.createElement('a');a.href=url;a.download=item.outputName;a.click();URL.revokeObjectURL(url)}
  const selectedItem=items.find(i=>i.id===selected)
  return <section className="batchWorkspace">
    <div className="batchHeader"><div><div className="eyebrow">MASINIS APDOROJIMAS</div><h2>Partijų apdorojimas</h2><p>Įkelk nuotraukas, pasirink apkirpimo proporciją ir eksportavimo formatą.</p></div><button className="analyze" onClick={()=>input.current?.click()}><ImagePlus size={17}/> Pridėti nuotraukas</button><input ref={input} hidden multiple type="file" accept="image/*,.heic,.heif,.tif,.tiff,.bmp,.avif,.gif" onChange={e=>{addFiles(e.target.files);e.currentTarget.value=''}}/></div>
    <div className="batchSettings panel">
      <label className="field">Apkirpimo proporcija<select value={ratio} onChange={e=>setRatio(e.target.value)}><option value="original">Originali (neapkirpti)</option><option value="3:2">3:2</option><option value="2:3">2:3</option><option value="4:3">4:3</option><option value="1:1">1:1</option><option value="16:9">16:9</option></select></label>
      <label className="field">Išsaugojimo formatas<select value={output} onChange={e=>setOutput(e.target.value as BatchOutput)}><option value="jpg">JPG (maksimali kokybė)</option><option value="tif">TIFF (be suspaudimo)</option></select></label>
      {output==='jpg'&&<label className="field">JPG kokybė <select value={quality} onChange={e=>setQuality(Number(e.target.value))}><option value="1">100 % (maksimali, vis tiek nuostolinis)</option></select></label>}
      <label className="field">Kopijų skaičius<input type="number" min="1" max="99" value={copies} onChange={e=>setCopies(Math.max(1,Math.min(99,Number(e.target.value)||1)))}/><small>{copies>1?`${copies}x - failo-pavadinimas.jpg`:'Numatyta: be prefikso'}</small></label>
      <div className="formatNote"><ShieldCheck size={17}/><span>TIFF eksportuojamas RGB 8 bitų, visiškai be suspaudimo. JPG išsaugomas 100 % kokybės nustatymu, tačiau pats JPEG formatas vis tiek naudoja nuostolinį kodavimą.</span></div>
    </div>
    <div className="batchGalleryHead"><h3><Images size={18}/> Nuotraukų sąrašas <span>{items.length}</span></h3><div className="batchActions"><button className="secondaryBtn" disabled={!items.length||busy} onClick={()=>{items.forEach(i=>URL.revokeObjectURL(i.previewUrl));setItems([])}}><Trash2 size={15}/> Išvalyti</button><button className="analyze" disabled={!items.length||busy} onClick={processAll}>{busy?<Loader2 className="spin"/>:<Zap size={16}/>} Apdoroti visas</button><button className="analyze" disabled={!items.some(i=>i.output)||busy} onClick={downloadAll}><Download size={16}/> Atsisiųsti ZIP</button></div></div>
    {message&&<p className="batchMessage">{message}</p>}
    {!items.length?<button className="batchEmpty" onClick={()=>input.current?.click()}><ImagePlus size={36}/><b>Įkelk iki 100 nuotraukų ar daugiau</b><span>JPG, PNG, HEIC, GIF, WebP, BMP, TIFF ir kiti naršyklės palaikomi vaizdai</span></button>:<div className="batchContent"><div className="thumbGrid">{items.map(item=><button key={item.id} className={`thumbCard ${selected===item.id?'chosen':''}`} onClick={()=>setSelected(item.id)}><div className="thumbPreview"><img src={item.previewUrl} alt="" onError={e=>{e.currentTarget.style.display="none"}}/>{item.output?<span className="doneMark">✓</span>:null}<span className="thumbExt">{item.file.name.split('.').pop()?.toUpperCase()}</span></div><b title={item.file.name}>{item.file.name}</b><small>{item.status==='done'?`${item.width} × ${item.height} px · Paruošta`:item.status==='error'?item.message:'Laukia apdorojimo'}</small>{item.output&&<span className="thumbDownload" onClick={e=>{e.stopPropagation();downloadOne(item)}}>Atsisiųsti</span>}</button>)}</div><aside className="batchDetail">{selectedItem?<><b>{selectedItem.file.name}</b><span>{(selectedItem.file.size/1024/1024).toFixed(2)} MB</span><span>{selectedItem.status==='done'?'Paruošta eksportui':selectedItem.status==='error'?selectedItem.message:'Dar neapdorota'}</span>{selectedItem.output&&<button className="analyze" onClick={()=>downloadOne(selectedItem)}><Download size={15}/> Atsisiųsti failą</button>}</>:<p>Pasirink nuotrauką sąraše, kad matytum jos informaciją.</p>}</aside></div>}
    <p className="hint">Failai apdorojami vietoje naršyklėje. GIF atveju naudojamas pirmasis kadras. HEIC dekodavimui naudojama lokaliai įkeliama biblioteka. RAW failai sąmoningai nepalaikomi.</p>
  </section>
}

export default function App() {
  const [activeTab,setActiveTab] = useState<'quality'|'batch'>('quality')
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
  const [cropFrameScale,setCropFrameScale] = useState(1)
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
  const dragRef = useRef<{x:number;y:number;panX:number;panY:number;mode:'pan'|'resize';frameScale:number}|null>(null)
  const profile:Profile = kind === 'photo' ? 'noritsu' : 'mimaki_poster'
  const ratio = width / height
  const activeFormats = kind === 'photo' ? photoFormats : wideFormats

  useEffect(()=>{
    if(!stageRef.current) return
    const el=stageRef.current
    const update=()=>setStageSize({width:el.clientWidth,height:el.clientHeight})
    update(); const ro=new ResizeObserver(update);ro.observe(el);return ()=>ro.disconnect()
  },[image])
  useEffect(()=>{ if(!file) return; const next=URL.createObjectURL(file); const img=new Image(); img.onload=()=>{setImage(img);setUrl(next);setZoom(1);setCropFrameScale(1);setPan({x:0,y:0});setResult(null);setMathConfirmed(false);setCropBlob(null);setCropUrl('')}; img.onerror=()=>setError('Nepavyko atidaryti nuotraukos.'); img.src=next; return ()=>URL.revokeObjectURL(next) },[file])
  useEffect(()=>()=>{if(cropUrl)URL.revokeObjectURL(cropUrl)},[cropUrl])

  const rect:Rect|null=useMemo(()=>{
    if(!image||!stageSize.width||!stageSize.height||width<=0||height<=0)return null
    const fw=Math.min(stageSize.width*.86,stageSize.height*.86*ratio)*cropFrameScale
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
  },[image,stageSize,ratio,zoom,pan,cropFrameScale])
  const cropPpi=rect?Math.min(rect.width/(width/2.54),rect.height/(height/2.54)):0

  function clear(){setFile(null);setImage(null);setUrl('');setResult(null);setError('');setProgress(0);setMathConfirmed(false);setAiEnabled(false);setCropBlob(null);setCropUrl('')}
  function chooseFormat(w:number,h:number){setWidth(w);setHeight(h);setCustom(false);setResult(null);setMathConfirmed(false);setCropBlob(null);setCropUrl('');setZoom(1);setCropFrameScale(1);setPan({x:0,y:0})}
  function clampPan(next:{x:number;y:number},nextZoom=zoom){
    if(!image)return next
    const fw=Math.min(stageSize.width*.86,stageSize.height*.86*ratio)*cropFrameScale,fh=fw/ratio
    const s=Math.max(fw/image.naturalWidth,fh/image.naturalHeight)*nextZoom
    const maxX=Math.max(0,(image.naturalWidth*s-fw)/2),maxY=Math.max(0,(image.naturalHeight*s-fh)/2)
    return {x:Math.max(-maxX,Math.min(maxX,next.x)),y:Math.max(-maxY,Math.min(maxY,next.y))}
  }
  function onPointerDown(e:React.PointerEvent){if(!image)return;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);dragRef.current={x:e.clientX,y:e.clientY,panX:pan.x,panY:pan.y,mode:'pan',frameScale:cropFrameScale}}
  function onCornerDown(e:React.PointerEvent){e.preventDefault();e.stopPropagation();if(!image)return;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);dragRef.current={x:e.clientX,y:e.clientY,panX:pan.x,panY:pan.y,mode:'resize',frameScale:cropFrameScale}}
  function onPointerMove(e:React.PointerEvent){const bounds=stageRef.current?.getBoundingClientRect();if(bounds)setPointer({x:e.clientX-bounds.left,y:e.clientY-bounds.top,visible:true});if(!dragRef.current)return;const d=dragRef.current;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(d.mode==='resize'){const delta=(dx+dy*(ratio>1?ratio:1/ratio))/Math.max(260,stageSize.width+stageSize.height)*2.2;const next=Math.max(.35,Math.min(1,d.frameScale+delta));setCropFrameScale(next);setPan(p=>clampPan(p,zoom));}else{setPan(clampPan({x:d.panX+dx,y:d.panY+dy}));}setMathConfirmed(false);setCropBlob(null);setCropUrl('')}
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
    <nav className="appTabs"><button className={activeTab==='quality'?'active':''} onClick={()=>setActiveTab('quality')}><ScanEye size={17}/> Kokybės tikrinimas</button><button className={activeTab==='batch'?'active':''} onClick={()=>setActiveTab('batch')}><Layers size={17}/> Partijų apdorojimas</button></nav>
    {activeTab==='batch'?<BatchProcessor/>:<>

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
        {image&&rect?<><div className="cropEditor"><div className="cropStagePro" ref={stageRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerLeave={()=>setPointer(p=>({...p,visible:false}))}><img className="cropSource" src={url} alt="Nuotraukos kadruotė" draggable={false} style={imageStyle}/><div className="cropShade"/><div className="cropWindow" style={cropFrameStyle}><div className="cropGrid"><i/><i/><i/><i/><i/><i/><i/><i/><i/></div><button className="cropHandle tl" onPointerDown={onCornerDown} aria-label="Keisti apkirpimo dydį"/><button className="cropHandle tr" onPointerDown={onCornerDown} aria-label="Keisti apkirpimo dydį"/><button className="cropHandle bl" onPointerDown={onCornerDown} aria-label="Keisti apkirpimo dydį"/><button className="cropHandle br" onPointerDown={onCornerDown} aria-label="Keisti apkirpimo dydį"/></div><div className="cropZoomDock"><button className={`iconBtn ${magnifier?'activeTool':''}`} onClick={()=>setMagnifier(v=>!v)} title="Didinamasis stiklas"><ScanEye size={18}/></button></div><div className="cropHelp">Vilk nuotrauką · tempk rėmelio kampus, kad keistum apkirpimo mastelį</div>{magnifier&&pointer.visible&&image&&rect&&<div className="magnifierLens" style={{left:Math.min(stageSize.width-164,Math.max(0,pointer.x+22)),top:Math.min(stageSize.height-164,Math.max(0,pointer.y+22))}}><img src={url} draggable={false} style={{left:82+(rect.left-pointer.x)*2,top:82+(rect.top-pointer.y)*2,width:image.naturalWidth*rect.scale*2,height:image.naturalHeight*rect.scale*2}}/></div>}</div></div>
          <div className="cropTools"><label className="lensToggle"><input type="checkbox" checked={magnifier} onChange={e=>setMagnifier(e.target.checked)}/> Didinamasis stiklas prie kursoriaus</label><button className="iconBtn resetCrop" onClick={()=>{setZoom(1);setCropFrameScale(1);setPan({x:0,y:0});setMathConfirmed(false);setCropBlob(null);setCropUrl('')}}><RotateCcw size={15}/> Atstatyti apkirpimą</button></div>
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
    <footer>PHOTO QUALITY AI <span>•</span> VIETINĖ ANALIZĖ <span>•</span> BETA 4.4</footer>
    </>}
  </main>
}
