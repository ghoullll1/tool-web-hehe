import { Icon, ToolIcon } from '../components/Icon'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { SpotlightLink } from '../appearance/SpotlightLink'
import { NebulaBackdrop } from '../appearance/NebulaBackdrop'
import { CountUp } from '../appearance/CountUp'
import { StudioStack } from '../appearance/StudioStack'
import { studioProfile } from '../appearance/studioProfiles'
import { useAppearance } from '../appearance/AppearanceContext'
import type { ToolDescriptor } from '../types/tool'
import { compareCategoryCodes, formatCategory, toolHref } from './dashboardModel'

interface DashboardProps {
  tools: ToolDescriptor[]
  loading: boolean
  error: string | null
}

export default function Dashboard({ tools, loading, error }: DashboardProps) {
  const { edition } = useAppearance()
  const [directoryView, setDirectoryView] = useState<'grid' | 'list'>('grid')
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const searchRef = useRef<HTMLInputElement>(null)

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    tools.forEach((tool) => counts.set(tool.categoryCode, (counts.get(tool.categoryCode) ?? 0) + 1))
    return [...counts.entries()].sort(([left], [right]) => compareCategoryCodes(left, right)).map(([code, count]) => ({ code, count, label: formatCategory(code) }))
  }, [tools])

  const activeCategory = selectedCategory === 'all' || categories.some(({ code }) => code === selectedCategory)
    ? selectedCategory
    : 'all'
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const visibleTools = useMemo(() => tools.filter((tool) => {
    if (activeCategory !== 'all' && tool.categoryCode !== activeCategory) return false
    if (!normalizedQuery) return true
    return [tool.displayName, tool.description, tool.categoryCode, formatCategory(tool.categoryCode)]
      .some((value) => value.toLocaleLowerCase('zh-CN').includes(normalizedQuery))
  }), [activeCategory, normalizedQuery, tools])

  const groupedTools = useMemo(() => visibleTools.reduce((groups, tool) => {
    const group = groups.get(tool.categoryCode) ?? []
    group.push(tool)
    groups.set(tool.categoryCode, group)
    return groups
  }, new Map<string, ToolDescriptor[]>()), [visibleTools])

  const featuredTools = tools.slice(0, 3)
  const localToolCount = tools.filter((tool) => tool.executionMode === 'CLIENT').length

  useEffect(() => {
    function handleGlobalShortcut(event: KeyboardEvent) {
      const target = event.target
      const isEditing = target instanceof Element && target.matches('input, textarea, select, [contenteditable="true"]')
      const isSearchShortcut = event.key === '/' && !isEditing
      const isCommandShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'
      if (!isSearchShortcut && !isCommandShortcut) return
      event.preventDefault()
      searchRef.current?.focus()
      searchRef.current?.select()
    }
    window.addEventListener('keydown', handleGlobalShortcut)
    return () => window.removeEventListener('keydown', handleGlobalShortcut)
  }, [])

  function resetFilters() {
    setQuery('')
    setSelectedCategory('all')
    searchRef.current?.focus()
  }

  return (
    <div className="dashboard dashboard-console" data-directory-view={directoryView}>
      <section className="dashboard-hero" aria-labelledby="dashboard-title">
        <NebulaBackdrop />
        <div className="dashboard-hero-copy">
          <div className="dashboard-kicker"><span /> TOOL WORKSPACE <b>ONLINE</b></div>
          <h1 id="dashboard-title">{edition === 'modern' ? <>把想法，<br />变成<em>顺手的日常。</em></> : <>把开发中的小麻烦，<br /><em>留给顺手的工具。</em></>}</h1>
          <p>格式化、校验、计算与转换集中在一个工作台。找到工具，打开即用，敏感内容优先在浏览器本地处理。</p>

          <div className="dashboard-search" role="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
            <input
              ref={searchRef}
              type="search"
              value={query}
              aria-label="搜索工具"
              placeholder="搜索工具名称、功能或分类"
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && query) {
                  event.preventDefault()
                  setQuery('')
                }
              }}
            />
            {query ? <button type="button" onClick={() => setQuery('')} aria-label="清空搜索"><Icon name="close" /></button> : <kbd>/</kbd>}
          </div>

          <div className="dashboard-metrics" aria-label="工具平台数据">
            <div><CountUp value={tools.length} /><span>可用工具</span></div>
            <div><CountUp value={categories.length} /><span>功能分类</span></div>
            <div><CountUp value={localToolCount} /><span>本地处理</span></div>
          </div>
        </div>

        {edition === 'modern' && !error && <StudioStack tools={tools} />}
        <div className="dashboard-visual" aria-hidden="true">
          <div className="dashboard-glow dashboard-glow-one" />
          <div className="dashboard-glow dashboard-glow-two" />
          <div className="dashboard-terminal">
            <header><i /><i /><i /><span>tool-web / console</span><b>LIVE</b></header>
            <div className="dashboard-terminal-body">
              <p><span>›</span> catalog.load()</p>
              <p><i><Icon name="check" /></i> {tools.length || '—'} tools published</p>
              <p><span>›</span> runtime.strategy</p>
              <p><i><Icon name="check" /></i> browser-first / server-ready</p>
              <div><span /><span /><span /><span /></div>
            </div>
          </div>
          {featuredTools.map((tool, index) => (
            <div className={`dashboard-float-card float-${index + 1}`} key={tool.slug}>
              <span><ToolIcon tool={tool} size={22} /></span><b>{tool.displayName}</b>
            </div>
          ))}
        </div>
      </section>

      {!loading && !error && featuredTools.length > 0 && !query && activeCategory === 'all' ? (
        <section className="dashboard-quick" aria-labelledby="quick-title">
          <div className="dashboard-section-heading">
            <div><span>QUICK START</span><h2 id="quick-title">快速开始</h2></div>
            <p>最近上架的常用工具</p>
          </div>
          <div className="dashboard-quick-grid">
            {featuredTools.map((tool, index) => (
              <SpotlightLink to={toolHref(tool)} key={tool.slug} className="dashboard-quick-card" data-studio-tone={studioProfile(tool.slug).tone}>
                <span className="dashboard-card-number">0{index + 1}</span>
                <span className="dashboard-tool-mark"><ToolIcon tool={tool} size={24} /></span>
                <div><small>{formatCategory(tool.categoryCode)}</small><h3>{tool.displayName}</h3><p>{tool.description}</p></div>
                <b aria-hidden="true"><Icon name="external" /></b>
              </SpotlightLink>
            ))}
          </div>
        </section>
      ) : null}

      <section className="dashboard-directory" aria-labelledby="directory-title">
        <div className="dashboard-section-heading">
          <div><span>TOOL DIRECTORY</span><h2 id="directory-title">工具目录</h2></div>
          <p aria-live="polite">{loading ? '正在同步目录' : `显示 ${visibleTools.length} / ${tools.length} 项`}</p>
          {edition === 'modern' && <div className="studio-directory-view" role="group" aria-label="目录显示方式"><button type="button" aria-pressed={directoryView === 'grid'} onClick={() => setDirectoryView('grid')}><Icon name="grid" size={16} />卡片</button><button type="button" aria-pressed={directoryView === 'list'} onClick={() => setDirectoryView('list')}><Icon name="file" size={16} />列表</button></div>}
        </div>

        {tools.length > 0 ? (
          <div className="dashboard-category-bar" role="group" aria-label="按分类筛选工具">
            <button type="button" className={activeCategory === 'all' ? 'is-active' : ''} aria-pressed={activeCategory === 'all'} onClick={() => setSelectedCategory('all')}>
              全部 <span>{tools.length}</span>
            </button>
            {categories.map((category) => (
              <button type="button" key={category.code} className={activeCategory === category.code ? 'is-active' : ''} aria-pressed={activeCategory === category.code} onClick={() => setSelectedCategory(category.code)}>
                {category.label} <span>{category.count}</span>
              </button>
            ))}
          </div>
        ) : null}

        {loading ? <DashboardState mode="loading" title="正在同步工具目录" detail="从服务端读取当前可用工具…" /> : null}
        {error ? <DashboardState mode="error" title="工具目录暂时不可用" detail={error} /> : null}
        {!loading && !error && tools.length === 0 ? <DashboardState mode="empty" title="还没有已发布工具" detail="工具框架已就绪，启用数据库中的工具定义后会自动出现在这里。" /> : null}
        {!loading && !error && tools.length > 0 && visibleTools.length === 0 ? (
          <DashboardState mode="search" title="没有找到匹配工具" detail="换一个关键词，或者清除分类筛选后再试。" action={<button type="button" onClick={resetFilters}>清除筛选</button>} />
        ) : null}

        {!loading && !error && visibleTools.length > 0 ? (
          <div className="dashboard-groups">
            {[...groupedTools.entries()].sort(([left], [right]) => compareCategoryCodes(left, right)).map(([category, categoryTools]) => (
              <section className="dashboard-tool-group" key={category} aria-labelledby={`category-${category}`}>
                <header><h3 id={`category-${category}`}>{formatCategory(category)}</h3><span>{categoryTools.length} 项工具</span></header>
                <div className="dashboard-tool-grid">
                  {categoryTools.map((tool) => (
                    <SpotlightLink to={toolHref(tool)} key={tool.slug} className="dashboard-tool-card" data-studio-tone={studioProfile(tool.slug).tone}>
                      <span className="dashboard-tool-mark"><ToolIcon tool={tool} size={24} /></span>
                      <div><small>{tool.executionMode === 'CLIENT' ? '浏览器本地' : tool.executionMode === 'SERVER' ? '服务端执行' : '前后端协同'}</small><h4>{tool.displayName}</h4><p>{tool.description}</p></div>
                      <span className="dashboard-open-label">打开工具 <b><Icon name="external" /></b></span>
                    </SpotlightLink>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}

function DashboardState({ mode, title, detail, action }: {
  mode: 'loading' | 'error' | 'empty' | 'search'
  title: string
  detail: string
  action?: ReactNode
}) {
  return (
    <div className={`dashboard-state is-${mode}`} role={mode === 'error' ? 'alert' : 'status'}>
      <span>{mode === 'loading' ? <i /> : mode === 'error' ? <Icon name="alert" /> : mode === 'search' ? <Icon name="search" /> : <Icon name="plus" />}</span>
      <div><h3>{title}</h3><p>{detail}</p>{action}</div>
    </div>
  )
}
