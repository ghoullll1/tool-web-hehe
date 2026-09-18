import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent } from 'react'
import type { ToolViewProps } from '../registry'
import { formatPdfBytes, inspectPdfFiles, MAX_PDF_FILES, MAX_PDF_TOTAL_BYTES, mergePdfFiles, movePdfItem, updatePdfPageSelection, type PdfMergeItem } from './pdfMergeModel'

type Notice = { tone: 'neutral' | 'success' | 'error'; message: string }

export default function PdfMergeTool({ tool }: ToolViewProps) {
  const [items, setItems] = useState<PdfMergeItem[]>([])
  const [notice, setNotice] = useState<Notice>({ tone: 'neutral', message: '添加至少两个 PDF，拖动排序后即可合并' })
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ url: string; size: number; name: string } | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const totalPages = useMemo(() => items.reduce((sum, item) => sum + item.pageIndices.length, 0), [items])
  const totalBytes = useMemo(() => items.reduce((sum, item) => sum + item.size, 0), [items])
  const hasSelectionError = items.some((item) => item.selectionError !== null)

  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url) }, [result])

  function clearResult() {
    if (result) URL.revokeObjectURL(result.url)
    setResult(null)
    setProgress(0)
  }

  async function addFiles(files: File[]) {
    if (busy || files.length === 0) return
    setNotice({ tone: 'neutral', message: `正在检查 ${files.length} 个文件…` })
    clearResult()
    try {
      const inspected = await inspectPdfFiles(files, items)
      setItems((current) => [...current, ...inspected])
      setNotice({ tone: 'success', message: `已添加 ${inspected.length} 个 PDF，可继续添加或调整顺序` })
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'PDF 文件读取失败' })
    }
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    void addFiles(Array.from(event.target.files ?? []))
    event.target.value = ''
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    void addFiles(Array.from(event.dataTransfer.files))
  }

  function reorder(from: number, to: number) {
    clearResult()
    setItems((current) => movePdfItem(current, from, to))
    setNotice({ tone: 'neutral', message: '合并顺序已更新' })
  }

  function remove(id: string) {
    clearResult()
    setItems((current) => current.filter((item) => item.id !== id))
    setNotice({ tone: 'neutral', message: '文件已移除' })
  }

  function changePageSelection(id: string, value: string) {
    clearResult()
    const currentItem = items.find((item) => item.id === id)
    if (!currentItem) return
    const updated = updatePdfPageSelection(currentItem, value)
    setItems((current) => current.map((item) => item.id === id ? updated : item))
    setNotice(updated?.selectionError
      ? { tone: 'error', message: updated.selectionError }
      : { tone: 'neutral', message: '合并页码已更新，将按填写顺序抽取页面' })
  }

  function reset() {
    clearResult()
    setItems([])
    setNotice({ tone: 'neutral', message: '文件列表已清空' })
  }

  async function merge() {
    if (items.length < 2 || busy || hasSelectionError) {
      if (hasSelectionError) {
        setNotice({ tone: 'error', message: '请先修正标红的合并页码' })
        return
      }
      setNotice({ tone: 'error', message: '请至少添加两个 PDF 文件' })
      return
    }
    clearResult()
    setBusy(true)
    setNotice({ tone: 'neutral', message: '正在按列表顺序合并页面…' })
    try {
      const bytes = await mergePdfFiles(items, ({ progress: nextProgress }) => setProgress(nextProgress))
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })
      const name = `merged-${new Date().toISOString().slice(0, 10)}.pdf`
      setResult({ url: URL.createObjectURL(blob), size: blob.size, name })
      setNotice({ tone: 'success', message: `合并完成，共 ${totalPages.toLocaleString()} 页` })
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'PDF 合并失败' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pdf-merge-tool" data-tool={tool.slug}>
      <div className={`pdf-merge-notice is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}><span aria-hidden="true">{notice.tone === 'error' ? '!' : notice.tone === 'success' ? '✓' : 'i'}</span><p>{notice.message}</p><b>文件仅在浏览器本地处理</b></div>
      <section className="pdf-merge-summary" aria-label="合并概览">
        <div><span>FILES</span><strong>{items.length.toString().padStart(2, '0')}</strong><p>已添加文件</p></div>
        <div><span>PAGES</span><strong>{totalPages.toLocaleString()}</strong><p>待合并页数</p></div>
        <div><span>SIZE</span><strong>{formatPdfBytes(totalBytes)}</strong><p>输入总大小</p></div>
        <div className="pdf-merge-summary-action"><button type="button" disabled={items.length < 2 || busy || hasSelectionError} onClick={() => void merge()}>{busy ? `合并中 ${Math.round(progress * 100)}%` : '开始合并'}<span>→</span></button></div>
      </section>
      <div className="pdf-merge-workspace">
        <section className="pdf-merge-panel">
          <header><div><span>01</span><h2>PDF 文件与顺序</h2></div><div><button type="button" onClick={() => inputRef.current?.click()}>添加文件</button><button type="button" disabled={!items.length || busy} onClick={reset}>全部清空</button></div></header>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden aria-label="选择 PDF 文件" onChange={handleInput} />
          {items.length === 0 ? (
            <div className={`pdf-drop-zone${dragging ? ' is-dragging' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
              <span aria-hidden="true">PDF</span><h3>拖入需要合并的 PDF</h3><p>也可以一次选择多个文件，添加后可调整合并顺序。</p><button type="button" onClick={() => inputRef.current?.click()}>选择 PDF 文件</button><small>最多 {MAX_PDF_FILES} 个文件 · 合计不超过 {formatPdfBytes(MAX_PDF_TOTAL_BYTES)}</small>
            </div>
          ) : (
            <div className="pdf-file-list" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
              {items.map((item, index) => <article key={item.id} className={`pdf-file-card${item.selectionError ? ' has-page-error' : ''}`}><span className="pdf-file-order">{String(index + 1).padStart(2, '0')}</span><span className="pdf-file-icon">PDF</span><div><h3 title={item.name}>{item.name}</h3><p>原文件 {item.pageCount} 页 · 已选 {item.pageIndices.length} 页 · {formatPdfBytes(item.size)}</p></div><div className="pdf-file-actions"><button type="button" disabled={index === 0 || busy} aria-label={`上移 ${item.name}`} onClick={() => reorder(index, index - 1)}>↑</button><button type="button" disabled={index === items.length - 1 || busy} aria-label={`下移 ${item.name}`} onClick={() => reorder(index, index + 1)}>↓</button><button type="button" disabled={busy} aria-label={`移除 ${item.name}`} onClick={() => remove(item.id)}>×</button></div><label className="pdf-page-selection"><span>合并页码</span><input type="text" value={item.pageSelection} disabled={busy} aria-label={`${item.name} 合并页码`} aria-invalid={Boolean(item.selectionError)} aria-describedby={`${item.id}-page-help`} onChange={(event) => changePageSelection(item.id, event.target.value)} /><small id={`${item.id}-page-help`}>{item.selectionError ?? '例如 1-3,5,7；2- 表示第 2 页到最后'}</small></label></article>)}
              <button className="pdf-add-more" type="button" disabled={busy || items.length >= MAX_PDF_FILES} onClick={() => inputRef.current?.click()}>＋ 继续添加 PDF</button>
            </div>
          )}
          <footer><span>先按文件顺序，再按填写的页码顺序合并</span><span>最多 2,000 页</span></footer>
        </section>
        <section className="pdf-merge-panel pdf-output-panel">
          <header><div><span>02</span><h2>合并结果</h2></div></header>
          <div className="pdf-output-content">
            {busy ? <div className="pdf-merge-processing"><span style={{ '--progress': `${progress * 360}deg` } as CSSProperties}><i>{Math.round(progress * 100)}%</i></span><h3>正在合并 PDF</h3><p>请保持当前页面打开，文件不会上传。</p></div> : result ? <div className="pdf-merge-complete"><span aria-hidden="true">✓</span><small>MERGE COMPLETE</small><h3>{result.name}</h3><p>{totalPages.toLocaleString()} 页 · {formatPdfBytes(result.size)}</p><a href={result.url} download={result.name}>下载合并后的 PDF <b>↓</b></a><button type="button" onClick={() => void merge()}>重新合并</button></div> : <div className="pdf-output-empty"><span aria-hidden="true">⇄</span><h3>等待合并</h3><p>添加至少两个文件并确认顺序，合并结果将在这里生成。</p></div>}
          </div>
          <footer><span>浏览器本地生成</span><span>建议下载后检查书签、表单与签名</span></footer>
        </section>
      </div>
      <p className="pdf-merge-warning"><strong>兼容性提示：</strong>加密或密码保护的 PDF 无法处理；合并会保留页面外观，但书签、数字签名及部分交互表单可能不会完整保留。</p>
    </div>
  )
}
