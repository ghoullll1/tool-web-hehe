import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { inspectPdfFiles, mergePdfFiles, movePdfItem, parsePdfPageSelection, updatePdfPageSelection } from './pdfMergeModel'

async function pdfFile(name: string, pages: number) {
  const document = await PDFDocument.create()
  for (let index = 0; index < pages; index += 1) document.addPage([300 + index, 400])
  const bytes = await document.save()
  const buffer = Uint8Array.from(bytes).buffer
  const file = new File([buffer], name, { type: 'application/pdf' })
  if (!file.arrayBuffer) Object.defineProperty(file, 'arrayBuffer', { value: async () => buffer })
  return file
}

describe('pdfMergeModel', () => {
  it('inspects page metadata and merges files in the supplied order', async () => {
    const first = await pdfFile('first.pdf', 2)
    const second = await pdfFile('second.pdf', 1)
    const items = await inspectPdfFiles([first, second])
    expect(items.map((item) => item.pageCount)).toEqual([2, 1])
    const progress: number[] = []
    const output = await mergePdfFiles(items, (state) => progress.push(state.progress))
    expect((await PDFDocument.load(output)).getPageCount()).toBe(3)
    expect(progress).toEqual([0.5, 1])
  })

  it('rejects non-PDF files and requires at least two inputs', async () => {
    const text = new File(['hello'], 'note.txt', { type: 'text/plain' })
    await expect(inspectPdfFiles([text])).rejects.toThrow('不是 PDF')
    const only = await inspectPdfFiles([await pdfFile('only.pdf', 1)])
    await expect(mergePdfFiles(only)).rejects.toThrow('至少添加两个')
  })

  it('reorders without mutating the original list', async () => {
    const items = await inspectPdfFiles([await pdfFile('a.pdf', 1), await pdfFile('b.pdf', 1)])
    const moved = movePdfItem(items, 1, 0)
    expect(moved.map((item) => item.name)).toEqual(['b.pdf', 'a.pdf'])
    expect(items.map((item) => item.name)).toEqual(['a.pdf', 'b.pdf'])
  })

  it('parses page expressions and preserves the entered page order', () => {
    expect(parsePdfPageSelection('1-3,5,7', 7)).toEqual([0, 1, 2, 4, 6])
    expect(parsePdfPageSelection('3，1－2', 3)).toEqual([2, 0, 1])
    expect(parsePdfPageSelection('2-', 5)).toEqual([1, 2, 3, 4])
    expect(parsePdfPageSelection('2-,1', 5)).toEqual([1, 2, 3, 4, 0])
  })

  it('rejects invalid, descending, duplicate, and out-of-range pages', () => {
    expect(() => parsePdfPageSelection('1,,2', 3)).toThrow('不是有效页码')
    expect(() => parsePdfPageSelection('3-1', 3)).toThrow('起始页不能大于结束页')
    expect(() => parsePdfPageSelection('1,1', 3)).toThrow('重复')
    expect(() => parsePdfPageSelection('4', 3)).toThrow('超出 1-3 页范围')
  })

  it('merges selected pages by file order and then expression order', async () => {
    const first = await inspectPdfFiles([await pdfFile('first.pdf', 7)])
    const second = await inspectPdfFiles([await pdfFile('second.pdf', 6)], first)
    const selected = [updatePdfPageSelection(first[0]!, '1-3,5,7'), updatePdfPageSelection(second[0]!, '4,6')]
    const output = await PDFDocument.load(await mergePdfFiles(selected))
    expect(output.getPages().map((page) => page.getWidth())).toEqual([300, 301, 302, 304, 306, 303, 305])
  })
})
