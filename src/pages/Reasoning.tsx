import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@yieldfabric/wallet';

import { type PipelineRun, startReasoning } from '../services/pipelines';
import PipelineRunView from '../components/PipelineRunView';
import ModeNav from '../components/ModeNav';
import DocLink from '../components/DocLink';
import { DOCS } from '../docs';

const WG_KEY = 'yf-working-group';

const EXAMPLES = [
  'Compare two financing structures for a $5M equipment purchase and recommend one.',
  'What are the main risks in a 30-day repo against corporate bonds, and how are they mitigated?',
  'Outline the steps to securitise a pool of auto loans into a simple ABS.',
];

/**
 * Reasoning — start a multi-agent reasoning run and watch it think.
 *
 * `POST /pipelines/run` (kind: reasoning) returns `{run_id, kg_id}`;
 * the run streams its progress over SSE and writes its conclusions
 * into a knowledge graph. The shared `PipelineRunView` renders the
 * live stream and the resulting KG. "Reason over this KG" chains a
 * follow-up run with the result as context (parent_kg_id).
 */
export default function Reasoning() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [problem, setProblem] = React.useState('');
  const [workingGroupId, setWorkingGroupId] = React.useState(
    () => localStorage.getItem(WG_KEY) || '',
  );
  const [team, setTeam] = React.useState(false);
  const [run, setRun] = React.useState<PipelineRun | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    localStorage.setItem(WG_KEY, workingGroupId.trim());
  }, [workingGroupId]);

  const go = async () => {
    const p = problem.trim();
    if (!p || starting) return;
    setStarting(true);
    setError(null);
    setRun(null);
    try {
      const r = await startReasoning({
        problem: p,
        workingGroupId: workingGroupId.trim() || undefined,
        requireTeamFormation: team,
      });
      setRun(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  // Inline "reason over this KG" follow-ups (rendered nested in the run
  // view) start a fresh reasoning run with the KG as context.
  const startChild = (parentKgId: string, followUp: string) =>
    startReasoning({
      problem: followUp,
      workingGroupId: workingGroupId.trim() || undefined,
      parentKgId,
    });

  return (
    <div className="h-screen flex flex-col bg-surface-alt">
      <header className="flex items-center gap-4 px-5 py-3 bg-white border-b border-line">
        <span className="inline-flex items-center gap-2 font-semibold text-ink-deep">
          <span className="h-7 w-7 rounded-lg bg-brand-600 text-white grid place-items-center text-xs font-bold">
            YF
          </span>
          YieldFabric Chat
        </span>
        <ModeNav active="reasoning" />
        <span className="hidden md:inline text-[11px] text-ink-mute">
          multi-agent reasoning ·{' '}
          <DocLink href={DOCS.guideReasoning} title="Following a reasoning run end to end">
            guide
          </DocLink>{' '}
          ·{' '}
          <DocLink href={DOCS.opPipelineRun} title="API reference: POST /pipelines/run">
            API
          </DocLink>
        </span>
        <div className="ml-auto flex items-center gap-3">
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
            <h1 className="text-sm font-semibold text-ink-deep">Multi-agent reasoning</h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
              Pose a hard problem; a team of agents reasons over it and writes its conclusions into
              a <strong>knowledge graph</strong>.{' '}
              <DocLink href={DOCS.opPipelineRun} title="API reference">
                <code className="text-[12px]">POST /pipelines/run</code>
              </DocLink>{' '}
              returns <code className="text-[12px]">{'{run_id, kg_id}'}</code>; the run streams its
              progress over SSE and lands a KG you can read and chat against.
            </p>
          </section>

          <section className="rounded-xl border border-line bg-white p-4 shadow-card">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setProblem(ex)}
                  disabled={starting}
                  className="rounded-full border border-line bg-surface-alt px-2.5 py-1 text-[11px] text-ink-soft hover:bg-chip-hover disabled:opacity-50 text-left"
                >
                  {ex.length > 52 ? ex.slice(0, 52) + '…' : ex}
                </button>
              ))}
            </div>
            <textarea
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              rows={3}
              placeholder="State a problem for the agents to reason about…"
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-brand-200 resize-none"
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={workingGroupId}
                onChange={(e) => setWorkingGroupId(e.target.value)}
                placeholder="working_group_id (optional)"
                className="flex-1 min-w-[200px] rounded-md border border-line bg-white px-2.5 py-1.5 text-[12px] text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
              <label
                className="flex items-center gap-1.5 text-xs text-ink-soft cursor-pointer select-none"
                title="Form a multi-agent team first — pauses the run for your review (waiting_for_input → POST /input)"
              >
                <input
                  type="checkbox"
                  checked={team}
                  onChange={(e) => setTeam(e.target.checked)}
                  className="accent-brand-600"
                />
                multi-agent team
              </label>
              <button
                onClick={go}
                disabled={starting || !problem.trim()}
                className="ml-auto rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {starting ? 'Starting…' : 'Reason'}
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-ink-mute">
              A <code className="text-[10px]">working_group_id</code> grounds the run in that
              workspace's knowledge and makes its KG show up in lists; ungrouped runs still produce a
              KG you can open by id.
            </p>
          </section>

          {error && (
            <div className="rounded-lg border border-status-error-text/20 bg-status-error-bg px-3 py-2 text-[12px] text-status-error-text">
              {error}
            </div>
          )}

          {run && (
            <section>
              <PipelineRunView
                runId={run.run_id}
                kgId={run.kg_id}
                workingGroupId={workingGroupId.trim() || undefined}
                startChild={startChild}
              />
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
