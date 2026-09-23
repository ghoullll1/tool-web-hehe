import { Icon } from '../components/Icon'
import { useAppearance } from './AppearanceContext'

export function AppearanceSwitch() {
  const { edition, setEdition, motion, setMotion, effectiveMotion, systemReduced } = useAppearance()
  const labels = { full: '完整', lite: '轻量', off: '关闭' }
  return <div className="appearance-bar">
    <span className="appearance-caption"><span aria-hidden="true" />TOOL WEB / 在线工具工作台</span>
    <div className="appearance-controls">
      <div className="appearance-segment" role="group" aria-label="界面风格">
        <button type="button" aria-pressed={edition === 'modern'} onClick={() => setEdition('modern')}><Icon name="grid" size={16} />现代版</button>
        <button type="button" aria-pressed={edition === 'classic'} onClick={() => setEdition('classic')}><Icon name="sun" size={16} />经典版</button>
      </div>
      {edition === 'modern' && <button className="appearance-motion" type="button" onClick={() => setMotion(motion === 'full' ? 'lite' : motion === 'lite' ? 'off' : 'full')} title={systemReduced ? '系统已启用减少动态效果' : '点击切换完整、轻量或关闭；移动设备自动使用轻量效果'}>
        <span className={effectiveMotion !== 'off' ? 'is-on' : ''} aria-hidden="true" />动效：{systemReduced ? '跟随系统' : labels[effectiveMotion]}
      </button>}
    </div>
  </div>
}
