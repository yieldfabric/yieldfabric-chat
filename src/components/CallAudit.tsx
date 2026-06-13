import React from 'react';

import { type CallLog, fetchCallLog } from '../services/usage';

/**
 * Lazy-loaded audit panel for one metered LLM call: the exact prompt
 * messages and output, from `GET /api/usage/calls/{id}/log`. Shared by
 * the conversation usage drawer and the cross-surface Analytics feed.
 */
export default function CallAudit({ usageEventId }: { usageEventId: string }) {
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
