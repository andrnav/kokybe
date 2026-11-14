export type QualityLevel = 'excellent' | 'very_good' | 'good' | 'acceptable' | 'weak' | 'poor'

export type PrintProfile = {
  id: string
  printer: string
  material: string
  excellent: number
  veryGood: number
  good: number
  acceptable: number
  weak: number
}

export type Analysis = {
  width: number
  height: number
  megapixels: number
  aspect: number
  sharpness: number
  sharpnessLabel: string
  warning: string
}

export const PRINT_PROFILES: Record<string, PrintProfile> = {
  noritsu: {
    id: 'noritsu',
    printer: 'Noritsu QSS-3701HD',
    material: 'Fujifilm DP II fotopopierius',
    excellent: 250, veryGood: 200, good: 160, acceptable: 120, weak: 90
  },
  mimaki_poster: {
    id: 'mimaki_poster',
    printer: 'Mimaki JV100-160',
    material: 'Plakatinis / foto popierius',
    excellent: 150, veryGood: 120, good: 100, acceptable: 80, weak: 60
  },
  mimaki_canvas: {
    id: 'mimaki_canvas',
    printer: 'Mimaki JV100-160',
    material: 'Drobė',
    excellent: 120, veryGood: 90, good: 72, acceptable: 55, weak: 40
  }
}

export function selectPrintProfile(product: string, printWidthCm: number): PrintProfile {
  // Canvas is produced on Mimaki regardless of width. For paper products,
  // the laboratory's 30.5 cm physical-width routing rule selects the printer.
  if (product === 'Drobė') return PRINT_PROFILES.mimaki_canvas
  if (printWidthCm <= 30.5) return PRINT_PROFILES.noritsu
  return PRINT_PROFILES.mimaki_poster
}

export function analyseImage(image: HTMLImageElement): Analysis {
  const width = image.naturalWidth
  const height = image.naturalHeight
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 1200 / Math.max(width, height))
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Nepavyko paruošti vaizdo analizei.')
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const gray = new Float32Array(canvas.width * canvas.height)
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
  }
  let sum = 0, sumSq = 0, count = 0
  for (let y = 1; y < canvas.height - 1; y++) {
    for (let x = 1; x < canvas.width - 1; x++) {
      const i = y * canvas.width + x
      const lap = gray[i - 1] + gray[i + 1] + gray[i - canvas.width] + gray[i + canvas.width] - 4 * gray[i]
      sum += lap
      sumSq += lap * lap
      count++
    }
  }
  const variance = count ? Math.max(0, sumSq / count - (sum / count) ** 2) : 0
  // Relative indicator only. It is not semantic blur detection.
  const sharpness = Math.max(0, Math.min(100, Math.round((Math.log1p(variance) / Math.log1p(900)) * 100)))
  const sharpnessLabel = sharpness >= 65 ? 'Daug ryškių detalių' : sharpness >= 35 ? 'Vidutinis detalumas' : 'Mažai ryškių detalių'
  return {
    width, height, megapixels: width * height / 1_000_000, aspect: width / height,
    sharpness, sharpnessLabel,
    warning: 'Šis rodiklis analizuoja visą vaizdą bendrai. Jis dar neatpažįsta pagrindinio objekto, debesų ar sąmoningai išfokusuoto fono. Vertinkite kartu su nuotraukos peržiūra.'
  }
}

export function effectiveDpi(px: number, cm: number) {
  return px / (cm / 2.54)
}

export function dpiQualityScore(dpi: number, profile: PrintProfile): number {
  if (dpi >= profile.excellent) return 100
  if (dpi >= profile.veryGood) return Math.round(85 + 15 * (dpi - profile.veryGood) / (profile.excellent - profile.veryGood))
  if (dpi >= profile.good) return Math.round(70 + 15 * (dpi - profile.good) / (profile.veryGood - profile.good))
  if (dpi >= profile.acceptable) return Math.round(55 + 15 * (dpi - profile.acceptable) / (profile.good - profile.acceptable))
  if (dpi >= profile.weak) return Math.round(35 + 20 * (dpi - profile.weak) / (profile.acceptable - profile.weak))
  return Math.max(0, Math.round(35 * dpi / profile.weak))
}

export function sharpnessQualityScore(sharpness: number): number {
  // A deliberately moderate influence: global blur metric can penalize soft backgrounds.
  return Math.max(0, Math.min(100, Math.round(sharpness * 0.8 + 20)))
}

export function combinedQualityScore(dpi: number, sharpness: number, profile: PrintProfile): number {
  const resolution = dpiQualityScore(dpi, profile)
  const detail = sharpnessQualityScore(sharpness)
  return Math.round(resolution * 0.7 + detail * 0.3)
}

export function qualityLabel(score: number): { label: string; color: string } {
  if (score >= 90) return { label: 'Puiki', color: 'green' }
  if (score >= 80) return { label: 'Labai gera', color: 'green' }
  if (score >= 70) return { label: 'Gera', color: 'blue' }
  if (score >= 55) return { label: 'Priimtina', color: 'amber' }
  if (score >= 40) return { label: 'Rizikinga', color: 'amber' }
  return { label: 'Prasta', color: 'red' }
}

export function recommendedSize(width: number, height: number, profile: PrintProfile, targetPpi: number) {
  // Keep original aspect ratio. Width is the physical print width.
  const widthCm = width / (targetPpi / 2.54)
  const heightCm = height / (targetPpi / 2.54)
  return { widthCm, heightCm }
}
