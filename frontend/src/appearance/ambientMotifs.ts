/** Route presentation only. The tool catalog remains API-backed. */
export type BackgroundEffect = 'Aurora' | 'Threads' | 'Iridescence' | 'LiquidChrome' | 'Balatro' | 'RippleGrid'
export interface BackgroundPreset {
  effect: BackgroundEffect
  colors: [string, string, string]
  speed: number
  scale: number
  rotation: number
}
const preset = (effect: BackgroundEffect, colors: BackgroundPreset['colors'], speed = .3, scale = 1, rotation = 0): BackgroundPreset => ({ effect, colors, speed, scale, rotation })
export const ambientMotifs: Record<string, BackgroundPreset> = {
  'timestamp-converter': preset('Aurora', ['#b99255','#e7bd8b','#7e9ebe'], .22),
  'common-ports': preset('RippleGrid', ['#587da8','#aac6df','#f3f6fb'], .25, 8, 0),
  'json-formatter': preset('Threads', ['#6a91b8','#9ebed6','#e4ecf6'], .35, .65),
  'data-converter': preset('LiquidChrome', ['#9d93bf','#b5c8df','#eee9f5'], .18, 2),
  'json-diff': preset('Balatro', ['#b8cbdc','#d6b6c5','#f7f4f9'], .28, .2),
  hash: preset('RippleGrid', ['#537d87','#b0d0d0','#f1f7f8'], .18, 18, 45),
  'sql-formatter': preset('Threads', ['#ab8854','#d0b38a','#f6eddb'], .23, 1.2),
  coordinate: preset('RippleGrid', ['#508992','#a6c7c4','#edf6f6'], .2, 5, 20),
  'api-test': preset('Balatro', ['#dfc7a4','#b4c5db','#f7f3ed'], .23, .4),
  'http-response-diagnostics': preset('Aurora', ['#668eac','#a7c6da','#b6a6cc'], .3, 1.5),
  'dns-query': preset('Threads', ['#887ca9','#aeb5d5','#ece9f5'], .3, 1.8),
  'image-converter': preset('Iridescence', ['#edd3e2','#b5cae5','#f5e3bd'], .22),
  'password-generator': preset('LiquidChrome', ['#a29cc7','#b6c2db','#e8e5f3'], .14, 4),
  'pdf-merge': preset('Aurora', ['#ba936c','#d3b59a','#99b1c6'], .18, .65),
  'pdf-image-converter': preset('Iridescence', ['#e2c6cf','#c9d6df','#f0dfcb'], .3, 1.2),
  'document-converter': preset('Balatro', ['#dbc5a5','#c2cfd2','#faf6ee'], .16, .1),
  'world-time': preset('Aurora', ['#628fa4','#b0c7d8','#ddbf95'], .16, 2),
  'temporary-file-share': preset('LiquidChrome', ['#9dbdd2','#b3cbd9','#e5eff7'], .2, 1.4),
  'temporary-chat': preset('Iridescence', ['#dfbfcf','#acc9db','#e5d6eb'], .18, .8),
}
const fallback = preset('Threads', ['#708da8','#abc1d5','#edf1f7'])
export function ambientMotif(slug: string): BackgroundPreset { return ambientMotifs[slug] ?? fallback }
