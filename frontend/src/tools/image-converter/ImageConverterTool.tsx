import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { ToolViewProps } from '../registry'
import {
  convertedImageName,
  convertImage,
  formatImageBytes,
  formatSizeDelta,
  validateImageFiles,
  zipConvertedImages,
  type ConvertedImage,
  type ImageOutputFormat,
  type ImageScale,
} from './imageConverterModel'
import './imageConverter.css'

interface SourceImage {
  id: string
  file: File
  url: string
  width?: number
  height?: number
}

interface ResultImage extends ConvertedImage {
  id: string
  sourceName: string
  sourceBytes: number
  url: string
}

const FORMATS: ReadonlyArray<{ value: ImageOutputFormat; name: string; note: string }> = [
  { value: 'jpeg', name: 'JPG', note: '兼容优先' },
  { value: 'png', name: 'PNG', note: '透明无损' },
  { value: 'webp', name: 'WebP', note: '轻量高效' },
]

const SCALES: ReadonlyArray<{ value: ImageScale; label: string }> = [
  { value: 1, label: '原始尺寸' },
  { value: 0.75, label: '缩小至 75%' },
  { value: 0.5, label: '缩小至 50%' },
]

export default function ImageConverterTool({ tool }: ToolViewProps) {
  const [sources, setSources] = useState<SourceImage[]>([])
  const [results, setResults] = useState<ResultImage[]>([])
  const [format, setFormat] = useState<ImageOutputFormat>('webp')
  const [quality, setQuality] = useState(88)
  const [scale, setScale] = useState<ImageScale>(1)
  const [background, setBackground] = useState('#ffffff')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [packing, setPacking] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [failures, setFailures] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('添加图片后，可统一设置格式并批量转换')
  const [noticeType, setNoticeType] = useState<'info' | 'success' | 'error'>('info')
  const inputRef = useRef<HTMLInputElement>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const urlsRef = useRef(new Set<string>())
  const mountedRef = useRef(true)

  useEffect(() => {
    const urls = urlsRef.current
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      controllerRef.current?.abort()
      urls.forEach(URL.revokeObjectURL)
      urls.clear()
    }
  }, [])

  const totalSourceBytes = useMemo(() => sources.reduce((sum, source) => sum + source.file.size, 0), [sources])
  const totalResultBytes = useMemo(() => results.reduce((sum, result) => sum + result.blob.size, 0), [results])
  const locked = busy || packing

  function allocateUrl(blob: Blob) {
    const url = URL.createObjectURL(blob)
    urlsRef.current.add(url)
    return url
  }

  function releaseUrl(url: string) {
    URL.revokeObjectURL(url)
    urlsRef.current.delete(url)
  }

  function clearResults() {
    results.forEach((result) => releaseUrl(result.url))
    setResults([])
    setFailures({})
    setProgress(0)
    setActiveId(null)
  }

  function addFiles(files: File[]) {
    if (locked || files.length === 0) return
    try {
      const combined = [...sources.map((source) => source.file), ...files]
      validateImageFiles(combined)
      clearResults()
      const added = files.map((file) => ({ id: crypto.randomUUID(), file, url: allocateUrl(file) }))
      setSources((current) => [...current, ...added])
      setNotice(`已添加 ${combined.length} 张图片，可以开始转换`)
      setNoticeType('success')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法添加这些图片')
      setNoticeType('error')
    }
  }

  function removeSource(id: string) {
    const source = sources.find((item) => item.id === id)
    if (source) releaseUrl(source.url)
    clearResults()
    const next = sources.filter((item) => item.id !== id)
    setSources(next)
    setNotice(next.length ? `还剩 ${next.length} 张图片` : '添加图片后，可统一设置格式并批量转换')
    setNoticeType('info')
  }

  function clearAll() {
    controllerRef.current?.abort()
    sources.forEach((source) => releaseUrl(source.url))
    clearResults()
    setSources([])
    setBusy(false)
    setNotice('已清空，拖入新图片即可重新开始')
    setNoticeType('info')
  }

  function updateFormat(next: ImageOutputFormat) {
    if (next === format) return
    clearResults()
    setFormat(next)
    setNotice(`输出格式已改为 ${FORMATS.find((item) => item.value === next)?.name ?? next.toUpperCase()}，请重新转换`)
    setNoticeType('info')
  }

  function updateScale(next: ImageScale) {
    if (next === scale) return
    clearResults()
    setScale(next)
    setNotice('尺寸设置已更新，请重新转换')
    setNoticeType('info')
  }

  async function runConversion() {
    if (locked || !sources.length) return
    clearResults()
    const controller = new AbortController()
    controllerRef.current = controller
    setBusy(true)
    setNoticeType('info')
    setNotice('正在逐张转换，已完成的结果会立即出现')
    const outputNameCounts = new Map<string, number>()
    for (const source of sources) {
      const name = convertedImageName(source.file.name, format)
      outputNameCounts.set(name, (outputNameCounts.get(name) ?? 0) + 1)
    }
    const nextResults: ResultImage[] = []
    const nextFailures: Record<string, string> = {}
    for (const [index, source] of sources.entries()) {
      if (controller.signal.aborted) break
      setActiveId(source.id)
      try {
        const baseName = convertedImageName(source.file.name, format)
        const converted = await convertImage(source.file, { format, quality, scale, background }, controller.signal, outputNameCounts.get(baseName)! > 1 ? index + 1 : undefined)
        if (controller.signal.aborted || !mountedRef.current) break
        const result = { ...converted, id: source.id, sourceName: source.file.name, sourceBytes: source.file.size, url: allocateUrl(converted.blob) }
        nextResults.push(result)
        setResults([...nextResults])
      } catch (error) {
        if (controller.signal.aborted) break
        nextFailures[source.id] = error instanceof Error ? error.message : '图片无法转换'
        setFailures({ ...nextFailures })
      }
      setProgress((index + 1) / sources.length)
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    }
    controllerRef.current = null
    if (!mountedRef.current) return
    setBusy(false)
    setActiveId(null)
    if (controller.signal.aborted) {
      setNotice(`转换已取消，保留 ${nextResults.length} 个已完成结果`)
      setNoticeType('info')
    } else if (Object.keys(nextFailures).length) {
      setNotice(`已转换 ${nextResults.length} 张，${Object.keys(nextFailures).length} 张失败`)
      setNoticeType(nextResults.length ? 'info' : 'error')
    } else {
      setProgress(1)
      setNotice(`转换完成 · ${nextResults.length} 张图片已准备好`)
      setNoticeType('success')
    }
  }

  async function downloadAll() {
    if (!results.length || packing) return
    setPacking(true)
    try {
      const zip = await zipConvertedImages(results)
      downloadBlob(zip, `converted-${format}-images.zip`)
      setNotice(`已打包 ${results.length} 张图片`)
      setNoticeType('success')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '打包失败，请逐张下载')
      setNoticeType('error')
    } finally {
      if (mountedRef.current) setPacking(false)
    }
  }

  function downloadBlob(blob: Blob, name: string) {
    const url = allocateUrl(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    window.setTimeout(() => releaseUrl(url), 60_000)
  }

  return <div className="image-converter" data-tool={tool.slug}>
    <section className="image-converter-hero" aria-labelledby="image-converter-title">
      <div className="image-converter-hero-copy">
        <span className="image-converter-eyebrow">IMAGE LAB · BROWSER LOCAL</span>
        <h2 id="image-converter-title">一次选择，换一种清晰表达。</h2>
        <p>批量转换 JPG、PNG 与 WebP；在下载前看清尺寸、质量与文件体积变化。</p>
        <span className="image-converter-local"><i /> 图片不会离开浏览器</span>
      </div>
      <ConversionArtwork />
    </section>

    <section className="image-converter-flow" aria-label="支持的图片格式">
      <div className="image-converter-flow-heading"><span>FORMAT MAP</span><strong>主流格式自由转换</strong></div>
      <div className="image-converter-flow-track">
        {FORMATS.map((item, index) => <div key={item.value} className="image-converter-flow-item">
          <span>{item.name}</span><small>{item.note}</small>{index < FORMATS.length - 1 && <b aria-hidden="true">↔</b>}
        </div>)}
      </div>
      <div className="image-converter-flow-limit"><span>批量上限</span><strong>30 张</strong><small>合计不超过 150 MB</small></div>
    </section>

    <div className="image-converter-workspace">
      <section className="image-converter-source">
        <header><div><span>01</span><div><h3>添加原始图片</h3><p>{sources.length ? `${sources.length} 张 · ${formatImageBytes(totalSourceBytes)}` : '拖入图片，或从设备中选择'}</p></div></div><button type="button" disabled={locked || !sources.length} onClick={clearAll}>清空全部</button></header>
        <input ref={inputRef} hidden type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} />
        <button
          type="button"
          className={`image-converter-drop ${dragging ? 'is-dragging' : ''}`}
          disabled={locked}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
          onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false) }}
          onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)) }}
        >
          <UploadIcon />
          <strong>{dragging ? '松开即可加入图片' : sources.length ? '继续添加图片' : '把图片拖到这里'}</strong>
          <span>点击选择 JPG、PNG、WebP</span>
        </button>
        {sources.length > 0 ? <div className="image-converter-source-list" aria-label="待转换图片">
          {sources.map((source, index) => <article key={source.id} className={activeId === source.id ? 'is-active' : failures[source.id] ? 'is-error' : results.some((result) => result.id === source.id) ? 'is-done' : ''}>
            <span className="image-converter-index">{String(index + 1).padStart(2, '0')}</span>
            <img src={source.url} alt="" onLoad={(event) => {
              const image = event.currentTarget
              setSources((current) => current.map((item) => item.id === source.id ? { ...item, width: image.naturalWidth, height: image.naturalHeight } : item))
            }} />
            <div className="image-converter-source-name"><strong title={source.file.name}>{source.file.name}</strong><span>{source.width && source.height ? `${source.width} × ${source.height} · ` : ''}{formatImageBytes(source.file.size)}</span>{failures[source.id] && <em>{failures[source.id]}</em>}</div>
            <StatusIcon status={activeId === source.id ? 'active' : failures[source.id] ? 'error' : results.some((result) => result.id === source.id) ? 'done' : 'ready'} />
            <button type="button" disabled={locked} aria-label={`移除 ${source.file.name}`} onClick={() => removeSource(source.id)}>×</button>
          </article>)}
        </div> : <div className="image-converter-empty"><PictureIcon /><p>可同时选择多张图片，转换顺序与当前列表一致。</p></div>}
      </section>

      <aside className="image-converter-settings">
        <header><span>02</span><div><h3>输出设置</h3><p>所有图片统一应用</p></div></header>
        <fieldset disabled={locked}>
          <legend>目标格式</legend>
          <div className="image-converter-formats">{FORMATS.map((item) => <button type="button" key={item.value} aria-pressed={format === item.value} onClick={() => updateFormat(item.value)}><strong>{item.name}</strong><span>{item.note}</span><i aria-hidden="true">✓</i></button>)}</div>
          {format !== 'png' && <label className="image-converter-quality"><span><b>图片质量</b><output>{quality}%</output></span><input aria-label="图片质量" type="range" min="40" max="100" step="1" value={quality} onChange={(event) => { clearResults(); setQuality(Number(event.target.value)) }} /><small>{quality >= 90 ? '更清晰，文件通常更大' : quality >= 75 ? '清晰度与体积均衡' : '更小体积，细节会减少'}</small></label>}
          <div className="image-converter-field"><span>输出尺寸</span><div className="image-converter-scale">{SCALES.map((item) => <button type="button" key={item.value} aria-pressed={scale === item.value} onClick={() => updateScale(item.value)}>{item.label}</button>)}</div></div>
          {format === 'jpeg' && <label className="image-converter-background"><span>透明区域背景</span><div><input aria-label="透明区域背景颜色" type="color" value={background} onChange={(event) => { clearResults(); setBackground(event.target.value) }} /><code>{background.toUpperCase()}</code></div><small>JPG 不支持透明，透明像素会填充此颜色。</small></label>}
          {format === 'png' && <p className="image-converter-setting-note">PNG 采用无损编码并保留透明区域，因此无需设置质量。</p>}
        </fieldset>
        <button type="button" className="image-converter-action" disabled={locked || !sources.length} onClick={() => void runConversion()}>{busy ? <><span className="image-converter-spinner" />正在转换 {Math.round(progress * 100)}%</> : <>开始批量转换 <span>→</span></>}</button>
        {busy && <button type="button" className="image-converter-cancel" onClick={() => controllerRef.current?.abort()}>取消转换</button>}
        <div className="image-converter-progress" aria-hidden={!busy && progress === 0}><span style={{ width: `${progress * 100}%` }} /></div>
      </aside>
    </div>

    <div className={`image-converter-notice is-${noticeType}`} role={noticeType === 'error' ? 'alert' : 'status'}><StatusIcon status={noticeType === 'error' ? 'error' : noticeType === 'success' ? 'done' : 'ready'} /><span>{notice}</span><b>浏览器本地处理</b></div>

    <section className="image-converter-results">
      <header><div><span>03</span><div><h3>转换结果</h3><p>{results.length ? `${results.length} 张 · ${formatImageBytes(totalResultBytes)}` : '完成后可对比并下载'}</p></div></div>{results.length > 0 && <button type="button" disabled={packing} onClick={() => void downloadAll()}>{packing ? '正在打包…' : '打包下载 ZIP'} <span>↓</span></button>}</header>
      {results.length ? <div className="image-converter-result-grid">{results.map((result, index) => <article key={result.id} style={{ '--result-index': index } as CSSProperties}>
        <div className="image-converter-result-preview"><img loading="lazy" src={result.url} alt={`${result.sourceName} 转换结果`} /><span>{format.toUpperCase()}</span></div>
        <div className="image-converter-result-copy"><strong title={result.name}>{result.name}</strong><p>{result.width} × {result.height}</p><div><span>{formatImageBytes(result.blob.size)}</span><b className={result.blob.size <= result.sourceBytes ? 'is-smaller' : ''}>{formatSizeDelta(result.sourceBytes, result.blob.size)}</b></div></div>
        <a href={result.url} download={result.name} aria-label={`下载 ${result.name}`}><DownloadIcon /> 下载</a>
      </article>)}</div> : <div className="image-converter-result-empty"><PictureIcon /><h4>还没有转换结果</h4><p>选择图片并设置目标格式，转换结果会在这里逐张出现。</p></div>}
    </section>
  </div>
}

function ConversionArtwork() {
  return <div className="image-converter-art" aria-hidden="true"><span className="is-jpg">JPG</span><svg viewBox="0 0 120 40"><path d="M4 20h104"/><path d="m98 9 11 11-11 11"/><circle cx="42" cy="20" r="5"/><circle cx="70" cy="20" r="5"/></svg><div><span className="is-png">PNG</span><span className="is-webp">WEBP</span></div></div>
}

function UploadIcon() {
  return <svg viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="7" width="38" height="34" rx="8"/><path d="M24 31V17m-6 6 6-6 6 6M14 35h20"/></svg>
}

function PictureIcon() {
  return <svg viewBox="0 0 48 44" aria-hidden="true"><rect x="4" y="4" width="40" height="36" rx="7"/><circle cx="16" cy="15" r="4"/><path d="m9 34 11-11 7 7 5-5 7 9"/></svg>
}

function DownloadIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 20h14"/></svg>
}

function StatusIcon({ status }: { status: 'ready' | 'active' | 'done' | 'error' }) {
  return <span className={`image-converter-status is-${status}`} aria-label={status === 'ready' ? '待处理' : status === 'active' ? '转换中' : status === 'done' ? '已完成' : '转换失败'}>{status === 'done' ? '✓' : status === 'error' ? '!' : status === 'active' ? '↻' : '•'}</span>
}
