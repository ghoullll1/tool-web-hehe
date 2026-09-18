export type GeneratorMode = 'password' | 'token' | 'passphrase'
export type TokenFormat = 'api-key' | 'base64url' | 'hex' | 'uuid'
export type TokenBits = 128 | 192 | 256
export type PassphraseLanguage = 'english' | 'chinese'
export type PassphraseCase = 'lower' | 'title' | 'random'
export type PassphraseSeparator = '-' | '_' | '.' | ' '

export interface PasswordOptions {
  length: number
  lowercase: boolean
  uppercase: boolean
  digits: boolean
  symbols: boolean
  avoidAmbiguous: boolean
  count: number
}

export interface TokenOptions {
  format: TokenFormat
  bits: TokenBits
  prefix: string
  count: number
}

export interface PassphraseOptions {
  wordCount: number
  language: PassphraseLanguage
  separator: PassphraseSeparator
  casing: PassphraseCase
  includeNumber: boolean
  count: number
}

export interface GeneratedSecret {
  value: string
  entropy: number
}

export interface RandomSource {
  integer(maxExclusive: number): number
}

export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
  length: 20,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: true,
  count: 5,
}

export const DEFAULT_TOKEN_OPTIONS: TokenOptions = {
  format: 'api-key',
  bits: 192,
  prefix: 'tk_live_',
  count: 5,
}

export const DEFAULT_PASSPHRASE_OPTIONS: PassphraseOptions = {
  wordCount: 8,
  language: 'english',
  separator: '-',
  casing: 'lower',
  includeNumber: true,
  count: 5,
}

const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DIGITS = '0123456789'
const SYMBOLS = '!@#$%^&*()-_=+[]{}:,.?'
const AMBIGUOUS = new Set('Il1O0o')
const BASE62 = `${LOWERCASE}${UPPERCASE}${DIGITS}`
const BASE64URL = `${BASE62}-_`
const HEX = '0123456789abcdef'

export const ENGLISH_WORDS = Array.from(new Set(`
acorn alpine amber anchor apple april arctic arrow atlas aurora autumn bamboo
basil beach beacon berry birch bloom breeze bridge brook cedar cherry cloud
clover coral cosmos crystal dawn delta dune earth echo elm ember fern field
firefly fjord flame flora forest frost galaxy garden glacier grove harbor hazel
hill horizon island ivory jade juniper lake leaf lemon light lilac lotus lunar
maple meadow mint mist moon moss mountain nebula night north ocean olive opal
orchid orbit palm pearl pine plum pond poppy prairie quartz rain raven reef
ridge river robin rose ruby sage sand sea shadow shore sky snow solar south
spark spring star stone storm summer sun sunset swift tide timber trail tree
tulip valley violet wave west willow wind winter wren zenith breeze canyon
castle citrus comet copper cotton creek daisy dream eagle falcon feather harbor
heron lagoon maple marble melody meteor olive pebble phoenix planet ripple
rocket silver summit thunder velvet voyage walnut whisper zephyr
`.trim().split(/\s+/)))

export const CHINESE_WORDS = Array.from(new Set(`
白露 青山 星河 晨光 清风 云海 松林 竹影 春雨 夏花 秋月 冬雪
远帆 灯塔 溪流 岩石 湖畔 海岸 晚霞 朝阳 月光 星辰 雨燕 白鹭
青竹 红枫 银杏 玉兰 茉莉 海棠 荷花 兰草 苍穹 原野 山谷 峡湾
极光 冰川 沙丘 森林 草原 岛屿 珊瑚 贝壳 珍珠 琥珀 水晶 翡翠
清泉 流云 微风 霜叶 雪松 麦田 稻香 花火 萤光 薄雾 晴空 暮色
黎明 午后 黄昏 深夜 春芽 夏雨 秋霜 冬阳 南风 北岸 东篱 西岭
归舟 远山 长河 云舟 星港 月湾 风铃 纸鸢 木舟 石桥 小径 庭院
书页 墨香 琴音 茶语 云锦 青瓷 玉石 锦鲤 灵鹿 飞鸟 山雀 海鸥
晨钟 暮鼓 流萤 落日 新月 满月 星轨 云杉 枫叶 杏花 桃枝 莲心
晴岚 雨幕 雪原 风谷 云岭 海蓝 湖绿 松涛 竹韵 泉声 鸟鸣
`.trim().split(/\s+/)))

const secureRandom: RandomSource = {
  integer(maxExclusive) {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) throw new Error('随机范围无效')
    const range = 0x1_0000_0000
    const limit = Math.floor(range / maxExclusive) * maxExclusive
    const buffer = new Uint32Array(1)
    let value = range
    while (value >= limit) {
      globalThis.crypto.getRandomValues(buffer)
      value = buffer[0]!
    }
    return value % maxExclusive
  },
}

export function generatePassword(options: PasswordOptions, random: RandomSource = secureRandom): GeneratedSecret {
  validateCount(options.count)
  if (!Number.isInteger(options.length) || options.length < 4 || options.length > 128) throw new Error('密码长度需要在 4 到 128 之间')
  const groups = [
    options.lowercase ? LOWERCASE : '',
    options.uppercase ? UPPERCASE : '',
    options.digits ? DIGITS : '',
    options.symbols ? SYMBOLS : '',
  ].filter(Boolean).map((group) => options.avoidAmbiguous ? [...group].filter((character) => !AMBIGUOUS.has(character)).join('') : group)
  if (!groups.length) throw new Error('请至少选择一类字符')
  if (options.length < groups.length) throw new Error('密码长度不能小于已选字符类型数量')
  const alphabet = groups.join('')
  const characters = groups.map((group) => pick(group, random))
  while (characters.length < options.length) characters.push(pick(alphabet, random))
  shuffle(characters, random)
  return { value: characters.join(''), entropy: options.length * Math.log2(alphabet.length) }
}

export function generateToken(options: TokenOptions, random: RandomSource = secureRandom): GeneratedSecret {
  validateCount(options.count)
  if (![128, 192, 256].includes(options.bits)) throw new Error('令牌强度仅支持 128、192 或 256 位')
  if (!/^[A-Za-z0-9_-]{0,24}$/.test(options.prefix)) throw new Error('前缀只能包含字母、数字、下划线和短横线，最多 24 个字符')
  if (options.format === 'uuid') return { value: createUuid(random), entropy: 122 }
  const alphabet = options.format === 'hex' ? HEX : options.format === 'base64url' ? BASE64URL : BASE62
  const characterCount = Math.ceil(options.bits / Math.log2(alphabet.length))
  const value = Array.from({ length: characterCount }, () => pick(alphabet, random)).join('')
  return {
    value: options.format === 'api-key' ? `${options.prefix}${value}` : value,
    entropy: characterCount * Math.log2(alphabet.length),
  }
}

export function generatePassphrase(options: PassphraseOptions, random: RandomSource = secureRandom): GeneratedSecret {
  validateCount(options.count)
  if (!Number.isInteger(options.wordCount) || options.wordCount < 4 || options.wordCount > 12) throw new Error('口令词数需要在 4 到 12 之间')
  const words = options.language === 'chinese' ? CHINESE_WORDS : ENGLISH_WORDS
  const chosen = Array.from({ length: options.wordCount }, () => words[random.integer(words.length)]!)
  const cased = chosen.map((word) => {
    if (options.language === 'chinese' || options.casing === 'lower') return word.toLowerCase()
    if (options.casing === 'title') return `${word[0]?.toUpperCase() ?? ''}${word.slice(1).toLowerCase()}`
    return random.integer(2) ? word.toUpperCase() : word.toLowerCase()
  })
  const suffix = options.includeNumber ? String(random.integer(100)).padStart(2, '0') : ''
  const entropy = options.wordCount * Math.log2(words.length) + (options.includeNumber ? Math.log2(100) : 0)
  return { value: `${cased.join(options.separator)}${suffix}`, entropy }
}

export function generateSecrets(
  mode: GeneratorMode,
  passwordOptions: PasswordOptions,
  tokenOptions: TokenOptions,
  passphraseOptions: PassphraseOptions,
  random: RandomSource = secureRandom,
): GeneratedSecret[] {
  const count = mode === 'password' ? passwordOptions.count : mode === 'token' ? tokenOptions.count : passphraseOptions.count
  return Array.from({ length: count }, () => mode === 'password'
    ? generatePassword(passwordOptions, random)
    : mode === 'token'
      ? generateToken(tokenOptions, random)
      : generatePassphrase(passphraseOptions, random))
}

export function strengthForEntropy(entropy: number) {
  if (entropy < 48) return { key: 'basic', label: '基础', detail: '适合低风险临时用途' } as const
  if (entropy < 72) return { key: 'good', label: '良好', detail: '适合大多数日常账户' } as const
  if (entropy < 100) return { key: 'strong', label: '强', detail: '适合重要账户与开发凭据' } as const
  return { key: 'excellent', label: '极强', detail: '具备很高的随机搜索空间' } as const
}

function validateCount(count: number) {
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error('生成数量需要在 1 到 20 之间')
}

function pick(alphabet: string, random: RandomSource) {
  return alphabet[random.integer(alphabet.length)]!
}

function shuffle(values: string[], random: RandomSource) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = random.integer(index + 1)
    ;[values[index], values[swapIndex]] = [values[swapIndex]!, values[index]!]
  }
}

function createUuid(random: RandomSource) {
  const bytes = Array.from({ length: 16 }, () => random.integer(256))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const value = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}
