import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { ToolViewProps } from '../registry'
import {
  DEFAULT_PASSPHRASE_OPTIONS,
  DEFAULT_PASSWORD_OPTIONS,
  DEFAULT_TOKEN_OPTIONS,
  generateSecrets,
  strengthForEntropy,
  type GeneratorMode,
  type PassphraseCase,
  type PassphraseLanguage,
  type PassphraseOptions,
  type PassphraseSeparator,
  type PasswordOptions,
  type TokenBits,
  type TokenFormat,
  type TokenOptions,
  type GeneratedSecret,
} from './passwordGeneratorModel'
import './passwordGenerator.css'

const MODES: ReadonlyArray<{ value: GeneratorMode; index: string; title: string; detail: string }> = [
  { value: 'password', index: '01', title: '随机密码', detail: '网站账户与登录凭据' },
  { value: 'token', index: '02', title: '开发者令牌', detail: 'API Key、Hex 与 UUID' },
  { value: 'passphrase', index: '03', title: '口令短语', detail: '易读、易输入、随机组合' },
]

const TOKEN_FORMATS: ReadonlyArray<{ value: TokenFormat; title: string; detail: string }> = [
  { value: 'api-key', title: 'API Key', detail: '可识别前缀 + Base62' },
  { value: 'base64url', title: 'Base64URL', detail: '适合 Header 与 URL' },
  { value: 'hex', title: 'Hex Secret', detail: '配置与环境变量常用' },
  { value: 'uuid', title: 'UUID v4', detail: '随机标识，约 122 位' },
]

const SEPARATORS: ReadonlyArray<{ value: PassphraseSeparator; label: string }> = [
  { value: '-', label: '短横线  -' },
  { value: '_', label: '下划线  _' },
  { value: '.', label: '点号  .' },
  { value: ' ', label: '空格' },
]

export default function PasswordGeneratorTool({ tool }: ToolViewProps) {
  const [mode, setMode] = useState<GeneratorMode>('password')
  const [passwordOptions, setPasswordOptions] = useState<PasswordOptions>({ ...DEFAULT_PASSWORD_OPTIONS })
  const [tokenOptions, setTokenOptions] = useState<TokenOptions>({ ...DEFAULT_TOKEN_OPTIONS })
  const [passphraseOptions, setPassphraseOptions] = useState<PassphraseOptions>({ ...DEFAULT_PASSPHRASE_OPTIONS })
  const [values, setValues] = useState<GeneratedSecret[]>(() => generateSecrets('password', DEFAULT_PASSWORD_OPTIONS, DEFAULT_TOKEN_OPTIONS, DEFAULT_PASSPHRASE_OPTIONS))
  const [generation, setGeneration] = useState(1)
  const [visible, setVisible] = useState(true)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [notice, setNotice] = useState('已生成一组随机密码，可直接复制使用')
  const [noticeTone, setNoticeTone] = useState<'info' | 'success' | 'error'>('info')
  const didMount = useRef(false)

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      return
    }
    refresh('设置已应用，结果已重新生成')
    // Every referenced options object is immutable and changes only from a user setting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, passwordOptions, tokenOptions, passphraseOptions])

  const modeMeta = MODES.find((item) => item.value === mode)!
  const strength = useMemo(() => strengthForEntropy(values[0]?.entropy ?? 0), [values])
  const entropy = Math.round(values[0]?.entropy ?? 0)

  function refresh(message = '已经换了一批新的随机结果') {
    try {
      setValues(generateSecrets(mode, passwordOptions, tokenOptions, passphraseOptions))
      setGeneration((current) => current + 1)
      setCopiedIndex(null)
      setNotice(message)
      setNoticeTone('success')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '暂时无法生成，请检查设置')
      setNoticeTone('error')
    }
  }

  async function copy(value: string, index: number) {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedIndex(index)
      setNotice(`第 ${index + 1} 条结果已复制`)
      setNoticeTone('success')
    } catch {
      setNotice('复制失败，请检查浏览器剪贴板权限')
      setNoticeTone('error')
    }
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(values.map((item) => item.value).join('\n'))
      setCopiedIndex(null)
      setNotice(`已复制全部 ${values.length} 条结果`)
      setNoticeTone('success')
    } catch {
      setNotice('复制失败，请检查浏览器剪贴板权限')
      setNoticeTone('error')
    }
  }

  function togglePasswordGroup(key: 'lowercase' | 'uppercase' | 'digits' | 'symbols') {
    const selected = ['lowercase', 'uppercase', 'digits', 'symbols'].filter((name) => passwordOptions[name as keyof PasswordOptions] === true)
    if (passwordOptions[key] && selected.length === 1) {
      setNotice('请至少保留一类字符')
      setNoticeTone('error')
      return
    }
    setPasswordOptions((current) => ({ ...current, [key]: !current[key] }))
  }

  return <div className="password-generator" data-tool={tool.slug}>
    <section className="password-hero" aria-labelledby="password-workbench-title">
      <div>
        <span className="password-eyebrow">SECURE RANDOM · BROWSER LOCAL</span>
        <h2 id="password-workbench-title">每一次生成，都只属于此刻。</h2>
        <p>从账户密码到开发者令牌与口令短语，用浏览器加密随机源一次生成。</p>
        <span className="password-private"><i /> 不上传、不保存、不记录历史</span>
      </div>
      <GeneratorArtwork />
    </section>

    <section className="password-mode-switch" aria-label="密码形式">
      {MODES.map((item) => <button type="button" key={item.value} className={mode === item.value ? 'is-active' : ''} aria-pressed={mode === item.value} onClick={() => setMode(item.value)}>
        <span>{item.index}</span><ModeIcon mode={item.value} /><div><strong>{item.title}</strong><small>{item.detail}</small></div><b aria-hidden="true">→</b>
      </button>)}
    </section>

    <div className="password-workspace">
      <section className="password-settings">
        <header><span>CONFIG</span><div><h3>{modeMeta.title}设置</h3><p>{modeMeta.detail}</p></div></header>
        <div className="password-settings-body">
          {mode === 'password' && <PasswordSettings options={passwordOptions} setOptions={setPasswordOptions} toggleGroup={togglePasswordGroup} />}
          {mode === 'token' && <TokenSettings options={tokenOptions} setOptions={setTokenOptions} />}
          {mode === 'passphrase' && <PassphraseSettings options={passphraseOptions} setOptions={setPassphraseOptions} />}
        </div>
        <footer><span>调整设置后自动换新</span><kbd>浏览器加密随机源</kbd></footer>
      </section>

      <section className="password-results">
        <header>
          <div><span>OUTPUT</span><h3>生成结果</h3></div>
          <div className={`password-strength is-${strength.key}`}><span><i />{strength.label}</span><b>约 {entropy} bits</b></div>
        </header>
        <div className="password-result-toolbar">
          <p><strong>{values.length}</strong> 条结果 <span>·</span> {strength.detail}</p>
          <div><button type="button" onClick={() => setVisible((current) => !current)}><EyeIcon hidden={visible} />{visible ? '隐藏' : '显示'}</button><button type="button" onClick={() => void copyAll()}><CopyIcon />复制全部</button><button type="button" className="is-primary" onClick={() => refresh()}><RefreshIcon />换一批</button></div>
        </div>
        <div className="password-result-list" key={generation} aria-live="polite">
          {values.map((item, index) => <article key={`${generation}-${index}`} style={{ '--result-index': index } as CSSProperties}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <code title={visible ? item.value : '内容已隐藏'}>{visible ? item.value : maskSecret(item.value)}</code>
            <small>约 {Math.round(item.entropy)} bits</small>
            <button type="button" className={copiedIndex === index ? 'is-copied' : ''} aria-label={`复制第 ${index + 1} 条结果`} onClick={() => void copy(item.value, index)}>{copiedIndex === index ? <CheckIcon /> : <CopyIcon />}<span>{copiedIndex === index ? '已复制' : '复制'}</span></button>
          </article>)}
        </div>
        <footer><span className={`password-meter is-${strength.key}`}><i /></span><p>强度为搜索空间估算；网站自身规则与泄露风险仍需单独考虑。</p></footer>
      </section>
    </div>

    <div className={`password-notice is-${noticeTone}`} role={noticeTone === 'error' ? 'alert' : 'status'}><span>{noticeTone === 'error' ? '!' : noticeTone === 'success' ? '✓' : 'i'}</span><p>{notice}</p><b>数据仅在浏览器本地生成</b></div>
  </div>
}

function PasswordSettings({ options, setOptions, toggleGroup }: { options: PasswordOptions; setOptions: React.Dispatch<React.SetStateAction<PasswordOptions>>; toggleGroup: (key: 'lowercase' | 'uppercase' | 'digits' | 'symbols') => void }) {
  return <>
    <RangeField label="密码长度" value={`${options.length} 位`} min={4} max={128} valueNumber={options.length} onChange={(value) => setOptions((current) => ({ ...current, length: value }))} ticks={['4', '32', '64', '96', '128']} />
    <fieldset className="password-choice-field"><legend>字符类型</legend><div className="password-character-grid">
      <ChoiceButton selected={options.lowercase} title="小写字母" sample="a–z" onClick={() => toggleGroup('lowercase')} />
      <ChoiceButton selected={options.uppercase} title="大写字母" sample="A–Z" onClick={() => toggleGroup('uppercase')} />
      <ChoiceButton selected={options.digits} title="数字" sample="0–9" onClick={() => toggleGroup('digits')} />
      <ChoiceButton selected={options.symbols} title="特殊符号" sample="! @ # $" onClick={() => toggleGroup('symbols')} />
    </div></fieldset>
    <SwitchRow checked={options.avoidAmbiguous} title="排除易混淆字符" detail="移除 I、l、1、O、0、o" onChange={(checked) => setOptions((current) => ({ ...current, avoidAmbiguous: checked }))} />
    <CountField count={options.count} onChange={(count) => setOptions((current) => ({ ...current, count }))} />
  </>
}

function TokenSettings({ options, setOptions }: { options: TokenOptions; setOptions: React.Dispatch<React.SetStateAction<TokenOptions>> }) {
  return <>
    <fieldset className="password-choice-field"><legend>令牌格式</legend><div className="password-token-grid">{TOKEN_FORMATS.map((item) => <button type="button" key={item.value} className={options.format === item.value ? 'is-selected' : ''} aria-pressed={options.format === item.value} onClick={() => setOptions((current) => ({ ...current, format: item.value }))}><span>{options.format === item.value ? '✓' : ''}</span><strong>{item.title}</strong><small>{item.detail}</small></button>)}</div></fieldset>
    {options.format === 'api-key' && <label className="password-text-field"><span>令牌前缀</span><input aria-label="令牌前缀" value={options.prefix} maxLength={24} spellCheck={false} autoComplete="off" placeholder="例如 tk_live_" onChange={(event) => setOptions((current) => ({ ...current, prefix: event.target.value.replace(/[^A-Za-z0-9_-]/g, '') }))} /><small>用于识别环境或用途，只支持字母、数字、_ 和 -。</small></label>}
    {options.format === 'uuid' ? <div className="password-fixed-strength"><span>固定强度</span><strong>UUID v4 · 122 bits 随机位</strong><p>适合作为不可预测标识；不要把 UUID 当作长期访问密钥。</p></div> : <fieldset className="password-segment-field"><legend>随机强度</legend><div>{([128, 192, 256] as TokenBits[]).map((bits) => <button type="button" key={bits} className={options.bits === bits ? 'is-selected' : ''} aria-pressed={options.bits === bits} onClick={() => setOptions((current) => ({ ...current, bits }))}>{bits}<small>bits</small></button>)}</div></fieldset>}
    <CountField count={options.count} onChange={(count) => setOptions((current) => ({ ...current, count }))} />
  </>
}

function PassphraseSettings({ options, setOptions }: { options: PassphraseOptions; setOptions: React.Dispatch<React.SetStateAction<PassphraseOptions>> }) {
  return <>
    <RangeField label="词语数量" value={`${options.wordCount} 个`} min={4} max={12} valueNumber={options.wordCount} onChange={(wordCount) => setOptions((current) => ({ ...current, wordCount }))} ticks={['4', '6', '8', '10', '12']} />
    <fieldset className="password-segment-field"><legend>词库语言</legend><div>{([['english', '英文词库'], ['chinese', '中文词库']] as [PassphraseLanguage, string][]).map(([language, label]) => <button type="button" key={language} className={options.language === language ? 'is-selected' : ''} aria-pressed={options.language === language} onClick={() => setOptions((current) => ({ ...current, language }))}>{label}</button>)}</div></fieldset>
    <fieldset className="password-choice-field"><legend>连接方式</legend><div className="password-separator-grid">{SEPARATORS.map((item) => <button type="button" key={item.label} className={options.separator === item.value ? 'is-selected' : ''} aria-pressed={options.separator === item.value} onClick={() => setOptions((current) => ({ ...current, separator: item.value }))}>{item.label}</button>)}</div></fieldset>
    {options.language === 'english' && <fieldset className="password-segment-field"><legend>字母样式</legend><div>{([['lower', '小写'], ['title', '首字母大写'], ['random', '随机大小写']] as [PassphraseCase, string][]).map(([casing, label]) => <button type="button" key={casing} className={options.casing === casing ? 'is-selected' : ''} aria-pressed={options.casing === casing} onClick={() => setOptions((current) => ({ ...current, casing }))}>{label}</button>)}</div></fieldset>}
    <SwitchRow checked={options.includeNumber} title="追加两位数字" detail="进一步扩大组合空间" onChange={(includeNumber) => setOptions((current) => ({ ...current, includeNumber }))} />
    <CountField count={options.count} onChange={(count) => setOptions((current) => ({ ...current, count }))} />
  </>
}

function RangeField({ label, value, min, max, valueNumber, onChange, ticks }: { label: string; value: string; min: number; max: number; valueNumber: number; onChange: (value: number) => void; ticks: string[] }) {
  return <label className="password-range"><span><strong>{label}</strong><output>{value}</output></span><input type="range" min={min} max={max} value={valueNumber} onChange={(event) => onChange(Number(event.target.value))} /><small>{ticks.map((tick) => <b key={tick}>{tick}</b>)}</small></label>
}

function ChoiceButton({ selected, title, sample, onClick }: { selected: boolean; title: string; sample: string; onClick: () => void }) {
  return <button type="button" className={selected ? 'is-selected' : ''} aria-pressed={selected} onClick={onClick}><span>{selected ? '✓' : ''}</span><strong>{title}</strong><small>{sample}</small></button>
}

function SwitchRow({ checked, title, detail, onChange }: { checked: boolean; title: string; detail: string; onChange: (checked: boolean) => void }) {
  return <label className="password-switch-row"><span><strong>{title}</strong><small>{detail}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i aria-hidden="true" /></label>
}

function CountField({ count, onChange }: { count: number; onChange: (count: number) => void }) {
  return <div className="password-count-field"><span><strong>生成数量</strong><small>单次最多 20 条</small></span><div><button type="button" aria-label="减少生成数量" disabled={count <= 1} onClick={() => onChange(count - 1)}>−</button><output>{count}</output><button type="button" aria-label="增加生成数量" disabled={count >= 20} onClick={() => onChange(count + 1)}>＋</button></div></div>
}

function maskSecret(value: string) { return '•'.repeat(Math.min(28, Math.max(12, value.length))) }

function GeneratorArtwork() { return <div className="password-art" aria-hidden="true"><span>••••••••</span><i /><span>tk_live_•••</span><i /><span>river-cloud-••</span><b>↻</b></div> }
function ModeIcon({ mode }: { mode: GeneratorMode }) { return mode === 'password' ? <svg viewBox="0 0 24 24"><rect x="4" y="9" width="16" height="11" rx="3"/><path d="M8 9V7a4 4 0 0 1 8 0v2M9 14h.01M12 14h.01M15 14h.01"/></svg> : mode === 'token' ? <svg viewBox="0 0 24 24"><circle cx="8" cy="12" r="4"/><path d="M12 12h8m-3 0v3m-3-3v2"/></svg> : <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h11M4 18h8"/><circle cx="19" cy="17" r="2"/></svg> }
function EyeIcon({ hidden }: { hidden: boolean }) { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5Z"/><circle cx="12" cy="12" r="2.5"/>{hidden && <path d="m4 4 16 16"/>}</svg> }
function CopyIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg> }
function CheckIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg> }
function RefreshIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M18 9a7 7 0 0 0-12-2L4 12m16 0-2 5a7 7 0 0 1-12 0"/></svg> }
