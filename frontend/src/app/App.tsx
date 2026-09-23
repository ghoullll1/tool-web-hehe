import { Icon, ToolIcon } from '../components/Icon'
import { createElement, Suspense, useEffect, useRef, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { recordToolUsage } from '../api/toolCatalog'
import { useToolCatalog } from '../hooks/useToolCatalog'
import { preloadClientToolBySlug, resolveClientTool } from '../tools/registry'
import type { ToolDescriptor } from '../types/tool'
import Dashboard from './Dashboard'
import { AppearanceProvider } from '../appearance/AppearanceProvider'
import { AppearanceSwitch } from '../appearance/AppearanceSwitch'
import { VisualEffects } from '../appearance/VisualEffects'
import { useAppearance } from '../appearance/AppearanceContext'
import { useNavigationDrawer } from '../appearance/useNavigationDrawer'
import { studioProfile } from '../appearance/studioProfiles'
import { StudioToolbar } from '../appearance/StudioToolbar'
import { AmbientBackdrop } from '../appearance/AmbientBackdrop'
import { compareCategoryCodes, formatCategory, toolHref } from './dashboardModel'

export function App() {
  const catalog = useToolCatalog()

  return (
    <AppearanceProvider><div className="app-shell">
      <Sidebar tools={catalog.tools} loading={catalog.loading} />
      <main className="main-content">
        <AppearanceSwitch />
        <Routes>
          <Route path="/" element={<Dashboard {...catalog} />} />
          <Route path="/tools/:slug" element={<ToolRoute tools={catalog.tools} loading={catalog.loading} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div><VisualEffects /></AppearanceProvider>
  )
}

function Sidebar({ tools, loading }: { tools: ToolDescriptor[]; loading: boolean }) {
  const location = useLocation()
  const navigationRef = useRef<HTMLElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const drawerTrigger = useRef<HTMLButtonElement>(null)
  const drawer = useNavigationDrawer(sidebarRef, drawerTrigger)
  const { edition } = useAppearance()
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [navQuery, setNavQuery] = useState('')
  const filteredTools = edition === 'modern' && navQuery.trim() ? tools.filter(tool => `${tool.displayName} ${tool.description}`.toLowerCase().includes(navQuery.trim().toLowerCase())) : tools
  const grouped = filteredTools.reduce((categories, tool) => {
    const categoryTools = categories.get(tool.categoryCode) ?? []
    categoryTools.push(tool)
    categories.set(tool.categoryCode, categoryTools)
    return categories
  }, new Map<string, ToolDescriptor[]>())

  useEffect(() => {
    const activeLink = navigationRef.current?.querySelector<HTMLElement>('[aria-current="page"]')
    if (activeLink && typeof activeLink.scrollIntoView === 'function') {
      activeLink.scrollIntoView({ block: 'nearest' })
    }
  }, [location.pathname, tools])

  return (
    <>
    <button ref={drawerTrigger} className="nebula-drawer-trigger" type="button" aria-expanded={drawer.open} aria-controls="workspace-sidebar" onClick={drawer.toggle}><Icon name="home" size={18} />工具导航</button>
    {drawer.open && <div className="nebula-drawer-scrim" onClick={drawer.close} aria-hidden="true" />}
    <aside ref={sidebarRef} id="workspace-sidebar" className={`sidebar${drawer.open ? ' is-drawer-open' : ''}`} role={drawer.open ? 'dialog' : undefined} aria-modal={drawer.open ? true : undefined} aria-label={drawer.open ? '工具导航' : undefined}>
      <button className="nebula-drawer-close" type="button" aria-label="关闭工具导航" onClick={drawer.close}><Icon name="close" /></button>
      <Link className="brand" to="/" aria-label="返回首页">
        <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
        <span>Tool Web</span>
      </Link>

      <header className="sidebar-workspace">
        <div>
          <span className="sidebar-workspace-mark" aria-hidden="true" />
          <h2>工作区</h2>
        </div>
        <span className="sidebar-workspace-count" aria-label={`${tools.length} 个可用工具`}>
          {loading ? '同步中' : `${tools.length} 项`}
        </span>
      </header>

      {edition === 'modern' && <label className="studio-nav-search"><Icon name="search" size={16} /><input aria-label="筛选导航工具" placeholder="查找工具…" value={navQuery} onChange={event => setNavQuery(event.target.value)} /></label>}

      <nav ref={navigationRef} className="navigation" aria-label="工具导航" onClick={event => { if ((event.target as Element).closest('a')) drawer.close() }}>
        <div className="navigation-home">
        <NavLink className="nav-link nav-home" to="/" end>
          <span className="tool-glyph" aria-hidden="true">
            <Icon name="home" size={18} />
          </span>
          <span className="nav-label">控制台</span>
        </NavLink>
        </div>

        <div className="navigation-tools">
        {loading && <p className="nav-muted">正在读取工具目录…</p>}
        {!loading && !filteredTools.length && navQuery && <p className="nav-muted">没有匹配工具</p>}
        {[...grouped.entries()].sort(([left], [right]) => compareCategoryCodes(left, right)).map(([category, categoryTools]) => (
          <section className={`nav-group${edition === 'modern' && !navQuery.trim() && collapsed.has(category) ? ' is-collapsed' : ''}`} key={category} aria-labelledby={`nav-group-${category}`}>
            <h2 id={`nav-group-${category}`} data-count={categoryTools.length}>{edition === 'modern' ? <button className="nebula-group-toggle" type="button" aria-expanded={!!navQuery.trim() || !collapsed.has(category)} aria-controls={`nav-tools-${category}`} onClick={() => setCollapsed(current => { const next = new Set(current); if (next.has(category)) next.delete(category); else next.add(category); return next })}>{formatCategory(category)}<span aria-hidden="true"><Icon name="chevronDown" size={14} /></span></button> : formatCategory(category)}</h2>
            <div className="nav-group-collapse"><div id={`nav-tools-${category}`} className="nav-group-tools" inert={edition === 'modern' && !navQuery.trim() && collapsed.has(category) ? true : undefined}>
              {categoryTools.map((tool) => (
                <NavLink className="nav-link" key={tool.slug} to={toolHref(tool)}>
                  <span className="tool-glyph" aria-hidden="true"><ToolIcon tool={tool} size={18} /></span>
                  <span className="nav-label">{tool.displayName}</span>
                </NavLink>
              ))}
            </div></div>
          </section>
        ))}
        </div>
      </nav>

      <div className="sidebar-footer">
        <span className="status-dot" />
        <span>服务框架已就绪</span>
      </div>
    </aside>
    </>
  )
}

function ToolRoute({ tools, loading }: { tools: ToolDescriptor[]; loading: boolean }) {
  const { slug } = useParams()
  const [focused, setFocused] = useState(false)
  const tool = tools.find((candidate) => candidate.slug === slug)
  const recordedUsageSlug = useRef<string | null>(null)
  const toolSlug = tool?.slug

  useEffect(() => {
    if (!slug) return
    void preloadClientToolBySlug(slug)?.catch(() => {
      // React.lazy retries through the resettable loader if this speculative fetch fails.
    })
  }, [slug])

  useEffect(() => {
    if (!toolSlug || recordedUsageSlug.current === toolSlug) return
    recordedUsageSlug.current = toolSlug
    void recordToolUsage(toolSlug)
  }, [toolSlug])

  if (loading) return <StatePanel title="正在加载" detail="正在确认工具配置…" />
  if (!tool) return <Navigate to="/" replace />

  const ClientTool = resolveClientTool(tool.frontendKey)

  return (
    <div className={`tool-page${focused ? ' is-studio-focused' : ''}`} data-studio-family={studioProfile(tool.slug).family} data-studio-tone={studioProfile(tool.slug).tone}>
      <AmbientBackdrop tone={studioProfile(tool.slug).tone} slug={tool.slug} />
      <StudioToolbar label={studioProfile(tool.slug).label} focused={focused} onFocusChange={setFocused} />
      <header className="tool-header">
        <span className="tool-card-icon" aria-hidden="true"><ToolIcon tool={tool} size={24} /></span>
        <div><small>{tool.categoryCode} · {tool.executionMode}</small><h1>{tool.displayName}</h1><p>{tool.description}</p></div>
      </header>
      <section className="workbench">
        {ClientTool ? (
          <Suspense fallback={<StatePanel title="正在加载组件" detail="工具界面按需载入中…" />}>
            {createElement(ClientTool, { tool })}
          </Suspense>
        ) : (
          <StatePanel
            title="实现尚未部署"
            detail={`目录配置已存在，但前端组件 ${tool.frontendKey ?? '（无）'} 尚未注册。`}
          />
        )}
      </section>
    </div>
  )
}

function StatePanel({ title, detail, tone = 'neutral' }: { title: string; detail: string; tone?: 'neutral' | 'error' }) {
  return (
    <div className={`state-panel ${tone}`}>
      <span className="state-symbol">{tone === 'error' ? <Icon name="alert" /> : <Icon name="info" size={24} />}</span>
      <div><h3>{title}</h3><p>{detail}</p></div>
    </div>
  )
}
