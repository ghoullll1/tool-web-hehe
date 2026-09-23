export interface CreatedChatSession {
  sessionId: string
  sessionKey: string
  creatorTicket: string
  expiresAt: string
  serverTime: string
  websocketPath: string
}

export interface JoinedChatSession {
  sessionId: string
  participantTicket: string
  expiresAt: string
  serverTime: string
  websocketPath: string
}

interface ProblemDetails {
  title?: string
  detail?: string
  code?: string
}

export async function createChatSession(displayName: string, signal?: AbortSignal): Promise<CreatedChatSession> {
  return request<CreatedChatSession>('/api/v1/temporary-chat/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: displayName.trim() || null }),
    signal,
  })
}

export async function joinChatSession(sessionKey: string, displayName: string, signal?: AbortSignal): Promise<JoinedChatSession> {
  return request<JoinedChatSession>('/api/v1/temporary-chat/sessions/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionKey: sessionKey.trim(), displayName: displayName.trim() || null }),
    signal,
  })
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' })
  if (response.ok) return response.json() as Promise<T>
  let problem: ProblemDetails | null = null
  try {
    problem = await response.json() as ProblemDetails
  } catch {
    // A stable local message is safer than exposing proxy or upstream response text.
  }
  throw new Error(problem?.detail || problem?.title || '临时会话暂时不可用，请稍后重试。')
}

export function temporaryChatWebSocketUrl(path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}`
}
