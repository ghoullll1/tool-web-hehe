import { Icon } from "../../components/Icon"
import {
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent,
} from 'react'
import type { KeywordCase, SqlLanguage } from 'sql-formatter'
import type { ToolViewProps } from '../registry'
import {
  MAX_SQL_BYTES,
  SQL_DIALECTS,
  SqlFormattingError,
  compactSqlDocument,
  describeSqlSizeChange,
  formatSqlBytes,
  formatSqlDocument,
  getSqlDiagnosticOffset,
  getSqlDialect,
  getSqlSample,
  type SqlFormatSettings,
  type SqlIndent,
} from './sqlFormatterModel'

const DEFAULT_SETTINGS: SqlFormatSettings = {
  dialect: 'mysql',
  indent: 'tab',
  keywordCase: 'upper',
  logicalOperatorNewline: 'before',
  denseOperators: false,
  linesBetweenQueries: 1,
}

type ProcessMode = 'format' | 'compact'
type Notice = { tone: 'neutral' | 'success' | 'error'; message: string }

export default function SqlFormatterTool({ tool }: ToolViewProps) {
  const initialSource = getSqlSample(DEFAULT_SETTINGS.dialect)
  const [source, setSource] = useState(initialSource)
  const [output, setOutput] = useState(() => formatSqlDocument(initialSource, DEFAULT_SETTINGS))
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [lastMode, setLastMode] = useState<ProcessMode>('format')
  const [notice, setNotice] = useState<Notice>({ tone: 'success', message: 'MySQL 示例已使用 Tab 缩进完成格式化' })
  const [dialectOpen, setDialectOpen] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const inputPanelRef = useRef<HTMLElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function locateError(error: SqlFormattingError, currentSource: string) {
    if (!error.diagnostic) return
    const offset = getSqlDiagnosticOffset(currentSource, error.diagnostic)
    inputRef.current?.focus()
    inputRef.current?.setSelectionRange(offset, Math.min(currentSource.length, offset + 1))
    inputPanelRef.current?.animate?.(
      [
        { transform: 'translateX(0)', borderColor: '#dce2d8' },
        { transform: 'translateX(-3px)', borderColor: '#df765e' },
        { transform: 'translateX(3px)', borderColor: '#df765e' },
        { transform: 'translateX(0)', borderColor: '#dce2d8' },
      ],
      { duration: 520, easing: 'ease-out' },
    )
  }

  function processSql(
    mode: ProcessMode,
    nextSource = source,
    nextSettings = settings,
    successMessage?: string,
  ) {
    try {
      const nextOutput = mode === 'format'
        ? formatSqlDocument(nextSource, nextSettings)
        : compactSqlDocument(nextSource, nextSettings)
      setOutput(nextOutput)
      setLastMode(mode)
      setNotice({
        tone: 'success',
        message: successMessage ?? `${getSqlDialect(nextSettings.dialect).label} SQL 已${mode === 'format' ? '格式化' : '压缩'}`,
      })
    } catch (error) {
      setOutput('')
      const formattingError = error instanceof SqlFormattingError
        ? error
        : new SqlFormattingError(error instanceof Error ? error.message : 'SQL 处理失败')
      const location = formattingError.diagnostic
        ? `（第 ${formattingError.diagnostic.line} 行，第 ${formattingError.diagnostic.column} 列）`
        : ''
      setNotice({ tone: 'error', message: `${formattingError.message}${location}` })
      locateError(formattingError, nextSource)
    }
  }

  function updateSource(value: string) {
    setSource(value)
    setOutput('')
    setNotice({ tone: 'neutral', message: value ? '内容已修改，按 Ctrl + Enter 格式化' : '请输入需要格式化的 SQL' })
  }

  function updateSettings(patch: Partial<SqlFormatSettings>) {
    const nextSettings = { ...settings, ...patch }
    setSettings(nextSettings)
    if (source.trim()) processSql(lastMode, source, nextSettings, '格式规则已更新并重新处理')
  }

  function chooseDialect(dialect: SqlLanguage) {
    setDialectOpen(false)
    updateSettings({ dialect })
  }

  function loadExample() {
    const example = getSqlSample(settings.dialect)
    setSource(example)
    processSql('format', example, settings, `${getSqlDialect(settings.dialect).label} 示例已载入`)
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    event.preventDefault()
    const editor = event.currentTarget
    const pasted = event.clipboardData.getData('text')
    const start = editor.selectionStart ?? source.length
    const end = editor.selectionEnd ?? start
    const nextSource = `${source.slice(0, start)}${pasted}${source.slice(end)}`
    setSource(nextSource)
    processSql('format', nextSource, settings, '粘贴内容已自动格式化')
  }

  async function loadFile(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_SQL_BYTES) {
      setOutput('')
      setNotice({ tone: 'error', message: `${file.name} 超过 ${formatSqlBytes(MAX_SQL_BYTES)} 的处理上限` })
      return
    }
    try {
      const content = await file.text()
      setSource(content)
      processSql('format', content, settings, `${file.name} 已载入并自动格式化`)
    } catch {
      setOutput('')
      setNotice({ tone: 'error', message: `${file.name} 读取失败，请重新选择` })
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    void loadFile(event.target.files?.[0])
    event.target.value = ''
  }

  function handleShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      processSql('format')
    }
  }

  async function copyResult() {
    if (!output) return
    try {
      await navigator.clipboard.writeText(output)
      setNotice({ tone: 'success', message: '格式化结果已复制' })
    } catch {
      setNotice({ tone: 'error', message: '复制失败，请检查浏览器剪贴板权限' })
    }
  }

  function downloadResult() {
    if (!output) return
    const url = URL.createObjectURL(new Blob([output], { type: 'text/sql;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${settings.dialect}-formatted.sql`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    setNotice({ tone: 'success', message: 'SQL 文件已生成' })
  }

  function clearAll() {
    setSource('')
    setOutput('')
    setNotice({ tone: 'neutral', message: '输入和结果已清空' })
    inputRef.current?.focus()
  }

  function backfillOutput() {
    if (!output) return
    setSource(output)
    setNotice({ tone: 'success', message: '结果已回填到输入区，可继续调整' })
  }

  const sourceBytes = new TextEncoder().encode(source).length
  const outputBytes = new TextEncoder().encode(output).length

  return (
    <div className="sql-tool" data-tool={tool.slug}>
      <div className={`sql-notice is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
        <span aria-hidden="true">{notice.tone === 'error' ? <Icon name="alert" /> : notice.tone === 'success' ? <Icon name="check" /> : <Icon name="info" />}</span>
        <p>{notice.message}</p>
        <b>仅在浏览器本地处理</b>
      </div>

      <section className="sql-settings" aria-label="SQL 格式化设置">
        <DialectPicker open={dialectOpen} value={settings.dialect} onOpenChange={setDialectOpen} onChange={chooseDialect} />
        <SettingGroup label="缩进">
          {(['tab', '2', '4'] as SqlIndent[]).map((value) => <OptionButton key={value} active={settings.indent === value} onClick={() => updateSettings({ indent: value })}>{value === 'tab' ? 'Tab' : `${value} 空格`}</OptionButton>)}
        </SettingGroup>
        <SettingGroup label="关键字">
          {([['upper', '大写'], ['lower', '小写'], ['preserve', '保留']] as [KeywordCase, string][]).map(([value, label]) => <OptionButton key={value} active={settings.keywordCase === value} onClick={() => updateSettings({ keywordCase: value })}>{label}</OptionButton>)}
        </SettingGroup>
        <SettingGroup label="AND / OR">
          <OptionButton active={settings.logicalOperatorNewline === 'before'} onClick={() => updateSettings({ logicalOperatorNewline: 'before' })}>条件前</OptionButton>
          <OptionButton active={settings.logicalOperatorNewline === 'after'} onClick={() => updateSettings({ logicalOperatorNewline: 'after' })}>条件后</OptionButton>
        </SettingGroup>
        <label className="sql-setting-check"><input type="checkbox" checked={settings.denseOperators} onChange={(event) => updateSettings({ denseOperators: event.target.checked })} /><span>紧凑运算符</span></label>
        <label className="sql-setting-check"><input type="checkbox" checked={settings.linesBetweenQueries === 2} onChange={(event) => updateSettings({ linesBetweenQueries: event.target.checked ? 2 : 1 })} /><span>语句间空行</span></label>
      </section>

      <div className="sql-workspace">
        <section className="sql-panel sql-input-panel" ref={inputPanelRef} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void loadFile(event.dataTransfer.files[0]) }}>
          <header className="sql-panel-header">
            <div><span>01</span><h2>SQL 输入</h2></div>
            <div className="sql-panel-actions">
              <button type="button" className="is-primary" onClick={() => processSql('format')}>格式化</button>
              <button type="button" onClick={() => processSql('compact')}>压缩</button>
              <button type="button" onClick={loadExample}>示例</button>
              <button type="button" onClick={() => fileInputRef.current?.click()}>打开文件</button>
              <input ref={fileInputRef} type="file" accept=".sql,.txt,text/plain,application/sql" hidden aria-label="选择 SQL 文件" onChange={handleFileChange} />
              <button type="button" className="is-destructive" onClick={clearAll}>清空</button>
            </div>
          </header>
          <textarea ref={inputRef} value={source} spellCheck={false} aria-label="SQL 输入" placeholder="输入、粘贴或拖入 SQL 文件…" onChange={(event) => updateSource(event.target.value)} onPaste={handlePaste} onKeyDown={handleShortcut} />
          <footer className="sql-panel-footer">
            <span>{source.length.toLocaleString()} 字符</span><span>{formatSqlBytes(sourceBytes)}</span><span>{getSqlDialect(settings.dialect).label}</span>
            <kbd>Ctrl</kbd><span><Icon name="plus" /></span><kbd>Enter</kbd><span>格式化</span>
          </footer>
        </section>

        <section className="sql-panel sql-output-panel">
          <header className="sql-panel-header">
            <div><span>02</span><h2>处理结果</h2></div>
            <div className="sql-panel-actions">
              <button type="button" disabled={!output} onClick={backfillOutput}>回填输入</button>
              <button type="button" disabled={!output} onClick={() => void copyResult()}>复制</button>
              <button type="button" disabled={!output} onClick={downloadResult}>下载</button>
            </div>
          </header>
          {output ? <textarea value={output} readOnly spellCheck={false} aria-label="SQL 处理结果" /> : <ResultEmpty error={notice.tone === 'error'} />}
          <footer className="sql-panel-footer"><span>{output.length.toLocaleString()} 字符</span><span>{formatSqlBytes(outputBytes)}</span><span>{lastMode === 'format' ? '格式化结果' : '压缩结果'}</span><strong>{output ? describeSqlSizeChange(sourceBytes, outputBytes) : ''}</strong></footer>
        </section>
      </div>

      <p className="sql-compatibility-note">兼容性说明：请选择最接近实际数据库的方言。存储过程和使用非分号分隔符的脚本可能无法完整格式化。</p>
    </div>
  )
}

function DialectPicker({ open, value, onOpenChange, onChange }: { open: boolean; value: SqlLanguage; onOpenChange: (open: boolean) => void; onChange: (value: SqlLanguage) => void }) {
  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onOpenChange(false)
  }
  return (
    <div className={`sql-dialect-picker${open ? ' is-open' : ''}`} onBlur={handleBlur} onKeyDown={(event) => { if (event.key === 'Escape') onOpenChange(false) }}>
      <span>数据库方言</span>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => onOpenChange(!open)}>{getSqlDialect(value).label}<i aria-hidden="true" /></button>
      {open && <div className="sql-dialect-menu" role="listbox" aria-label="数据库方言">
        <DialectGroup title="常用数据库" group="common" value={value} onChange={onChange} />
        <DialectGroup title="数据平台" group="data" value={value} onChange={onChange} />
      </div>}
    </div>
  )
}

function DialectGroup({ title, group, value, onChange }: { title: string; group: 'common' | 'data'; value: SqlLanguage; onChange: (value: SqlLanguage) => void }) {
  return <section><h3>{title}</h3><div>{SQL_DIALECTS.filter((dialect) => dialect.group === group).map((dialect) => <button type="button" role="option" aria-selected={dialect.id === value} key={dialect.id} onClick={() => onChange(dialect.id)}><span>{dialect.label}</span>{dialect.id === value && <b aria-hidden="true"><Icon name="check" /></b>}</button>)}</div></section>
}

function SettingGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="sql-setting-group"><span>{label}</span><div>{children}</div></div>
}

function OptionButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className={active ? 'is-active' : ''} aria-pressed={active} onClick={onClick}>{children}</button>
}

function ResultEmpty({ error }: { error: boolean }) {
  return <div className={`sql-result-empty${error ? ' is-error' : ''}`}><span aria-hidden="true">{error ? <Icon name="alert" /> : 'SQL'}</span><strong>{error ? '格式化失败' : '等待处理'}</strong><p>{error ? '请根据上方提示检查语法和数据库方言。' : '输入 SQL 后点击格式化或压缩。'}</p></div>
}
