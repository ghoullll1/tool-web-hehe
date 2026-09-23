import { Component, type ReactNode } from 'react'

/** Only decorative children belong here. A failed effect must never hide a tool. */
export class EffectBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? null : this.props.children }
}
