import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { useAppearance } from './AppearanceContext'

/** Toggles a visual class on the existing page; never wraps/reparents the tool. */
export function StudioToolbar({ label, focused, onFocusChange }: { label: string; focused: boolean; onFocusChange: (value: boolean) => void }) {
  const { edition } = useAppearance()
  if (edition !== 'modern') return null
  return <div className="studio-workspace-bar">
    <div><Link to="/">工具目录</Link><span>/</span><strong>{label}</strong></div>
    <button type="button" aria-pressed={focused} onClick={() => onFocusChange(!focused)}><Icon name={focused ? 'grid' : 'external'} size={16} />{focused ? '完整布局' : '专注工作'}</button>
  </div>
}
