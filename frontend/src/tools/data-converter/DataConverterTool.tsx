import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  Fragment,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import type { ToolViewProps } from '../registry'
import {
  convertData,
  DataConversionError,
  dataFormatExtension,
  DEFAULT_CONVERSION_SETTINGS,
  detectDataFormat,
  formatDataBytes,
  MAX_DATA_SOURCE_BYTES,
  type ConversionResult,
  type ConversionSettings,
  type DataFormat,
  type SourceFormat,
} from './dataConverterModel'
import './dataConverter.css'

const SAMPLE_BY_FORMAT: Record<DataFormat, string> = {
  json: `{
  "service": {
    "name": "tool-web",
    "port": 8090,
    "features": ["format", "convert"]
  },
  "logging": { "level": "INFO" }
}`,
  yaml: `service:
  name: tool-web
  port: 8090
  features:
    - format
    - convert
logging:
  level: INFO`,
  properties: `service.name=tool-web
service.port=8090
service.features[0]=format
service.features[1]=convert
logging.level=INFO`,
}

const FORMAT_OPTIONS: Array<{ value: DataFormat; label: string }> = [
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'properties', label: 'Properties' },
]

type Notice = { tone: 'success' | 'error' | 'neutral'; text: string }

function initialResult() {
  return convertData(SAMPLE_BY_FORMAT.properties, 'properties', 'yaml')
}

export default function DataConverterTool({ tool }: ToolViewProps) {
  const [sourceFormat, setSourceFormat] = useState<SourceFormat>('auto')
  const [targetFormat, setTargetFormat] = useState<DataFormat>('yaml')
  const [source, setSource] = useState(SAMPLE_BY_FORMAT.properties)
  const [settings, setSettings] = useState<ConversionSettings>({ ...DEFAULT_CONVERSION_SETTINGS })
  const [result, setResult] = useState<ConversionResult | null>(initialResult)
  const [notice, setNotice] = useState<Notice>({ tone: 'success', text: '示例已按点路径合并，并转换为 YAML' })
  const [resultRevision, setResultRevision] = useState(0)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sourceEditorRef = useRef<HTMLTextAreaElement>(null)

  const detectedSourceFormat = useMemo(() => {
    if (sourceFormat !== 'auto' || !source.trim()) return null
    try {
      return detectDataFormat(source)
    } catch {
      return null
    }
  }, [source, sourceFormat])
  const actualSourceFormat = sourceFormat === 'auto' ? detectedSourceFormat : sourceFormat
  const warnings = result?.warnings ?? []
  const sourceBytes = useMemo(() => new TextEncoder().encode(source).length, [source])
  const targetGuideStep = indentGuideStep(targetFormat, settings)
  const sourceRouteDetail = sourceFormat === 'auto'
    ? actualSourceFormat ? `当前识别为 ${formatLabel(actualSourceFormat)}` : '转换时自动判断'
    : '已手动指定格式'
  const settingsSummary = useMemo(() => {
    const parts = [settings.sortKeys ? '递归排序' : '保留字段顺序']
    if (sourceFormat === 'properties' || sourceFormat === 'auto') {
      parts.push(settings.expandPropertyPaths ? '合并点路径' : '保留原始键名')
      parts.push(settings.inferPropertyScalars ? '识别值类型' : '值均为文本')
    }
    return parts.join(' · ')
  }, [settings.expandPropertyPaths, settings.inferPropertyScalars, settings.sortKeys, sourceFormat])

  useEffect(() => {
    if (sourceFormat !== 'auto' || !source.trim()) return
    const timer = window.setTimeout(() => {
      try {
        const nextResult = convertData(source, 'auto', targetFormat, settings)
        setResult(nextResult)
        setResultRevision((revision) => revision + 1)
        setNotice({
          tone: 'success',
          text: `已自动识别为 ${formatLabel(nextResult.sourceFormat)}，并转换为 ${formatLabel(targetFormat)}${nextResult.warnings.length ? `，有 ${nextResult.warnings.length} 条提示` : ''}`,
        })
      } catch {
        setResult(null)
        setNotice({ tone: 'neutral', text: '正在等待完整配置，识别成功后会自动转换' })
      }
    }, 240)
    return () => window.clearTimeout(timer)
  }, [settings, source, sourceFormat, targetFormat])

  function runConversion(
    nextSource = source,
    nextSourceFormat = sourceFormat,
    nextTargetFormat = targetFormat,
    nextSettings = settings,
    successText?: string,
  ) {
    try {
      const nextResult = convertData(nextSource, nextSourceFormat, nextTargetFormat, nextSettings)
      setResult(nextResult)
      setResultRevision((revision) => revision + 1)
      setNotice({
        tone: 'success',
        text: successText ?? `${formatLabel(nextResult.sourceFormat)} 已转换为 ${formatLabel(nextTargetFormat)}${nextResult.warnings.length ? `，有 ${nextResult.warnings.length} 条提示` : ''}`,
      })
      return nextResult
    } catch (error) {
      setResult(null)
      if (error instanceof DataConversionError) {
        const location = error.diagnostic ? `（第 ${error.diagnostic.line} 行，第 ${error.diagnostic.column} 列）` : ''
        setNotice({ tone: 'error', text: `${error.message}${location}` })
        if (error.diagnostic) locateSource(error.diagnostic.line, error.diagnostic.column, nextSource)
      } else {
        setNotice({ tone: 'error', text: error instanceof Error ? error.message : '转换失败，请检查输入内容' })
      }
      return null
    }
  }

  function locateSource(line: number, column: number, content: string) {
    window.setTimeout(() => {
      const editor = sourceEditorRef.current
      if (!editor) return
      const lines = content.split(/\r\n|\r|\n/)
      const offset = lines.slice(0, Math.max(line - 1, 0)).reduce((sum, item) => sum + item.length + 1, 0)
      const position = Math.min(content.length, offset + Math.max(column - 1, 0))
      editor.focus()
      editor.setSelectionRange(position, Math.min(position + 1, content.length))
    }, 0)
  }

  function updateSource(value: string) {
    setSource(value)
    setResult(null)
    setNotice({ tone: 'neutral', text: sourceFormat === 'auto' ? '正在自动识别，完成输入后将立即转换' : '输入已修改，按 Ctrl / ⌘ + Enter 或点击转换' })
  }

  function chooseSourceFormat(next: SourceFormat) {
    setSourceFormat(next)
    if (next !== 'auto') {
      const sample = source.trim() ? source : SAMPLE_BY_FORMAT[next]
      if (!source.trim()) setSource(sample)
      runConversion(sample, next, targetFormat, settings, `已按 ${formatLabel(next)} 解析输入`)
    } else if (source.trim()) {
      setResult(null)
      setNotice({ tone: 'neutral', text: '自动转换已开启，正在识别输入格式' })
    }
  }

  function chooseTargetFormat(next: DataFormat) {
    setTargetFormat(next)
    if (source.trim() && sourceFormat !== 'auto') {
      runConversion(source, sourceFormat, next, settings)
    } else if (source.trim()) {
      setResult(null)
      setNotice({ tone: 'neutral', text: `正在自动转换为 ${formatLabel(next)}` })
    }
  }

  function applySettings(patch: Partial<ConversionSettings>) {
    const next = { ...settings, ...patch }
    setSettings(next)
    if (source.trim() && sourceFormat !== 'auto') {
      runConversion(source, sourceFormat, targetFormat, next, '格式设置已应用')
    } else if (source.trim()) {
      setResult(null)
      setNotice({ tone: 'neutral', text: '排版设置已更新，正在自动生成结果' })
    }
  }

  function swapRoute() {
    if (!result) {
      setNotice({ tone: 'neutral', text: '请先完成一次转换，再交换源与目标' })
      return
    }
    const nextSource = result.output
    const nextSourceFormat = result.targetFormat
    const nextTargetFormat = result.sourceFormat
    setSource(nextSource)
    setSourceFormat(nextSourceFormat)
    setTargetFormat(nextTargetFormat)
    runConversion(nextSource, nextSourceFormat, nextTargetFormat, settings, '源格式与目标格式已交换')
  }

  function loadSample() {
    const sampleFormat = sourceFormat === 'auto' ? 'properties' : sourceFormat
    const sample = SAMPLE_BY_FORMAT[sampleFormat]
    setSource(sample)
    runConversion(sample, sampleFormat, targetFormat, settings, `${formatLabel(sampleFormat)} 示例已载入`)
  }

  function clearAll() {
    setSource('')
    setResult(null)
    setNotice({ tone: 'neutral', text: '内容已清空，可粘贴文本或导入配置文件' })
  }

  function backfillOutput() {
    if (!result) return
    setSource(result.output)
    setSourceFormat(result.targetFormat)
    setNotice({ tone: 'neutral', text: '转换结果已回填到源编辑器，可继续调整或转换' })
  }

  async function copyOutput() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.output)
      setNotice({ tone: 'success', text: `${formatLabel(targetFormat)} 结果已复制` })
    } catch {
      setNotice({ tone: 'error', text: '浏览器未允许访问剪贴板，请手动选择复制' })
    }
  }

  function downloadOutput() {
    if (!result) return
    const blob = new Blob([result.output], { type: `${mimeType(targetFormat)};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${tool.slug || 'converted'}.${dataFormatExtension(targetFormat)}`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setNotice({ tone: 'success', text: '转换文件已生成' })
  }

  async function loadFile(file: File | undefined) {
    setDragging(false)
    if (!file) return
    if (file.size > MAX_DATA_SOURCE_BYTES) {
      setResult(null)
      setNotice({ tone: 'error', text: `${file.name} 超过 ${formatDataBytes(MAX_DATA_SOURCE_BYTES)} 的本地处理上限` })
      return
    }
    try {
      const content = await file.text()
      const detected = formatFromFilename(file.name)
      const nextSourceFormat: SourceFormat = detected ?? 'auto'
      setSource(content)
      setSourceFormat(nextSourceFormat)
      if (nextSourceFormat === 'auto') {
        setResult(null)
        setNotice({ tone: 'neutral', text: `${file.name} 已载入，正在自动识别并转换` })
      } else {
        runConversion(content, nextSourceFormat, targetFormat, settings, `${file.name} 已在浏览器本地载入`)
      }
    } catch {
      setNotice({ tone: 'error', text: `${file.name} 读取失败，请重新选择` })
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    void loadFile(event.target.files?.[0])
    event.target.value = ''
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    void loadFile(event.dataTransfer.files[0])
  }

  function handleShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      runConversion()
    }
  }

  return (
    <div className="data-converter">
      <section className="data-converter-hero" aria-labelledby="data-converter-heading">
        <div className="data-converter-hero-copy">
          <span className="data-converter-kicker"><i /> CONFIG ROUTER / LOCAL ONLY</span>
          <h2 id="data-converter-heading">让不同配置语法，保持同一份结构。</h2>
          <p>在 JSON、YAML 与 Properties 之间互转；合并分散路径、处理重复配置，并按目标格式重新排版。</p>
          <div className="data-converter-badges" aria-label="处理特性">
            <span>3 种格式</span><span>3 MB 上限</span><span>不上传数据</span>
          </div>
        </div>
        <div className="data-converter-orbit" aria-hidden="true">
          <svg className="data-orbit-map" viewBox="0 0 540 220" preserveAspectRatio="none">
            <path d="M132 45 C 188 45, 198 83, 228 102" />
            <path d="M408 45 C 352 45, 342 83, 312 102" />
            <path d="M270 154 C 270 149, 270 145, 270 140" />
            <circle cx="178" cy="60" r="3" /><circle cx="362" cy="60" r="3" /><circle cx="270" cy="148" r="3" />
          </svg>
          <div className="data-orbit-node is-json"><strong>{'{ }'}</strong><span><b>JSON</b><small>对象语法</small></span></div>
          <div className="data-orbit-node is-yaml"><strong>Y</strong><span><b>YAML</b><small>层级配置</small></span></div>
          <div className="data-orbit-node is-properties"><strong>.P</strong><span><b>Properties</b><small>键值配置</small></span></div>
          <div className="data-orbit-core"><span>↔</span><strong>统一结构</strong><small>双向转换</small></div>
        </div>
      </section>

      <section className="data-route-panel" aria-label="转换路线">
        <div className="data-route-block">
          <header><span>01</span><div><strong>输入格式</strong><small>{sourceRouteDetail}</small></div></header>
          <div className="data-format-switch" role="group" aria-label="选择源格式">
            <button type="button" className={sourceFormat === 'auto' ? 'is-active' : ''} onClick={() => chooseSourceFormat('auto')}>自动</button>
            {FORMAT_OPTIONS.map((option) => (
              <button type="button" key={option.value} className={sourceFormat === option.value ? 'is-active' : ''} onClick={() => chooseSourceFormat(option.value)}>{option.label}</button>
            ))}
          </div>
        </div>
        <button className="data-route-swap" type="button" onClick={swapRoute} aria-label="交换源格式和目标格式">
          <ActionIcon name="swap" /><span>交换方向</span>
        </button>
        <div className="data-route-block is-target">
          <header><span>02</span><div><strong>输出格式</strong><small>转换为 {formatLabel(targetFormat)}</small></div></header>
          <div className="data-format-switch" role="group" aria-label="选择目标格式">
            {FORMAT_OPTIONS.map((option) => (
              <button type="button" key={option.value} className={targetFormat === option.value ? 'is-active' : ''} onClick={() => chooseTargetFormat(option.value)}>{option.label}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="data-settings-panel" aria-label="转换和格式化设置">
        <header>
          <div><span>FORMAT RULES</span><h3>结构与排版</h3></div>
          <p>{settingsSummary}</p>
        </header>
        <div className="data-settings-layout">
          <section className="data-settings-group">
            <header><span>01</span><div><strong>结构规则</strong><small>决定如何解析、合并与整理字段</small></div></header>
            <div className="data-settings-grid is-structure">
              <ToggleSetting label="合并点路径" detail="将 server.port 合并为嵌套结构" checked={settings.expandPropertyPaths} onChange={(checked) => applySettings({ expandPropertyPaths: checked })} />
              <ToggleSetting label="识别值类型" detail="识别数字、布尔值与 null" checked={settings.inferPropertyScalars} onChange={(checked) => applySettings({ inferPropertyScalars: checked })} />
              <ToggleSetting label="递归排序" detail="按名称整理所有对象字段" checked={settings.sortKeys} onChange={(checked) => applySettings({ sortKeys: checked })} />
              <SelectSetting label="重复键" detail="同名配置冲突时的处理策略" value={settings.duplicateStrategy} onChange={(value) => applySettings({ duplicateStrategy: value as ConversionSettings['duplicateStrategy'] })} options={[
                ['last', '保留末项'], ['first', '保留首项'], ['array', '合并为数组'],
              ]} />
            </div>
          </section>
          <section key={targetFormat} className="data-settings-group is-output">
            <header><span>02</span><div><strong>{formatLabel(targetFormat)} 输出排版</strong><small>只影响转换结果的呈现方式</small></div></header>
            <div className="data-settings-grid is-output">
              {targetFormat === 'json' && <SelectSetting label="JSON 缩进" detail="层级对齐宽度" value={String(settings.jsonIndent)} onChange={(value) => applySettings({ jsonIndent: value === '\t' ? '\t' : Number(value) as 2 | 4 })} options={[["2", '2 空格'], ["4", '4 空格'], ['\t', 'Tab']]} />}
              {targetFormat === 'yaml' && <>
                <SelectSetting label="YAML 缩进" detail="层级对齐宽度" value={String(settings.yamlIndent)} onChange={(value) => applySettings({ yamlIndent: Number(value) as 2 | 4 })} options={[["2", '2 空格'], ["4", '4 空格']]} />
                <SelectSetting label="字符串样式" detail="文本引号策略" value={settings.yamlQuoteStyle} onChange={(value) => applySettings({ yamlQuoteStyle: value as ConversionSettings['yamlQuoteStyle'] })} options={[["plain", '自动'], ['single', '单引号'], ['double', '双引号']]} />
                <SelectSetting label="折行宽度" detail="长文本换行位置" value={String(settings.yamlLineWidth)} onChange={(value) => applySettings({ yamlLineWidth: Number(value) as 0 | 80 | 120 })} options={[["80", '80 字符'], ["120", '120 字符'], ["0", '不折行']]} />
              </>}
              {targetFormat === 'properties' && <>
                <SelectSetting label="键值分隔" detail="键和值之间的符号" value={settings.propertiesSeparator} onChange={(value) => applySettings({ propertiesSeparator: value as '=' | ':' })} options={[['=', '等号 ='], [':', '冒号 :']]} />
                <ToggleSetting label="Unicode 转义" detail="输出兼容传统 Java 的 \\uXXXX" checked={settings.escapeUnicode} onChange={(checked) => applySettings({ escapeUnicode: checked })} />
              </>}
            </div>
          </section>
        </div>
      </section>

      <div className="data-converter-toolbar" aria-label="数据转换操作栏">
        <div className="data-toolbar-primary">
          {sourceFormat === 'auto'
            ? <span className="data-auto-convert-status"><i />自动转换已开启</span>
            : <button type="button" className="is-primary" onClick={() => runConversion()}><ActionIcon name="convert" />转换</button>}
          <button type="button" onClick={() => fileInputRef.current?.click()}><ActionIcon name="upload" />导入文件</button>
          <input ref={fileInputRef} type="file" accept=".json,.yaml,.yml,.properties,.conf,.txt" onChange={handleFileChange} aria-label="导入配置文件" hidden />
        </div>
        <div className="data-toolbar-secondary">
          <button type="button" onClick={loadSample}>载入示例</button>
          <button type="button" onClick={clearAll}>清空</button>
        </div>
      </div>

      <div className="data-editor-grid">
        <EditorPanel
          kind="source"
          label={sourceFormat === 'auto' ? 'AUTO DETECT' : formatLabel(sourceFormat)}
          badge={sourceFormat === 'auto' && actualSourceFormat ? formatLabel(actualSourceFormat) : undefined}
          title="源配置"
          detail={`${formatDataBytes(sourceBytes)} / ${formatDataBytes(MAX_DATA_SOURCE_BYTES)}`}
          value={source}
          editorRef={sourceEditorRef}
          dragging={dragging}
          onChange={updateSource}
          onKeyDown={handleShortcut}
          onDragEnter={() => setDragging(true)}
          onDragLeave={() => setDragging(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        />

        <div className="data-convert-rail" aria-hidden="true">
          <div><ActionIcon name="convert" /></div>
        </div>

        <section className={`data-editor-panel is-output${result ? ' is-ready' : ''}`}>
          <header>
            <div><span className="data-output-format"><i />{formatLabel(targetFormat)} OUTPUT</span><h3>转换结果</h3></div>
            <div className="data-output-tools">
              <span className="data-output-state"><i />{result ? '已格式化' : '等待转换'}</span>
              <div className="data-output-actions">
                <button type="button" disabled={!result} onClick={() => void copyOutput()} aria-label="复制转换结果"><ActionIcon name="copy" />复制</button>
                <button type="button" disabled={!result} onClick={downloadOutput} aria-label="下载转换结果"><ActionIcon name="download" />下载</button>
                <button type="button" disabled={!result} onClick={backfillOutput} aria-label="将结果回填到源配置"><ActionIcon name="backfill" />回填</button>
              </div>
            </div>
          </header>
          <div className="data-editor-shell is-output-shell">
            {result ? (
              <div className="data-output-scroll">
                <div key={resultRevision} className={`data-output-canvas${targetGuideStep ? ' has-guides' : ''}`}>
                  <IndentGuides content={result.output} format={targetFormat} step={targetGuideStep} />
                  <pre className="data-output-code" tabIndex={0}><HighlightedOutput content={result.output} format={targetFormat} /></pre>
                </div>
              </div>
            ) : (
              <div className="data-output-empty"><ActionIcon name="nodes" /><strong>等待结构转换</strong><span>结果会在这里按目标语法重新排版</span></div>
            )}
          </div>
        </section>
      </div>

      <div className={`data-converter-notice is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
        <span className="data-notice-mark" aria-hidden="true">{notice.tone === 'success' ? '✓' : notice.tone === 'error' ? '!' : 'i'}</span>
        <p>{notice.text}</p>
        <strong>浏览器本地处理</strong>
      </div>

      {result && (
        <section className="data-result-summary" aria-label="转换统计">
          <div><span>识别格式</span><strong>{formatLabel(actualSourceFormat ?? result.sourceFormat)} → {formatLabel(targetFormat)}</strong></div>
          <div><span>配置字段</span><strong>{result.statistics.keys}</strong></div>
          <div><span>结构深度</span><strong>{result.statistics.maxDepth}</strong></div>
          <div><span>数组节点</span><strong>{result.statistics.arrays}</strong></div>
          <div><span>输出大小</span><strong>{formatDataBytes(result.statistics.outputBytes)}</strong></div>
          <div className={warnings.length ? 'has-warning' : ''}><span>转换提示</span><strong>{warnings.length}</strong></div>
          {warnings.length > 0 && <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
        </section>
      )}
    </div>
  )
}

function EditorPanel({
  label,
  badge,
  title,
  detail,
  value,
  editorRef,
  dragging,
  onChange,
  onKeyDown,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
}: {
  kind: 'source'
  label: string
  badge?: string
  title: string
  detail: string
  value: string
  editorRef: React.RefObject<HTMLTextAreaElement | null>
  dragging: boolean
  onChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onDragEnter: () => void
  onDragLeave: () => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
}) {
  return (
    <section
      className={`data-editor-panel is-source${dragging ? ' is-dragging' : ''}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <header><div><div className="data-editor-label-row"><span>{label}</span>{badge && <b className="data-source-detected"><i />{badge}</b>}</div><h3>{title}</h3></div><small>{detail}</small></header>
      <div className="data-editor-shell">
        <textarea ref={editorRef} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={onKeyDown} spellCheck={false} aria-label="源配置内容" />
        {dragging && <div className="data-drop-overlay"><ActionIcon name="upload" /><strong>松开以载入配置</strong></div>}
      </div>
    </section>
  )
}

function ToggleSetting({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="data-toggle-setting">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="data-toggle-track"><i /></span>
      <span><strong>{label}</strong><small>{detail}</small></span>
    </label>
  )
}

function SelectSetting({ label, detail, value, onChange, options }: { label: string; detail: string; value: string; onChange: (value: string) => void; options: Array<readonly [string, string]> }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const listboxId = useId()
  const selectedIndex = Math.max(0, options.findIndex(([optionValue]) => optionValue === value))
  const selectedLabel = options[selectedIndex]?.[1] ?? value

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  function openAndFocus(index: number) {
    setOpen(true)
    window.requestAnimationFrame(() => optionRefs.current[index]?.focus())
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openAndFocus(event.key === 'ArrowDown' ? selectedIndex : options.length - 1)
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null
    if (event.key === 'ArrowDown') nextIndex = (index + 1) % options.length
    if (event.key === 'ArrowUp') nextIndex = (index - 1 + options.length) % options.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = options.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    optionRefs.current[nextIndex]?.focus()
  }

  function choose(valueToSelect: string) {
    onChange(valueToSelect)
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div className={`data-select-setting${open ? ' is-open' : ''}`}>
      <span className="data-setting-copy"><strong>{label}</strong><small>{detail}</small></span>
      <div ref={rootRef} className="data-select-control">
        <button
          ref={triggerRef}
          type="button"
          className="data-select-trigger"
          aria-label={label}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={handleTriggerKeyDown}
        >
          <span>{selectedLabel}</span><i><ActionIcon name="chevron" /></i>
        </button>
        {open && (
          <div id={listboxId} className="data-select-menu" role="listbox" aria-label={`${label}选项`}>
            {options.map(([optionValue, optionLabel], index) => (
              <button
                ref={(element) => { optionRefs.current[index] = element }}
                type="button"
                role="option"
                aria-selected={optionValue === value}
                key={optionValue}
                onClick={() => choose(optionValue)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
              >
                <span>{optionLabel}</span><i aria-hidden="true">{optionValue === value ? '✓' : ''}</i>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function IndentGuides({ content, format, step }: { content: string; format: DataFormat; step: number | null }) {
  if (!step) return null
  const segments = buildIndentGuideSegments(content, step)
  return (
    <div className={`data-indent-guides is-${format}`} aria-hidden="true">
      {segments.map((segment) => (
        <i
          key={`${segment.column}-${segment.start}-${segment.lines}`}
          style={{
            '--data-guide-column': segment.column,
            '--data-guide-start': segment.start,
            '--data-guide-lines': segment.lines,
          } as CSSProperties}
        />
      ))}
    </div>
  )
}

function buildIndentGuideSegments(content: string, step: number) {
  const indentation = content.split('\n').map((line) => {
    const whitespace = line.match(/^[\t ]*/)?.[0] ?? ''
    return [...whitespace].reduce((width, character) => width + (character === '\t' ? step : 1), 0)
  })
  const maximumLevel = Math.min(8, Math.floor(Math.max(0, ...indentation) / step))
  const segments: Array<{ column: number; start: number; lines: number }> = []

  for (let level = 1; level <= maximumLevel; level += 1) {
    let start: number | null = null
    indentation.forEach((width, lineIndex) => {
      const active = width >= level * step
      if (active && start === null) start = lineIndex
      if (!active && start !== null) {
        segments.push({ column: level * step, start, lines: lineIndex - start })
        start = null
      }
    })
    if (start !== null) segments.push({ column: level * step, start, lines: indentation.length - start })
  }

  return segments
}

function HighlightedOutput({ content, format }: { content: string; format: DataFormat }) {
  const lines = content.split('\n')
  return lines.map((line, index) => {
    const tokens = tokenizeOutputLine(line, format)
    return (
      <Fragment key={`${index}-${line}`}>
        {tokens ? (
          <>{tokens.prefix}<span className="data-token-key">{tokens.key}</span><span className="data-token-separator">{tokens.separator}</span>{tokens.value && <span className="data-token-value">{tokens.value}</span>}</>
        ) : line}
        {index < lines.length - 1 ? '\n' : null}
      </Fragment>
    )
  })
}

function tokenizeOutputLine(line: string, format: DataFormat) {
  const indentationEnd = line.search(/\S|$/)
  if (indentationEnd >= line.length) return null
  let keyStart = indentationEnd

  if (format === 'json' && line.charAt(keyStart) !== '"') return null
  if (format === 'yaml' && line.slice(keyStart, keyStart + 2) === '- ') keyStart += 2
  if (format === 'yaml' && (line.charAt(keyStart) === '#' || line.slice(keyStart).startsWith('---'))) return null
  if (format === 'properties' && (line.charAt(keyStart) === '#' || line.charAt(keyStart) === '!')) return null

  const separatorIndex = findOutputSeparator(line, keyStart, format === 'properties' ? ['=', ':'] : [':'])
  if (separatorIndex < 0) return null
  if (format === 'yaml' && separatorIndex + 1 < line.length && !/\s/.test(line.charAt(separatorIndex + 1))) return null

  let keyEnd = separatorIndex
  while (keyEnd > keyStart && /\s/.test(line.charAt(keyEnd - 1))) keyEnd -= 1
  let valueStart = separatorIndex + 1
  while (valueStart < line.length && /\s/.test(line.charAt(valueStart))) valueStart += 1
  if (keyEnd <= keyStart) return null

  return {
    prefix: line.slice(0, keyStart),
    key: line.slice(keyStart, keyEnd),
    separator: line.slice(keyEnd, valueStart),
    value: line.slice(valueStart),
  }
}

function findOutputSeparator(line: string, start: number, separators: string[]): number {
  let quote = ''
  let escaped = false
  for (let index = start; index < line.length; index += 1) {
    const character = line.charAt(index)
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (quote) {
      if (character === quote) quote = ''
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (separators.includes(character)) return index
  }
  return -1
}

function ActionIcon({ name }: { name: 'swap' | 'convert' | 'upload' | 'copy' | 'download' | 'backfill' | 'nodes' | 'chevron' }) {
  const paths: Record<typeof name, React.ReactNode> = {
    swap: <><path d="M5 7h13m0 0-3-3m3 3-3 3M19 17H6m0 0 3 3m-3-3 3-3" /></>,
    convert: <><path d="M7 7h10l-3-3m3 3-3 3M17 17H7l3 3m-3-3 3-3" /></>,
    upload: <><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" /><path d="M5 14v5h14v-5" /></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    download: <><path d="M12 4v11m0 0 4-4m-4 4-4-4" /><path d="M5 19h14" /></>,
    backfill: <><path d="M9 7H5v12h12v-4" /><path d="M10 14 19 5m0 0h-6m6 0v6" /></>,
    nodes: <><circle cx="5" cy="12" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="19" cy="18" r="2" /><path d="m7 12 10-5M7 12l10 5" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function formatLabel(format: SourceFormat | null): string {
  if (format === 'auto') return '自动识别'
  if (format === 'properties') return 'Properties'
  return format?.toUpperCase() ?? '—'
}

function indentGuideStep(format: DataFormat | null, settings: ConversionSettings): number | null {
  if (format === 'json') return settings.jsonIndent === '\t' ? 4 : settings.jsonIndent
  if (format === 'yaml') return settings.yamlIndent
  return null
}

function formatFromFilename(filename: string): DataFormat | null {
  const extension = filename.split('.').pop()?.toLowerCase()
  if (extension === 'json') return 'json'
  if (extension === 'yaml' || extension === 'yml') return 'yaml'
  if (extension === 'properties' || extension === 'conf') return 'properties'
  return null
}

function mimeType(format: DataFormat): string {
  if (format === 'json') return 'application/json'
  if (format === 'yaml') return 'application/yaml'
  return 'text/plain'
}
