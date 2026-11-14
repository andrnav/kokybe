import * as ort from 'onnxruntime-web'

export type Mode = 'full' | 'optimized' | 'light'
export type Profile = 'noritsu' | 'mimaki_poster' | 'mimaki_canvas'
export type ModelResult = { score: number; model: string; provider: string; durationMs: number }

const MODELS = {
  full: { name: 'MUSIQ', url: 'https://huggingface.co/86Cao/IQA-ONNX-Models/resolve/main/musiq_model.onnx', size: 'apie 104 MB' },
  optimized: { name: 'HyperIQA', url: 'https://huggingface.co/86Cao/IQA-ONNX-Models/resolve/main/hyperiqa_model.onnx', size: 'apie 105 MB' },
  light: { name: 'DBCNN', url: 'https://huggingface.co/86Cao/IQA-ONNX-Models/resolve/main/dbcnn_model.onnx', size: 'apie 59 MB' }
} as const

export const profiles: Record<Profile, { label: string; printer: string; material: string; good: number; acceptable: number; weak: number }> = {
  noritsu: { label: 'Fotopopierius iki 30,5 cm', printer: 'Noritsu QSS-3701HD', material: 'Fujifilm Crystal Archive DP II', good: 160, acceptable: 120, weak: 90 },
  mimaki_poster: { label: 'Plakatas / foto popierius', printer: 'Mimaki JV100-160', material: 'Plakatinis / foto popierius', good: 100, acceptable: 80, weak: 60 },
  mimaki_canvas: { label: 'Drobė', printer: 'Mimaki JV100-160', material: 'Drobė', good: 72, acceptable: 55, weak: 40 }
}

export function chooseProfile(product: string, widthCm: number): Profile {
  if (product === 'Drobė') return 'mimaki_canvas'
  return widthCm <= 30.5 ? 'noritsu' : 'mimaki_poster'
}
export function ppi(px: number, cm: number) { return px / (cm / 2.54) }
export function printGrade(value: number, profile: Profile) {
  const p = profiles[profile]
  return value >= p.good ? 'Gera raiška' : value >= p.acceptable ? 'Priimtina raiška' : value >= p.weak ? 'Silpna raiška' : 'Nepakankama raiška'
}

async function createSession(mode: Mode, onProgress: (v: number) => void) {
  const model = MODELS[mode]
  const url = model.url
  const cache = await caches.open('photo-quality-ai-models-v1').catch(() => null)
  let buffer: ArrayBuffer
  const cached = await cache?.match(url)
  if (cached) {
    buffer = await cached.arrayBuffer()
    onProgress(100)
  } else {
    const response = await fetch(url)
    if (!response.ok || !response.body) throw new Error(`Nepavyko atsisiųsti ${model.name} modelio (${response.status}).`)
    const total = Number(response.headers.get('content-length')) || 0
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value); loaded += value.length
      if (total) onProgress(Math.min(99, Math.round(loaded / total * 100)))
    }
    const bytes = new Uint8Array(loaded)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    buffer = bytes.buffer
    if (cache) await cache.put(url, new Response(buffer.slice(0)))
    onProgress(100)
  }
  const providers: ('webgpu' | 'wasm')[] = []
  if ('gpu' in navigator) providers.push('webgpu')
  providers.push('wasm')
  let lastError: unknown
  for (const provider of providers) {
    try {
      const session = await ort.InferenceSession.create(buffer, { executionProviders: [provider], graphOptimizationLevel: 'all' })
      return { session, provider, model: model.name }
    } catch (e) { lastError = e }
  }
  throw new Error(`Modelio nepavyko paleisti šioje naršyklėje: ${String(lastError)}`)
}

function imageTensor(image: HTMLImageElement, size = 224) {
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight)
  const w = image.naturalWidth * scale, h = image.naturalHeight * scale
  ctx.drawImage(image, (size-w)/2, (size-h)/2, w, h)
  const { data } = ctx.getImageData(0,0,size,size)
  const values = new Float32Array(3*size*size)
  for (let i=0; i<size*size; i++) {
    values[i] = (data[i*4]/255 - 0.485)/0.229
    values[size*size+i] = (data[i*4+1]/255 - 0.456)/0.224
    values[2*size*size+i] = (data[i*4+2]/255 - 0.406)/0.225
  }
  return new ort.Tensor('float32', values, [1,3,size,size])
}

export async function runIqa(image: HTMLImageElement, mode: Mode, onProgress: (v:number)=>void): Promise<ModelResult> {
  const started = performance.now()
  const { session, provider, model } = await createSession(mode, onProgress)
  const inputName = session.inputNames[0]
  if (!inputName) throw new Error('AI modelis neturi atpažįstamo įvesties sluoksnio.')
  const input = imageTensor(image)
  const outputs = await session.run({ [inputName]: input })
  const output = outputs[session.outputNames[0]]
  if (!output?.data?.length) throw new Error('AI modelis negrąžino kokybės rezultato.')
  const raw = Number(output.data[0])
  if (!Number.isFinite(raw)) throw new Error('AI modelio rezultatas netinkamas.')
  // DBCNN is commonly exported to 0..100; HyperIQA 0..1. MUSIQ export scale must be calibrated.
  let score: number
  if (mode === 'optimized' && raw >= 0 && raw <= 1.5) score = raw * 100
  else if (raw >= 0 && raw <= 1.5) score = raw * 100
  else score = raw
  if (score < 0 || score > 100) throw new Error(`Neatpažintas ${model} išvesties mastelis (${raw.toFixed(3)}). Balas nerodomas, kol modelis nesukalibruotas.`)
  return { score: Math.round(score), model, provider, durationMs: Math.round(performance.now()-started) }
}

export function qualityWord(score: number) {
  if (score >= 80) return 'Aukšta kokybė'
  if (score >= 65) return 'Gana gera kokybė'
  if (score >= 45) return 'Vidutinė kokybė'
  if (score >= 25) return 'Žema kokybė'
  return 'Labai žema kokybė'
}
