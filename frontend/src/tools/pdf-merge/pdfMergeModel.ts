import { PDFDocument } from 'pdf-lib'

export const MAX_PDF_FILES = 20
export const MAX_PDF_TOTAL_BYTES = 200 * 1024 * 1024
export const MAX_PDF_TOTAL_PAGES = 2_000

export interface PdfMergeItem {
  id: string
  file: File
  name: string
  size: number
  pageCount: number
  pageSelection: string
  pageIndices: number[]
  selectionError: string | null
}

export interface PdfMergeProgress {
  completedFiles: number
  totalFiles: number
  progress: number
}

export async function inspectPdfFiles(files: readonly File[], existing: readonly PdfMergeItem[] = []): Promise<PdfMergeItem[]> {
  if (files.length === 0) return []
  if (existing.length + files.length > MAX_PDF_FILES) throw new Error(`最多可添加 ${MAX_PDF_FILES} 个 PDF 文件`)
  const nextBytes = existing.reduce((sum, item) => sum + item.size, 0) + files.reduce((sum, file) => sum + file.size, 0)
  if (nextBytes > MAX_PDF_TOTAL_BYTES) throw new Error(`文件总大小不能超过 ${formatPdfBytes(MAX_PDF_TOTAL_BYTES)}`)

  const inspected: PdfMergeItem[] = []
  let pages = existing.reduce((sum, item) => sum + item.pageCount, 0)
  for (const file of files) {
    assertPdfFile(file)
    try {
      const bytes = await file.arrayBuffer()
      const document = await PDFDocument.load(bytes, { updateMetadata: false })
      const pageCount = document.getPageCount()
      if (pageCount === 0) throw new Error('文件没有可合并页面')
      pages += pageCount
      if (pages > MAX_PDF_TOTAL_PAGES) throw new Error(`总页数不能超过 ${MAX_PDF_TOTAL_PAGES.toLocaleString()} 页`)
      inspected.push({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        size: file.size,
        pageCount,
        pageSelection: `1-${pageCount}`,
        pageIndices: Array.from({ length: pageCount }, (_, index) => index),
        selectionError: null,
      })
    } catch (error) {
      if (error instanceof Error && (error.message.includes('总页数') || error.message.includes('没有可合并'))) throw error
      throw new Error(`${file.name} 无法读取，文件可能损坏或已加密`, { cause: error })
    }
  }
  return inspected
}

export async function mergePdfFiles(items: readonly PdfMergeItem[], onProgress: (state: PdfMergeProgress) => void = () => undefined): Promise<Uint8Array> {
  if (items.length < 2) throw new Error('请至少添加两个 PDF 文件')
  const invalidItem = items.find((item) => item.selectionError || item.pageIndices.length === 0)
  if (invalidItem) throw new Error(`${invalidItem.name} 的合并页码不正确`)
  const output = await PDFDocument.create()
  for (const [index, item] of items.entries()) {
    const source = await PDFDocument.load(await item.file.arrayBuffer(), { updateMetadata: false })
    const pages = await output.copyPages(source, item.pageIndices)
    pages.forEach((page) => output.addPage(page))
    onProgress({ completedFiles: index + 1, totalFiles: items.length, progress: (index + 1) / items.length })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  return output.save({ addDefaultPage: false, useObjectStreams: true })
}

export function parsePdfPageSelection(expression: string, pageCount: number): number[] {
  const normalized = expression.trim().replace(/[，、]/g, ',').replace(/[－—–]/g, '-')
  if (!normalized) throw new Error('请输入合并页码')

  const selected: number[] = []
  const seen = new Set<number>()
  for (const rawToken of normalized.split(',')) {
    const token = rawToken.trim()
    const match = /^(\d+)(?:\s*-\s*(\d*))?$/.exec(token)
    if (!match) throw new Error(`“${token || '空白'}”不是有效页码`)
    const start = Number(match[1])
    const hasRangeMarker = token.includes('-')
    const end = hasRangeMarker && !match[2] ? pageCount : match[2] ? Number(match[2]) : start
    if (start > end) throw new Error(`页码范围 ${start}-${end} 的起始页不能大于结束页`)
    for (let page = start; page <= end; page += 1) {
      if (page < 1 || page > pageCount) throw new Error(`页码 ${page} 超出 1-${pageCount} 页范围`)
      if (seen.has(page)) throw new Error(`页码 ${page} 重复`)
      seen.add(page)
      selected.push(page - 1)
    }
  }
  return selected
}

export function updatePdfPageSelection(item: PdfMergeItem, pageSelection: string): PdfMergeItem {
  try {
    return { ...item, pageSelection, pageIndices: parsePdfPageSelection(pageSelection, item.pageCount), selectionError: null }
  } catch (error) {
    return {
      ...item,
      pageSelection,
      pageIndices: [],
      selectionError: error instanceof Error ? error.message : '合并页码不正确',
    }
  }
}

export function movePdfItem(items: readonly PdfMergeItem[], from: number, to: number): PdfMergeItem[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return [...items]
  const next = [...items]
  const item = next.splice(from, 1)[0]!
  next.splice(to, 0, item)
  return next
}

export function formatPdfBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function assertPdfFile(file: File) {
  const isPdf = file.type === 'application/pdf' || file.name.toLocaleLowerCase().endsWith('.pdf')
  if (!isPdf) throw new Error(`${file.name} 不是 PDF 文件`)
  if (file.size === 0) throw new Error(`${file.name} 是空文件`)
}
