import React from 'react';

import {
  type PipelineEvent,
  type PipelineRun,
  cancelRun,
  openPipelineEvents,
  sendInput,
} from '../services/pipelines';
import KgView from './KgView';
import KgChat, { type KgChatAgent } from './KgChat';
import DocLink from './DocLink';
import { DOCS } from '../docs';

type Phase = 'running' | 'waiting' | 'complete' | 'failed' | 'closed';

/** An agent on the proposed/selected team (from the `team_setup` event). */
interface TeamAgent {
  id: string;
  display_name?: string;
  role?: string;
  expertise?: string[];
  focus?: string;
  is_core?: boolean;
}

interface RunState {
  narrative: string[];
  activity: string[];
  /** The team, as it forms (from `transform_extension` kind="team_setup"). */
  team: TeamAgent[];
  /** Agents seen actually working, in first-seen order (from `agent_invoked`). */
  agentsSeen: string[];
  nodes: number;
  edges: number;
  phase: Phase;
  waitingPrompt?: string;
  error?: string;
  kgId: string;
}

/** Fold one SSE event into the view state. Pure — easy to read and to
 *  reuse. The wire is the agents service's `TransformProgress` enum
 *  (frames are `{ type, …}`); see services/pipelines.ts. */
function applyEvent(s: RunState, e: PipelineEvent): RunState {
  switch (e.type) {
    case 'pipeline_started':
      return { ...s, activity: [...s.activity, `Run started · ${(e as any).total_steps} steps`] };
    case 'pipeline_step_started':
      return { ...s, activity: [...s.activity, `Step: ${(e as any).name}`] };
    case 'transform_extension': {
      const kind = (e as any).kind;
      const payload = (e as any).payload ?? {};
      // The agents the run forms/selects — the team roster.
      if (kind === 'team_setup' && Array.isArray(payload.agents)) {
        return { ...s, team: payload.agents as TeamAgent[] };
      }
      // Human-readable prose the agents emit.
      if (kind === 'narrative_text' && payload.text) {
        return { ...s, narrative: [...s.narrative, String(payload.text)] };
      }
      return s;
    }
    case 'turn_started':
      return {
        ...s,
        phase: 'running',
        activity: [...s.activity, `Turn ${(e as any).turn} — ${(e as any).input_label ?? (e as any).input_kind}`],
      };
    case 'turn_complete':
      return {
        ...s,
        nodes: (e as any).total_nodes,
        edges: (e as any).total_edges,
        activity: [...s.activity, `Turn ${(e as any).turn} complete`],
      };
    case 'agent_invoked': {
      const id = (e as any).agent_id as string;
      const seen = s.agentsSeen.includes(id) ? s.agentsSeen : [...s.agentsSeen, id];
      return { ...s, agentsSeen: seen, activity: [...s.activity, `Agent ${id} thinking…`] };
    }
    // serde splits the `KGUpdated` acronym → wire name is `k_g_updated`.
    case 'k_g_updated':
    case 'kg_updated':
      return { ...s, nodes: (e as any).total_nodes, edges: (e as any).total_edges };
    case 'persisted':
      return {
        ...s,
        activity: [...s.activity, `Persisted +${(e as any).nodes} nodes, +${(e as any).edges} edges`],
      };
    case 'waiting_for_input':
      return {
        ...s,
        phase: 'waiting',
        waitingPrompt: (e as any).prompt,
      };
    case 'human_input_received':
      return { ...s, phase: 'running', waitingPrompt: undefined, activity: [...s.activity, 'Input received'] };
    case 'pipeline_complete':
      return {
        ...s,
        phase: 'complete',
        kgId: (e as any).kg_id,
        nodes: (e as any).total_nodes,
        edges: (e as any).total_edges,
      };
    case 'pipeline_failed':
      return { ...s, phase: 'failed', error: (e as any).error };
    default:
      return s;
  }
}

const streamTerminal = (e: PipelineEvent) =>
  e.type === 'pipeline_complete' || e.type === 'pipeline_failed';

/** The agents you can chat with: the selected team (rich labels) if one
 *  formed, else whoever actually worked (`agent_invoked`). */
function chatAgents(team: TeamAgent[], agentsSeen: string[]): KgChatAgent[] {
  if (team.length > 0) {
    return team.map((a) => ({
      id: a.id,
      label: a.role ? `${a.display_name || a.id} · ${a.role}` : a.display_name || a.id,
    }));
  }
  return agentsSeen.map((id) => ({ id, label: id.replace(/_/g, ' ') }));
}

const freshState = (kgId: string): RunState => ({
  narrative: [],
  activity: [],
  team: [],
  agentsSeen: [],
  nodes: 0,
  edges: 0,
  phase: 'running',
  kgId,
});

/**
 * Renders a running pipeline (reasoning or ingestion) live: the team of
 * agents as it forms, the agents' narrative, a compact activity log,
 * the growing node/edge counts, the human-in-the-loop pause
 * (`waiting_for_input` → POST /input), and — on completion — the
 * knowledge graph it built, with an inline "reason over this KG"
 * follow-up. Shared by the Reasoning and Knowledge tabs.
 */
export default function PipelineRunView({
  runId,
  kgId,
  workingGroupId,
  startChild,
}: {
  runId: string;
  kgId: string;
  /** Passed to the grounded "Chat with this KG" panel. */
  workingGroupId?: string | null;
  /** When provided, completed runs offer an inline follow-up that
   *  reasons over the resulting KG (parent_kg_id). Returns the child
   *  run to render nested. */
  startChild?: (parentKgId: string, problem: string) => Promise<PipelineRun>;
}) {
  const [busy, setBusy] = React.useState(false);
  const [guidance, setGuidance] = React.useState('');
  const [state, setState] = React.useState<RunState>(() => freshState(kgId));
  const closeRef = React.useRef<null | (() => void)>(null);

  // The follow-up child run, when the user reasons over this KG.
  const [followOpen, setFollowOpen] = React.useState(false);
  const [followProblem, setFollowProblem] = React.useState('');
  const [child, setChild] = React.useState<PipelineRun | null>(null);
  const [followErr, setFollowErr] = React.useState<string | null>(null);

  // (Re)open the SSE stream when the run changes. EventSource is async,
  // so `closeRef` is set before any event can arrive; we close on the
  // first terminal event and on unmount.
  React.useEffect(() => {
    setState(freshState(kgId));
    setChild(null);
    setFollowOpen(false);
    const close = openPipelineEvents(runId, {
      onEvent: (ev) => {
        setState((prev) => applyEvent(prev, ev));
        if (streamTerminal(ev)) closeRef.current?.();
      },
      onError: () =>
        setState((prev) =>
          prev.phase === 'running' || prev.phase === 'waiting' ? { ...prev, phase: 'closed' } : prev,
        ),
    });
    closeRef.current = close;
    return () => close();
  }, [runId, kgId]);

  // waiting_for_input → POST /pipelines/{id}/input (stream stays open).
  const proceed = async () => {
    setBusy(true);
    try {
      const trimmed = guidance.trim();
      if (trimmed) await sendInput(runId, { kind: 'guidance', content: trimmed });
      await sendInput(runId, { kind: 'proceed' });
      setGuidance('');
      setState((prev) => ({ ...prev, phase: 'running', waitingPrompt: undefined }));
    } catch (e) {
      setState((prev) => ({ ...prev, error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    closeRef.current?.();
    await cancelRun(runId);
    setState((prev) => ({ ...prev, phase: 'closed' }));
  };

  const runFollowUp = async () => {
    const p = followProblem.trim();
    if (!p || !startChild) return;
    setBusy(true);
    setFollowErr(null);
    try {
      const c = await startChild(state.kgId, p);
      setChild(c);
      setFollowOpen(false);
      setFollowProblem('');
    } catch (e) {
      setFollowErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Status strip */}
      <div className="flex items-center gap-2 text-[11px]">
        <PhaseChip phase={state.phase} />
        <span className="text-ink-mute tabular-nums">
          {state.nodes} nodes · {state.edges} edges
        </span>
        {(state.phase === 'running' || state.phase === 'waiting') && (
          <button onClick={cancel} className="ml-auto text-ink-mute hover:text-status-error-text">
            cancel
          </button>
        )}
      </div>

      {/* The team of agents, as it forms / who worked */}
      <TeamCard team={state.team} agentsSeen={state.agentsSeen} />

      {/* Agents' narrative */}
      {state.narrative.length > 0 && (
        <div className="rounded-lg border border-line bg-white p-3 space-y-2">
          {state.narrative.map((n, i) => (
            <p key={i} className="text-[13px] leading-relaxed text-ink-deep whitespace-pre-wrap">
              {n}
            </p>
          ))}
        </div>
      )}

      {/* waiting_for_input — live human-in-the-loop (the only pause these
          flows emit; includes team formation / vocab review) */}
      {state.phase === 'waiting' && (
        <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-3">
          <p className="text-[12px] text-ink-deep">{state.waitingPrompt || 'The run is waiting for you.'}</p>
          <textarea
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
            rows={2}
            placeholder="Optional steering — e.g. 'swap the credit analyst for a tax specialist' (POST /input {kind:'guidance'})"
            className="mt-2 w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-[12px] text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-brand-200 resize-none"
          />
          <button
            onClick={proceed}
            disabled={busy}
            className="mt-2 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? 'Sending…' : guidance.trim() ? 'Steer & continue' : 'Continue'}
          </button>
        </div>
      )}

      {state.error && (
        <div className="rounded-lg border border-status-error-text/20 bg-status-error-bg px-3 py-2 text-[12px] text-status-error-text">
          {state.error}
        </div>
      )}
      {state.phase === 'failed' && !state.error && (
        <div className="rounded-lg border border-status-error-text/20 bg-status-error-bg px-3 py-2 text-[12px] text-status-error-text">
          Run failed.
        </div>
      )}
      {state.phase === 'closed' && (
        <p className="text-[11px] text-ink-mute">
          Stream closed before completion. The run may still be finishing — its KG is at{' '}
          <code className="text-[10px]">{state.kgId}</code>.
        </p>
      )}

      {/* Compact activity log */}
      {state.activity.length > 0 && state.phase !== 'complete' && (
        <details className="text-[11px] text-ink-mute">
          <summary className="cursor-pointer hover:text-ink-soft">
            activity ({state.activity.length})
          </summary>
          <ul className="mt-1 space-y-0.5 pl-3">
            {state.activity.slice(-30).map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </details>
      )}

      {/* On completion: the knowledge graph + chat with it (and its
          agents) + an optional new reasoning run over it. */}
      {state.phase === 'complete' && (
        <div className="space-y-3">
          <KgView kgId={state.kgId} />

          {/* Chat with the KG — and AS one of the agents that built it.
              The team surfaced above feeds the chat's agent picker. */}
          <KgChat
            kgId={state.kgId}
            workingGroupId={workingGroupId}
            agents={chatAgents(state.team, state.agentsSeen)}
          />

          {startChild && !child && (
            <div className="rounded-lg border border-line bg-surface-alt p-3">
              {!followOpen ? (
                <button
                  onClick={() => setFollowOpen(true)}
                  className="rounded-md border border-line bg-white px-3 py-1.5 text-xs text-ink hover:bg-chip-hover"
                  title="Start a new reasoning run with this KG as context (parent_kg_id)"
                >
                  Reason over this KG →
                </button>
              ) : (
                <div>
                  <p className="text-[11px] text-ink-soft mb-1.5">
                    A follow-up question — a fresh reasoning run with this KG as context
                    (<code className="text-[10px]">parent_kg_id</code>):
                  </p>
                  <textarea
                    autoFocus
                    value={followProblem}
                    onChange={(e) => setFollowProblem(e.target.value)}
                    rows={2}
                    placeholder="e.g. 'Given the above, what's the worst-case loss and how do we hedge it?'"
                    className="w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-[12px] text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-brand-200 resize-none"
                  />
                  {followErr && <p className="mt-1 text-[11px] text-status-error-text">{followErr}</p>}
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={runFollowUp}
                      disabled={busy || !followProblem.trim()}
                      className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {busy ? 'Starting…' : 'Reason'}
                    </button>
                    <button
                      onClick={() => setFollowOpen(false)}
                      className="rounded-md px-3 py-1.5 text-xs text-ink-soft hover:bg-chip-hover"
                    >
                      cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* The nested follow-up run, reasoning over this KG. */}
          {child && (
            <div className="border-l-2 border-brand-200 pl-3">
              <p className="text-[10px] uppercase tracking-wider text-brand-700 mb-1">
                reasoning over the KG above
              </p>
              <PipelineRunView runId={child.run_id} kgId={child.kg_id} startChild={startChild} />
            </div>
          )}

          <p className="text-[10px] text-ink-mute">
            Streamed from{' '}
            <DocLink href={DOCS.opPipelineEvents} title="API reference: GET /pipelines/{run_id}/events">
              <code className="text-[10px]">GET /pipelines/{'{run_id}'}/events</code>
            </DocLink>{' '}
            (SSE). The same stream powers reasoning and file ingestion.
          </p>
        </div>
      )}
    </div>
  );
}

/** The agent team — the proposed/selected roster (`team_setup`), or who
 *  actually worked (`agent_invoked`) when no explicit team formed. */
function TeamCard({ team, agentsSeen }: { team: TeamAgent[]; agentsSeen: string[] }) {
  if (team.length === 0 && agentsSeen.length === 0) return null;
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-mute">
        Agents {team.length > 0 ? '· selected team' : '· participating'}
      </span>
      {team.length > 0 ? (
        <ul className="mt-1.5 space-y-1.5">
          {team.map((a) => (
            <li key={a.id} className="flex items-start gap-2 text-[12px]">
              <span className="rounded bg-chip px-1.5 py-0.5 text-[11px] text-ink-deep border border-line-soft font-medium h-fit">
                {a.display_name || a.id}
              </span>
              {a.is_core && (
                <span className="rounded bg-brand-50 text-brand-700 px-1.5 py-0.5 text-[10px] h-fit">
                  core
                </span>
              )}
              <span className="text-ink-soft">
                {a.role}
                {a.focus ? ` — ${a.focus}` : ''}
                {a.expertise && a.expertise.length > 0 ? ` (${a.expertise.join(', ')})` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {agentsSeen.map((id) => (
            <span
              key={id}
              className="rounded bg-chip px-1.5 py-0.5 text-[11px] text-ink-soft border border-line-soft"
            >
              {id.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PhaseChip({ phase }: { phase: Phase }) {
  const map: Record<Phase, [string, string]> = {
    running: ['running', 'bg-brand-50 text-brand-700 border-brand-200'],
    waiting: ['waiting for you', 'bg-brand-50 text-brand-700 border-brand-200'],
    complete: ['complete', 'bg-status-success-bg text-status-success-text border-transparent'],
    failed: ['failed', 'bg-status-error-bg text-status-error-text border-transparent'],
    closed: ['closed', 'bg-chip text-ink-soft border-line-soft'],
  };
  const [label, cls] = map[phase];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${cls}`}>
      {(phase === 'running' || phase === 'waiting') && (
        <span className="h-2 w-2 rounded-full border-2 border-current border-t-transparent animate-spin" />
      )}
      {label}
    </span>
  );
}
