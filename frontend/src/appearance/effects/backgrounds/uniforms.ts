import type { BackgroundPreset } from '../../ambientMotifs'
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
type Uniforms = Record<string, { value: number | boolean | number[] | number[][] }>
export function backgroundUniforms(p: BackgroundPreset): Uniforms {
  const color = rgb(p.colors[0])
  const values: Record<string, number | boolean | number[] | number[][]> = {
    uTime: 0, iTime: 0, uResolution: [1, 1, 1], iResolution: [1, 1, 1],
    uMouse: [.5, .5], uAmplitude: p.scale, uColor: color,
  }
  switch (p.effect) {
    case 'Aurora': Object.assign(values, { uColorStops: p.colors.map(rgb), uBlend: .65, uLightMode: 1 }); break
    case 'Threads': Object.assign(values, { uDistance: p.scale * .16 }); break
    case 'Iridescence': Object.assign(values, { uColor: color.map(c => c / Math.max(...color)), uAmplitude: .1, uSpeed: p.scale }); break
    case 'LiquidChrome': Object.assign(values, { uBaseColor: color.map(c => c * .5), uAmplitude: .3, uFrequencyX: p.scale, uFrequencyY: p.scale + .5 }); break
    case 'Balatro': Object.assign(values, {
      uSpinRotation: -2, uSpinSpeed: 2, uOffset: [0, 0],
      uColor1: [...rgb(p.colors[0]), 1], uColor2: [...rgb(p.colors[1]), 1], uColor3: [...rgb(p.colors[2]), 1],
      uContrast: 3.5, uLighting: .1, uSpinAmount: p.scale, uPixelFilter: 900, uSpinEase: 1, uIsRotate: false,
    }); break
    case 'RippleGrid': Object.assign(values, {
      enableRainbow: false, gridColor: color, rippleIntensity: .04, gridSize: p.scale,
      gridThickness: 18, fadeDistance: 1.5, vignetteStrength: 1.5, glowIntensity: .08, opacity: .75,
      gridRotation: p.rotation, mouseInteraction: false, mousePosition: [.5, .5],
      mouseInfluence: 0, mouseInteractionRadius: 1, lightMode: true,
    }); break
  }
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }]))
}
