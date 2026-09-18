import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import type { ToolViewProps } from '../registry'
import { convertDocument } from './documentConversionApi'
import MarkdownPreview from './MarkdownPreview'
import {
  formatBytes,
  markdownFilename,
  MAX_DOCUMENT_BYTES,
  profileMarkdown,
  SUPPORTED_DOCUMENT_EXTENSIONS,
  validateDocument,
  type ConvertedDocument,
} from './documentConversionModel'
import './documentConverter.css'

type Phase = 'idle' | 'uploading' | 'converting' | 'complete'

export default function DocumentConverterTool({ tool }: ToolViewProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [result, setResult] = useState<ConvertedDocument | null>(null)
  const [notice, setNotice] = useState<{ tone: 'info' | 'error' | 'success'; text: string }>({
    tone: 'info',
    text: '文档只用于本次转换，请选择 10 MB 以内的受支持文件。',
  })
  const [copied, setCopied] = useState(false)
  const profile = useMemo(() => result ? profileMarkdown(result.markdown) : null, [result])
  const busy = phase === 'uploading' || phase === 'converting'

  useEffect(() => () => abortRef.current?.abort(), [])

  function chooseFile(candidate: File | null) {
    if (!candidate || busy) return
    const error = validateDocument(candidate)
    if (error) {
      setFile(null)
      setResult(null)
      setNotice({ tone: 'error', text: error })
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    setFile(candidate)
    setResult(null)
    setPhase('idle')
    setUploadProgress(0)
    setNotice({ tone: 'info', text: '文档已就绪，开始后将由服务端转换为 Markdown。' })
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    chooseFile(event.dataTransfer.files.item(0))
  }

  async function startConversion() {
    if (!file || busy) return
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('uploading')
    setUploadProgress(1)
    setNotice({ tone: 'info', text: '正在安全上传文档，请保持页面打开。' })
    try {
      const converted = await convertDocument(file, {
        signal: controller.signal,
        onUploadProgress: setUploadProgress,
        onUploadComplete: () => {
          setUploadProgress(100)
          setPhase('converting')
          setNotice({ tone: 'info', text: '上传完成，转换引擎正在提取文档结构与内容。' })
        },
      })
      setResult(converted)
      setPhase('complete')
      setNotice({ tone: 'success', text: '转换完成，Markdown 已可复制或下载。' })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setNotice({ tone: 'info', text: '转换已取消，未生成结果。' })
      } else {
        setNotice({ tone: 'error', text: error instanceof Error ? error.message : '转换失败，请稍后重试。' })
      }
      setPhase('idle')
      setUploadProgress(0)
    } finally {
      abortRef.current = null
    }
  }

  async function copyMarkdown() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.markdown)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setNotice({ tone: 'error', text: '复制失败，请检查浏览器剪贴板权限。' })
    }
  }

  function downloadMarkdown() {
    if (!result) return
    const blob = new Blob([result.markdown], { type: 'text/markdown;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = markdownFilename(result.source.filename)
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(href), 30_000)
  }

  return <div className="document-converter" data-tool={tool.slug}>
    <header className="document-converter-hero">
      <div className="document-converter-hero-copy">
        <span className="document-converter-kicker"><i /> DOCUMENT WORKBENCH / MARKDOWN PREVIEW</span>
        <h2>把复杂文档，整理成清晰文本。</h2>
        <p>上传 PDF、Office、HTML、文本或邮件文档，由隔离的转换服务提取内容并交付 Markdown。</p>
        <div className="document-converter-constraints">
          <span><strong>10 MB</strong>硬性上限</span>
          <span><strong>15</strong>种扩展名</span>
          <span><strong>NO STORE</strong>即时处理</span>
        </div>
      </div>
      <PipelineVisual phase={phase} />
    </header>

    <div className={`document-phase-rail is-${phase}`} aria-label="转换进度">
      <PhaseStep index="01" label="选择文档" active={phase === 'idle'} complete={phase !== 'idle'} />
      <PhaseStep index="02" label="上传与转换" active={busy} complete={phase === 'complete'} />
      <PhaseStep index="03" label="交付 Markdown" active={phase === 'complete'} complete={phase === 'complete'} />
    </div>

    <section className={`document-converter-workspace${result ? ' has-result' : ''}`}>
      <div className="document-input-panel">
        <header><span>01</span><div><h3>送入转换通道</h3><p>单次处理一个文档，文件不会加入公开目录</p></div></header>
        <div
          className={`document-dropzone${dragging ? ' is-dragging' : ''}${file ? ' has-file' : ''}${busy ? ' is-busy' : ''}`}
          onDragEnter={(event) => { event.preventDefault(); if (!busy) setDragging(true) }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <input ref={inputRef} type="file" aria-label="选择待转换文档" accept={SUPPORTED_DOCUMENT_EXTENSIONS.join(',')} onChange={(event) => chooseFile(event.currentTarget.files?.[0] ?? null)} />
          <i className="document-dropzone-scan" aria-hidden="true" />
          {file ? <div className="document-selected-file">
            <span>{file.name.split('.').pop()?.slice(0, 5).toUpperCase() || 'DOC'}</span>
            <div><strong title={file.name}>{file.name}</strong><small>{formatBytes(file.size)} · {busy ? '正在处理' : '等待开始转换'}</small></div>
            <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>更换文档</button>
          </div> : <button type="button" className="document-choose-action" onClick={() => inputRef.current?.click()}>
            <UploadDocumentIcon />
            <strong>拖入文档，或点击选择</strong>
            <small>PDF · DOCX · PPTX · XLSX · HTML · TXT 等</small>
          </button>}
        </div>

        <div className="document-conversion-action">
          <div className="document-progress-copy">
            <span><b style={{ width: `${phase === 'complete' ? 100 : uploadProgress}%` }} /></span>
            <small>{phase === 'uploading' ? `上传中 ${uploadProgress}%` : phase === 'converting' ? '转换引擎处理中' : phase === 'complete' ? '转换完成' : file ? '准备就绪' : '等待选择文档'}</small>
          </div>
          {busy
            ? <button type="button" className="document-cancel-button" onClick={() => abortRef.current?.abort()}>取消</button>
            : <button type="button" className="document-start-button" disabled={!file} onClick={() => void startConversion()}><span>{result ? '重新转换' : '开始转换'}</span><ArrowIcon /></button>}
        </div>
      </div>

      {result && profile ? <div className="document-result-panel" aria-live="polite">
        <header className="document-result-heading">
          <div><span>02</span><div><h3>Markdown 已交付</h3><p>{result.title || result.source.filename || '未命名文档'}</p></div></div>
          <div className="document-result-actions"><button type="button" onClick={() => void copyMarkdown()}>{copied ? '已复制' : '复制 Markdown'}</button><button type="button" className="is-primary" onClick={downloadMarkdown}>下载 .md</button></div>
        </header>
        <div className="document-result-body">
          <MarkdownPreview source={result.markdown} />
          <aside className="document-output-profile">
            <span className="document-output-seal"><CheckIcon /> CONVERTED</span>
            <strong>{result.metrics.markdownCharacters.toLocaleString()}</strong><small>Markdown 字符</small>
            <dl>
              <div><dt>转换耗时</dt><dd>{result.metrics.durationMs} ms</dd></div>
              <div><dt>文本行数</dt><dd>{profile.lines}</dd></div>
              <div><dt>标题结构</dt><dd>{profile.headings}</dd></div>
              <div><dt>链接 / 代码块</dt><dd>{profile.links} / {profile.codeBlocks}</dd></div>
              <div><dt>表格行</dt><dd>{profile.tables}</dd></div>
              <div><dt>转换引擎</dt><dd>{result.engineVersion ? `${result.engine} ${result.engineVersion}` : result.engine}</dd></div>
            </dl>
            {result.warnings.length > 0 ? <div className="document-warnings"><b>转换提示</b>{result.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
          </aside>
        </div>
      </div> : <aside className="document-guide-panel">
        <header><span>02</span><div><h3>转换输出</h3><p>完成后在这里检查并导出 Markdown</p></div></header>
        <div className="document-guide-visual" role="img" aria-label="文档转换为 Markdown 的等待动画">
          <div className="document-guide-stage">
            <div className="document-guide-source-card"><SourceDocumentIcon /><span>原始文档</span></div>
            <div className="document-guide-flow" aria-hidden="true"><i /><i /><i /><span /></div>
            <div className="document-guide-output-card"><MarkdownDocumentIcon /><span>转换结果</span></div>
          </div>
          <p><i aria-hidden="true" />等待文档进入转换通道</p>
        </div>
        <ol>
          <li><span>01</span><div><strong>结构化提取</strong><p>保留标题、列表、表格和链接等可识别结构。</p></div></li>
          <li><span>02</span><div><strong>安全预览</strong><p>按标题、列表和表格排版，不执行文档中的脚本或宏。</p></div></li>
          <li><span>03</span><div><strong>立即带走</strong><p>复制源码或下载为 .md 文件继续编辑。</p></div></li>
        </ol>
      </aside>}
    </section>

    <footer className={`document-converter-notice is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}><span>{notice.tone === 'error' ? '!' : notice.tone === 'success' ? '✓' : 'i'}</span><p>{notice.text}</p><b>最大 {formatBytes(MAX_DOCUMENT_BYTES)}</b></footer>
  </div>
}

function PhaseStep({ index, label, active, complete }: { index: string; label: string; active: boolean; complete: boolean }) {
  return <div className={`${active ? 'is-active' : ''}${complete ? ' is-complete' : ''}`}><span>{complete ? '✓' : index}</span><strong>{label}</strong></div>
}
function PipelineVisual({ phase }: { phase: Phase }) {
  return <div className={`document-pipeline-visual is-${phase}`} role="img" aria-label="文档转换为 Markdown 的处理流程">
    <div className="document-pipeline-source"><SourceDocumentIcon /><small>原始文档</small></div>
    <div className="document-pipeline-route"><i /><i /><i /><span /></div>
    <div className="document-pipeline-core"><ConversionIcon /><span /></div>
    <div className="document-pipeline-route"><i /><i /><i /><span /></div>
    <div className="document-pipeline-output"><MarkdownDocumentIcon /><small>转换结果</small></div>
  </div>
}
function UploadDocumentIcon() { return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M13 5h15l8 8v27H13z" /><path d="M28 5v9h8M24 34V19m0 0-6 6m6-6 6 6" /></svg> }
function SourceDocumentIcon() { return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 3h10l7 7v19H8z" /><path d="M18 3v8h7M12 17h9M12 21h9M12 25h6" /></svg> }
function MarkdownDocumentIcon() { return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 3h10l7 7v19H8z" /><path d="M18 3v8h7M14 15l-2 11M20 15l-2 11M11 19h11M10 23h11" /></svg> }
function ConversionIcon() { return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 11h16m-4-4 4 4-4 4M25 21H9m4 4-4-4 4-4" /></svg> }
function ArrowIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13m-5-5 5 5-5 5" /></svg> }
function CheckIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10" /></svg> }
