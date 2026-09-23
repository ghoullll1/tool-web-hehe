// React Bits Stack visual adaptation: deliberate next/previous controls, no autoplay or demo data.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon, ToolIcon } from '../components/Icon'
import type { ToolDescriptor } from '../types/tool'
import { toolHref } from '../app/dashboardModel'
import { studioProfile } from './studioProfiles'

export function StudioStack({ tools }: { tools: ToolDescriptor[] }) {
  const [index, setIndex] = useState(0)
  if (!tools.length) return null
  const selected = index % tools.length
  const tool = tools[selected]
  if (!tool) return null
  return <aside className="studio-stack" aria-label="探索工具">
    <div className="studio-stack-stage">
      <div className="studio-stack-sheet is-back" aria-hidden="true"><i /><i /><i /></div>
      <div className="studio-stack-sheet is-middle" aria-hidden="true"><span>{'{ }'}</span></div>
      <article key={tool.slug} className="studio-stack-sheet is-front" data-studio-tone={studioProfile(tool.slug).tone}>
        <div className="studio-stack-top"><span>TOOL / {String(selected + 1).padStart(2, '0')}</span><ToolIcon tool={tool} size={22} /></div>
        <div className="studio-stack-art" aria-hidden="true"><i /><i /><i /><ToolIcon tool={tool} size={44} /></div>
        <h2>{tool.displayName}</h2><p>{tool.description}</p>
        <Link to={toolHref(tool)}>打开这个工具 <Icon name="arrowRight" size={18} /></Link>
      </article>
    </div>
    <div className="studio-stack-controls"><span aria-live="polite">{selected + 1} / {tools.length} · 探索工具</span><button type="button" aria-label="上一个推荐工具" onClick={() => setIndex((selected - 1 + tools.length) % tools.length)}><Icon name="arrowLeft" size={18} /></button><button type="button" aria-label="下一个推荐工具" onClick={() => setIndex((selected + 1) % tools.length)}><Icon name="arrowRight" size={18} /></button></div>
  </aside>
}
