/**
 * The whole YieldFabric chat integration, in one file.
 *
 * Three endpoints on the agents service:
 *
 *   POST /chat                     — send a message, stream the reply (SSE)
 *   GET  /api/models               — which models this deployment serves
 *   GET  /chat/history/{thread_id} — restore a conversation
 *
 * Auth is a bearer JWT minted by the wallet-SDK at login; every call
 * here reads it from the SDK's `tokenManager`. The SSE wire handling
 * (fetch + TextDecoder loop, abort, error surfacing) is delegated to
 * the terminal package's `handleSSEStream` so this file stays at the
 * "what to send" level.
 */
import { handleSSEStream } from '@yieldfabric/terminal'
import type { StreamChunk, TerminalEntry } from '@yieldfabric/terminal'
import { tokenManager } from '@yieldfabric/wallet'

import { AGENTS_API_URL } from '../config'

/** Request body for `POST /chat`. Subset of the full ChatRequest —
 *  see the agents API reference for every field. */
export interface ChatStreamBody {
  message: string
  /** Conversation thread (client-generated UUID; the server persists
   *  turns under it so history survives reloads). */
  thread_id?: string | null
  /** Which configured model serves this request: a registry id
   *  (`"default"`, `"mini"`) or a deployment name. Catalog at
   *  `GET /api/models`. */
  model?: string
  /** Prior turns for stateless calls (not needed when thread_id is
   *  used — the server keeps its own memory per thread). */
  conversation_history?: Array<{ role: string; content: string }>
  /** `false` skips the intent classifier — fastest path to the LLM. */
  reasoning?: boolean | null
  /** `true` skips RAG retrieval — pure LLM, no workspace grounding. */
  skip_rag?: boolean
  /** Per-request output-token cap (server-clamped). */
  max_output_tokens?: number
  /** Ground the reply in a single knowledge graph — answers cite it.
   *  Used by the "Chat with this KG" panel. */
  kg_id?: string | null
  /** Workspace scope (improves grounding when the KG is in a group). */
  working_group_id?: string | null
  /** Reply AS a specific agent (e.g. one of a reasoning run's team).
   *  The backend loads that agent's persona + the KG context. */
  as_agent?: string
}

export interface ChatStreamHandlers {
  onChunk: (chunk: StreamChunk) => void
  onComplete: () => void
  onError: (error: string) => void
}

function authHeaders(): Record<string, string> {
  // Explicit `purpose: 'user'`: chat threads and history are scoped to
  // the signed-in user's identity. The legacy `getCurrentToken()`
  // silently prefers a group-delegation token when one is installed —
  // which would route this user's conversation under the group
  // identity. Always name the purpose at the call site.
  const token = tokenManager.getAuthToken({ purpose: 'user' })
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Send one message and stream the assistant's reply. */
export function streamChat(
  body: ChatStreamBody,
  handlers: ChatStreamHandlers,
  options?: { signal?: AbortSignal },
): Promise<void> {
  return handleSSEStream(
    `${AGENTS_API_URL}/chat`,
    body,
    handlers.onChunk,
    handlers.onComplete,
    handlers.onError,
    { headers: authHeaders(), signal: options?.signal },
  )
}

export interface ChatModel {
  /** Stable id to pass as `model`: `default`, `mini`, … */
  id: string
  /** Upstream deployment name (display only). */
  model: string
  kind: 'chat' | 'embedding'
  default: boolean
}

/** The model catalog this YF deployment serves. */
export async function listModels(): Promise<ChatModel[]> {
  const res = await fetch(`${AGENTS_API_URL}/api/models`, {
    headers: authHeaders(),
  })
  if (!res.ok) {
    throw new Error(`GET /api/models failed: HTTP ${res.status}`)
  }
  const json = await res.json()
  const models: ChatModel[] = json?.data ?? []
  return models.filter((m) => m.kind === 'chat')
}

/** Restore a conversation: server-side history → TerminalEntry[].
 *
 *  A brand-new thread is HTTP 200 with an empty `messages` array, so
 *  any non-OK status here is a real failure: auth problems are thrown
 *  (the caller should surface them), anything else is logged and
 *  treated as no history so a transient server hiccup doesn't block
 *  the UI. */
export async function fetchChatHistory(threadId: string): Promise<TerminalEntry[]> {
  const res = await fetch(
    `${AGENTS_API_URL}/chat/history/${encodeURIComponent(threadId)}?limit=100`,
    { headers: authHeaders() },
  )
  if (res.status === 401 || res.status === 403) {
    throw new Error('Not authorized to load history — your session may have expired')
  }
  if (!res.ok) {
    console.warn(`GET /chat/history failed: HTTP ${res.status}`)
    return []
  }
  const json = await res.json()
  const messages: Array<{ role: string; content: string; created_at: string }> =
    json?.messages ?? []
  return messages.map((m, index) => ({
    id: `history-${index}`,
    type: m.role === 'user' ? 'command' : 'response',
    content: m.content,
    timestamp: new Date(m.created_at),
  }))
}

/** Fresh client-side conversation id. */
export function newThreadId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // Older browsers: RFC4122-ish fallback, good enough for a thread key.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
