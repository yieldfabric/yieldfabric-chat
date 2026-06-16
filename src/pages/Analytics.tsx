import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@yieldfabric/wallet';

import {
  type AggregateGroup,
  type UsageAggregate,
  type UsageEvent,
  featureLabel,
  fetchRecentActivity,
  fetchUsageAggregate,
  formatTokens,
} from '../services/usage';
import CallAudit from '../components/CallAudit';
import ModeNav from '../components/ModeNav';
import DocLink from '../components/DocLink';
import { DOCS } from '../docs';

const WINDOWS: Array<{ label: string; days: number }> = [
  { label: '24h', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
];

/**
 * Cross-surface analytics — everything the signed-in user has run on
 * YieldFabric, across every surface (native chat, the `/v1` tools
 * endpoint, embeddings, …), live from `GET /api/usage/aggregate`
 * (includes failures and today's calls — no rollup lag; the token
 * totals shown are real per-(feature, model) sums). The
 * per-conversation view stays in the chat Usage drawer; this is the
 * "see everything" view.
 *
 * Each non-embedding row's `audit` drill-down opens the call's exact
 * prompt + output — including STREAMING chat replies (the primary chat
 * path), whose transcript is recorded at stream end. Embeddings stay
 * logless by design (the `auditable = call_type !== 'embed'` guard
 * below), so they show an `embedding` marker instead of an audit button.
 */
export default function Analytics() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [days, setDays] = React.useState(7);
  const [agg, setAgg] = React.useState<UsageAggregate | null>(null);
  const [activity, setActivity] = React.useState<UsageEvent[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [version, setVersion] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setRefreshing(true);
    setError(null);
    Promise.all([fetchUsageAggregate(days), fetchRecentActivity(days, 100)])
      .then(([a, feed]) => {
        if (cancelled) return;
        setAgg(a);
        setActivity(feed);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, version]);

  const totals = agg?.totals;
  const bySurface = agg ? sumBy(agg.groups, (g) => g.feature) : [];
  const byModel = agg ? sumBy(agg.groups, (g) => g.model) : [];

  return (
    <div className="h-screen flex flex-col bg-surface-alt">
      <header className="flex items-center gap-4 px-5 py-3 bg-white border-b border-line">
        <span className="inline-flex items-center gap-2 font-semibold text-ink-deep">
          <span className="h-7 w-7 rounded-lg bg-brand-600 text-white grid place-items-center text-xs font-bold">
            YF
          </span>
          YieldFabric Chat
        </span>
        <ModeNav active="analytics" />
        <div className="ml-auto flex items-center gap-3">
          <div className="inline-flex rounded-lg border border-line bg-surface-alt p-0.5 text-xs">
            {WINDOWS.map((w) => (
              <button
                key={w.days}
                onClick={() => setDays(w.days)}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  days === w.days ? 'bg-white text-ink-deep shadow-sm font-medium' : 'text-ink-soft hover:text-ink'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setVersion((v) => v + 1)}
            disabled={refreshing}
            className="rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-soft hover:bg-chip-hover disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <span className="hidden sm:block text-xs text-ink-mute max-w-[160px] truncate">
            {user?.email}
          </span>
          <button
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
            className="rounded-md px-3 py-1.5 text-xs text-ink-soft hover:text-ink hover:bg-chip-hover"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          <section className="rounded-xl border border-line bg-white p-4 shadow-card">
            <h1 className="text-sm font-semibold text-ink-deep">All your LLM usage</h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
              Every metered call across <strong>every</strong> surface — native chat, the
              OpenAI-compatible <code className="text-[12px]">/v1</code> tools endpoint, embeddings,
              and more — live from{' '}
              <DocLink href={DOCS.opUsageAggregate} title="API reference: GET /api/usage/aggregate">
                <code className="text-[12px]">GET /api/usage/aggregate</code>
              </DocLink>
              . Includes failures and today's activity (unlike the day-bucketed{' '}
              <code className="text-[12px]">summary</code> rollup). Entity-scoped: this is your own
              data.{' '}
              <DocLink href={DOCS.guideMetering} title="Usage-metering guide">
                docs
              </DocLink>
            </p>
          </section>

          {error && (
            <div className="rounded-lg border border-status-error-text/20 bg-status-error-bg px-3 py-2 text-[12px] text-status-error-text">
              {error}
            </div>
          )}

          {/* Headline totals */}
          {totals && (
            <section className="rounded-xl border border-line bg-white p-4 shadow-card">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-ink-soft">
                  {totals.calls} call{totals.calls === 1 ? '' : 's'} · last {days === 1 ? '24h' : `${days}d`}
                  {totals.error_count > 0 && (
                    <span className="ml-1 text-status-error-text">· {totals.error_count} failed</span>
                  )}
                </span>
                <span className="text-2xl font-semibold text-ink-deep tabular-nums">
                  {formatTokens(totals.total_tokens)}
                  <span className="ml-1 text-[11px] font-normal text-ink-mute">tokens</span>
                </span>
              </div>
              <SplitBar prompt={totals.prompt_tokens} completion={totals.completion_tokens} className="mt-2" />
              <div className="mt-1.5 flex justify-between text-[11px] text-ink-mute">
                <span>
                  <Dot className="bg-brand-500" /> prompt {formatTokens(totals.prompt_tokens)}
                </span>
                <span>
                  <Dot className="bg-emerald-500" /> completion {formatTokens(totals.completion_tokens)}
                </span>
              </div>
            </section>
          )}

          {/* Breakdowns */}
          {agg && agg.groups.length === 0 && !refreshing && (
            <p className="text-xs text-ink-mute">No usage in this window. Send a chat or run a tool.</p>
          )}
          {agg && agg.groups.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-4">
              <BreakdownCard
                title="By surface"
                rows={bySurface}
                total={totals?.total_tokens ?? 0}
                label={featureLabel}
              />
              <BreakdownCard
                title="By model"
                rows={byModel}
                total={totals?.total_tokens ?? 0}
                label={(s) => s}
              />
            </div>
          )}

          {/* Recent activity — cross-surface */}
          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-2">
              Recent activity — all surfaces
            </h2>
            {activity === null ? (
              <p className="text-xs text-ink-mute">Loading…</p>
            ) : activity.length === 0 ? (
              <p className="text-xs text-ink-mute">No calls in this window.</p>
            ) : (
              <ul className="space-y-1.5">
                {activity.map((e, i) => (
                  <ActivityRow key={e.id ?? i} event={e} />
                ))}
              </ul>
            )}
          </section>

          <p className="text-[10px] leading-relaxed text-ink-mute border-t border-line-soft pt-3">
            Breakdowns:{' '}
            <DocLink href={DOCS.opUsageAggregate} title="GET /api/usage/aggregate">
              <code className="text-[10px]">GET /api/usage/aggregate</code>
            </DocLink>{' '}
            · activity feed:{' '}
            <DocLink href={DOCS.opUsageDetail} title="GET /api/usage/detail">
              <code className="text-[10px]">GET /api/usage/detail</code>
            </DocLink>{' '}
            · audit:{' '}
            <DocLink href={DOCS.opCallLog} title="GET /api/usage/calls/{id}/log">
              <code className="text-[10px]">…/calls/{'{id}'}/log</code>
            </DocLink>
          </p>
        </div>
      </main>
    </div>
  );
}

interface SummedRow {
  key: string;
  total_tokens: number;
  calls: number;
  error_count: number;
}

/** Sum the aggregate groups by a key (feature or model). */
function sumBy(groups: AggregateGroup[], keyOf: (g: AggregateGroup) => string): SummedRow[] {
  const map = new Map<string, SummedRow>();
  for (const g of groups) {
    const key = keyOf(g) || '—';
    const row = map.get(key) ?? { key, total_tokens: 0, calls: 0, error_count: 0 };
    row.total_tokens += g.total_tokens;
    row.calls += g.calls;
    row.error_count += g.error_count;
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => b.total_tokens - a.total_tokens);
}

function BreakdownCard({
  title,
  rows,
  total,
  label,
}: {
  title: string;
  rows: SummedRow[];
  total: number;
  label: (key: string) => string;
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-card">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-2">{title}</h3>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="flex justify-between text-[12px] text-ink-soft mb-0.5">
              <span className="truncate">
                {label(r.key)}
                <span className="ml-1 text-[10px] text-ink-mute">
                  {r.calls} call{r.calls === 1 ? '' : 's'}
                  {r.error_count > 0 && (
                    <span className="text-status-error-text"> · {r.error_count}✗</span>
                  )}
                </span>
              </span>
              <span className="tabular-nums">{formatTokens(r.total_tokens)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-line-soft overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-400"
                style={{ width: `${total > 0 ? Math.max(2, (r.total_tokens / total) * 100) : 0}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One call in the cross-surface feed, with audit drill-down. */
function ActivityRow({ event }: { event: UsageEvent }) {
  const [auditOpen, setAuditOpen] = React.useState(false);
  // Embeddings have no prompt/output to audit — the server never writes a
  // call-log for them, so offering "audit" only yields a misleading
  // "No log for this call" message. Show a plain marker instead.
  const auditable = event.call_type !== 'embed';
  return (
    <li className="rounded-lg border border-line bg-white p-2.5">
      <div className="flex items-center gap-2 text-[11px] text-ink-soft">
        <span className="text-ink-mute tabular-nums">
          {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span className="rounded bg-chip px-1.5 py-0.5 text-[10px] text-ink-soft border border-line-soft">
          {featureLabel(event.feature)}
        </span>
        <span className="text-ink-mute">{event.model}</span>
        {!event.success && (
          <span className="text-status-error-text">{event.error_type ?? 'failed'}</span>
        )}
        <span className="ml-auto tabular-nums">
          {formatTokens(event.total_tokens)} · {(event.latency_ms / 1000).toFixed(1)}s
        </span>
        {event.id && auditable && (
          <button
            type="button"
            onClick={() => setAuditOpen((v) => !v)}
            className="rounded border border-line px-1.5 py-0.5 text-[10px] text-brand-600 hover:bg-chip-hover"
            title="View the exact prompt and output of this call"
          >
            {auditOpen ? 'hide' : 'audit'}
          </button>
        )}
        {event.id && !auditable && (
          <span
            className="text-[10px] text-ink-mute"
            title="Embedding calls have no prompt/output transcript to audit"
          >
            embedding
          </span>
        )}
      </div>
      {auditOpen && auditable && event.id && <CallAudit usageEventId={event.id} />}
    </li>
  );
}

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
