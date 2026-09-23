// React Bits AnimatedList / GooeyNav visual adaptation. Native links, focus and callbacks remain untouched.
import { animate } from 'motion'

const groups = '.navigation-home,.navigation-tools,.dashboard-category-bar,.appearance-segment,.studio-directory-view,.data-format-switch,.api-tabs,.json-view-switch,.ts-tabs,.ts-option-group,.port-category-rail,.port-transport-filter > div,.hash-mode-switch,.hash-input-switch,.hash-case-switch,.coordinate-mode-switch,.coordinate-segmented > div,.sql-setting-group > div,.hd-methods,.hd-auth-types,.world-time-mode,.hd-tabs,.dns-tabs,.pic-modes,.pic-options,.temporary-chat-mode,.temporary-share-mode,.password-mode-switch'
type Stop = { stop: () => void }
export function installSelectionEffects() {
  const records = new Map<HTMLElement, { glow: HTMLSpanElement; selected: Element | null; animation?: Stop; geometry: string }>()
  const entered = new WeakSet<Element>()
  const entrances = new Map<Stop, () => void>()
  let frame = 0
  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      observer?.unobserve(entry.target)
      const node = entry.target as HTMLElement
      const opacity = node.style.opacity, transform = node.style.transform
      const restore = () => { node.style.opacity = opacity; node.style.transform = transform }
      const animation = animate(node, { opacity: [0.35, 1] }, { duration: 0.45 })
      entrances.set(animation, restore)
      void animation.then(() => { if (entrances.has(animation)) { restore(); entrances.delete(animation) } })
    }
  }, { threshold: 0.1 })
  const sync = () => {
    frame = 0
    if (document.hidden) return
    for (const [group, record] of records) {
      if (!group.isConnected) { record.animation?.stop(); record.glow.remove(); resize?.unobserve(group); records.delete(group) }
    }
    document.querySelectorAll<HTMLElement>(groups).forEach(group => {
      let record = records.get(group)
      if (!record) {
        const glow = document.createElement('span')
        glow.className = 'nebula-selection-glow'
        glow.setAttribute('aria-hidden', 'true')
        group.append(glow)
        group.dataset.nebulaGroup = ''
        record = { glow, selected: null, geometry: '' }
        records.set(group, record)
        resize?.observe(group)
      }
      const selected = group.querySelector<HTMLElement>('[aria-current="page"],button[aria-pressed="true"],button[aria-selected="true"],button.is-active')
      if (!selected || selected.closest('.nav-group.is-collapsed,[hidden]')) { record.animation?.stop(); record.glow.style.opacity = '0'; record.geometry = ''; record.selected = null; return }
      const box = selected.getBoundingClientRect(), parent = group.getBoundingClientRect()
      const x = box.left - parent.left + group.scrollLeft - group.clientLeft
      const y = box.top - parent.top + group.scrollTop - group.clientTop
      const geometry = `${x},${y},${box.width},${box.height}`
      if (record.geometry === geometry) return
      record.animation?.stop()
      record.glow.style.opacity = box.width ? '1' : '0'
      record.animation = animate(record.glow, { x, y, width: box.width, height: box.height, opacity: record.selected ? [0.65, 1] : 1 }, {
        duration: record.selected ? 0.36 : 0, ease: [0.22, 1, 0.36, 1],
      })
      record.selected = selected
      record.geometry = geometry
    })
    document.querySelectorAll('.nav-group,.dashboard-quick-card,.dashboard-tool-card,.tool-header,.workbench > :not(.state-panel),.workbench [role="tabpanel"]').forEach(item => {
      if (!entered.has(item)) { entered.add(item); observer?.observe(item) }
    })
  }
  const schedule = () => { if (!document.hidden && !frame) frame = requestAnimationFrame(sync) }
  const mutations = new MutationObserver(schedule)
  mutations.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-current', 'aria-pressed', 'aria-selected'] })
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
  document.querySelectorAll('.sidebar,.main-content').forEach(el => resize?.observe(el))
  const visibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame); frame = 0
      for (const [animation, restore] of entrances) { animation.stop(); restore() }
      entrances.clear()
      for (const record of records.values()) { record.animation?.stop(); record.geometry = '' }
    } else schedule()
  }
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('resize', schedule)
  document.addEventListener('click', schedule)
  // Collapsing a preceding category moves the selected link without resizing the
  // scroll container. Re-measure after its grid transition has settled.
  document.addEventListener('transitionend', schedule)
  schedule()
  return () => {
    cancelAnimationFrame(frame)
    mutations.disconnect(); resize?.disconnect(); observer?.disconnect()
    for (const [animation, restore] of entrances) { animation.stop(); restore() }
    for (const [group, record] of records) {
      record.animation?.stop(); record.glow.remove(); delete group.dataset.nebulaGroup
    }
    document.removeEventListener('visibilitychange', visibility)
    window.removeEventListener('resize', schedule)
    document.removeEventListener('click', schedule)
    document.removeEventListener('transitionend', schedule)
  }
}
