import { useEffect, useRef, useState } from 'react'
import type { ToolViewProps } from '../registry'
import { formatPdfBytes } from '../pdf-merge/pdfMergeModel'
import { imagesToPdf, pdfToImages, validateFiles, zipImages, type OutputFile } from './converterModel'
import './pdfImage.css'

type Preview = OutputFile & { url: string }
type Source = { file: File; url: string; id: string }

export default function PdfImageTool({ tool }: ToolViewProps) {
  const [mode, setMode] = useState<'pdf' | 'images'>('pdf')
  const [sources, setSources] = useState<Source[]>([])
  const [outputs, setOutputs] = useState<Preview[]>([])
  const [range, setRange] = useState('')
  const [format, setFormat] = useState<'png' | 'jpeg'>('png')
  const [dpi, setDpi] = useState(144)
  const [quality, setQuality] = useState(90)
  const [paper, setPaper] = useState<'original' | 'a4'>('a4')
  const [landscape, setLandscape] = useState(false)
  const [margin, setMargin] = useState(24)
  const [busy, setBusy] = useState(false)
  const [packing, setPacking] = useState(false)
  const [progress, setProgress] = useState(0)
  const [notice, setNotice] = useState('选择文件，开始一次轻松的格式转换')
  const [error, setError] = useState(false)
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const controller = useRef<AbortController | null>(null)
  const urls = useRef(new Set<string>())
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; const allocated = urls.current; return () => { mounted.current = false; controller.current?.abort(); allocated.forEach(URL.revokeObjectURL); allocated.clear() } }, [])
  function urlFor(blob: Blob) { const url = URL.createObjectURL(blob); urls.current.add(url); return url }
  function release(url: string) { URL.revokeObjectURL(url); urls.current.delete(url) }
  function invalidate() { outputs.forEach((output) => release(output.url)); setOutputs([]); setProgress(0) }
  function reset(nextMode = mode) {
    invalidate(); sources.forEach((source) => release(source.url)); setSources([]); setMode(nextMode); setRange(''); setError(false); setNotice('选择文件，开始一次轻松的格式转换')
  }
  function add(files: File[]) {
    if (busy || packing || !files.length) return
    try {
      const combined = mode === 'pdf' ? files : [...sources.map((source) => source.file), ...files]
      validateFiles(combined, mode)
      invalidate()
      if (mode === 'pdf') sources.forEach((source) => release(source.url))
      const added = files.map((file) => ({ file, url: mode === 'images' ? urlFor(file) : '', id: crypto.randomUUID() }))
      setSources(mode === 'pdf' ? added : [...sources, ...added]); setError(false); setNotice(`已添加 ${combined.length} 个文件`)
    } catch (cause) { setError(true); setNotice(cause instanceof Error ? cause.message : '无法添加文件') }
  }
  function move(index: number, offset: number) {
    const next = [...sources]; const target = index + offset
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    invalidate(); setSources(next)
  }
  async function convert() {
    if (controller.current || !sources.length) return
    invalidate(); setError(false); setBusy(true); setNotice('正在转换，请稍候…')
    const active = new AbortController(); controller.current = active
    try {
      const results = mode === 'pdf'
        ? await pdfToImages(sources[0]!.file, range, format, dpi, quality / 100, active.signal, setProgress)
        : await imagesToPdf(sources.map((source) => source.file), { paper, landscape, margin }, active.signal, setProgress)
      if (!mounted.current || active.signal.aborted) return
      setOutputs(results.map((result) => ({ ...result, url: urlFor(result.blob) })))
      setNotice(`转换完成 · ${results.length} 个文件已准备好`)
    } catch (cause) { if (mounted.current) { setError(true); setNotice(cause instanceof Error ? cause.message : '文件无法转换，请检查文件是否损坏') } }
    finally { controller.current = null; if (mounted.current) setBusy(false) }
  }
  async function downloadZip() {
    setPacking(true)
    try {
      const blob = await zipImages(outputs)
      if (!mounted.current) return
      const url = urlFor(blob); const link = document.createElement('a'); link.href = url; link.download = 'pdf-images.zip'; link.click()
      window.setTimeout(() => release(url), 60_000)
    } catch { if (mounted.current) { setError(true); setNotice('打包失败，请尝试逐张下载') } }
    finally { if (mounted.current) setPacking(false) }
  }
  const locked = busy || packing
  return <div className="pic-tool" data-tool={tool.slug}>
    <div className="pic-intro"><div><span className="pic-eyebrow">文档与画面，自由转换</span><h2>每一页，都有新的打开方式。</h2><p>将 PDF 变成清晰图片，或把多张图片整理成一份文档。</p></div><span className="pic-local">● 文件仅在本地处理</span></div>
    <div className="pic-modes" role="group" aria-label="转换方向"><button disabled={locked} aria-pressed={mode === 'pdf'} onClick={() => reset('pdf')}><ConversionIcon direction="pdf-to-image" /><strong>PDF 转图片</strong><small>逐页导出 PNG / JPG</small></button><button disabled={locked} aria-pressed={mode === 'images'} onClick={() => reset('images')}><ConversionIcon direction="image-to-pdf" /><strong>图片转 PDF</strong><small>按顺序生成多页文档</small></button></div>
    <div className="pic-workspace"><section className="pic-files"><header><h3>01 {mode === 'pdf' ? '选择 PDF' : '添加图片'}</h3><button disabled={locked || !sources.length} onClick={() => reset()}>清空</button></header>
      <input ref={input} hidden type="file" accept={mode === 'pdf' ? '.pdf,application/pdf' : '.png,.jpg,.jpeg,.webp'} multiple={mode === 'images'} onChange={(event) => { add(Array.from(event.target.files ?? [])); event.target.value = '' }} />
      <button className={`pic-drop ${dragging ? 'is-dragging' : ''}`} disabled={locked} onClick={() => input.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); add(Array.from(event.dataTransfer.files)) }}><span className="pic-upload">↑</span><strong>{sources.length ? '点击或拖入，继续添加 / 替换' : '拖拽文件到这里，或点击选择'}</strong><small>{mode === 'pdf' ? '单个 PDF · 最多导出 100 页' : 'JPG / PNG / WebP · 最多 40 张'} · 总计 100 MB 以内</small></button>
      <div className="pic-source-list">{sources.map((source, index) => <article key={source.id}>{mode === 'images' ? <img src={source.url} alt={source.file.name} /> : <span className="pic-pdf-symbol">PDF</span>}<div><strong title={source.file.name}>{source.file.name}</strong><small>{mode === 'images' ? `第 ${index + 1} 页 · ` : ''}{formatPdfBytes(source.file.size)}</small></div><div className="pic-order">{mode === 'images' && <><button disabled={locked || index === 0} aria-label={`上移 ${source.file.name}`} onClick={() => move(index, -1)}>↑</button><button disabled={locked || index === sources.length - 1} aria-label={`下移 ${source.file.name}`} onClick={() => move(index, 1)}>↓</button></>}<button disabled={locked} aria-label={`移除 ${source.file.name}`} onClick={() => { invalidate(); release(source.url); setSources(sources.filter((item) => item.id !== source.id)) }}>×</button></div></article>)}</div>
      {!sources.length && <div className="pic-source-empty"><EmptyDocumentIcon image={mode === 'images'} /><p>{mode === 'pdf' ? '支持扫描件与普通 PDF，完整页面转成图片。' : '图片顺序就是 PDF 页序，可在添加后调整。'}</p></div>}
    </section><aside className="pic-settings"><h3>02 转换设置</h3><fieldset disabled={locked}>{mode === 'pdf' ? <><label>导出页码<input value={range} onChange={(event) => { invalidate(); setRange(event.target.value) }} placeholder="留空全部页，例如 1-3,5,7-" /></label><label>图片格式<div className="pic-options">{(['png', 'jpeg'] as const).map((value) => <button key={value} aria-pressed={format === value} onClick={() => { invalidate(); setFormat(value) }}>{value === 'png' ? 'PNG 无损' : 'JPG 轻量'}</button>)}</div></label><label>清晰度<div className="pic-options">{[72, 144, 216].map((value) => <button key={value} aria-pressed={dpi === value} onClick={() => { invalidate(); setDpi(value) }}>{value} DPI</button>)}</div></label>{format === 'jpeg' && <label>图片质量 · {quality}%<input aria-label="图片质量" type="range" min="50" max="100" value={quality} onChange={(event) => { invalidate(); setQuality(Number(event.target.value)) }} /></label>}<p>144 DPI 适合日常分享；更高清晰度会增加文件大小。图片使用白色背景。</p></> : <><label>纸张尺寸<div className="pic-options"><button aria-pressed={paper === 'a4'} onClick={() => { invalidate(); setPaper('a4') }}>A4 纸张</button><button aria-pressed={paper === 'original'} onClick={() => { invalidate(); setPaper('original') }}>适应图片</button></div></label>{paper === 'a4' && <label>纸张方向<div className="pic-options"><button aria-pressed={!landscape} onClick={() => { invalidate(); setLandscape(false) }}>纵向</button><button aria-pressed={landscape} onClick={() => { invalidate(); setLandscape(true) }}>横向</button></div></label>}<label>留白边距<div className="pic-options">{[0, 24, 48].map((value) => <button key={value} aria-pressed={margin === value} onClick={() => { invalidate(); setMargin(value) }}>{value === 0 ? '无边距' : value === 24 ? '适中' : '宽松'}</button>)}</div></label><p>每张图片独占一页，等比居中、不裁切。透明区域填充白色，采用高质量 JPEG 编码。</p></>}</fieldset><button className="pic-convert" disabled={locked || !sources.length} onClick={() => void convert()}>{busy ? `转换中 ${Math.round(progress * 100)}%` : mode === 'pdf' ? '转换为图片 →' : '生成 PDF →'}</button>{busy && <><progress max="1" value={progress} aria-label="转换进度" /><button onClick={() => controller.current?.abort()}>取消转换</button></>}</aside></div>
    <div className={`pic-notice ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>{notice}</div>
    <section className="pic-results"><header><div><h3>03 转换结果</h3><span>{outputs.length ? `${outputs.length} 个文件 · ${formatPdfBytes(outputs.reduce((sum, output) => sum + output.blob.size, 0))}` : '转换完成后在这里预览与下载'}</span></div>{outputs.length > 0 && mode === 'pdf' && <button disabled={packing} onClick={() => void downloadZip()}>{packing ? '正在打包…' : '↓ 打包下载 ZIP'}</button>}</header>{outputs.length ? <div className="pic-result-grid">{outputs.map((output) => <article key={output.name}>{mode === 'pdf' ? <a href={output.url} target="_blank" rel="noreferrer"><img loading="lazy" src={output.url} alt={output.name} /></a> : <div className="pic-pdf-ready"><span>✓</span><strong>文档已生成</strong><p>{sources.length} 页 · 按图片顺序排列</p></div>}<footer><div><strong>{output.name}</strong><small>{formatPdfBytes(output.blob.size)}</small></div><a href={output.url} download={output.name}>下载 ↓</a></footer></article>)}</div> : <div className="pic-result-empty"><EmptyDocumentIcon image={mode === 'pdf'} /><p>准备好文件，让内容换一种呈现。</p></div>}</section>
  </div>
}

function ConversionIcon({ direction }: { direction: 'pdf-to-image' | 'image-to-pdf' }) {
  const document = <svg className="pic-file-icon" viewBox="0 0 32 38" aria-hidden="true"><path d="M6 2.5h13l7 7V35.5H6z" /><path d="M19 2.5v8h7M10.5 17h11M10.5 22h11M10.5 27h7" /></svg>
  const image = <svg className="pic-image-icon" viewBox="0 0 38 32" aria-hidden="true"><rect x="2.5" y="2.5" width="33" height="27" rx="3" /><circle cx="12" cy="11" r="2.5" /><path d="m6.5 25 8-8 5.5 5 4.5-4 7 7" /></svg>
  const arrow = <svg className="pic-arrow-icon" viewBox="0 0 34 16" aria-hidden="true"><path d="M2 8h27M23 2l7 6-7 6" /></svg>
  return <span className="pic-mode-art" aria-hidden="true">{direction === 'pdf-to-image' ? <>{document}{arrow}{image}</> : <>{image}{arrow}{document}</>}</span>
}

function EmptyDocumentIcon({ image }: { image: boolean }) {
  return image
    ? <svg className="pic-empty-icon" viewBox="0 0 44 38" aria-hidden="true"><rect x="3" y="4" width="38" height="30" rx="4" /><circle cx="14" cy="14" r="3" /><path d="m8 29 10-10 7 6 5-5 8 9" /></svg>
    : <svg className="pic-empty-icon" viewBox="0 0 38 44" aria-hidden="true"><path d="M6 2.5h16l9 9v30H6z" /><path d="M22 2.5v10h9M11 21h15M11 27h15M11 33h10" /></svg>
}
