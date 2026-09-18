export type ImageOutputFormat = 'jpeg' | 'png' | 'webp'
export type ImageScale = 1 | 0.75 | 0.5

export interface ImageConversionSettings {
  format: ImageOutputFormat
  quality: number
  scale: ImageScale
  background: string
}

export interface ConvertedImage {
  blob: Blob
  name: string
  width: number
  height: number
}

export const MAX_IMAGE_FILES = 30
export const MAX_IMAGE_FILE_BYTES = 40 * 1024 * 1024
export const MAX_IMAGE_TOTAL_BYTES = 150 * 1024 * 1024
export const MAX_IMAGE_PIXELS = 40_000_000
export const MAX_IMAGE_EDGE = 16_384

const MIME_BY_FORMAT: Readonly<Record<ImageOutputFormat, string>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

const EXTENSION_BY_FORMAT: Readonly<Record<ImageOutputFormat, string>> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
}

const SUPPORTED_EXTENSIONS = /\.(?:jpe?g|png|webp)$/i
const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function validateImageFiles(files: readonly File[]) {
  if (!files.length) throw new Error('请选择 JPG、PNG 或 WebP 图片')
  if (files.length > MAX_IMAGE_FILES) throw new Error(`一次最多添加 ${MAX_IMAGE_FILES} 张图片`)
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  if (totalBytes > MAX_IMAGE_TOTAL_BYTES) throw new Error(`图片总大小不能超过 ${formatImageBytes(MAX_IMAGE_TOTAL_BYTES)}`)
  for (const file of files) {
    const supported = SUPPORTED_MIME_TYPES.has(file.type) || (!file.type && SUPPORTED_EXTENSIONS.test(file.name))
    if (!supported) throw new Error(`${file.name} 不是支持的 JPG、PNG 或 WebP 图片`)
    if (file.size === 0) throw new Error(`${file.name} 是空文件`)
    if (file.size > MAX_IMAGE_FILE_BYTES) throw new Error(`${file.name} 超过单张 ${formatImageBytes(MAX_IMAGE_FILE_BYTES)} 的限制`)
  }
}

export function outputDimensions(width: number, height: number, scale: ImageScale) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('无法识别图片尺寸')
  }
  if (width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE) throw new Error(`图片单边不能超过 ${MAX_IMAGE_EDGE.toLocaleString()} 像素`)
  if (width * height > MAX_IMAGE_PIXELS) throw new Error(`图片像素不能超过 ${Math.round(MAX_IMAGE_PIXELS / 1_000_000)} 百万`)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export function convertedImageName(sourceName: string, format: ImageOutputFormat, sequence?: number) {
  const base = sourceName.replace(/\.[^.]+$/, '') || 'image'
  const suffix = sequence === undefined ? '' : `-${sequence}`
  return `${base}-converted${suffix}.${EXTENSION_BY_FORMAT[format]}`
}

export function formatImageBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatSizeDelta(sourceBytes: number, outputBytes: number) {
  if (sourceBytes <= 0) return '新文件'
  const percentage = Math.round(Math.abs(outputBytes - sourceBytes) / sourceBytes * 100)
  if (percentage === 0) return '大小基本不变'
  return outputBytes < sourceBytes ? `减小 ${percentage}%` : `增加 ${percentage}%`
}

export async function convertImage(
  file: File,
  settings: ImageConversionSettings,
  signal?: AbortSignal,
  sequence?: number,
): Promise<ConvertedImage> {
  throwIfAborted(signal)
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    throwIfAborted(signal)
    const dimensions = outputDimensions(bitmap.width, bitmap.height, settings.scale)
    const canvas = document.createElement('canvas')
    canvas.width = dimensions.width
    canvas.height = dimensions.height
    const context = canvas.getContext('2d', { alpha: settings.format !== 'jpeg' })
    if (!context) throw new Error('浏览器无法创建图片画布')
    if (settings.format === 'jpeg') {
      context.fillStyle = normalizeHexColor(settings.background)
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const mimeType = MIME_BY_FORMAT[settings.format]
    const quality = settings.format === 'png' ? undefined : clampQuality(settings.quality) / 100
    const blob = await canvasToBlob(canvas, mimeType, quality)
    canvas.width = 0
    canvas.height = 0
    throwIfAborted(signal)
    if (blob.type !== mimeType) throw new Error(`当前浏览器不支持 ${settings.format.toUpperCase()} 编码`)
    return {
      blob,
      name: convertedImageName(file.name, settings.format, sequence),
      ...dimensions,
    }
  } finally {
    bitmap.close()
  }
}

export async function zipConvertedImages(files: readonly ConvertedImage[]) {
  if (!files.length) throw new Error('没有可打包的转换结果')
  const { zipSync } = await import('fflate')
  const entries: Record<string, Uint8Array> = {}
  for (const file of files) entries[file.name] = new Uint8Array(await file.blob.arrayBuffer())
  return new Blob([new Uint8Array(zipSync(entries, { level: 6 }))], { type: 'application/zip' })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('浏览器无法生成目标图片')), type, quality)
  })
}

function clampQuality(value: number) {
  return Math.max(40, Math.min(100, Math.round(value)))
}

function normalizeHexColor(value: string) {
  return /^#[\da-f]{6}$/i.test(value) ? value : '#ffffff'
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('转换已取消', 'AbortError')
}
