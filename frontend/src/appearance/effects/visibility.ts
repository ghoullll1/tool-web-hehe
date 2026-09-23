/** Runs animation work only while the document and its target are visible. */
export function observeVisibility(element: Element, update: (visible: boolean) => void) {
  let intersecting = true
  const publish = () => update(intersecting && !document.hidden)
  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    intersecting = entries[0]?.isIntersecting ?? false
    publish()
  })
  observer?.observe(element)
  document.addEventListener('visibilitychange', publish)
  publish()
  return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', publish) }
}
