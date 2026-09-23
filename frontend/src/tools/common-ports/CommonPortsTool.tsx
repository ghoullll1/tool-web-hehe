import { Icon } from '../../components/Icon'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { ToolViewProps } from '../registry'
import { COMMON_PORTS, PORT_CATEGORIES, type CommonPort, type PortTransport } from './commonPortsData'
import {
  categoryLabel,
  filterCommonPorts,
  portBand,
  portBandLabel,
  portLogPosition,
  portSecurityLabel,
  relatedPorts,
  type PortCategoryFilter,
  type PortTransportFilter,
} from './commonPortsModel'
import './commonPorts.css'

const INITIAL_PORT = 443
const transports: readonly PortTransportFilter[] = ['all', 'TCP', 'UDP']

export default function CommonPortsTool({ tool }: ToolViewProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<PortCategoryFilter>('all')
  const [transport, setTransport] = useState<PortTransportFilter>('all')
  const [selectedPort, setSelectedPort] = useState(INITIAL_PORT)
  const [copiedPort, setCopiedPort] = useState<number | null>(null)
  const [copyMessage, setCopyMessage] = useState('')
  const [copyFailed, setCopyFailed] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const filteredPorts = useMemo(
    () => filterCommonPorts({ query, category, transport }),
    [category, query, transport],
  )
  const activePort = filteredPorts.find((entry) => entry.port === selectedPort) ?? filteredPorts[0] ?? null
  const activeRelated = useMemo(() => activePort ? relatedPorts(activePort) : [], [activePort])

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      event.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
  }, [])

  async function copyPort(port: number) {
    try {
      await navigator.clipboard.writeText(String(port))
      setCopiedPort(port)
      setCopyFailed(false)
      setCopyMessage(`端口 ${port} 已复制`)
    } catch {
      setCopiedPort(null)
      setCopyFailed(true)
      setCopyMessage('复制失败，请检查浏览器剪贴板权限')
    }
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => { setCopiedPort(null); setCopyMessage(''); setCopyFailed(false) }, 1800)
  }

  function openRelated(entry: CommonPort) {
    setQuery('')
    setCategory(entry.category)
    setTransport('all')
    setSelectedPort(entry.port)
  }

  const orbitStyle = { '--port-position': `${portLogPosition(activePort?.port ?? 0)}%` } as CSSProperties

  return <div className="port-atlas" data-tool={tool.slug}>
    <header className="port-command">
      <div className="port-command-copy">
        <span className="port-command-eyebrow"><i /> PORT ATLAS / BROWSER INDEX</span>
        <h2>从端口号，看见服务角色。</h2>
        <p>检索常用网络端口，核对默认服务、TCP/UDP 传输方式、加密特征与使用边界。</p>
        <div className={`port-search-console ${query ? 'has-query' : ''}`}>
          <div className="port-search-meta">
            <span><i aria-hidden="true" /> PORT LOOKUP</span>
            <strong>{query ? `${filteredPorts.length} 个匹配` : '输入 / 快速聚焦'}</strong>
          </div>
          <label className="port-search">
            <span className="port-search-icon"><SearchIcon /></span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索端口、服务或用途，例如 443、SSH、数据库"
              aria-label="搜索常用端口"
              autoComplete="off"
              spellCheck={false}
            />
            {query
              ? <button type="button" onClick={() => { setQuery(''); searchRef.current?.focus() }} aria-label="清除端口搜索"><Icon name="close" /></button>
              : <kbd>/</kbd>}
          </label>
        </div>
      </div>

      <div className="port-radar" role="img" aria-label={activePort ? `当前定位端口 ${activePort.port}，服务 ${activePort.service}` : '当前筛选没有匹配端口'} style={orbitStyle}>
        <i className="port-radar-ring is-outer" aria-hidden="true" />
        <i className="port-radar-ring is-inner" aria-hidden="true" />
        <i className="port-radar-sweep" aria-hidden="true" />
        <div className="port-radar-core">
          <span>PORT</span>
          <strong>{activePort?.port ?? '—'}</strong>
          <small>{activePort?.service ?? 'NO MATCH'}</small>
        </div>
        <i className="port-radar-packet is-one" aria-hidden="true" />
        <i className="port-radar-packet is-two" aria-hidden="true" />
      </div>

      <div className="port-spectrum" aria-label="端口号对数位置">
        <div className="port-spectrum-head">
          <span>0</span><strong>PORT SPECTRUM · LOG SCALE</strong><span>65535</span>
        </div>
        <div className="port-spectrum-track" style={orbitStyle}>
          <i aria-hidden="true" /><b aria-hidden="true" />
        </div>
        <div className="port-spectrum-meta">
          <span>{COMMON_PORTS.length} 个常用端口</span>
          <span>{activePort ? portBandLabel(portBand(activePort.port)) : '等待匹配'}</span>
        </div>
      </div>
    </header>

    <section className="port-filters" aria-label="端口筛选">
      <div className="port-filter-heading">
        <div><span>01</span><div><h3>缩小检索范围</h3><p>按用途与传输层协议组合筛选</p></div></div>
        <button type="button" onClick={() => { setQuery(''); setCategory('all'); setTransport('all') }}>重置筛选</button>
      </div>
      <div className="port-category-rail" role="group" aria-label="端口分类">
        <FilterButton active={category === 'all'} label="全部" count={COMMON_PORTS.length} onClick={() => setCategory('all')} />
        {PORT_CATEGORIES.map((item) => <FilterButton
          key={item.id}
          active={category === item.id}
          label={item.shortLabel}
          count={COMMON_PORTS.filter((entry) => entry.category === item.id).length}
          onClick={() => setCategory(item.id)}
        />)}
      </div>
      <div className="port-transport-filter">
        <span>传输协议</span>
        <div role="group" aria-label="传输协议">
          {transports.map((item) => <button
            key={item}
            type="button"
            className={transport === item ? 'is-active' : ''}
            aria-pressed={transport === item}
            onClick={() => setTransport(item)}
          >{item === 'all' ? '全部协议' : item}</button>)}
        </div>
        <p>登记端口只表示约定用途，不代表目标主机一定开放该服务。</p>
      </div>
    </section>

    <main className="port-workbench">
      <section className="port-index" aria-label="常用端口索引">
        <header>
          <div><span>02</span><div><h3>端口索引</h3><p>点击条目查看完整说明</p></div></div>
          <strong aria-label={`显示 ${filteredPorts.length} / ${COMMON_PORTS.length} 个端口`}>{filteredPorts.length}<small> / {COMMON_PORTS.length}</small></strong>
        </header>
        {filteredPorts.length ? <ol className="port-list">
          {filteredPorts.map((entry) => {
            const selected = activePort?.port === entry.port
            return <li key={entry.port} className={selected ? 'is-selected' : ''}>
              <button type="button" className="port-list-main" aria-label={`查看端口 ${entry.port} ${entry.service}`} aria-pressed={selected} onClick={() => setSelectedPort(entry.port)}>
                <span className="port-list-number">{entry.port}</span>
                <span className="port-list-copy"><strong>{entry.service}</strong><small>{entry.name}</small></span>
                <span className="port-list-protocols">{entry.transports.map((item) => <ProtocolBadge key={item} value={item} />)}</span>
                <span className="port-list-category">{categoryLabel(entry.category)}</span>
              </button>
              <button type="button" className="port-copy" onClick={() => void copyPort(entry.port)} aria-label={`复制端口 ${entry.port}`}>
                {copiedPort === entry.port ? <CheckIcon /> : <CopyIcon />}
              </button>
            </li>
          })}
        </ol> : <div className="port-empty">
          <span><Icon name="search" size={28} /></span><strong>没有匹配的端口</strong><p>换一个关键词，或重置分类与协议筛选。</p>
          <button type="button" onClick={() => { setQuery(''); setCategory('all'); setTransport('all') }}>显示全部端口</button>
        </div>}
      </section>

      <aside className="port-detail" aria-label="端口详情">
        {activePort ? <div key={activePort.port} className="port-detail-content">
          <header className="port-detail-header">
            <div className="port-detail-heading"><span>PORT PROFILE</span><strong>当前选中端口</strong></div>
            <div className="port-detail-badge"><small>PORT</small><strong>{activePort.port}</strong></div>
            <button type="button" onClick={() => void copyPort(activePort.port)}>
              {copiedPort === activePort.port ? <><CheckIcon /> 已复制</> : <><CopyIcon /> 复制端口</>}
            </button>
          </header>
          <div className="port-detail-title">
            <span>{categoryLabel(activePort.category)}</span>
            <h3>{activePort.service}</h3>
            <p>{activePort.name}</p>
          </div>
          <p className="port-detail-summary">{activePort.summary}</p>
          <dl className="port-facts">
            <div><dt>传输协议</dt><dd>{activePort.transports.map((item) => <ProtocolBadge key={item} value={item} />)}</dd></div>
            <div><dt>加密特征</dt><dd>{portSecurityLabel(activePort.security)}</dd></div>
            <div><dt>端口区间</dt><dd>{portBandLabel(portBand(activePort.port))}</dd></div>
            <div><dt>默认用途</dt><dd>{activePort.name}</dd></div>
          </dl>
          {activePort.note && <div className="port-detail-note"><span><Icon name="alert" /></span><p>{activePort.note}</p></div>}
          <div className="port-related">
            <div><strong>同类邻近端口</strong><span>继续浏览</span></div>
            <div>{activeRelated.map((entry) => <button key={entry.port} type="button" onClick={() => openRelated(entry)}><b>{entry.port}</b><span>{entry.service}</span></button>)}</div>
          </div>
          <footer><InfoIcon /><p>端口可以由应用重新配置。诊断开放状态时，应结合防火墙、监听地址与实际进程核对。</p></footer>
        </div> : <div className="port-detail-empty"><span><Icon name="search" size={28} /></span><strong>等待有效匹配</strong></div>}
      </aside>
    </main>
    <footer className="port-source-note">
      <InfoIcon />
      <p>数据口径以 IANA 服务名与传输协议端口登记为基线，并补充开发、运维场景中的常见约定端口；约定用途不等于端口当前开放。</p>
    </footer>
    <div className={`port-copy-status ${copyMessage ? 'is-visible' : ''} ${copyFailed ? 'is-error' : ''}`} aria-live="polite">{copyMessage}</div>
  </div>
}

function FilterButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return <button type="button" className={active ? 'is-active' : ''} aria-label={`${label} ${count}`} aria-pressed={active} onClick={onClick}>
    <span>{label}</span><b>{count}</b>
  </button>
}

function ProtocolBadge({ value }: { value: PortTransport }) {
  return <b className={`port-protocol is-${value.toLocaleLowerCase()}`}>{value}</b>
}

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.5 15.5 4 4"/></svg>
}

function CopyIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="8" width="10" height="10" rx="2"/><path d="M15 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/></svg>
}

function CheckIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12.5 4.2 4L19 7"/></svg>
}

function InfoIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/></svg>
}
