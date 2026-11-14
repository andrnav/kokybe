import * as ort from 'onnxruntime-web'

export type Mode = 'full' | 'optimized' | 'light'
export type Profile = 'noritsu' | 'mimaki_poster' | 'mimaki_canvas'
export type ModelResult = { score: number; model: string; provider: string; durationMs: number; rawScore: number }

type ModelConfig = {
  name: string
  modelFile: string
  externalFile: string
  modelUrl: string
  externalUrl: string
  scoreScale: '0-1' | '0-100' | 'raw'
  normalization: 'imagenet' | 'minus-one-to-one'
  description: string
}

const HF = 'https://huggingface.co/86Cao/IQA-ONNX-Models/resolve/main'
const MODELS: Record<Mode, ModelConfig> = {
  full: {
    name: 'MUSIQ', modelFile: 'musiq_model.onnx', externalFile: 'musiq_model.onnx.data',
    modelUrl: `${HF}/musiq_model.onnx`, externalUrl: `${HF}/musiq_model.onnx.data`,
    scoreScale: '0-100', normalization: 'minus-one-to-one',
    description: 'MUSIQ single-scale export; 224 × 224'
  },
  optimized: {
    name: 'HyperIQA', modelFile: 'hyperiqa_model.onnx', externalFile: 'hyperiqa_model.onnx.data',
    modelUrl: `${HF}/hyperiqa_model.onnx`, externalUrl: `${HF}/hyperiqa_model.onnx.data`,
    scoreScale: 'raw', normalization: 'imagenet',
    description: 'HyperIQA; ImageNet normalization'
  },
  light: {
    name: 'DBCNN', modelFile: 'dbcnn_model.onnx', externalFile: 'dbcnn_model.onnx.data',
    modelUrl: `${HF}/dbcnn_model.onnx`, externalUrl: `${HF}/dbcnn_model.onnx.data`,
    scoreScale: '0-100', normalization: 'imagenet',
    description: 'DBCNN; ImageNet normalization'
  }
}

const CACHE_NAME = 'photo-quality-ai-model-cache-v2'

export const profiles: Record<Profile, { label: string; printer: string; material: string; good: number; acceptable: number; weak: number }> = {
  noritsu: { label: 'Fotopopierius iki 30,5 cm', printer: 'Noritsu QSS-3701HD', material: 'Fujifilm Crystal Archive DP II', good: 160, acceptable: 120, weak: 90 },
  mimaki_poster: { label: 'Plakatas / foto popierius', printer: 'Mimaki JV100-160', material: 'Plakatinis / foto popierius', good: 100, acceptable: 80, weak: 60 },
  mimaki_canvas: { label: 'Drobė', printer: 'Mimaki JV100-160', material: 'Drobė', good: 72, acceptable: 55, weak: 40 }
}

export function chooseProfile(product: string, widthCm: number): Profile {
  if (product === 'Drobė') return 'mimaki_canvas'
  return widthCm <= 30.5 ? 'noritsu' : 'mimaki_poster'
}
export function ppi(px: number, cm: number) { return cm > 0 ? px / (cm / 2.54) : 0 }
export function printGrade(value: number, profile: Profile) {
  const p = profiles[profile]
  return value >= p.good ? 'Gera raiška' : value >= p.acceptable ? 'Priimtina raiška' : value >= p.weak ? 'Silpna raiška' : 'Nepakankama raiška'
}

async function fetchCached(url: string, onProgress: (loaded: number, total: number) => void): Promise<Uint8Array> {
  const cache = 'caches' in globalThis ? await caches.open(CACHE_NAME).catch(() => null) : null
  const cached = await cache?.match(url)
  if (cached) {
    const bytes = new Uint8Array(await cached.arrayBuffer())
    onProgress(bytes.byteLength, bytes.byteLength)
    return bytes
  }

  const response = await fetch(url, { mode: 'cors' })
  if (!response.ok) throw new Error(`Atsisiuntimas nepavyko (${response.status}): ${url.split('/').pop()}`)
  if (!response.body) throw new Error('Naršyklė nepateikė atsisiuntimo srauto.')

  const total = Number(response.headers.get('content-length')) || 0
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    onProgress(loaded, total)
  }
  const result = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
  if (cache) {
    try { await cache.put(url, new Response(result.slice().buffer as ArrayBuffer)) }
    catch { /* Browser storage may be full; the downloaded bytes remain usable for this session. */ }
  }
  return result
}

async function loadModelFiles(config: ModelConfig, onProgress: (value: number) => void) {
  // Download both files explicitly. The external-data path must match the location
  // embedded in the ONNX protobuf; the repository stores it as <model>.onnx.data.
  const modelBytes = await fetchCached(config.modelUrl, (loaded, total) => onProgress(total ? Math.round(loaded / total * 10) : 5))
  const externalBytes = await fetchCached(config.externalUrl, (loaded, total) => onProgress(total ? 10 + Math.round(loaded / total * 75) : 15))
  if (!modelBytes.byteLength || !externalBytes.byteLength) throw new Error('Atsisiųstas modelio failas yra tuščias.')
  onProgress(88)
  return { modelBytes, externalBytes }
}

async function createSession(mode: Mode, onProgress: (value: number) => void) {
  const config = MODELS[mode]
  const { modelBytes, externalBytes } = await loadModelFiles(config, onProgress)
  const externalData = [{ path: config.externalFile, data: externalBytes }]
  const providers: Array<'webgpu' | 'wasm'> = []
  if ('gpu' in navigator) providers.push('webgpu')
  providers.push('wasm')

  let lastError: unknown
  for (const provider of providers) {
    try {
      onProgress(92)
      const session = await ort.InferenceSession.create(modelBytes, {
        executionProviders: [provider],
        graphOptimizationLevel: 'all',
        externalData
      })
      onProgress(100)
      return { session, provider, config }
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`Nepavyko sukurti ${config.name} sesijos nei su GPU, nei su CPU. ${String(lastError)}`)
}

function makeCropTensor(image: HTMLImageElement, size: number, crop: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right', normalization: ModelConfig['normalization']) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Nepavyko paruošti nuotraukos AI analizei.')

  const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight)
  const scaledW = image.naturalWidth * scale
  const scaledH = image.naturalHeight * scale
  const overflowX = scaledW - size
  const overflowY = scaledH - size
  const positions = {
    center: [0.5, 0.5], 'top-left': [0, 0], 'top-right': [1, 0], 'bottom-left': [0, 1], 'bottom-right': [1, 1]
  } as const
  const [fx, fy] = positions[crop]
  ctx.drawImage(image, -overflowX * fx, -overflowY * fy, scaledW, scaledH)
  const { data } = ctx.getImageData(0, 0, size, size)
  const plane = size * size
  const values = new Float32Array(3 * plane)
  const mean = normalization === 'imagenet' ? [0.485, 0.456, 0.406] : [0.5, 0.5, 0.5]
  const std = normalization === 'imagenet' ? [0.229, 0.224, 0.225] : [0.5, 0.5, 0.5]
  for (let i = 0; i < plane; i++) {
    values[i] = (data[i * 4] / 255 - mean[0]) / std[0]
    values[plane + i] = (data[i * 4 + 1] / 255 - mean[1]) / std[1]
    values[2 * plane + i] = (data[i * 4 + 2] / 255 - mean[2]) / std[2]
  }
  return new ort.Tensor('float32', values, [1, 3, size, size])
}

export async function runIqa(image: HTMLImageElement, mode: Mode, onProgress: (value: number) => void): Promise<ModelResult> {
  const started = performance.now()
  const { session, provider, config } = await createSession(mode, onProgress)
  try {
    const inputName = session.inputNames[0]
    const outputName = session.outputNames[0]
    if (!inputName || !outputName) throw new Error('ONNX modelyje nerastas įvesties arba išvesties sluoksnis.')

    // HyperIQA benefits from multi-crop evaluation. Other modes use a center crop.
    const crops: Array<'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'> = mode === 'optimized'
      ? ['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right']
      : ['center']
    const scores: number[] = []
    for (let i = 0; i < crops.length; i++) {
      const tensor = makeCropTensor(image, 224, crops[i], config.normalization)
      const outputs = await session.run({ [inputName]: tensor })
      const output = outputs[outputName]
      if (!output?.data?.length) throw new Error(`${config.name} negrąžino kokybės įverčio.`)
      const value = Number(output.data[0])
      if (!Number.isFinite(value)) throw new Error(`${config.name} grąžino netinkamą skaičių.`)
      scores.push(value)
      onProgress(100)
    }

    const rawScore = scores.reduce((sum, value) => sum + value, 0) / scores.length
    const score = config.scoreScale === '0-1' ? rawScore * 100 : rawScore
    if (config.scoreScale !== 'raw' && (score < 0 || score > 100)) throw new Error(`${config.name} grąžino ${rawScore.toFixed(4)}, o tikėtinas diapazonas yra ${config.scoreScale}.`)
    return { score: Math.round(score), rawScore, model: config.name, provider, durationMs: Math.round(performance.now() - started) }
  } finally {
    await session.release()
  }
}

export function qualityWord(score: number) {
  if (score >= 80) return 'Aukšta kokybė'
  if (score >= 65) return 'Gana gera kokybė'
  if (score >= 45) return 'Vidutinė kokybė'
  if (score >= 25) return 'Žema kokybė'
  return 'Labai žema kokybė'
}
