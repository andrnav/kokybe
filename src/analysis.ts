export type QualityLevel = 'excellent' | 'good' | 'borderline' | 'poor'
export type Analysis = {
  width: number; height: number; megapixels: number; aspect: number
  sharpness: number; sharpnessLabel: string; warning: string
}

export function analyseImage(image: HTMLImageElement): Analysis {
  const width = image.naturalWidth
  const height = image.naturalHeight
  // Downsample for fast, consistent browser-side sharpness estimation.
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 640 / Math.max(width, height))
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const gray = new Float32Array(canvas.width * canvas.height)
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
  }
  // Variance of a 4-neighbour Laplacian: useful as a relative blur indicator,
  // not a universal perceptual-quality score.
  let sum = 0, sumSq = 0, count = 0
  for (let y = 1; y < canvas.height - 1; y++) {
    for (let x = 1; x < canvas.width - 1; x++) {
      const i = y * canvas.width + x
      const lap = gray[i - 1] + gray[i + 1] + gray[i - canvas.width] + gray[i + canvas.width] - 4 * gray[i]
      sum += lap; sumSq += lap * lap; count++
    }
  }
  const variance = count ? Math.max(0, sumSq / count - (sum / count) ** 2) : 0
  const sharpness = Math.max(0, Math.min(100, Math.round((Math.log1p(variance) / Math.log1p(900)) * 100)))
  const sharpnessLabel = sharpness >= 65 ? 'Geras detalumas' : sharpness >= 35 ? 'Vidutinis detalumas' : 'Galimai neryški'
  return {
    width, height, megapixels: width * height / 1_000_000, aspect: width / height,
    sharpness, sharpnessLabel,
    warning: 'Ryškumo rodiklis yra automatinis indikatorius. Jį veikia vaizdo turinys, triukšmas ir galandimas, todėl galutinį rezultatą verta patikrinti akimis.'
  }
}

export function effectiveDpi(px: number, cm: number) {
  return px / (cm / 2.54)
}
export function dpiLevel(dpi: number): { level: QualityLevel; label: string; color: string } {
  if (dpi >= 300) return { level: 'excellent', label: 'Puiku', color: 'green' }
  if (dpi >= 200) return { level: 'good', label: 'Labai gerai', color: 'green' }
  if (dpi >= 150) return { level: 'good', label: 'Gerai', color: 'blue' }
  if (dpi >= 100) return { level: 'borderline', label: 'Ribinė kokybė', color: 'amber' }
  return { level: 'poor', label: 'Prasta raiška', color: 'red' }
}
