import { PDFDocument, rgb } from 'pdf-lib'
import { parsePdfPageSelection } from '../pdf-merge/pdfMergeModel'

export const MAX_BYTES = 100 * 1024 * 1024
export const MAX_FILES = 40
export type OutputFile = { name: string; blob: Blob }
export type ImageSettings = { paper: 'original' | 'a4'; landscape: boolean; margin: number }

export function imagePlacement(width: number, height: number, settings: ImageSettings) {
  const pageWidth = settings.paper === 'original' ? width * .75 + settings.margin * 2 : settings.landscape ? 841.89 : 595.28
  const pageHeight = settings.paper === 'original' ? height * .75 + settings.margin * 2 : settings.landscape ? 595.28 : 841.89
  const scale = Math.min((pageWidth - settings.margin * 2) / width, (pageHeight - settings.margin * 2) / height)
  return { pageWidth, pageHeight, width: width * scale, height: height * scale, x: (pageWidth - width * scale) / 2, y: (pageHeight - height * scale) / 2 }
}

export function validateFiles(files: File[], mode: 'pdf' | 'images') {
  if (!files.length || files.length > (mode === 'pdf' ? 1 : MAX_FILES)) throw new Error(mode === 'pdf' ? '每次请选择一个 PDF' : `最多添加 ${MAX_FILES} 张图片`)
  if (files.reduce((total, file) => total + file.size, 0) > MAX_BYTES) throw new Error('文件总大小不能超过 100 MB')
  for (const file of files) {
    if (!file.size) throw new Error(`${file.name} 是空文件`)
    if (!(mode === 'pdf' ? /\.pdf$/i : /\.(png|jpe?g|webp)$/i).test(file.name)) throw new Error(`${file.name} 格式不支持`)
  }
}

function assertActive(signal: AbortSignal) { if (signal.aborted) throw new Error('转换已取消') }
function encodeCanvas(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('图片编码失败')), mime, quality))
}

export async function pdfToImages(file: File, range: string, format: 'png' | 'jpeg', dpi: number, quality: number, signal: AbortSignal, progress: (value: number) => void): Promise<OutputFile[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href
  const base = `${import.meta.env.BASE_URL}pdfjs/`
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/`, isEvalSupported: false })
  const abort = () => { void task.destroy() }
  signal.addEventListener('abort', abort, { once: true })
  try {
    assertActive(signal)
    const pdf = await task.promise
    const pages = range.trim() ? parsePdfPageSelection(range, pdf.numPages) : Array.from({ length: pdf.numPages }, (_, i) => i)
    if (pages.length > 100) throw new Error('一次最多转换 100 页，请使用页码范围分批转换')
    const outputs: OutputFile[] = []
    let bytes = 0
    for (const [index, pageIndex] of pages.entries()) {
      assertActive(signal)
      const page = await pdf.getPage(pageIndex + 1)
      const viewport = page.getViewport({ scale: dpi / 72 })
      if (viewport.width * viewport.height > 24_000_000 || Math.max(viewport.width, viewport.height) > 16000) throw new Error(`第 ${pageIndex + 1} 页尺寸过大，请降低清晰度`)
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
      try {
        await page.render({ canvas, viewport, background: '#ffffff' }).promise
        const blob = await encodeCanvas(canvas, `image/${format}`, quality)
        bytes += blob.size
        if (bytes > MAX_BYTES) throw new Error('输出超过 100 MB，请降低清晰度或减少页数')
        outputs.push({ name: `page-${String(pageIndex + 1).padStart(3, '0')}.${format === 'jpeg' ? 'jpg' : 'png'}`, blob })
      } finally { canvas.width = 0; canvas.height = 0; page.cleanup() }
      progress((index + 1) / pages.length)
    }
    assertActive(signal)
    return outputs
  } catch (error) {
    if (signal.aborted) throw new Error('转换已取消', { cause: error })
    if (error instanceof Error && error.name === 'PasswordException') throw new Error('PDF 已加密，请先移除密码后重试', { cause: error })
    throw error
  } finally { signal.removeEventListener('abort', abort); await task.destroy() }
}

export async function imagesToPdf(files: File[], settings: ImageSettings, signal: AbortSignal, progress: (value: number) => void): Promise<OutputFile[]> {
  const pdf = await PDFDocument.create()
  for (const [index, file] of files.entries()) {
    assertActive(signal)
    const bitmap = await createImageBitmap(file)
    try {
      if (bitmap.width * bitmap.height > 24_000_000) throw new Error(`${file.name} 超过 2400 万像素，请缩小后重试`)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width; canvas.height = bitmap.height
      let blob: Blob
      try {
        const context = canvas.getContext('2d')
        if (!context) throw new Error('浏览器无法创建图片画布')
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(bitmap, 0, 0)
        blob = await encodeCanvas(canvas, 'image/jpeg', .95)
      } finally { canvas.width = 0; canvas.height = 0 }
      const image = await pdf.embedJpg(await blob.arrayBuffer())
      const placement = imagePlacement(bitmap.width, bitmap.height, settings)
      const page = pdf.addPage([placement.pageWidth, placement.pageHeight])
      page.drawRectangle({ x: 0, y: 0, width: placement.pageWidth, height: placement.pageHeight, color: rgb(1, 1, 1) })
      page.drawImage(image, placement)
    } finally { bitmap.close() }
    progress((index + 1) / files.length)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  assertActive(signal)
  const bytes = await pdf.save()
  assertActive(signal)
  return [{ name: 'images.pdf', blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }) }]
}

export async function zipImages(outputs: OutputFile[]): Promise<Blob> {
  const { zip } = await import('fflate')
  const entries = Object.fromEntries(await Promise.all(outputs.map(async (output) => [output.name, new Uint8Array(await output.blob.arrayBuffer())])))
  return new Promise((resolve, reject) => zip(entries, { level: 0 }, (error, bytes) => error ? reject(error) : resolve(new Blob([new Uint8Array(bytes)], { type: 'application/zip' }))))
}
