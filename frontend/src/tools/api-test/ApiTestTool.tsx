import { Icon, type IconName } from '../../components/Icon'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ToolViewProps } from '../registry'
import './ApiTestTool.css'
import {
  BODY_TYPES,
  METHODS,
  PARAMETER_VALUE_TYPES,
  REQUEST_CODE_FORMATS,
  createRow,
  executeApiRequest,
  formatByteSize,
  generateRequestCode,
  type ApiRequestConfig,
  type ApiResponseResult,
  type AuthType,
  type BodyType,
  type HttpMethod,
  type KeyValueRow,
  type ParameterValueType,
  type RequestCodeFormat,
} from './apiTestModel'

type RequestTab = 'params' | 'headers' | 'auth' | 'body'
type ResponseTab = 'body' | 'headers' | 'request' | 'timing'
type Notice = { tone: 'neutral' | 'success' | 'error'; message: string }

const BODY_METHODS: readonly HttpMethod[] = ['POST', 'PUT', 'PATCH', 'DELETE']

export default function ApiTestTool({ tool }: ToolViewProps) {
  const [method, setMethod] = useState<HttpMethod>('GET')
  const [url, setUrl] = useState('')
  const [query, setQuery] = useState<KeyValueRow[]>([createRow()])
  const [headers, setHeaders] = useState<KeyValueRow[]>([createRow('Accept', 'application/json')])
  const [bodyType, setBodyType] = useState<BodyType>('none')
  const [bodyText, setBodyText] = useState('{\n  "message": "hello"\n}')
  const [bodyFields, setBodyFields] = useState<KeyValueRow[]>([createRow()])
  const [authType, setAuthType] = useState<AuthType>('none')
  const [authToken, setAuthToken] = useState('')
  const [authUsername, setAuthUsername] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [apiKeyName, setApiKeyName] = useState('X-API-Key')
  const [apiKeyValue, setApiKeyValue] = useState('')
  const [apiKeyLocation, setApiKeyLocation] = useState<'header' | 'query'>('header')
  const [timeoutMs, setTimeoutMs] = useState(30_000)
  const [requestTab, setRequestTab] = useState<RequestTab>('params')
  const [responseTab, setResponseTab] = useState<ResponseTab>('body')
  const [formatted, setFormatted] = useState(true)
  const [requestCodeFormat, setRequestCodeFormat] = useState<RequestCodeFormat>('curl')
  const [response, setResponse] = useState<ApiResponseResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>({ tone: 'neutral', message: '配置请求后点击发送，数据将由浏览器直接访问目标接口' })
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => controllerRef.current?.abort('cancelled'), [])

  const activeQueryCount = useMemo(() => query.filter((row) => row.enabled && row.key.trim()).length + (authType === 'api-key' && apiKeyLocation === 'query' ? 1 : 0), [apiKeyLocation, authType, query])
  const activeHeaderCount = useMemo(() => headers.filter((row) => row.enabled && row.key.trim()).length + (authType !== 'none' && !(authType === 'api-key' && apiKeyLocation === 'query') ? 1 : 0), [apiKeyLocation, authType, headers])

  function chooseMethod(nextMethod: HttpMethod) {
    setMethod(nextMethod)
    if (!BODY_METHODS.includes(nextMethod)) setBodyType('none')
  }

  async function sendRequest() {
    controllerRef.current?.abort('cancelled')
    const controller = new AbortController()
    controllerRef.current = controller
    const timer = window.setTimeout(() => controller.abort('timeout'), timeoutMs)
    setBusy(true)
    setResponse(null)
    setNotice({ tone: 'neutral', message: `${method} 请求发送中…` })
    const config: ApiRequestConfig = { method, url, query, headers, bodyType, bodyText, bodyFields, authType, authToken, authUsername, authPassword, apiKeyName, apiKeyValue, apiKeyLocation, timeoutMs }
    try {
      const nextResponse = await executeApiRequest(config, controller.signal)
      if (controllerRef.current !== controller) return
      setResponse(nextResponse)
      setResponseTab('body')
      setNotice({ tone: nextResponse.ok ? 'success' : 'error', message: `${nextResponse.status} ${nextResponse.statusText || 'HTTP Response'} · ${nextResponse.totalMs.toFixed(0)} ms` })
    } catch (error) {
      if (controllerRef.current !== controller) return
      const message = error instanceof Error ? error.message : '请求失败'
      setNotice({ tone: 'error', message })
    } finally {
      window.clearTimeout(timer)
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setBusy(false)
      }
    }
  }

  function cancelRequest() {
    controllerRef.current?.abort('cancelled')
  }

  async function copyResponse() {
    if (!response) return
    try {
      await navigator.clipboard.writeText(formatted ? response.formattedBody : response.rawBody)
      setNotice({ tone: 'success', message: '响应正文已复制' })
    } catch { setNotice({ tone: 'error', message: '复制失败，请检查浏览器剪贴板权限' }) }
  }

  async function copyRequestCode() {
    if (!response) return
    try {
      await navigator.clipboard.writeText(generateRequestCode(response.request, requestCodeFormat))
      setNotice({ tone: 'success', message: `${REQUEST_CODE_FORMATS.find(({ id }) => id === requestCodeFormat)?.label ?? '请求代码'}已复制` })
    } catch { setNotice({ tone: 'error', message: '复制失败，请检查浏览器剪贴板权限' }) }
  }

  function resetRequest() {
    const activeController = controllerRef.current
    controllerRef.current = null
    activeController?.abort('cancelled')
    setMethod('GET'); setUrl(''); setQuery([createRow()]); setHeaders([createRow('Accept', 'application/json')])
    setBodyType('none'); setBodyText(''); setBodyFields([createRow()]); setAuthType('none'); setAuthToken(''); setAuthUsername(''); setAuthPassword(''); setApiKeyName('X-API-Key'); setApiKeyValue(''); setApiKeyLocation('header'); setResponse(null); setBusy(false)
    setNotice({ tone: 'neutral', message: '请求配置已清空' })
  }

  return <div className="api-tool" data-tool={tool.slug}>
    <div className={`api-notice is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
      <span aria-hidden="true">{busy ? <Icon name="external" /> : notice.tone === 'success' ? <Icon name="check" /> : notice.tone === 'error' ? <Icon name="alert" /> : <Icon name="info" />}</span>
      <p>{notice.message}</p><b>浏览器直连 · 不保存请求数据</b>
    </div>

    <section className="api-request-bar" aria-label="请求地址">
      <MethodPicker value={method} onChange={chooseMethod} />
      <input aria-label="接口地址" value={url} spellCheck={false} placeholder="示例：https://api.example.com/v1/resource" onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void sendRequest() }} />
      <label className="api-timeout"><span>超时</span><input aria-label="超时时间" type="number" min="100" max="120000" step="1000" value={timeoutMs} onChange={(event) => setTimeoutMs(Number(event.target.value))} /><em>ms</em></label>
      {busy
        ? <button type="button" className="api-cancel" onClick={cancelRequest}><span>取消</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8" /></svg></button>
        : <button type="button" className="api-send" title="发送请求（Ctrl/⌘ + Enter）" onClick={() => void sendRequest()}>
          <svg className="api-send-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="m3.2 4.2 13.9 5.6a.25.25 0 0 1 0 .46L3.2 15.8l1.5-5.8-1.5-5.8Z" /><path d="M4.8 10h7.4" /></svg>
          <span>发送</span>
        </button>}
      <button type="button" className="api-reset" aria-label="清空请求" title="清空请求" onClick={resetRequest}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 6.5A6 6 0 1 1 4.3 13" /><path d="M5 3.5v3.2H1.8" /></svg></button>
    </section>

    <div className="api-workspace">
      <section className="api-panel api-request-panel">
        <header className="api-composer-header">
          <div className="api-composer-title"><span>01</span><div><small>REQUEST COMPOSER</small><h2>请求配置</h2></div></div>
          <div className="api-composer-summary" aria-label="请求配置摘要">
            <strong className={`is-${method.toLowerCase()}`}>{method}</strong>
            <span>{activeQueryCount} 参数</span>
            <span>{activeHeaderCount} 请求头</span>
          </div>
        </header>
        <nav className="api-tabs api-request-tabs" aria-label="请求配置标签">
          <RequestTabButton icon="params" label="Query" meta={`${activeQueryCount} 项`} ariaLabel="请求 Query" active={requestTab === 'params'} onClick={() => setRequestTab('params')} />
          <RequestTabButton icon="headers" label="Headers" meta={`${activeHeaderCount} 项`} ariaLabel="请求 Headers" active={requestTab === 'headers'} onClick={() => setRequestTab('headers')} />
          <RequestTabButton icon="auth" label="Auth" meta={authType === 'none' ? '未设置' : '已设置'} ariaLabel="请求 Auth" active={requestTab === 'auth'} onClick={() => setRequestTab('auth')} />
          <RequestTabButton icon="body" label="Body" meta={bodyType === 'none' ? '未设置' : BODY_TYPES.find((item) => item.id === bodyType)?.label ?? '已设置'} ariaLabel="请求 Body" active={requestTab === 'body'} onClick={() => setRequestTab('body')} />
        </nav>
        <div className="api-tab-content">
          {requestTab === 'params' && <PairEditor title="Query 参数" rows={query} onChange={setQuery} keyPlaceholder="参数名" typed />}
          {requestTab === 'headers' && <><PairEditor title="请求 Headers" rows={headers} onChange={setHeaders} keyPlaceholder="Header 名称" /><p className="api-hint">浏览器可能限制 Host、Content-Length、Cookie 等受保护请求头。</p></>}
          {requestTab === 'auth' && <AuthEditor type={authType} onType={setAuthType} token={authToken} onToken={setAuthToken} username={authUsername} onUsername={setAuthUsername} password={authPassword} onPassword={setAuthPassword} apiKeyName={apiKeyName} onApiKeyName={setApiKeyName} apiKeyValue={apiKeyValue} onApiKeyValue={setApiKeyValue} location={apiKeyLocation} onLocation={setApiKeyLocation} />}
          {requestTab === 'body' && <BodyEditor method={method} type={bodyType} onType={setBodyType} text={bodyText} onText={setBodyText} fields={bodyFields} onFields={setBodyFields} />}
        </div>
      </section>

      <section className={`api-panel api-response-panel${busy ? ' is-loading' : ''}`}>
        <header><div><span>02</span><h2>响应结果</h2></div>{response && <ResponseBadge result={response} />}</header>
        <nav className="api-tabs" aria-label="响应结果标签">
          <TabButton ariaLabel="响应 Body" active={responseTab === 'body'} onClick={() => setResponseTab('body')}>Body</TabButton>
          <TabButton ariaLabel="响应 Headers" active={responseTab === 'headers'} onClick={() => setResponseTab('headers')}>Headers <i>{response?.headers.length ?? 0}</i></TabButton>
          <TabButton ariaLabel="实际请求" active={responseTab === 'request'} onClick={() => setResponseTab('request')}>Request</TabButton>
          <TabButton ariaLabel="响应 Timing" active={responseTab === 'timing'} onClick={() => setResponseTab('timing')}>Timing</TabButton>
          {responseTab === 'body' && response && <div className="api-response-actions"><button type="button" className={formatted ? 'is-active' : ''} onClick={() => setFormatted(true)}>格式化</button><button type="button" className={!formatted ? 'is-active' : ''} onClick={() => setFormatted(false)}>原始</button><button type="button" onClick={() => void copyResponse()}>复制</button></div>}
        </nav>
        <div className="api-response-content">
          {busy && <ApiEmpty icon="refresh" title="正在等待响应" detail="请求已发出，可以随时取消。" loading />}
          {!busy && !response && <ApiEmpty icon="terminal" title="等待发送请求" detail="响应正文、Headers 和耗时分析将在这里显示。" />}
          {!busy && response && responseTab === 'body' && <ResponseBody result={response} formatted={formatted} />}
          {!busy && response && responseTab === 'headers' && <ResponseHeaders rows={response.headers} />}
          {!busy && response && responseTab === 'request' && <RequestDetails result={response} format={requestCodeFormat} onFormat={setRequestCodeFormat} onCopy={() => void copyRequestCode()} />}
          {!busy && response && responseTab === 'timing' && <TimingPanel result={response} />}
        </div>
      </section>
    </div>
    <p className="api-cors-note"><strong>CORS 提示：</strong>目标接口必须允许当前网站域名访问。若接口不支持跨域，请在目标服务配置 CORS；不要使用公开代理发送令牌或敏感数据。</p>
  </div>
}

function MethodPicker({ value, onChange }: { value: HttpMethod; onChange: (value: HttpMethod) => void }) {
  const [open, setOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnPointerDown)
    return () => document.removeEventListener('pointerdown', closeOnPointerDown)
  }, [open])

  return <div className={`api-method-picker${open ? ' is-open' : ''}`} ref={pickerRef} onKeyDown={(event) => {
    if (event.key === 'Escape') { setOpen(false); pickerRef.current?.querySelector<HTMLButtonElement>('.api-method-trigger')?.focus() }
    if (!open && event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); return }
    if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const options = [...(pickerRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])]
      const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement)
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : event.key === 'ArrowDown' ? (currentIndex + 1) % options.length : (currentIndex - 1 + options.length) % options.length
      options[nextIndex]?.focus()
    }
  }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <button type="button" className="api-method-trigger" aria-label="HTTP 请求方法" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span className={`method-dot is-${value.toLowerCase()}`} aria-hidden="true" />
      <strong>{value}</strong>
      <Icon name="chevronDown" size={16} />
    </button>
    {open && <div className="api-method-menu" role="listbox" aria-label="HTTP 请求方法选项">
      {METHODS.map((item) => <button type="button" role="option" aria-selected={item === value} className={item === value ? 'is-selected' : ''} key={item} autoFocus={item === value} onClick={() => { onChange(item); setOpen(false) }}>
        <span className={`method-dot is-${item.toLowerCase()}`} aria-hidden="true" /><strong>{item}</strong><i aria-hidden="true"><Icon name="check" /></i>
      </button>)}
    </div>}
  </div>
}

function TabButton({ active, ariaLabel, onClick, children }: { active: boolean; ariaLabel: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className={active ? 'is-active' : ''} aria-label={ariaLabel} aria-pressed={active} onClick={onClick}>{children}</button>
}

function RequestTabButton({ active, ariaLabel, icon, label, meta, onClick }: { active: boolean; ariaLabel: string; icon: RequestTab; label: string; meta: string; onClick: () => void }) {
  const paths: Record<RequestTab, React.ReactNode> = {
    params: <><circle cx="7" cy="7" r="2.25" /><path d="M9 7h8M7 9v8" /></>,
    headers: <><path d="M5 6h14M5 12h10M5 18h14" /><circle cx="18" cy="12" r="1" /></>,
    auth: <><circle cx="8" cy="12" r="3.5" /><path d="m11.5 12 7.5 0m-3 0v3m-2-3v2" /></>,
    body: <><path d="M9 5H6v14h3M15 5h3v14h-3" /><path d="M11 9h2M11 15h2" /></>,
  }
  return <button type="button" className={active ? 'is-active' : ''} aria-label={ariaLabel} aria-pressed={active} onClick={onClick}>
    <span className="api-request-tab-icon" aria-hidden="true"><svg viewBox="0 0 24 24">{paths[icon]}</svg></span>
    <span className="api-request-tab-copy"><strong>{label}</strong><small>{meta}</small></span>
    <i aria-hidden="true" />
  </button>
}

function PairEditor({ title, rows, onChange, keyPlaceholder, typed = false }: { title: string; rows: KeyValueRow[]; onChange: (rows: KeyValueRow[]) => void; keyPlaceholder: string; typed?: boolean }) {
  const listRef = useRef<HTMLDivElement>(null)
  const pendingRowIdRef = useRef<string | null>(null)

  useEffect(() => {
    const pendingRowId = pendingRowIdRef.current
    if (!pendingRowId) return
    const rowElement = [...(listRef.current?.children ?? [])].find((element) => (element as HTMLElement).dataset.rowId === pendingRowId) as HTMLElement | undefined
    rowElement?.scrollIntoView?.({ block: 'nearest' })
    rowElement?.querySelector<HTMLInputElement>('.api-pair-field input')?.focus()
    pendingRowIdRef.current = null
  }, [rows])

  function update(id: string, patch: Partial<KeyValueRow>) { onChange(rows.map((row) => row.id === id ? { ...row, ...patch } : row)) }
  function addRow() {
    const nextRow = createRow()
    pendingRowIdRef.current = nextRow.id
    onChange([...rows, nextRow])
  }
  const isHeader = title.includes('Header')
  const itemName = isHeader ? '请求头' : title.includes('Form') || title.includes('表单') ? '字段' : '参数'
  const activeCount = rows.filter((row) => row.enabled && row.key.trim()).length
  return <div className={`api-pairs${typed ? ' is-typed' : ''}`}>
    <div className="api-pairs-header">
      <div><span>{isHeader ? 'HEADER SET' : 'KEY / VALUE'}</span><h3>{title}</h3><p>仅启用且名称完整的{itemName}会写入本次请求。</p></div>
      <button type="button" aria-label={`新增${itemName}`} onClick={addRow}>
        <span aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M10 4v12M4 10h12" /></svg></span>新增{itemName}
      </button>
    </div>
    <div className="api-pairs-status" aria-live="polite"><span><i aria-hidden="true" />{activeCount} 项已启用</span><small>{typed ? '类型用于发送前校验，Query 最终仍以文本编码' : rows.length > 2 ? '更多条目可在编辑区内滚动查看' : '关闭的行会保留，但不会随请求发送'}</small></div>
    <div className={`api-pair-grid-head${typed ? ' is-typed' : ''}`} aria-hidden="true">
      <span>状态</span><span>{keyPlaceholder}</span><span>{itemName}值</span>{typed && <><span>类型</span><span>说明</span></>}<span>操作</span>
    </div>
    <div className="api-pair-list" ref={listRef} tabIndex={0} aria-label={`${title}编辑区`}>
      {rows.map((row, index) => <article className={`api-pair-row${typed ? ' is-typed' : ''}${row.enabled ? ' is-enabled' : ' is-disabled'}`} data-row-id={row.id} key={row.id}>
        <div className="api-pair-row-state">
          <span className="api-pair-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <label className="api-pair-switch">
            <input aria-label={`启用 ${row.key || '空参数'}`} type="checkbox" checked={row.enabled} onChange={(event) => update(row.id, { enabled: event.target.checked })} />
            <span className="api-pair-switch-control" aria-hidden="true"><i /></span>
            <span>{row.enabled ? '启用' : '停用'}</span>
          </label>
        </div>
        <label className="api-pair-field api-pair-key"><span>{keyPlaceholder}</span><input aria-label={`${title}名称`} value={row.key} placeholder={`输入${keyPlaceholder}`} onChange={(event) => update(row.id, { key: event.target.value })} /></label>
        <label className="api-pair-field api-pair-value"><span>{itemName}值</span><input aria-label={`${title}值`} value={row.value} placeholder={`输入${itemName}值`} onChange={(event) => update(row.id, { value: event.target.value })} /></label>
        {typed && <div className="api-pair-type"><span>类型</span><ParameterTypePicker ariaLabel={`${title}类型 ${index + 1}`} value={row.valueType ?? 'string'} onChange={(value) => update(row.id, { valueType: value })} /></div>}
        {typed && <label className="api-pair-field api-pair-description"><span>说明</span><input aria-label={`${title}说明 ${index + 1}`} value={row.description ?? ''} placeholder="可选说明" onChange={(event) => update(row.id, { description: event.target.value })} /></label>}
        <button className="api-pair-delete" type="button" aria-label={`删除 ${row.key || '空行'}`} title={`删除第 ${index + 1} 行`} onClick={() => onChange(rows.length === 1 ? [createRow()] : rows.filter((item) => item.id !== row.id))}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6.5 6.5 7 7m0-7-7 7" /></svg>
        </button>
      </article>)}
    </div>
  </div>
}

function ParameterTypePicker({ ariaLabel, value, onChange }: { ariaLabel: string; value: ParameterValueType; onChange: (value: ParameterValueType) => void }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 230, openAbove: false })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()
  const selected = PARAMETER_VALUE_TYPES.find((type) => type.id === value) ?? PARAMETER_VALUE_TYPES[0]

  function closeAndFocus() {
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  function toggle() {
    if (open) { setOpen(false); return }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const menuWidth = Math.max(230, rect.width)
    const menuHeight = 250
    const openAbove = window.innerHeight - rect.bottom < menuHeight && rect.top > menuHeight
    setPosition({
      top: openAbove ? Math.max(10, rect.top - menuHeight - 7) : Math.max(10, Math.min(window.innerHeight - menuHeight - 10, rect.bottom + 7)),
      left: Math.max(10, Math.min(rect.left, window.innerWidth - menuWidth - 10)),
      width: menuWidth,
      openAbove,
    })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus()
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    const closeOnViewportChange = () => setOpen(false)
    document.addEventListener('pointerdown', closeOnPointerDown)
    window.addEventListener('resize', closeOnViewportChange)
    window.addEventListener('scroll', closeOnViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      window.removeEventListener('resize', closeOnViewportChange)
      window.removeEventListener('scroll', closeOnViewportChange, true)
    }
  }, [open])

  function handleKeyboard(event: React.KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); closeAndFocus(); return }
    if (!open && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); toggle(); return }
    if (!open || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const options = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])]
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement)
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : event.key === 'ArrowDown' ? (currentIndex + 1) % options.length : (currentIndex - 1 + options.length) % options.length
    options[nextIndex]?.focus()
  }

  return <div className={`api-pair-type-picker${open ? ' is-open' : ''}`} onKeyDown={handleKeyboard}>
    <button ref={triggerRef} type="button" className="api-pair-type-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listboxId : undefined} onClick={toggle}>
      <strong>{selected?.label ?? 'String'}</strong><Icon name="chevronDown" size={16} />
    </button>
    {open && createPortal(<div ref={menuRef} id={listboxId} className={`api-parameter-type-menu${position.openAbove ? ' opens-above' : ''}`} role="listbox" aria-label="Query 参数类型选项" style={{ top: position.top, left: position.left, width: position.width }} onKeyDown={handleKeyboard}>
      <span className="api-parameter-type-menu-label">VALUE TYPE</span>
      {PARAMETER_VALUE_TYPES.map((type) => <button type="button" role="option" aria-selected={type.id === value} className={type.id === value ? 'is-selected' : undefined} key={type.id} onClick={() => { onChange(type.id); closeAndFocus() }}>
        <i aria-hidden="true" /><span><strong>{type.label}</strong><small>{type.hint}</small></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.2 2.8 2.8 6.2-6.2" /></svg>
      </button>)}
    </div>, document.body)}
  </div>
}

function AuthEditor(props: { type: AuthType; onType: (value: AuthType) => void; token: string; onToken: (value: string) => void; username: string; onUsername: (value: string) => void; password: string; onPassword: (value: string) => void; apiKeyName: string; onApiKeyName: (value: string) => void; apiKeyValue: string; onApiKeyValue: (value: string) => void; location: 'header' | 'query'; onLocation: (value: 'header' | 'query') => void }) {
  return <div className="api-auth"><label><span>认证类型</span><select aria-label="认证类型" value={props.type} onChange={(event) => props.onType(event.target.value as AuthType)}><option value="none">无认证</option><option value="bearer">Bearer Token</option><option value="basic">Basic Auth</option><option value="api-key">API Key</option></select></label>
    {props.type === 'none' && <ApiEmpty icon="lock" title="此请求不携带认证信息" detail="需要认证时请选择 Bearer、Basic Auth 或 API Key。" />}
    {props.type === 'bearer' && <label><span>Token</span><input aria-label="Bearer Token" type="password" value={props.token} autoComplete="off" onChange={(event) => props.onToken(event.target.value)} /></label>}
    {props.type === 'basic' && <><label><span>用户名</span><input aria-label="Basic Auth 用户名" value={props.username} autoComplete="off" onChange={(event) => props.onUsername(event.target.value)} /></label><label><span>密码</span><input aria-label="Basic Auth 密码" type="password" value={props.password} autoComplete="off" onChange={(event) => props.onPassword(event.target.value)} /></label></>}
    {props.type === 'api-key' && <><label><span>参数名称</span><input aria-label="API Key 名称" value={props.apiKeyName} onChange={(event) => props.onApiKeyName(event.target.value)} /></label><label><span>参数值</span><input aria-label="API Key 值" type="password" value={props.apiKeyValue} autoComplete="off" onChange={(event) => props.onApiKeyValue(event.target.value)} /></label><label><span>添加到</span><select aria-label="API Key 位置" value={props.location} onChange={(event) => props.onLocation(event.target.value as 'header' | 'query')}><option value="header">Header</option><option value="query">Query</option></select></label></>}
    <p className="api-hint">认证信息仅保留在当前页面内存中，刷新或离开页面后不会保存。</p>
  </div>
}

function BodyEditor({ method, type, onType, text, onText, fields, onFields }: { method: HttpMethod; type: BodyType; onType: (value: BodyType) => void; text: string; onText: (value: string) => void; fields: KeyValueRow[]; onFields: (rows: KeyValueRow[]) => void }) {
  const disabled = !BODY_METHODS.includes(method)
  return <div className="api-body"><div className="api-body-types">{BODY_TYPES.map((item) => <button type="button" key={item.id} disabled={disabled && item.id !== 'none'} className={type === item.id ? 'is-active' : ''} onClick={() => onType(item.id)}>{item.label}</button>)}</div>
    {disabled && <ApiEmpty icon="file" title={`${method} 请求不发送 Body`} detail="切换到 POST、PUT、PATCH 或 DELETE 后可以配置请求体。" />}
    {!disabled && type === 'none' && <ApiEmpty icon="file" title="请求不包含 Body" detail="可选择 JSON、Text 或表单格式。" />}
    {!disabled && (type === 'json' || type === 'text') && <textarea aria-label={`${type === 'json' ? 'JSON' : 'Text'} Body`} value={text} spellCheck={false} placeholder={type === 'json' ? '{\n  "key": "value"\n}' : '输入文本请求体'} onChange={(event) => onText(event.target.value)} />}
    {!disabled && (type === 'form-urlencoded' || type === 'form-data') && <PairEditor title={type === 'form-data' ? 'Form Data' : '表单参数'} rows={fields} onChange={onFields} keyPlaceholder="字段名" />}
  </div>
}

function ResponseBadge({ result }: { result: ApiResponseResult }) { return <div className={`api-response-badge is-${result.ok ? 'success' : 'error'}`}><b>{result.status}</b><span>{result.totalMs.toFixed(0)} ms</span><span>{formatByteSize(result.sizeBytes)}</span></div> }
function ResponseBody({ result, formatted }: { result: ApiResponseResult; formatted: boolean }) { return <div className="api-body-view">{result.truncated && <p role="alert">响应超过 5 MB，仅展示前 5 MB。</p>}<pre><code>{(formatted ? result.formattedBody : result.rawBody) || '（响应正文为空）'}</code></pre></div> }
function ResponseHeaders({ rows }: { rows: KeyValueRow[] }) { return <div className="api-response-headers">{rows.length ? rows.map((row) => <div key={row.id}><b>{row.key}</b><code>{row.value}</code></div>) : <ApiEmpty icon="file" title="没有可读取的响应 Header" detail="浏览器仅暴露 CORS 允许读取的响应头。" />}</div> }
function RequestDetails({ result, format, onFormat, onCopy }: { result: ApiResponseResult; format: RequestCodeFormat; onFormat: (value: RequestCodeFormat) => void; onCopy: () => void }) {
  const parameters = [...new URL(result.request.url).searchParams.entries()]
  return <div className="api-request-details">
    <section><span>实际请求 URL</span><code>{result.request.url}</code></section>
    <section><span>实际 URL 参数</span>{parameters.length ? <div className="api-request-params">{parameters.map(([key, value], index) => <p key={`${key}-${index}`}><b>{key}</b><code>{value}</code></p>)}</div> : <small>此请求没有 URL 参数</small>}</section>
    <div className="api-code-toolbar"><div role="group" aria-label="请求代码格式">{REQUEST_CODE_FORMATS.map((item) => <button type="button" key={item.id} className={format === item.id ? 'is-active' : ''} aria-pressed={format === item.id} onClick={() => onFormat(item.id)}>{item.label}</button>)}</div><button type="button" onClick={onCopy}>复制代码</button></div>
    <pre><code>{generateRequestCode(result.request, format)}</code></pre>
  </div>
}
function TimingPanel({ result }: { result: ApiResponseResult }) {
  const headerRatio = result.totalMs ? result.timeToHeadersMs / result.totalMs * 100 : 0
  return <div className="api-timing"><div className="api-stat-grid"><article><span>总耗时</span><strong>{result.totalMs.toFixed(1)}<small>ms</small></strong></article><article><span>等待响应</span><strong>{result.timeToHeadersMs.toFixed(1)}<small>ms</small></strong></article><article><span>下载正文</span><strong>{result.downloadMs.toFixed(1)}<small>ms</small></strong></article><article><span>响应大小</span><strong>{formatByteSize(result.sizeBytes)}</strong></article></div><div className="api-timing-bar"><i style={{ width: `${headerRatio}%` }} /><b style={{ width: `${100 - headerRatio}%` }} /></div><div className="api-timing-legend"><span><i />等待响应头</span><span><i />下载正文</span></div><dl><div><dt>开始时间</dt><dd>{result.startedAt.toLocaleTimeString()}</dd></div><div><dt>最终地址</dt><dd title={result.url}>{result.url}</dd></div><div><dt>Content-Type</dt><dd>{result.contentType || '未提供'}</dd></div></dl><p className="api-hint">浏览器直连仅能可靠统计等待响应头、正文下载和总耗时，不虚构 DNS、TCP 或 TLS 阶段数据。</p></div>
}
function ApiEmpty({ icon, title, detail, loading = false }: { icon: IconName; title: string; detail: string; loading?: boolean }) { return <div className={`api-empty${loading ? ' is-loading' : ''}`}><span aria-hidden="true"><Icon name={icon} size={28} /></span><strong>{title}</strong><p>{detail}</p></div> }
