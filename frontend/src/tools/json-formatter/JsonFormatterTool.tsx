import { Icon } from "../../components/Icon"
import {
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FocusEvent,
  type KeyboardEvent,
} from 'react'
import type { ToolViewProps } from '../registry'
import { JsonTree } from './JsonTree'
import {
  escapeJsonText,
  findJsonMatches,
  formatBytes,
  formatJson,
  JsonToolError,
  MAX_JSON_BYTES,
  minifyJson,
  parseJsonDocument,
  sortJson,
  unescapeJsonText,
  type JsonDiagnostic,
  type JsonIndent,
} from './jsonModel'

const SAMPLE_JSON = `{
  "service": "tool-web",
  "enabled": true,
  "release": 1,
  "requestId": 9223372036854775807,
  "features": [
    "格式化",
    "压缩",
    "树形查看"
  ],
  "owner": {
    "team": "platform",
    "region": "cn-east"
  }
}`
const DEFAULT_INDENT: JsonIndent = '\t'
const DEFAULT_SAMPLE_JSON = formatJson(SAMPLE_JSON, DEFAULT_INDENT)
const INDENT_OPTIONS: ReadonlyArray<{ value: JsonIndent; label: string }> = [
  { value: '\t', label: 'Tab' },
  { value: 2, label: '2 空格' },
  { value: 4, label: '4 空格' },
]

type ViewMode = 'tree' | 'text'
type InputAction = 'format' | 'minify' | 'validate' | 'escape' | 'unescape'
type InputIconName = InputAction | 'indent' | 'file' | 'clear' | 'example' | 'backfill'
type Notice =
  | { tone: 'success'; message: string }
  | { tone: 'error'; message: string; diagnostic?: JsonDiagnostic }
  | { tone: 'neutral'; message: string }

export default function JsonFormatterTool({ tool }: ToolViewProps) {
  const [source, setSource] = useState(DEFAULT_SAMPLE_JSON)
  const [output, setOutput] = useState(DEFAULT_SAMPLE_JSON)
  const [indent, setIndent] = useState<JsonIndent>(DEFAULT_INDENT)
  const [indentMenuOpen, setIndentMenuOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('tree')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  const [notice, setNotice] = useState<Notice>({ tone: 'success', message: '示例 JSON 校验通过' })
  const [expandRevision, setExpandRevision] = useState(0)
  const [expandAll, setExpandAll] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputEditorRef = useRef<HTMLTextAreaElement>(null)
  const inputPanelRef = useRef<HTMLElement>(null)
  const indentTriggerRef = useRef<HTMLButtonElement>(null)

  const deferredOutput = useDeferredValue(output)
  const parsedOutput = useMemo(() => {
    if (!output) return null
    try {
      return parseJsonDocument(deferredOutput)
    } catch {
      return null
    }
  }, [deferredOutput, output])
  const searchMatches = useMemo(
    () => parsedOutput ? findJsonMatches(parsedOutput.value, searchQuery) : [],
    [parsedOutput, searchQuery],
  )
  const resolvedMatchIndex = searchMatches.length === 0
    ? 0
    : Math.min(activeMatchIndex, searchMatches.length - 1)
  const activeMatch = searchMatches[resolvedMatchIndex]

  function applyInputAction(action: InputAction) {
    try {
      let nextInput = source
      if (action === 'format' || action === 'validate') nextInput = formatJson(source, indent)
      if (action === 'minify') nextInput = minifyJson(source)
      if (action === 'escape') nextInput = escapeJsonText(source, indent)
      if (action === 'unescape') nextInput = unescapeJsonText(source, indent)

      if (action !== 'validate') setSource(nextInput)
      publishResult(nextInput)
      setNotice({
        tone: 'success',
        message: action === 'validate' ? 'JSON 语法有效，未发现重复字段' : actionMessage(action),
      })
    } catch (error) {
      handleProcessingError(error, source)
    }
  }

  function sortResult() {
    try {
      const sorted = sortJson(output, indent)
      publishResult(sorted)
      setNotice({ tone: 'success', message: '右侧结果的字段已按名称递归排序' })
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : '结果排序失败' })
    }
  }

  function publishResult(nextOutput: string) {
    setOutput(nextOutput)
    setSearchQuery('')
    setActiveMatchIndex(0)
  }

  function handleProcessingError(error: unknown, inputContent: string) {
    publishResult('')
    if (error instanceof JsonToolError) {
      setNotice({ tone: 'error', message: error.message, diagnostic: error.diagnostic })
      locateInputError(error.diagnostic, inputContent)
      return
    }
    setNotice({ tone: 'error', message: error instanceof Error ? error.message : '处理失败，请检查输入' })
  }

  function locateInputError(diagnostic: JsonDiagnostic, inputContent: string) {
    window.setTimeout(() => {
      const editor = inputEditorRef.current
      const panel = inputPanelRef.current
      if (!editor || !panel) return

      const position = Math.min(Math.max(diagnostic.position, 0), inputContent.length)
      editor.focus()
      editor.setSelectionRange(position, Math.min(position + 1, inputContent.length))
      const lineHeight = Number.parseFloat(window.getComputedStyle(editor).lineHeight) || 21
      editor.scrollTop = Math.max(0, (diagnostic.line - 3) * lineHeight)

      panel.classList.remove('is-error-locating')
      void panel.offsetWidth
      panel.classList.add('is-error-locating')
    }, 0)
  }

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(output)
      setNotice({ tone: 'success', message: '结果已复制到剪贴板' })
    } catch {
      setNotice({ tone: 'error', message: '浏览器未允许访问剪贴板，请手动选择复制' })
    }
  }

  function downloadOutput() {
    const blob = new Blob([output], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${tool.slug || 'formatted'}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setNotice({ tone: 'success', message: 'JSON 文件已生成' })
  }

  function updateSource(nextSource: string) {
    setSource(nextSource)
    publishResult('')
    setNotice({ tone: 'neutral', message: '输入已修改；点击输入操作按钮处理，粘贴或导入文件可自动解析' })
  }

  function updateOutput(nextOutput: string) {
    setOutput(nextOutput)
    setSearchQuery('')
    setActiveMatchIndex(0)
    setNotice({ tone: 'neutral', message: '结果已手动修改，树形视图将按当前内容重新解析' })
  }

  function loadAndPreview(nextSource: string, successMessage: string) {
    setSource(nextSource)
    try {
      publishResult(formatJson(nextSource, indent))
      setNotice({ tone: 'success', message: successMessage })
    } catch (error) {
      handleProcessingError(error, nextSource)
    }
  }

  async function loadFile(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_JSON_BYTES) {
      handleProcessingError(new JsonToolError({
        message: `文件超过 ${formatBytes(MAX_JSON_BYTES)} 的处理上限`,
        position: 0,
        line: 1,
        column: 1,
      }), source)
      return
    }

    try {
      const content = await file.text()
      loadAndPreview(content, `已载入并自动格式化 ${file.name}`)
    } catch {
      setNotice({ tone: 'error', message: '文件读取失败，请重新选择' })
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

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    event.preventDefault()
    const pastedText = event.clipboardData.getData('text')
    const editor = event.currentTarget
    const selectionStart = editor.selectionStart ?? source.length
    const selectionEnd = editor.selectionEnd ?? selectionStart
    const nextSource = `${source.slice(0, selectionStart)}${pastedText}${source.slice(selectionEnd)}`
    loadAndPreview(nextSource, '已从剪贴板读取并自动生成树形结果')
  }

  function handleShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      applyInputAction('format')
    }
  }

  function clearAll() {
    setSource('')
    setOutput('')
    setSearchQuery('')
    setActiveMatchIndex(0)
    setNotice({ tone: 'neutral', message: '内容已清空' })
  }

  function toggleAll(nextExpandAll: boolean) {
    setExpandAll(nextExpandAll)
    setExpandRevision((revision) => revision + 1)
  }

  function updateSearchQuery(nextQuery: string) {
    setSearchQuery(nextQuery)
    setActiveMatchIndex(0)
  }

  function moveSearchMatch(direction: -1 | 1) {
    if (searchMatches.length < 2) return
    setActiveMatchIndex((current) => (
      (Math.min(current, searchMatches.length - 1) + direction + searchMatches.length)
      % searchMatches.length
    ))
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || searchMatches.length === 0) return
    event.preventDefault()
    moveSearchMatch(event.shiftKey ? -1 : 1)
  }

  function selectIndent(nextIndent: JsonIndent) {
    setIndent(nextIndent)
    setIndentMenuOpen(false)
    window.setTimeout(() => indentTriggerRef.current?.focus(), 0)
  }

  function handleIndentBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIndentMenuOpen(false)
    }
  }

  function handleIndentKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && indentMenuOpen) {
      event.preventDefault()
      setIndentMenuOpen(false)
      indentTriggerRef.current?.focus()
    }
  }

  const sourceBytes = new TextEncoder().encode(source).length
  const stats = parsedOutput?.statistics
  const selectedIndentLabel = INDENT_OPTIONS.find((option) => option.value === indent)?.label ?? 'Tab'

  return (
    <div className="json-tool">
      <div className={`json-notice is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
        <span className="json-notice-icon">{notice.tone === 'success' ? <Icon name="check" /> : notice.tone === 'error' ? <Icon name="alert" /> : <Icon name="info" />}</span>
        <span>{notice.message}</span>
        {notice.tone === 'error' && notice.diagnostic && (
          <strong>第 {notice.diagnostic.line} 行，第 {notice.diagnostic.column} 列</strong>
        )}
        <span className="json-local-badge">仅在浏览器本地处理</span>
      </div>

      <div className="json-workspace">
        <section ref={inputPanelRef} className="json-panel json-input-panel" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
          <header className="json-panel-header">
            <div><span className="json-panel-index">01</span><h2>输入</h2></div>
            <div className="json-panel-actions json-input-actions" aria-label="输入操作">
              <IconButton label="格式化" icon="format" primary onClick={() => applyInputAction('format')} />
              <IconButton label="校验" icon="validate" onClick={() => applyInputAction('validate')} />
              <IconButton label="压缩" icon="minify" onClick={() => applyInputAction('minify')} />
              <IconButton label="转义" icon="escape" onClick={() => applyInputAction('escape')} />
              <IconButton label="去转义" icon="unescape" onClick={() => applyInputAction('unescape')} />
              <span className="json-input-divider" aria-hidden="true" />
              <div
                className={`json-indent-picker${indentMenuOpen ? ' is-open' : ''}`}
                onBlur={handleIndentBlur}
                onKeyDown={handleIndentKeyDown}
              >
                <button
                  ref={indentTriggerRef}
                  className="json-indent-trigger"
                  type="button"
                  aria-label="缩进"
                  aria-haspopup="listbox"
                  aria-expanded={indentMenuOpen}
                  aria-controls="json-indent-options"
                  title="缩进"
                  onClick={() => setIndentMenuOpen((open) => !open)}
                >
                  <ActionIcon name="indent" />
                  <span>{selectedIndentLabel}</span>
                  <svg className="json-indent-chevron" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="m3 4.5 3 3 3-3" />
                  </svg>
                </button>
                {indentMenuOpen && (
                  <div className="json-indent-menu" id="json-indent-options" role="listbox" aria-label="缩进选项">
                    {INDENT_OPTIONS.map((option) => (
                      <button
                        className="json-indent-option"
                        key={String(option.value)}
                        type="button"
                        role="option"
                        aria-selected={option.value === indent}
                        onClick={() => selectIndent(option.value)}
                      >
                        <strong>{option.label}</strong>
                        <span className="json-indent-check" aria-hidden="true"><Icon name="check" /></span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="json-input-divider" aria-hidden="true" />
              <IconButton label="打开文件" icon="file" onClick={() => fileInputRef.current?.click()} />
              <IconButton label="清空" icon="clear" destructive onClick={clearAll} />
              <IconButton label="载入示例" icon="example" onClick={() => loadAndPreview(formatJson(SAMPLE_JSON, indent), '已载入并格式化示例 JSON')} />
              <IconButton label="结果回填" icon="backfill" onClick={() => loadAndPreview(output, '结果已回填并重新解析')} disabled={!output} />
            </div>
            <input ref={fileInputRef} type="file" accept=".json,application/json,text/plain" aria-label="打开 JSON 文件" hidden onChange={handleFileChange} />
          </header>
          <textarea
            className="json-editor"
            ref={inputEditorRef}
            value={source}
            onChange={(event) => updateSource(event.target.value)}
            onPaste={handlePaste}
            onKeyDown={handleShortcut}
            spellCheck={false}
            aria-label="JSON 输入"
            placeholder="粘贴 JSON，或将 .json 文件拖放到这里…"
          />
          <footer className="json-panel-footer">
            <span>{source.length.toLocaleString()} 字符</span>
            <span>{formatBytes(sourceBytes)}</span>
            <span className={sourceBytes > MAX_JSON_BYTES ? 'is-over-limit' : ''}>上限 {formatBytes(MAX_JSON_BYTES)}</span>
            <kbd>Ctrl</kbd><span><Icon name="plus" /></span><kbd>Enter</kbd><span>格式化</span>
          </footer>
        </section>

        <section className="json-panel json-output-panel">
          <header className="json-panel-header json-result-header">
            <div><span className="json-panel-index">02</span><h2>结果</h2></div>
            <div className="json-panel-actions">
              <div className="json-view-switch" role="group" aria-label="结果视图">
                <button className={viewMode === 'tree' ? 'is-active' : ''} type="button" aria-pressed={viewMode === 'tree'} onClick={() => setViewMode('tree')}>树形</button>
                <button className={viewMode === 'text' ? 'is-active' : ''} type="button" aria-pressed={viewMode === 'text'} onClick={() => setViewMode('text')}>文本</button>
              </div>
              <button type="button" onClick={sortResult} disabled={!parsedOutput}>键排序</button>
              <button type="button" onClick={() => void copyOutput()} disabled={!output}>复制</button>
              <button type="button" onClick={downloadOutput} disabled={!output}>下载</button>
            </div>
          </header>

          {viewMode === 'tree' ? (
            <div className="json-tree-shell">
              <div className="json-tree-tools">
                <label className="json-search">
                  <span aria-hidden="true"><Icon name="search" /></span>
                  <input
                    value={searchQuery}
                    onChange={(event) => updateSearchQuery(event.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="搜索键、值或 JSONPath"
                    aria-label="搜索 JSON 结果"
                  />
                </label>
                {searchQuery.trim() && (
                  <div className="json-search-navigation" role="group" aria-label="搜索结果导航">
                    <button
                      type="button"
                      onClick={() => moveSearchMatch(-1)}
                      disabled={searchMatches.length < 2}
                      aria-label="上一个匹配项"
                      title="上一个匹配项（Shift + Enter）"
                    >‹</button>
                    <output aria-live="polite">
                      {searchMatches.length === 0 ? '0 / 0' : `${resolvedMatchIndex + 1} / ${searchMatches.length}`}
                    </output>
                    <button
                      type="button"
                      onClick={() => moveSearchMatch(1)}
                      disabled={searchMatches.length < 2}
                      aria-label="下一个匹配项"
                      title="下一个匹配项（Enter）"
                    >›</button>
                  </div>
                )}
                <button type="button" onClick={() => toggleAll(true)} disabled={Boolean(searchQuery.trim())}>全部展开</button>
                <button type="button" onClick={() => toggleAll(false)} disabled={Boolean(searchQuery.trim())}>全部折叠</button>
              </div>

              <div className="json-tree-content">
                {!parsedOutput && (
                  <EmptyResult message={notice.tone === 'error'
                    ? '格式化失败，请修正左侧已定位的语法错误。'
                    : '粘贴 JSON 或选择文件后，将自动生成树形结果。'} />
                )}
                {parsedOutput && searchQuery.trim() && (
                  <p className="json-search-summary" role="status">
                    {searchMatches.length === 0
                      ? '没有找到匹配项'
                      : `正在查看第 ${resolvedMatchIndex + 1} 项，共 ${searchMatches.length} 项${searchMatches.length === 100 ? '（仅提供前 100 个匹配项）' : ''}`}
                  </p>
                )}
                {parsedOutput && (
                  <JsonTree
                    key={`${expandRevision}-${activeMatch?.path ?? searchQuery}`}
                    value={parsedOutput.value}
                    expandAll={expandAll}
                    activePath={activeMatch?.path}
                  />
                )}
              </div>
            </div>
          ) : (
            <textarea
              className="json-editor json-result-editor"
              value={output}
              onChange={(event) => updateOutput(event.target.value)}
              spellCheck={false}
              aria-label="JSON 结果"
              placeholder="格式化结果会显示在这里…"
            />
          )}

          <footer className="json-panel-footer json-stats">
            <span>{output.length.toLocaleString()} 字符</span>
            {stats && <><span>{stats.nodes.toLocaleString()} 节点</span><span>{stats.keys.toLocaleString()} 字段</span><span>深度 {stats.maxDepth}</span></>}
            {stats && stats.unsafeNumbers > 0 && <strong>已无损保留 {stats.unsafeNumbers} 个高精度数字</strong>}
          </footer>
        </section>
      </div>
    </div>
  )
}

function EmptyResult({ message }: { message: string }) {
  return <div className="json-empty-result"><span>{'{ }'}</span><p>{message}</p></div>
}

function IconButton({
  label,
  icon,
  onClick,
  disabled = false,
  primary = false,
  destructive = false,
}: {
  label: string
  icon: InputIconName
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  destructive?: boolean
}) {
  const className = [
    'json-icon-button',
    primary ? 'json-primary-button' : '',
    destructive ? 'is-destructive' : '',
  ].filter(Boolean).join(' ')

  return (
    <button
      className={className}
      type="button"
      aria-label={label}
      title={label}
      data-tooltip={label}
      onClick={onClick}
      disabled={disabled}
    >
      <ActionIcon name={icon} />
    </button>
  )
}

function ActionIcon({ name }: { name: InputIconName }) {
  return (
    <svg className="json-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {name === 'format' && <><path d="M4 6h8M4 12h12M4 18h8" /><path d="m17 3 .7 1.8L19.5 5.5l-1.8.7L17 8l-.7-1.8-1.8-.7 1.8-.7L17 3Z" /></>}
      {name === 'validate' && <><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>}
      {name === 'minify' && <><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /><path d="m4 4 6 6M20 4l-6 6M4 20l6-6M20 20l-6-6" /></>}
      {name === 'escape' && <><path d="M8 5H6a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h2M16 5h2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-2" /><path d="m9 16 6-8" /></>}
      {name === 'unescape' && <><path d="M7 8H4v4h4V8H7Zm10 0h-3v4h4V8h-1Z" /><path d="M7 16h10M12 4v2M12 18v2" /></>}
      {name === 'indent' && <><path d="M9 6h11M9 12h11M9 18h11M3 9l3 3-3 3" /></>}
      {name === 'file' && <><path d="M3 7.5h7l2 2h9v8.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Z" /><path d="M3 7.5V6a2 2 0 0 1 2-2h4l2 2h5" /></>}
      {name === 'clear' && <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></>}
      {name === 'example' && <><path d="m12 3 1.2 3.3L16.5 7.5l-3.3 1.2L12 12l-1.2-3.3-3.3-1.2 3.3-1.2L12 3Z" /><path d="m18 13 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM6 14l.6 1.4L8 16l-1.4.6L6 18l-.6-1.4L4 16l1.4-.6L6 14Z" /></>}
      {name === 'backfill' && <><path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 5 5v2" /><path d="M15 5h5v5" /></>}
    </svg>
  )
}

function actionMessage(action: string): string {
  const messages: Record<string, string> = {
    format: '格式化完成',
    minify: '压缩完成',
    escape: 'JSON 已转为转义字符串',
    unescape: '转义字符串已还原并格式化',
  }
  return messages[action] ?? '处理完成'
}
