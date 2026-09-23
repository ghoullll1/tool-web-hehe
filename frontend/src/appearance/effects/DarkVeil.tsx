// React Bits DarkVeil adapted with visibility, DPR/FPS limits and GPU disposal.
import { useEffect, useRef } from 'react'
import { Mesh, Program, Renderer, Triangle, Vec2 } from 'ogl'
import { fragment, vertex } from './darkVeilShader'
import { observeVisibility } from './visibility'

export default function DarkVeil() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // A fresh canvas per setup also handles React StrictMode's setup/cleanup replay.
    const host = ref.current!
    const canvas = document.createElement('canvas')
    canvas.className = 'nebula-veil'
    canvas.setAttribute('aria-hidden', 'true')
    host.append(canvas)
    let renderer: Renderer | undefined
    let geometry: Triangle | undefined
    let program: Program | undefined
    let frame = 0
    let last = 0
    let elapsed = 0
    let running = false
    let resize: ResizeObserver | undefined
    let stopVisibility: (() => void) | undefined
    let disposed = false
    const dispose = () => {
      if (disposed) return
      disposed = true
      running = false
      cancelAnimationFrame(frame)
      resize?.disconnect()
      stopVisibility?.()
      geometry?.remove()
      program?.remove()
      renderer?.gl.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.remove()
    }
    const lost = () => { dispose() }
    try {
      renderer = new Renderer({ canvas, dpr: Math.min(window.devicePixelRatio || 1, 1.5), alpha: false, antialias: false })
      const gl = renderer.gl
      geometry = new Triangle(gl)
      program = new Program(gl, { vertex, fragment, uniforms: {
        uResolution: { value: new Vec2() }, uTime: { value: 0 }, uHueShift: { value: 0 },
        uNoise: { value: 0.025 }, uScan: { value: 0 }, uScanFreq: { value: 0 },
        uWarp: { value: 0.3 }, uLightMode: { value: 1 },
      } })
      if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) throw new Error('Decorative shader unavailable')
      const mesh = new Mesh(gl, { geometry, program })
      const fit = () => {
        const bounds = canvas.parentElement!.getBoundingClientRect()
        renderer!.setSize(Math.max(1, bounds.width), Math.max(1, bounds.height))
        program!.uniforms.uResolution.value.set(gl.drawingBufferWidth, gl.drawingBufferHeight)
      }
      resize = new ResizeObserver(fit)
      resize.observe(canvas.parentElement!)
      fit()
      const draw = (now: number) => {
        if (!running || disposed) return
        if (now - last >= 1000 / 30) {
          elapsed += Math.min(now - last, 80) * 0.00032
          last = now
          program!.uniforms.uTime.value = elapsed
          try { renderer!.render({ scene: mesh }) } catch { dispose(); return }
        }
        frame = requestAnimationFrame(draw)
      }
      stopVisibility = observeVisibility(canvas, visible => {
        if (disposed) return
        running = visible
        cancelAnimationFrame(frame)
        if (visible) { last = performance.now(); frame = requestAnimationFrame(draw) }
      })
      canvas.addEventListener('webglcontextlost', lost)
    } catch { dispose(); canvas.style.opacity = '0' }
    return () => { canvas.removeEventListener('webglcontextlost', lost); dispose() }
  }, [])
  return <div ref={ref} className="nebula-veil-host" aria-hidden="true" />
}
