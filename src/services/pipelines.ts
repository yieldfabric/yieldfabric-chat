/**
 * Pipelines: reasoning runs and file → knowledge-graph ingestion.
 *
 * Both are the SAME skeleton on the agents service:
 *
 *   1. POST to start            → { run_id, kg_id, thread_id? }
 *   2. Stream progress (SSE)    GET /pipelines/{run_id}/events
 *   3. On completion, view the  GET /kgs/{kg_id}/summary  + /frames
 *      knowledge graph it built
 *
 * The only difference is step 1: reasoning posts a problem to
 * `/pipelines/run`; ingestion posts a file to
 * `/pipelines/ingest-document-upload` (the server does all the
 * chunking, embedding, and frame extraction). So this one service
 * powers both the Reasoning and Knowledge tabs, and they share the
 * `PipelineRunView` component.
 *
 * Auth note: POSTs send the JWT as `Authorization: Bearer`. The SSE
 * stream is opened with the browser `EventSource`, which CANNOT set
 * headers — so the JWT goes in the `?access_token=` query parameter
 * (the agents service accepts it there for exactly this reason).
 */
import { tokenManager } from '@yieldfabric/wallet';

import { AGENTS_API_URL } from '../config';

function userToken(): string | null {
  return tokenManager.getAuthToken({ purpose: 'user' });
}

function authHeaders(json = true): Record<string, string> {
  const token = userToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** What every start endpoint returns. */
export interface PipelineRun {
  run_id: string;
  kg_id: string;
  thread_id?: string | null;
}

// ── Starting a run ───────────────────────────────────────────────────

export interface StartReasoningOpts {
  problem: string;
  name?: string;
  workingGroupId?: string | null;
  /** Reason WITH an existing KG as context (chains a child KG). */
  parentKgId?: string | null;
  maxTurns?: number;
  /** Form a multi-agent team first. true → the run PAUSES ALIVE for
   *  your review (a `waiting_for_input` event) which you continue with
   *  POST /pipelines/{run_id}/input — see PipelineRunView. false
   *  (default here) → a linear run with no pause. */
  requireTeamFormation?: boolean;
}

/** Start a multi-agent reasoning run. */
export async function startReasoning(opts: StartReasoningOpts): Promise<PipelineRun> {
  const body = {
    kind: 'reasoning',
    name: opts.name ?? opts.problem.slice(0, 80),
    problem: opts.problem,
    working_group_id: opts.workingGroupId || undefined,
    parent_kg_id: opts.parentKgId || undefined,
    require_team_formation: opts.requireTeamFormation ?? false,
    max_turns: opts.maxTurns ?? 12,
  };
  const res = await fetch(`${AGENTS_API_URL}/pipelines/run`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, 'start reasoning'));
  return res.json();
}

export interface IngestOpts {
  workingGroupId?: string | null;
  /** Add to an existing KG instead of creating a new one. */
  targetKgId?: string | null;
  title?: string;
}

/** Upload a file and turn it into a knowledge graph. The server
 *  chunks, embeds, and extracts frames — you just send the file. */
export async function ingestDocument(file: File, opts: IngestOpts = {}): Promise<PipelineRun> {
  const form = new FormData();
  form.append('file', file);
  if (opts.workingGroupId) form.append('working_group_id', opts.workingGroupId);
  if (opts.targetKgId) form.append('target_kg_id', opts.targetKgId);
  if (opts.title) form.append('title', opts.title);
  const res = await fetch(`${AGENTS_API_URL}/pipelines/ingest-document-upload`, {
    method: 'POST',
    headers: authHeaders(false), // let the browser set the multipart boundary
    body: form,
  });
  if (!res.ok) throw new Error(await readError(res, 'ingest document'));
  return res.json();
}

// ── Streaming progress (SSE) ─────────────────────────────────────────

/**
 * One progress event. The wire is the agents service's
 * `TransformProgress` enum — every frame is `{ "type": "<snake_case>",
 * …fields }`. We type the variants this reference renders; everything
 * else flows through as a generic event the reducer can ignore.
 */
export type PipelineEvent =
  | { type: 'pipeline_started'; kind: string; total_steps: number }
  | { type: 'pipeline_step_started'; step_index: number; step_kind: string; name: string }
  | { type: 'turn_started'; turn: number; input_kind: string; input_label?: string }
  | { type: 'turn_complete'; turn: number; total_nodes: number; total_edges: number }
  | { type: 'agent_invoked'; agent_id: string; turn: number; round: number }
  | { type: 'node_added'; key: string; label: string; node_type: string }
  | { type: 'edge_added'; from: string; to: string; edge_type: string }
  | { type: 'persisted'; nodes: number; edges: number }
  // Running KG totals. NOTE the name: serde's snake_case splits the
  // `KGUpdated` acronym into `k_g_updated` (each capital → its own
  // word), so the wire string is `k_g_updated`, not `kg_updated`.
  | { type: 'k_g_updated'; total_nodes: number; total_edges: number }
  // Human-readable prose the agents emit (the main thing to show).
  | { type: 'transform_extension'; kind: string; payload: { text?: string } & Record<string, unknown> }
  // The run is ALIVE and paused → continue with POST /input. This is
  // the only pause the reasoning/ingest flows emit (incl. team
  // formation and vocab review). `pipeline_checkpoint` (→ POST /resume)
  // is a separate mechanism used only by pipelines with an explicit
  // Checkpoint step — not these flows.
  | { type: 'waiting_for_input'; turn: number; prompt: string; active_agents: string[] }
  | { type: 'pipeline_complete'; run_id: string; kg_id: string; total_nodes: number; total_edges: number }
  | { type: 'pipeline_failed'; run_id: string; phase?: string; error: string }
  | { type: string; [k: string]: unknown };

export interface PipelineEventHandlers {
  onEvent: (event: PipelineEvent) => void;
  /** Connection closed / errored before a terminal event. */
  onError?: (message: string) => void;
}

/**
 * Open the SSE event stream for a run. Returns a close function.
 *
 * `EventSource` auto-reconnects by default, but this endpoint returns
 * 410 once the run's live stream is gone — which would make it
 * reconnect-loop. So we close on the first error (after a terminal
 * event we close proactively in the component). For production you'd
 * add Last-Event-ID resume + dedupe; this keeps the reference clear.
 */
export function openPipelineEvents(runId: string, handlers: PipelineEventHandlers): () => void {
  const token = userToken();
  const url =
    `${AGENTS_API_URL}/pipelines/${encodeURIComponent(runId)}/events` +
    (token ? `?access_token=${encodeURIComponent(token)}` : '');
  const es = new EventSource(url);
  let closed = false;
  const close = () => {
    if (!closed) {
      closed = true;
      es.close();
    }
  };
  es.onmessage = (ev) => {
    if (!ev.data) return;
    try {
      handlers.onEvent(JSON.parse(ev.data) as PipelineEvent);
    } catch {
      /* ignore keep-alive / non-JSON frames */
    }
  };
  es.onerror = () => {
    if (!closed) {
      handlers.onError?.('event stream closed');
      close();
    }
  };
  return close;
}

// ── Steering a live / paused run ─────────────────────────────────────

/** Advance a run paused at `waiting_for_input` (the stream stays open). */
export async function sendInput(
  runId: string,
  input: { kind: 'proceed' | 'done' | 'cancel' } | { kind: 'guidance'; content: string },
): Promise<void> {
  const res = await fetch(`${AGENTS_API_URL}/pipelines/${encodeURIComponent(runId)}/input`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res, 'send input'));
}

// (The reasoning/ingest flows never need POST /pipelines/{id}/resume —
// that's for pipelines with an explicit Checkpoint step, which these
// don't have. Their only human-in-the-loop pause is `waiting_for_input`
// above, advanced with `sendInput`.)

export async function cancelRun(runId: string): Promise<void> {
  await fetch(`${AGENTS_API_URL}/pipelines/${encodeURIComponent(runId)}/cancel`, {
    method: 'POST',
    headers: authHeaders(),
  }).catch(() => undefined);
}

// ── Reading the knowledge graph ──────────────────────────────────────

export interface KgSummary {
  kg_id: string;
  frame_counts: {
    total: number;
    by_lifecycle: { untyped: number; provisional: number; typed: number };
    by_kind: Record<string, number>;
    consolidation_failed: number;
  };
  lexicon: { present: boolean; version: number; quality_warning?: boolean };
}

export interface KgFrame {
  frame_id: string;
  frame_kind?: string;
  lifecycle: string;
  verb?: string;
  concept_type?: string;
  label?: string;
  description: string;
  confidence?: number;
}

export interface KgListItem {
  id: string;
  name: string;
  node_count: number;
  edge_count: number;
  working_group_id?: string | null;
  created_at: string;
}

export async function fetchKgSummary(kgId: string): Promise<KgSummary> {
  const res = await fetch(`${AGENTS_API_URL}/kgs/${encodeURIComponent(kgId)}/summary`, {
    headers: authHeaders(false),
  });
  if (!res.ok) throw new Error(await readError(res, 'kg summary'));
  return res.json();
}

export async function fetchKgFrames(kgId: string, limit = 60): Promise<KgFrame[]> {
  const res = await fetch(
    `${AGENTS_API_URL}/kgs/${encodeURIComponent(kgId)}/frames?limit=${limit}`,
    { headers: authHeaders(false) },
  );
  if (!res.ok) throw new Error(await readError(res, 'kg frames'));
  const json = await res.json();
  return json?.frames ?? [];
}

/** Recent KGs the user can see. NOTE: this lists only KGs scoped to a
 *  working group the user belongs to — an ungrouped run's KG won't
 *  appear here, though you can still open it directly by its kg_id. */
export async function listKgs(): Promise<KgListItem[]> {
  const res = await fetch(`${AGENTS_API_URL}/kgs`, { headers: authHeaders(false) });
  if (!res.ok) throw new Error(await readError(res, 'list kgs'));
  return res.json();
}

async function readError(res: Response, what: string): Promise<string> {
  const body = await res.text().catch(() => '');
  return `${what} failed: HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`;
}
