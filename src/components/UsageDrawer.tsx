import React from 'react';

import {
  type CallLog,
  type DailyUsage,
  type ThreadUsage,
  type UsageEvent,
  aggregateByModel,
  fetchCallLog,
  fetchUsageSummary,
  formatTokens,
} from '../services/usage';
import DocLink from './DocLink';
import { DOCS } from '../docs';

/**
 * Right-side metering drawer.
 *
 * "This conversation": totals, the PER-MODEL aggregation (costs
 * differ per model — these are the numbers a billing-aware partner
 * needs), then one row per user message (all LLM calls of a message
 * share a request_id) with an expandable per-call breakdown. Each
 * call can be opened into its AUDIT view — the exact prompt messages
 * and output, from GET /api/usage/calls/{usage_event_id}/log.
 *
 * "Last 7 days": the caller's rollups by model and feature. Rollups
 * are advanced by a background task (~every 5 minutes) and aggregate
 * successful calls, so very recent activity can lag here while
 * already visible above.
 */
export default function UsageDrawer({
  open,
  onClose,
  threadUsage,
  threadUsageError,
  onRefresh,
  refreshing,
  refreshVersion,
}: {
  open: boolean;
  onClose: () => void;
  threadUsage: ThreadUsage | null;
  threadUsageError: string | null;
  onRefresh: () => void;
  refreshing: boolean;
  /** Bumped by the parent on every refresh — re-fetches the summary. */
  refreshVersion: number;
}) {
  const [summary, setSummary] = React.useState<DailyUsage[] | null>(null);
  const [summaryError, setSummaryError] = React.useState<string | null>(null);
  const closeRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSummaryError(null);
    fetchUsageSummary(7)
      .then((rows) => {
        if (!cancelled) setSummary(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setSummaryError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open, refreshVersion]);

  // Basic dialog behavior: Escape closes, focus lands inside.
  React.useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const messages = threadUsage?.messages ?? [];
  const totals = messages.reduce(
    (acc, m) => ({
      prompt: acc.prompt + m.promptTokens,
      completion: acc.completion + m.completionTokens,
      total: acc.total + m.totalTokens,
    }),
    { prompt: 0, completion: 0, total: 0 }
  );
  const byModel = aggregateByModel(messages);

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Token usage">
      <div className="absolute inset-0 bg-ink-deep/20" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-lg bg-white border-l border-line shadow-card flex flex-col">
        <header className="flex items-center gap-3 px-5 py-4 border-b border-line">
          <div>
            <h2 className="text-sm font-semibold text-ink-deep">Usage &amp; metering</h2>
            <p className="text-[11px] text-ink-mute">
              Every LLM call is metered per user — this is your own data, scoped server-side.{' '}
              <DocLink href={DOCS.guideMetering} title="The usage-metering guide">
                docs
              </DocLink>
            </p>
          </div>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="ml-auto rounded-md border border-line px-2.5 py-1 text-xs text-ink-soft hover:bg-chip-hover disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-chip-hover"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* ── This conversation ─────────────────────────────── */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-2">
              This conversation
            </h3>

            {threadUsageError ? (
              <p className="text-xs text-status-error-text">
                Could not load usage: {threadUsageError}
              </p>
            ) : threadUsage === null ? (
              <p className="text-xs text-ink-mute">Loading…</p>
            ) : messages.length === 0 ? (
              <p className="text-xs text-ink-mute">
                No metered calls yet — send a message and refresh. (Usage events are written
                asynchronously and can trail a reply by a moment.)
              </p>
            ) : (
              <>
                <div className="rounded-lg border border-line bg-surface-alt p-3 mb-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-ink-soft">
                      {messages.length} message{messages.length === 1 ? '' : 's'}
                      {threadUsage.truncated && (
                        <span className="ml-1 text-ink-mute">(most recent — older calls not shown)</span>
                      )}
                    </span>
                    <span className="text-lg font-semibold text-ink-deep tabular-nums">
                      {formatTokens(totals.total)}
                      <span className="ml-1 text-[11px] font-normal text-ink-mute">tokens</span>
                    </span>
                  </div>
                  <SplitBar prompt={totals.prompt} completion={totals.completion} className="mt-2" />
                  <div className="mt-1.5 flex justify-between text-[11px] text-ink-mute">
                    <span>
                      <Dot className="bg-brand-500" /> prompt {formatTokens(totals.prompt)}
                    </span>
                    <span>
                      <Dot className="bg-emerald-500" /> completion {formatTokens(totals.completion)}
                    </span>
                  </div>
                </div>

                {/* Per-model aggregation — the unit that maps to cost. */}
                {byModel.length > 0 && (
                  <div className="rounded-lg border border-line p-3 mb-3">
                    <h4 className="text-[11px] text-ink-mute mb-2">By model</h4>
                    <ul className="space-y-2">
                      {byModel.map((m) => (
                        <li key={m.model}>
                          <div className="flex items-center justify-between text-[12px] mb-0.5">
                            <span className="rounded bg-chip px-1.5 py-0.5 text-[11px] text-ink-soft border border-line-soft">
                              {m.model}
                            </span>
                            <span className="tabular-nums font-medium text-ink-deep">
                              {formatTokens(m.totalTokens)}
                              <span className="ml-1 font-normal text-[10px] text-ink-mute">
                                ({m.calls} call{m.calls === 1 ? '' : 's'})
                              </span>
                            </span>
                          </div>
                          <SplitBar prompt={m.promptTokens} completion={m.completionTokens} />
                          <div className="mt-0.5 text-[10px] text-ink-mute tabular-nums">
                            ↑ {formatTokens(m.promptTokens)} prompt · ↓{' '}
                            {formatTokens(m.completionTokens)} completion
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <ul className="space-y-2">
                  {messages.map((m) => (
                    <MessageRow key={m.requestId} usage={m} />
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* ── Last 7 days ───────────────────────────────────── */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-2">
              Last 7 days — all conversations
            </h3>
            {summaryError ? (
              <p className="text-xs text-status-error-text">{summaryError}</p>
            ) : summary === null ? (
              <p className="text-xs text-ink-mute">Loading…</p>
            ) : summary.length === 0 ? (
              <p className="text-xs text-ink-mute">
                No rolled-up usage yet. Daily rollups update every few minutes — recent calls
                appear above first.
              </p>
            ) : (
              <SummaryBreakdown rows={summary} />
            )}
          </section>

          <p className="text-[10px] leading-relaxed text-ink-mute border-t border-line-soft pt-3">
            Source:{' '}
            <DocLink href={DOCS.opUsageDetail} title="API reference: GET /api/usage/detail">
              <code className="text-[10px]">GET /api/usage/detail?thread_id=…</code>
            </DocLink>{' '}
            grouped by <code className="text-[10px]">request_id</code> (all LLM calls answering one
            message share one); audit via{' '}
            <DocLink href={DOCS.opCallLog} title="API reference: GET /api/usage/calls/{id}/log">
              <code className="text-[10px]">GET /api/usage/calls/{'{id}'}/log</code>
            </DocLink>
            ; rollups via{' '}
            <DocLink href={DOCS.opUsageSummary} title="API reference: GET /api/usage/summary">
              <code className="text-[10px]">GET /api/usage/summary</code>
            </DocLink>{' '}
            (updated ~every 5 minutes, successful calls only).
          </p>
        </div>
      </aside>
    </div>
  );
}

/** One user message: total + split bar + expandable per-call detail
 *  with the per-call audit view behind it. */
function MessageRow({ usage }: { usage: import('../services/usage').MessageUsage }) {
  const [expanded, setExpanded] = React.useState(false);
  const multi = usage.calls.length > 1;
  return (
    <li className="rounded-lg border border-line p-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-ink-mute tabular-nums">
            {usage.startedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {usage.models.map((model) => (
            <span
              key={model}
              className="rounded bg-chip px-1.5 py-0.5 text-[10px] text-ink-soft border border-line-soft"
            >
              {model}
            </span>
          ))}
          {usage.hasError && (
            <span className="rounded bg-status-error-bg px-1.5 py-0.5 text-[10px] text-status-error-text">
              error
            </span>
          )}
          <span className="ml-auto text-sm font-semibold text-ink-deep tabular-nums">
            {formatTokens(usage.totalTokens)}
          </span>
        </div>
        <SplitBar prompt={usage.promptTokens} completion={usage.completionTokens} className="mt-2" />
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-mute">
          <span>
            ↑ {formatTokens(usage.promptTokens)} · ↓ {formatTokens(usage.completionTokens)}
          </span>
          <span title="Sum of per-call LLM latencies (upper bound on wall time)">
            llm {(usage.latencyMs / 1000).toFixed(1)}s
            <span className="ml-2 text-brand-600">
              {multi ? `${usage.calls.length} calls` : 'detail'} {expanded ? '▾' : '▸'}
            </span>
          </span>
        </div>
      </button>

      {expanded && (
        <ul className="mt-2 border-t border-line-soft pt-2 space-y-1.5">
          {usage.calls.map((c, i) => (
            <CallRow key={c.id ?? i} call={c} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** One LLM call: feature/type/tokens + the prompt/output audit view. */
function CallRow({ call }: { call: UsageEvent }) {
  const [auditOpen, setAuditOpen] = React.useState(false);
  return (
    <li>
      <div className="flex items-center gap-2 text-[11px] text-ink-soft">
        <span className="rounded bg-surface-alt px-1.5 py-0.5 border border-line-soft">
          {call.feature}
        </span>
        <span className="text-ink-mute">{call.call_type}</span>
        <span className="rounded bg-chip px-1 py-0.5 text-[10px] text-ink-mute">{call.model}</span>
        {!call.success && (
          <span className="text-status-error-text">{call.error_type ?? 'failed'}</span>
        )}
        <span className="ml-auto tabular-nums">
          {formatTokens(call.total_tokens)} · {(call.latency_ms / 1000).toFixed(1)}s
        </span>
        {call.id && (
          <button
            type="button"
            onClick={() => setAuditOpen((v) => !v)}
            className="rounded border border-line px-1.5 py-0.5 text-[10px] text-brand-600 hover:bg-chip-hover"
            title="View the exact prompt and output of this call"
          >
            {auditOpen ? 'hide' : 'audit'}
          </button>
        )}
      </div>
      {auditOpen && call.id && <CallAudit usageEventId={call.id} />}
    </li>
  );
}

/** Lazy-loaded audit panel: the exact prompt messages + output. */
function CallAudit({ usageEventId }: { usageEventId: string }) {
  const [log, setLog] = React.useState<CallLog | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetchCallLog(usageEventId)
      .then((l) => {
        if (!cancelled) setLog(l);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [usageEventId]);

  if (error) {
    return <p className="mt-1.5 text-[11px] text-status-warning-text">{error}</p>;
  }
  if (!log) {
    return <p className="mt-1.5 text-[11px] text-ink-mute">Loading audit log…</p>;
  }

  const prompts: Array<{ role?: string; content?: string }> = Array.isArray(log.promptMessages)
    ? (log.promptMessages as Array<{ role?: string; content?: string }>)
    : [];

  return (
    <div className="mt-1.5 rounded-md border border-line bg-surface-alt p-2 space-y-1.5">
      <div className="max-h-56 overflow-y-auto space-y-1.5">
        {prompts.length > 0 ? (
          prompts.map((m, i) => (
            <div key={i}>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-ink-mute">
                {m.role ?? 'message'}
              </span>
              <pre className="mt-0.5 whitespace-pre-wrap break-words text-[10px] leading-relaxed text-ink font-mono bg-white border border-line-soft rounded p-1.5">
                {typeof m.content === 'string' ? m.content : JSON.stringify(m, null, 2)}
              </pre>
            </div>
          ))
        ) : (
          <pre className="whitespace-pre-wrap break-words text-[10px] leading-relaxed text-ink font-mono bg-white border border-line-soft rounded p-1.5">
            {JSON.stringify(log.promptMessages, null, 2)}
          </pre>
        )}
        <div>
          <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-700">
            output
          </span>
          <pre className="mt-0.5 whitespace-pre-wrap break-words text-[10px] leading-relaxed text-ink font-mono bg-white border border-line-soft rounded p-1.5">
            {log.output || '(empty)'}
          </pre>
        </div>
      </div>
      {log.maxTokensRequested !== null && (
        <p className="text-[10px] text-ink-mute">max_tokens requested: {log.maxTokensRequested}</p>
      )}
    </div>
  );
}

/** 7-day rollups: total, then proportion bars by model and by feature. */
function SummaryBreakdown({ rows }: { rows: DailyUsage[] }) {
  const total = rows.reduce((n, r) => n + r.totalTokens, 0);
  const calls = rows.reduce((n, r) => n + r.calls, 0);
  const byKey = (key: 'model' | 'feature') => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const k = r[key] || '—';
      map.set(k, (map.get(k) ?? 0) + r.totalTokens);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-surface-alt p-3 flex items-baseline justify-between">
        <span className="text-xs text-ink-soft">{calls} LLM calls</span>
        <span className="text-lg font-semibold text-ink-deep tabular-nums">
          {formatTokens(total)}
          <span className="ml-1 text-[11px] font-normal text-ink-mute">tokens</span>
        </span>
      </div>
      <ProportionList title="By model" entries={byKey('model')} total={total} />
      <ProportionList title="By feature" entries={byKey('feature')} total={total} />
    </div>
  );
}

function ProportionList({
  title,
  entries,
  total,
}: {
  title: string;
  entries: Array<[string, number]>;
  total: number;
}) {
  return (
    <div>
      <h4 className="text-[11px] text-ink-mute mb-1.5">{title}</h4>
      <ul className="space-y-1.5">
        {entries.map(([label, tokens]) => (
          <li key={label}>
            <div className="flex justify-between text-[11px] text-ink-soft mb-0.5">
              <span className="truncate">{label}</span>
              <span className="tabular-nums">{formatTokens(tokens)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-line-soft overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-400"
                style={{ width: `${total > 0 ? Math.max(2, (tokens / total) * 100) : 0}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal prompt/completion proportion bar. */
function SplitBar({
  prompt,
  completion,
  className,
}: {
  prompt: number;
  completion: number;
  className?: string;
}) {
  const total = prompt + completion;
  const promptPct = total > 0 ? (prompt / total) * 100 : 0;
  const completionPct = total > 0 ? 100 - promptPct : 0;
  return (
    <div className={`h-1.5 rounded-full bg-line-soft overflow-hidden flex ${className ?? ''}`}>
      <div className="h-full bg-brand-500" style={{ width: `${promptPct}%` }} />
      <div className="h-full bg-emerald-500" style={{ width: `${completionPct}%` }} />
    </div>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={`inline-block h-2 w-2 rounded-full align-middle mr-1 ${className}`} />;
}
