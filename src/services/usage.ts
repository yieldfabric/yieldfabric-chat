/**
 * Token-usage metering, from the agents service's three read endpoints:
 *
 *   GET /api/usage/detail                       — one row per LLM call
 *   GET /api/usage/summary                      — daily rollups (model × feature)
 *   GET /api/usage/calls/{usage_event_id}/log   — audit: full prompt + output
 *
 * Both STREAMING and non-streaming chat/reasoning calls are audited:
 * the agents service records the prompt + accumulated output as the
 * call-log transcript at stream end too, so a streamed chat reply has a
 * full transcript here — not just usage. Embeddings are the one call
 * type with no transcript (no prompt/output to log).
 *
 * Per-message attribution works because the platform stamps every
 * call with the conversation `thread_id`, and ALL calls made while
 * answering one user message (intent classifier, retrieval, the
 * completion itself) share a `request_id`. Filter by thread, group by
 * request_id → one row per message with a per-call breakdown.
 *
 * All three endpoints are entity-scoped server-side: a signed-in user
 * sees exactly their own usage.
 */
import { tokenManager } from '@yieldfabric/wallet'

import { AGENTS_API_URL } from '../config'

function authHeaders(): Record<string, string> {
  const token = tokenManager.getAuthToken({ purpose: 'user' })
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** One LLM call, as returned by GET /api/usage/detail. */
export interface UsageEvent {
  id: string | null
  feature: string
  model: string
  request_id: string | null
  call_type: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  latency_ms: number
  success: boolean
  error_type: string | null
  thread_id: string | null
  created_at: string
}

/** All LLM calls behind ONE user message (grouped by request_id). */
export interface MessageUsage {
  requestId: string
  startedAt: Date
  /** Models touched (usually one; classifier + completion can differ). */
  models: string[]
  promptTokens: number
  completionTokens: number
  totalTokens: number
  /** SUM of per-call latencies — an upper bound on wall time, not the
   *  user-perceived response time. Label it as LLM time in UIs. */
  latencyMs: number
  hasError: boolean
  /** Chronological per-call breakdown. */
  calls: UsageEvent[]
}

export interface ThreadUsage {
  /** Newest first. */
  messages: MessageUsage[]
  /** True when the thread has more events than we paged in — totals
   *  then cover only the most recent calls and must say so. */
  truncated: boolean
}

const DETAIL_PAGE_SIZE = 500
const DETAIL_MAX_PAGES = 4

/** Per-message usage for a conversation. Pages through the detail
 *  endpoint (newest first) up to DETAIL_MAX_PAGES; longer-lived
 *  threads come back with `truncated: true`. */
export async function fetchThreadUsage(threadId: string): Promise<ThreadUsage> {
  const events: UsageEvent[] = []
  let truncated = false
  for (let page = 0; page < DETAIL_MAX_PAGES; page++) {
    const res = await fetch(
      `${AGENTS_API_URL}/api/usage/detail?thread_id=${encodeURIComponent(threadId)}` +
        `&limit=${DETAIL_PAGE_SIZE}&offset=${page * DETAIL_PAGE_SIZE}`,
      { headers: authHeaders() },
    )
    if (!res.ok) {
      throw new Error(`GET /api/usage/detail failed: HTTP ${res.status}`)
    }
    const json = await res.json()
    const batch: UsageEvent[] = json?.data ?? []
    events.push(...batch)
    if (batch.length < DETAIL_PAGE_SIZE) break
    if (page === DETAIL_MAX_PAGES - 1) truncated = true
  }

  const groups = new Map<string, UsageEvent[]>()
  for (const e of events) {
    // request_id is always set in practice; fall back to the row id so
    // a stray null can never merge unrelated calls.
    const key = e.request_id ?? `row-${e.id}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(e)
    else groups.set(key, [e])
  }

  const messages: MessageUsage[] = []
  groups.forEach((calls, requestId) => {
    const ordered = [...calls].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    messages.push({
      requestId,
      startedAt: new Date(ordered[0].created_at),
      models: Array.from(new Set(ordered.map((c) => c.model).filter(Boolean))),
      promptTokens: ordered.reduce((n, c) => n + (c.prompt_tokens || 0), 0),
      completionTokens: ordered.reduce((n, c) => n + (c.completion_tokens || 0), 0),
      totalTokens: ordered.reduce((n, c) => n + (c.total_tokens || 0), 0),
      latencyMs: ordered.reduce((n, c) => n + (c.latency_ms || 0), 0),
      hasError: ordered.some((c) => !c.success),
      calls: ordered,
    })
  })
  messages.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
  return { messages, truncated }
}

/** Per-model aggregation across a set of messages — costs differ per
 *  model, so per-model token counts are the unit that matters. */
export interface ModelAggregate {
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  calls: number
}

export function aggregateByModel(messages: MessageUsage[]): ModelAggregate[] {
  const map = new Map<string, ModelAggregate>()
  for (const m of messages) {
    for (const c of m.calls) {
      const model = c.model || '—'
      const agg =
        map.get(model) ??
        ({ model, promptTokens: 0, completionTokens: 0, totalTokens: 0, calls: 0 } as ModelAggregate)
      agg.promptTokens += c.prompt_tokens || 0
      agg.completionTokens += c.completion_tokens || 0
      agg.totalTokens += c.total_tokens || 0
      agg.calls += 1
      map.set(model, agg)
    }
  }
  return Array.from(map.values()).sort((a, b) => b.totalTokens - a.totalTokens)
}

/** One daily rollup row, as returned by GET /api/usage/summary. */
export interface DailyUsage {
  date: string
  model: string
  feature: string
  calls: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/** Daily rollups for the caller over the trailing `days` window.
 *  Rollups are advanced by a background task (~every 5 minutes) and
 *  aggregate successful calls — very recent activity may not show. */
export async function fetchUsageSummary(days = 7): Promise<DailyUsage[]> {
  const end = new Date()
  const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const res = await fetch(
    `${AGENTS_API_URL}/api/usage/summary?start_date=${fmt(start)}&end_date=${fmt(end)}`,
    { headers: authHeaders() },
  )
  if (!res.ok) {
    throw new Error(`GET /api/usage/summary failed: HTTP ${res.status}`)
  }
  const json = await res.json()
  const rows: Array<{
    date: string
    model: string
    feature: string
    call_count: number
    total_prompt_tokens: number
    total_completion_tokens: number
    total_tokens: number
  }> = json?.data ?? []
  return rows.map((r) => ({
    date: r.date,
    model: r.model,
    feature: r.feature,
    calls: r.call_count,
    promptTokens: r.total_prompt_tokens,
    completionTokens: r.total_completion_tokens,
    totalTokens: r.total_tokens,
  }))
}

/** The audit view of one metered call: exact prompt + output. */
export interface CallLog {
  usageEventId: string
  /** JSON array of the messages sent upstream (role/content shape). */
  promptMessages: unknown
  output: string
  maxTokensRequested: number | null
  createdAt: string | null
}

export async function fetchCallLog(usageEventId: string): Promise<CallLog> {
  const res = await fetch(
    `${AGENTS_API_URL}/api/usage/calls/${encodeURIComponent(usageEventId)}/log`,
    { headers: authHeaders() },
  )
  if (res.status === 404) {
    // Chat/reasoning calls — streaming AND non-streaming — ARE audited, so a
    // missing transcript means one of three things, not "replies aren't
    // logged": (a) it was an embedding (logless by design — no prompt/output),
    // (b) call logging is disabled server-side
    // (agents.metering.call_log_enabled), or (c) the row aged past the 30-day
    // retention window.
    throw new Error(
      'No transcript for this call — it was an embedding (no prompt/output to log), ' +
        'call logging is disabled server-side, or the row aged past the 30-day retention window',
    )
  }
  if (!res.ok) {
    throw new Error(`GET /api/usage/calls/…/log failed: HTTP ${res.status}`)
  }
  const json = await res.json()
  return {
    usageEventId: json.usage_event_id,
    promptMessages: json.prompt_messages,
    output: json.output ?? '',
    maxTokensRequested: json.max_tokens_requested ?? null,
    createdAt: json.created_at ?? null,
  }
}

// ── Cross-surface analytics ──────────────────────────────────────────

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
const windowStart = (days: number) =>
  new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);

/** One (feature, model) group from GET /api/usage/aggregate. */
export interface AggregateGroup {
  feature: string;
  model: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  error_count: number;
  avg_latency_ms: number;
}

export interface UsageAggregate {
  groups: AggregateGroup[];
  totals: {
    calls: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    error_count: number;
  };
}

/** Live, cross-surface usage over the trailing `days` window — every
 *  feature/model the caller touched, including failures and today's
 *  activity (no rollup lag). One query, entity-scoped server-side. The
 *  token counts are real per-(feature, model) sums. */
export async function fetchUsageAggregate(days: number): Promise<UsageAggregate> {
  const res = await fetch(
    `${AGENTS_API_URL}/api/usage/aggregate?start_date=${fmtDate(windowStart(days))}` +
      `&end_date=${fmtDate(new Date())}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error(`GET /api/usage/aggregate failed: HTTP ${res.status}`);
  const json = await res.json();
  return {
    groups: json?.data ?? [],
    totals: json?.totals ?? {
      calls: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      error_count: 0,
    },
  };
}

/** Recent calls across ALL surfaces (no thread filter) for the
 *  activity feed. Newest first. */
export async function fetchRecentActivity(days: number, limit = 100): Promise<UsageEvent[]> {
  const res = await fetch(
    `${AGENTS_API_URL}/api/usage/detail?start_date=${fmtDate(windowStart(days))}` +
      `&end_date=${fmtDate(new Date())}&limit=${Math.min(limit, 500)}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error(`GET /api/usage/detail failed: HTTP ${res.status}`);
  const json = await res.json();
  return json?.data ?? [];
}

/** Human-readable label for a metering `feature` (the raw surface
 *  identifier). Unknown features fall through to the raw value. */
const FEATURE_LABELS: Record<string, string> = {
  chat: 'Chat',
  compat_chat: 'OpenAI /v1 chat',
  compat_embed: 'OpenAI /v1 embeddings',
  builder_assistant: 'Pipeline builder',
  chat_agent: 'Agent persona',
  rag_query: 'RAG query',
  workflow: 'Workflow',
  economy_internal: 'Economy',
  asset_catalog: 'Asset catalog',
};

export function featureLabel(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature;
}

/** 1234 → "1.2k", 1234567 → "1.23M", 999 → "999". */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
