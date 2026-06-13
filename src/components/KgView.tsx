import React from 'react';

import {
  type KgFrame,
  type KgSummary,
  fetchKgFrames,
  fetchKgSummary,
} from '../services/pipelines';
import DocLink from './DocLink';
import { DOCS } from '../docs';

/**
 * The knowledge graph a pipeline produced, made visible: frame counts
 * (the typed nodes), the lexicon status, and a list of the frames
 * themselves. A KG is the durable substrate every pipeline reads from
 * and writes to — this is the "what did it actually build" view.
 */
export default function KgView({ kgId }: { kgId: string }) {
  const [summary, setSummary] = React.useState<KgSummary | null>(null);
  const [frames, setFrames] = React.useState<KgFrame[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setFrames(null);
    setError(null);
    Promise.all([fetchKgSummary(kgId), fetchKgFrames(kgId, 60)])
      .then(([s, f]) => {
        if (cancelled) return;
        setSummary(s);
        setFrames(f);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [kgId]);

  if (error) {
    return <p className="text-[12px] text-status-error-text">Could not load the KG: {error}</p>;
  }
  if (!summary || !frames) {
    return <p className="text-[12px] text-ink-mute">Loading knowledge graph…</p>;
  }

  const fc = summary.frame_counts;
  const kinds = Object.entries(fc.by_kind)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-line bg-surface-alt p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
            Knowledge graph
          </span>
          <span className="text-lg font-semibold text-ink-deep tabular-nums">
            {fc.total} <span className="text-[11px] font-normal text-ink-mute">frames</span>
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
          <Pill label="typed" n={fc.by_lifecycle.typed} tone="ok" />
          <Pill label="provisional" n={fc.by_lifecycle.provisional} tone="warn" />
          <Pill label="untyped" n={fc.by_lifecycle.untyped} tone="mute" />
          {summary.lexicon.present && (
            <span className="rounded bg-chip px-1.5 py-0.5 text-ink-soft border border-line-soft">
              lexicon v{summary.lexicon.version}
            </span>
          )}
        </div>
        {kinds.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-ink-mute">
            {kinds.map(([k, n]) => (
              <span key={k}>
                {k}: <span className="tabular-nums">{n}</span>
              </span>
            ))}
          </div>
        )}
        <p className="mt-2 text-[10px] text-ink-mute">
          <code className="text-[10px]">GET /kgs/{'{id}'}/summary</code> +{' '}
          <DocLink href={DOCS.opKgFrames} title="API reference: GET /kgs/{id}/frames">
            <code className="text-[10px]">/frames</code>
          </DocLink>
          . Each frame is a typed node in the substrate.
        </p>
      </div>

      <ul className="space-y-1.5">
        {frames.length === 0 && (
          <li className="text-[12px] text-ink-mute">
            No frames yet — extraction may still be settling. Reopen in a moment.
          </li>
        )}
        {frames.map((f) => (
          <li key={f.frame_id} className="rounded-lg border border-line bg-white p-2.5">
            <div className="flex items-center gap-2 text-[11px]">
              {f.frame_kind && (
                <span className="rounded bg-chip px-1.5 py-0.5 text-[10px] text-ink-soft border border-line-soft">
                  {f.frame_kind}
                </span>
              )}
              {f.verb && <span className="text-brand-700 font-medium">{f.verb}</span>}
              {f.concept_type && <span className="text-ink-soft">{f.concept_type}</span>}
              <span className="text-ink-mute">{f.lifecycle}</span>
              {typeof f.confidence === 'number' && (
                <span className="ml-auto text-ink-mute tabular-nums">
                  {Math.round(f.confidence * 100)}%
                </span>
              )}
            </div>
            {(f.label || f.description) && (
              <p className="mt-0.5 text-[12px] text-ink-deep">
                {f.label ? <span className="font-medium">{f.label}: </span> : null}
                {f.description}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Pill({ label, n, tone }: { label: string; n: number; tone: 'ok' | 'warn' | 'mute' }) {
  const cls =
    tone === 'ok'
      ? 'bg-status-success-bg text-status-success-text'
      : tone === 'warn'
        ? 'bg-status-warning-bg text-status-warning-text'
        : 'bg-chip text-ink-soft border border-line-soft';
  return (
    <span className={`rounded px-1.5 py-0.5 tabular-nums ${cls}`}>
      {label} {n}
    </span>
  );
}
