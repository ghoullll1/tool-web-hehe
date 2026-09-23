import { useEffect, useRef } from 'react'
import { Mesh, Program, Renderer, Triangle } from 'ogl'
import { observeVisibility } from './visibility'
import type { BackgroundPreset, BackgroundEffect } from '../ambientMotifs'
import { backgroundUniforms } from './backgrounds/uniforms'

const sources = {
  Aurora: () => import('./backgrounds/Aurora'),
  Threads: () => import('./backgrounds/Threads'),
  Iridescence: () => import('./backgrounds/Iridescence'),
  LiquidChrome: () => import('./backgrounds/LiquidChrome'),
  Balatro: () => import('./backgrounds/Balatro'),
  RippleGrid: () => import('./backgrounds/RippleGrid'),
} satisfies Record<BackgroundEffect, () => Promise<{ vertex: string; fragment: string }>>

/** Original React Bits GLSL, with a shared bounded/visibility-aware OGL lifecycle.
 * Shader algorithms are untouched; light palettes are passed through upstream uniforms.
 */
export default function AmbientField({ motif }: { tone?: string; motif: BackgroundPreset }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const host = ref.current!
    let disposed = false, running = false, frame = 0, last = 0, elapsed = 0
    let renderer: Renderer | undefined, geometry: Triangle | undefined, program: Program | undefined
    let resize: ResizeObserver | undefined, stopVisibility: (() => void) | undefined
    const canvas = document.createElement('canvas')
    canvas.className = 'studio-ambient-canvas'
    canvas.setAttribute('aria-hidden', 'true')
    const dispose = () => {
      if (disposed) return
      disposed = true; running = false
      cancelAnimationFrame(frame)
      resize?.disconnect(); stopVisibility?.()
      canvas.removeEventListener('webglcontextlost', dispose)
      geometry?.remove(); program?.remove()
      renderer?.gl.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.remove()
    }
    void sources[motif.effect]().then(({ vertex, fragment }) => {
      if (disposed) return
      try {
        host.append(canvas)
        renderer = new Renderer({ canvas, alpha: true, premultipliedAlpha: true, antialias: false, dpr: 1 })
        const gl = renderer.gl
        gl.clearColor(0, 0, 0, 0)
        geometry = new Triangle(gl)
        const uniforms = backgroundUniforms(motif)
        program = new Program(gl, { vertex, fragment, uniforms, transparent: true })
        program.setBlendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
        if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) throw new Error('Background unavailable')
        const mesh = new Mesh(gl, { geometry, program })
        const fit = () => {
          const box = host.getBoundingClientRect()
          const width = Math.max(1, box.width), height = Math.max(1, box.height)
          renderer!.dpr = Math.min(window.devicePixelRatio || 1, 1.5, 1600 / Math.max(width, height))
          renderer!.setSize(width, height)
          const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight
          uniforms.uResolution!.value = motif.effect === 'Aurora' ? [w, h] : [w, h, w / h]
          uniforms.iResolution!.value = motif.effect === 'RippleGrid' ? [w, h] : [w, h, w / h]
        }
        fit()
        renderer.render({ scene: mesh })
        canvas.dataset.ready = 'true'
        resize = new ResizeObserver(fit); resize.observe(host)
        const draw = (now: number) => {
          if (!running || disposed) return
          if (now - last >= 1000 / 30) {
            elapsed += Math.min(now - last, 80) * .001 * motif.speed; last = now
            uniforms.uTime!.value = elapsed; uniforms.iTime!.value = elapsed
            try { renderer!.render({ scene: mesh }) } catch { dispose(); return }
          }
          frame = requestAnimationFrame(draw)
        }
        stopVisibility = observeVisibility(host, visible => {
          if (disposed) return
          running = visible; cancelAnimationFrame(frame)
          if (visible) { last = performance.now(); frame = requestAnimationFrame(draw) }
        })
        canvas.addEventListener('webglcontextlost', dispose)
      } catch { dispose() }
    }).catch(dispose)
    return dispose
  }, [motif])
  return <div ref={ref} className="studio-ambient-renderer" data-background={motif.effect} />
}
