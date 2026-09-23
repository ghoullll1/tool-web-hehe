import { Icon } from "../../components/Icon"
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { ToolViewProps } from '../registry'
import {
  createChatSession,
  joinChatSession,
  temporaryChatWebSocketUrl,
  type CreatedChatSession,
  type JoinedChatSession,
} from './temporaryChatApi'
import './temporaryChat.css'

type Mode = 'create' | 'join'
type Phase = 'ready' | 'connecting' | 'waiting' | 'active' | 'closed'
type Role = 'CREATOR' | 'PARTICIPANT'

interface ChatMessage {
  id: string
  text: string
  mine: boolean
  sentAt: string
  status: 'sending' | 'accepted' | 'delivered'
}

interface ServerFrame {
  messageId: string
  type: string
  timestamp: string
  correlationId?: string
  data?: Record<string, unknown>
}

function keyFromFragment() {
  const value = new URLSearchParams(window.location.hash.slice(1)).get('key')
  return value ?? ''
}

export default function TemporaryChatTool({ tool }: ToolViewProps) {
  const [fragmentKey] = useState(() => keyFromFragment())
  const [mode, setMode] = useState<Mode>(fragmentKey ? 'join' : 'create')
  const [phase, setPhase] = useState<Phase>('ready')
  const [displayName, setDisplayName] = useState('')
  const [sessionKey, setSessionKey] = useState(() => formatSessionKey(fragmentKey))
  const [sessionId, setSessionId] = useState('')
  const [role, setRole] = useState<Role | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [secondsRemaining, setSecondsRemaining] = useState(180)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)
  const requestAbortRef = useRef<AbortController | null>(null)
  const intentionalCloseRef = useRef(false)
  const messageListRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => {
    intentionalCloseRef.current = true
    requestAbortRef.current?.abort()
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(frame('LEAVE', {}))
      socket.close(1000, 'page closed')
    }
  }, [])

  useEffect(() => {
    if (!expiresAt || phase === 'active' || phase === 'closed') return
    const update = () => setSecondsRemaining(Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [expiresAt, phase])

  useEffect(() => {
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function handleStart(event: FormEvent) {
    event.preventDefault()
    setNotice(null)
    setPhase('connecting')
    requestAbortRef.current?.abort()
    const controller = new AbortController()
    requestAbortRef.current = controller
    try {
      if (mode === 'create') {
        const created = await createChatSession(displayName, controller.signal)
        setSessionKey(created.sessionKey)
        setSessionId(created.sessionId)
        setExpiresAt(created.expiresAt)
        openSocket(created, created.creatorTicket)
      } else {
        const joined = await joinChatSession(formatSessionKey(sessionKey), displayName, controller.signal)
        setSessionId(joined.sessionId)
        setExpiresAt(joined.expiresAt)
        openSocket(joined, joined.participantTicket)
      }
    } catch (error) {
      if (controller.signal.aborted) return
      setPhase('ready')
      setNotice(error instanceof Error ? error.message : '临时会话暂时不可用。')
    } finally {
      if (requestAbortRef.current === controller) requestAbortRef.current = null
    }
  }

  function openSocket(session: CreatedChatSession | JoinedChatSession, ticket: string) {
    intentionalCloseRef.current = false
    const socket = new WebSocket(temporaryChatWebSocketUrl(session.websocketPath))
    socketRef.current = socket
    socket.addEventListener('open', () => socket.send(frame('AUTH', { ticket })))
    socket.addEventListener('message', (event) => handleServerFrame(socket, event.data))
    socket.addEventListener('error', () => setNotice('实时连接建立失败，请检查网络后重新创建会话。'))
    socket.addEventListener('close', () => {
      if (!intentionalCloseRef.current) {
        setPhase((current) => current === 'closed' ? current : 'closed')
        setNotice((current) => current ?? '实时连接已结束，本次会话密钥已失效。')
      }
    })
  }

  function handleServerFrame(socket: WebSocket, payload: unknown) {
    if (typeof payload !== 'string') return
    let incoming: ServerFrame
    try {
      incoming = JSON.parse(payload) as ServerFrame
    } catch {
      setNotice('收到无法识别的服务端消息，会话已停止。')
      socket.close(1002, 'invalid frame')
      return
    }
    const data = incoming.data ?? {}
    switch (incoming.type) {
      case 'AUTHENTICATED':
        setRole(data.role === 'CREATOR' ? 'CREATOR' : 'PARTICIPANT')
        setPhase('waiting')
        break
      case 'WAITING_FOR_PEER':
        setPhase('waiting')
        break
      case 'PEER_CONNECTED':
        setPhase('active')
        setNotice(null)
        break
      case 'PING':
        socket.send(frame('PONG', {}))
        break
      case 'CHAT': {
        const text = typeof data.text === 'string' ? data.text : ''
        const sentAt = typeof data.sentAt === 'string' ? data.sentAt : incoming.timestamp
        if (text) {
          setMessages((current) => [...current, {
            id: incoming.correlationId ?? incoming.messageId,
            text,
            mine: false,
            sentAt,
            status: 'delivered',
          }])
          socket.send(frame('ACK', { messageId: incoming.correlationId ?? incoming.messageId }))
        }
        break
      }
      case 'ACK':
        if (incoming.correlationId) updateMessageStatus(incoming.correlationId, 'accepted')
        break
      case 'DELIVERY_ACK':
        if (typeof data.messageId === 'string') updateMessageStatus(data.messageId, 'delivered')
        break
      case 'SESSION_CLOSED':
        intentionalCloseRef.current = true
        setPhase('closed')
        setNotice(closeReasonText(typeof data.reason === 'string' ? data.reason : 'CLOSED'))
        break
      case 'ERROR':
        setNotice(typeof data.detail === 'string' ? data.detail : '会话操作未完成。')
        break
    }
  }

  function updateMessageStatus(id: string, status: ChatMessage['status']) {
    setMessages((current) => current.map((message) => message.id === id ? { ...message, status } : message))
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    const socket = socketRef.current
    if (!text || phase !== 'active' || socket?.readyState !== WebSocket.OPEN) return
    const id = crypto.randomUUID()
    setMessages((current) => [...current, {
      id,
      text,
      mine: true,
      sentAt: new Date().toISOString(),
      status: 'sending',
    }])
    socket.send(frame('CHAT', { text }, id))
    setDraft('')
  }

  function endSession() {
    intentionalCloseRef.current = true
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) socket.send(frame('LEAVE', {}))
    socket?.close(1000, 'user left')
    setPhase('closed')
    setNotice('你已结束本次临时会话。')
  }

  function reset() {
    intentionalCloseRef.current = true
    socketRef.current?.close(1000, 'reset')
    socketRef.current = null
    setPhase('ready')
    setSessionId('')
    setSessionKey(formatSessionKey(fragmentKey))
    setRole(null)
    setMessages([])
    setNotice(null)
    setShareCopied(false)
    setExpiresAt(null)
  }

  function selectMode(nextMode: Mode) {
    if (phase === 'connecting') return
    setMode(nextMode)
    setNotice(null)
    setShareCopied(false)
  }

  async function copyShareLink() {
    const link = `${window.location.origin}/tools/${tool.slug}#key=${encodeURIComponent(sessionKey)}`
    try {
      await navigator.clipboard.writeText(link)
      setShareCopied(true)
      setNotice('邀请链接已复制。密钥只会出现在浏览器地址片段中，不会发送给网页服务器。')
    } catch {
      setNotice('浏览器未允许自动复制，请手动复制会话密钥。')
    }
  }

  const clock = `${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, '0')}`
  const normalizedSessionKey = formatSessionKey(sessionKey)
  const joinKeyReady = SESSION_KEY_PATTERN.test(normalizedSessionKey)
  const submitDisabled = phase === 'connecting' || (mode === 'join' && !joinKeyReady)

  return (
    <div className="temporary-chat">
      <section className="temporary-chat-hero" aria-labelledby="temporary-chat-title">
        <div>
          <span className="temporary-chat-kicker"><i /> PRIVATE RELAY · NO HISTORY</span>
          <h2 id="temporary-chat-title">两个人，一把临时密钥，<br />一段不留档的实时会话。</h2>
          <p>密钥三分钟内等待第二位用户；连接后任意一方三分钟未发送消息，会话立即结束。</p>
          <div className="temporary-chat-badges"><span>双人独占</span><span>消息不落库</span><span>关闭即清空</span></div>
        </div>
        <ChatRouteGraphic phase={phase} />
      </section>

      {phase === 'ready' || phase === 'connecting' ? (
        <section className="temporary-chat-entry">
          <header>
            <span>01</span>
            <div><small>SESSION GATE</small><h3>选择进入方式</h3></div>
            <p>无需注册，称呼只用于标记本次会话。</p>
          </header>
          <div className="temporary-chat-entry-grid">
            <div className="temporary-chat-mode" role="tablist" aria-label="会话方式">
              <button id="temporary-chat-create-tab" type="button" role="tab" aria-controls="temporary-chat-entry-panel" aria-label="创建新会话" aria-selected={mode === 'create'} className={mode === 'create' ? 'is-active' : ''} onClick={() => selectMode('create')}>
                <span className="temporary-chat-mode-icon" aria-hidden="true"><CreateSessionIcon /></span>
                <span><strong>创建新会话</strong><small>生成密钥并邀请另一位用户</small></span>
                <i aria-hidden="true">01</i>
              </button>
              <button id="temporary-chat-join-tab" type="button" role="tab" aria-controls="temporary-chat-entry-panel" aria-label="使用密钥加入" aria-selected={mode === 'join'} className={mode === 'join' ? 'is-active' : ''} onClick={() => selectMode('join')}>
                <span className="temporary-chat-mode-icon" aria-hidden="true"><JoinSessionIcon /></span>
                <span><strong>使用密钥加入</strong><small>输入对方分享的一次性密钥</small></span>
                <i aria-hidden="true">02</i>
              </button>
            </div>
            <form id="temporary-chat-entry-panel" role="tabpanel" aria-labelledby={`temporary-chat-${mode}-tab`} className={`temporary-chat-entry-form mode-${mode}`} onSubmit={handleStart}>
              <div className="temporary-chat-form-heading">
                <span>{mode === 'create' ? 'CREATE' : 'JOIN'}</span>
                <div>
                  <h4>{mode === 'create' ? '创建你的双人通道' : '加入已有会话'}</h4>
                  <p>{mode === 'create' ? '密钥生成后 3 分钟内有效，请及时分享。' : '密钥仅用于本次连接，加入成功后立即失效。'}</p>
                </div>
              </div>
              <div className="temporary-chat-fields">
                <label>
                  <span>你的称呼 <small>可选</small></span>
                  <input value={displayName} maxLength={32} autoComplete="off" placeholder="例如：呵呵" onChange={(event) => setDisplayName(event.target.value)} />
                </label>
                {mode === 'join' ? <label>
                  <span>会话密钥 <small>{joinKeyReady ? '格式正确' : '12 位字符'}</small></span>
                  <input className="temporary-chat-key-input" value={normalizedSessionKey} maxLength={14} required autoFocus autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-invalid={sessionKey.length > 0 && !joinKeyReady} placeholder="XXXX-XXXX-XXXX" onChange={(event) => {
                    setSessionKey(formatSessionKey(event.target.value))
                    setNotice(null)
                  }} />
                </label> : null}
              </div>
              <div className="temporary-chat-form-action">
                <p><span aria-hidden="true"><Icon name="check" /></span> 消息只做实时转发，刷新或关闭页面即清空。</p>
                <button className="temporary-chat-primary" type="submit" disabled={submitDisabled}>
                  {phase === 'connecting' ? <><i className="temporary-chat-spinner" /> 正在连接…</> : mode === 'create' ? <>生成会话密钥 <span aria-hidden="true"><ArrowRightIcon /></span></> : <>验证并加入 <span aria-hidden="true"><ArrowRightIcon /></span></>}
                </button>
              </div>
            </form>
          </div>
          {notice ? <p className="temporary-chat-notice" role="alert">{notice}</p> : null}
        </section>
      ) : (
        <section className="temporary-chat-console">
          <header>
            <div><span className={`temporary-chat-live ${phase}`} /><div><small>{role === 'CREATOR' ? '会话发起人' : '受邀参与者'}</small><h3>{phase === 'active' ? '双方已连接' : phase === 'waiting' ? '等待另一位用户' : '会话已结束'}</h3></div></div>
            <div className="temporary-chat-session-meta"><span>SESSION</span><code>{sessionId.slice(0, 8)}</code></div>
          </header>

          {phase === 'waiting' ? (
            <div className="temporary-chat-waiting">
              <div className="temporary-chat-pulse"><i /><i /><strong>{clock}</strong></div>
              <h4>{role === 'CREATOR' ? '把邀请链接发给另一位用户' : '密钥有效，正在进入会话'}</h4>
              <p>只有第一位加入者能占用参与席位，其他人会被拒绝。</p>
              {role === 'CREATOR' ? <div className="temporary-chat-share"><code>{sessionKey}</code><button type="button" className={shareCopied ? 'is-copied' : ''} onClick={() => void copyShareLink()}>{shareCopied ? '已复制，可直接发送' : '复制邀请链接'}</button></div> : null}
            </div>
          ) : phase === 'closed' ? (
            <div className="temporary-chat-closed">
              <span className="temporary-chat-closed-icon" aria-hidden="true"><Icon name="close" /></span>
              <small>SESSION CLOSED</small>
              <h4>这段临时会话已经结束</h4>
              <p>{notice ?? '会话密钥已失效，本地消息不会保留。'}</p>
              <div><span>密钥已销毁</span><span>消息已清空</span><span>连接已释放</span></div>
              <button type="button" onClick={reset}>重新建立会话 <span><Icon name="arrowRight" /></span></button>
            </div>
          ) : (
            <>
              <div className="temporary-chat-messages" ref={messageListRef} aria-live="polite">
                {messages.length === 0 && phase === 'active' ? <div className="temporary-chat-empty"><span><Icon name="swap" /></span><h4>通道已建立</h4><p>开始发送消息。服务端只即时转发，不提供历史记录。</p></div> : null}
                {messages.map((message) => <article key={message.id} className={message.mine ? 'is-mine' : 'is-peer'}>
                  <div>{message.text}</div>
                  <footer><time>{new Date(message.sentAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>{message.mine ? <span>{message.status === 'delivered' ? '已送达' : message.status === 'accepted' ? '已转发' : '发送中'}</span> : null}</footer>
                </article>)}
              </div>
              {phase === 'active' ? <form className="temporary-chat-composer" onSubmit={sendMessage}>
                <div><textarea value={draft} maxLength={4000} rows={2} placeholder="输入消息，Enter 发送，Shift + Enter 换行" aria-label="聊天消息" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }} /><span>{draft.length} / 4000</span></div>
                <button type="submit" disabled={!draft.trim()}>发送 <span><Icon name="arrowUp" /></span></button>
              </form> : null}
            </>
          )}

          <footer className="temporary-chat-footer">
            <p className={notice && phase !== 'closed' ? 'has-notice' : ''}>{phase === 'closed' ? '本地消息已经清空，可以安全关闭页面。' : notice ?? (phase === 'active' ? '活跃计时只由聊天消息刷新，心跳不会延长会话。' : '页面关闭后，本地消息会立即清空。')}</p>
            {phase !== 'closed' ? <button className="temporary-chat-end" type="button" onClick={endSession}>结束会话</button> : null}
          </footer>
        </section>
      )}
    </div>
  )
}

function frame(type: string, data: Record<string, unknown>, messageId = crypto.randomUUID()) {
  return JSON.stringify({ messageId, type, timestamp: new Date().toISOString(), data })
}

function closeReasonText(reason: string) {
  if (reason === 'JOIN_TIMEOUT') return '三分钟内没有建立双向连接，会话密钥已失效。'
  if (reason.endsWith('_INACTIVE')) return '其中一方三分钟没有发送消息，会话已自动结束。'
  if (reason === 'PEER_DISCONNECTED') return '另一位用户已离开，会话密钥已失效。'
  if (reason.endsWith('_HEARTBEAT_TIMEOUT')) return '其中一方网络连接中断，会话已结束。'
  return '本次临时会话已结束。'
}

const SESSION_KEY_PATTERN = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/

function formatSessionKey(value: string) {
  const characters = value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 12)
  return characters.match(/.{1,4}/g)?.join('-') ?? ''
}

function ChatRouteGraphic({ phase }: { phase: Phase }) {
  const routeLabel = phase === 'active' ? '会话中' : phase === 'waiting' ? '等待中' : phase === 'connecting' ? '连接中' : phase === 'closed' ? '已结束' : '待连接'
  return <div className={`temporary-chat-route is-${phase}`} role="img" aria-label={phase === 'active' ? '两位用户的实时会话通道已连接' : '两位用户通过一次性密钥建立会话'}>
    <span className="temporary-chat-person"><i>A</i><b>发起人</b></span>
    <span className="temporary-chat-line"><i /><i /><i /></span>
    <span className="temporary-chat-lock"><span className="temporary-chat-relay-icon" aria-hidden="true"><SessionLockIcon /></span><small>{routeLabel}</small></span>
    <span className="temporary-chat-line reverse"><i /><i /><i /></span>
    <span className="temporary-chat-person"><i>B</i><b>参与者</b></span>
  </div>
}

function CreateSessionIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
    <circle cx="7.5" cy="7.5" r="3" />
    <path d="M2.8 18.5c.7-3.2 2.5-4.8 4.7-4.8s4 1.6 4.7 4.8" />
    <path d="M17.5 7v7M14 10.5h7" />
  </svg>
}

function JoinSessionIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
    <path d="M13 4.5h6.2v15H13" />
    <path d="M3.5 12h11M11 8.5l3.5 3.5-3.5 3.5" />
  </svg>
}

function SessionLockIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
    <rect x="5.5" y="10" width="13" height="10" rx="2.4" />
    <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
    <circle cx="12" cy="14.7" r="1.1" />
    <path d="M12 15.8v1.5" />
  </svg>
}

function ArrowRightIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
    <path d="M3.5 10h12M11.5 6l4 4-4 4" />
  </svg>
}
