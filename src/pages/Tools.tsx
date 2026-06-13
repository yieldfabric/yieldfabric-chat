import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@yieldfabric/wallet';

import {
  type ChatModel,
  listModels,
} from '../services/chat';
import {
  type ToolChoice,
  type ToolLoopEvent,
  type YfBlock,
  runToolLoop,
} from '../services/v1';
import { CLIENT_TOOLS, clientToolSpecs } from '../tools/clientTools';
import ModeNav from '../components/ModeNav';
import DocLink from '../components/DocLink';
import { DOCS } from '../docs';

const MODEL_KEY = 'yf-chat-model';
const WG_KEY = 'yf-tools-working-group';

const EXAMPLES = [
  'What time is it in Tokyo right now?',
  'What is (1234 × 9) + 17?',
  "What time is it in Oslo, and what's 15% of 240?",
];

const SYSTEM_PROMPT =
  'You are a helpful assistant. Use the provided tools when they help — ' +
  'do not guess at facts (like the current time) or do arithmetic yourself ' +
  'when a tool can do it. After using tools, answer the user directly.';

/**
 * Tool-calling demo on the OpenAI-compatible `/v1` surface.
 *
 * This page calls `POST /v1/chat/completions` with `tools` /
 * `tool_choice` and runs the standard agent loop — the model requests
 * tool calls, the browser executes them (see `src/tools/clientTools.ts`),
 * results are fed back, and the loop repeats until a final answer. Each
 * step is rendered so you can watch the protocol work.
 */
export default function Tools() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [models, setModels] = React.useState<ChatModel[]>([]);
  const [model, setModel] = React.useState<string>(
    () => localStorage.getItem(MODEL_KEY) || 'default'
  );
  const [toolChoice, setToolChoice] = React.useState<ToolChoice>('auto');
  const [prompt, setPrompt] = React.useState('');

  const [yfEnabled, setYfEnabled] = React.useState(false);
  const [workingGroupId, setWorkingGroupId] = React.useState<string>(
    () => localStorage.getItem(WG_KEY) || ''
  );

  const [running, setRunning] = React.useState(false);
  const [submitted, setSubmitted] = React.useState<string | null>(null);
  const [events, setEvents] = React.useState<ToolLoopEvent[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    localStorage.setItem(MODEL_KEY, model);
  }, [model]);
  React.useEffect(() => {
    localStorage.setItem(WG_KEY, workingGroupId.trim());
  }, [workingGroupId]);
  React.useEffect(() => {
    listModels().then(setModels).catch(() => setModels([]));
  }, []);

  const grounding = yfEnabled && workingGroupId.trim().length > 0;

  const run = React.useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || running) return;
      setRunning(true);
      setError(null);
      setEvents([]);
      setSubmitted(message);
      try {
        await runToolLoop({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: message },
          ],
          tools: clientToolSpecs(),
          toolChoice,
          clientTools: CLIENT_TOOLS,
          yf: grounding
            ? { working_group_id: workingGroupId.trim(), builtin_tools: ['rag_search'] }
            : undefined,
          onEvent: (e) => setEvents((prev) => [...prev, e]),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRunning(false);
      }
    },
    [model, toolChoice, grounding, workingGroupId, running]
  );

  return (
    <div className="h-screen flex flex-col bg-surface-alt">
      <header className="flex items-center gap-4 px-5 py-3 bg-white border-b border-line">
        <span className="inline-flex items-center gap-2 font-semibold text-ink-deep">
          <span className="h-7 w-7 rounded-lg bg-brand-600 text-white grid place-items-center text-xs font-bold">
            YF
          </span>
          YieldFabric Chat
        </span>
        <ModeNav active="tools" />
        <span className="hidden md:inline text-[11px] text-ink-mute">
          OpenAI-compatible tool calling ·{' '}
          <DocLink href={DOCS.opV1Chat} title="API reference: POST /v1/chat/completions">
            API
          </DocLink>{' '}
          ·{' '}
          <DocLink href={DOCS.guideV1} title="The /v1 section of the LLM-access guide">
            guide
          </DocLink>
        </span>

        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-ink-soft">
            <DocLink
              href={DOCS.guideModels}
              title="Choosing a model"
              className="text-ink-soft hover:text-brand-600 no-underline"
            >
              Model
            </DocLink>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="rounded-md border border-line bg-white px-2 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              {models.length === 0 && <option value="default">default</option>}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                  {m.default ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </label>
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
          {/* Intro */}
          <section className="rounded-xl border border-line bg-white p-4 shadow-card">
            <h1 className="text-sm font-semibold text-ink-deep">Tool calling on `/v1`</h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
              This page calls{' '}
              <DocLink href={DOCS.opV1Chat} title="API reference">
                <code className="text-[12px]">POST /v1/chat/completions</code>
              </DocLink>{' '}
              — the OpenAI-compatible endpoint — with <code className="text-[12px]">tools</code> and{' '}
              <code className="text-[12px]">tool_choice</code>. The model decides when to call a
              function; your browser runs it (
              <code className="text-[12px]">src/tools/clientTools.ts</code>); the result is fed back
              until a final answer. Watch the loop below.
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-mute">
              The bearer here is your signed-in JWT (the wallet-SDK manages it). A backend service
              would use the official OpenAI SDK unchanged —{' '}
              <code className="text-[11px]">new OpenAI(&#123; baseURL, apiKey: yf_api_… &#125;)</code>{' '}
              — with these exact request shapes.
            </p>
          </section>

          {/* Available tools */}
          <section className="rounded-xl border border-line bg-white p-4 shadow-card">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-2">
              Tools the model can call
            </h2>
            <ul className="space-y-1.5">
              {Object.values(CLIENT_TOOLS).map((t) => (
                <li key={t.spec.function.name} className="flex gap-2 text-[12px]">
                  <code className="shrink-0 rounded bg-chip px-1.5 py-0.5 text-[11px] text-ink-soft border border-line-soft h-fit">
                    {t.spec.function.name}
                  </code>
                  <span className="text-ink-soft">{t.spec.function.description}</span>
                </li>
              ))}
            </ul>

            {/* Advanced: yf extension */}
            <div className="mt-3 pt-3 border-t border-line-soft">
              <label className="flex items-center gap-2 text-[12px] text-ink-soft cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={yfEnabled}
                  onChange={(e) => setYfEnabled(e.target.checked)}
                  className="accent-brand-600"
                />
                Add the <code className="text-[11px]">yf</code> extension — ground answers in a
                workspace + a server-side <code className="text-[11px]">rag_search</code> tool
              </label>
              {yfEnabled && (
                <div className="mt-2 pl-6">
                  <input
                    type="text"
                    value={workingGroupId}
                    onChange={(e) => setWorkingGroupId(e.target.value)}
                    placeholder="working_group_id (a group you're a member of)"
                    className="w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-[12px] text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-brand-200"
                  />
                  <p className="mt-1 text-[11px] text-ink-mute">
                    Membership is enforced server-side. Client tools still run in the browser;{' '}
                    <code className="text-[11px]">rag_search</code> runs on the server and reports
                    back in <code className="text-[11px]">yf.tool_activity</code>.{' '}
                    <DocLink href={DOCS.guideYfExtension} title="The yf extension">
                      docs
                    </DocLink>
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Composer */}
          <section className="rounded-xl border border-line bg-white p-4 shadow-card">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setPrompt(ex)}
                  disabled={running}
                  className="rounded-full border border-line bg-surface-alt px-2.5 py-1 text-[11px] text-ink-soft hover:bg-chip-hover disabled:opacity-50"
                >
                  {ex}
                </button>
              ))}
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run(prompt);
              }}
              rows={2}
              placeholder="Ask something that needs a tool — e.g. the current time, or some arithmetic…"
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-brand-200 resize-none"
            />
            <div className="mt-2 flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-ink-soft">
                tool_choice
                <select
                  value={toolChoice}
                  onChange={(e) => setToolChoice(e.target.value as ToolChoice)}
                  className="rounded-md border border-line bg-white px-2 py-1 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-brand-200"
                  title="auto: model decides · required: must call a tool · none: must not"
                >
                  <option value="auto">auto</option>
                  <option value="required">required</option>
                  <option value="none">none</option>
                </select>
              </label>
              <button
                onClick={() => run(prompt)}
                disabled={running || !prompt.trim()}
                className="ml-auto rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {running ? 'Running…' : 'Run'}
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-ink-mute">
              ⌘/Ctrl+Enter to run. Tool-path requests run buffered (no token streaming) — the
              loop completes server-side, then renders.
            </p>
          </section>

          {/* Trace */}
          {(submitted || error) && (
            <section className="space-y-3">
              {error && (
                <div className="rounded-lg border border-status-error-text/20 bg-status-error-bg px-3 py-2 text-[12px] text-status-error-text">
                  {error}
                </div>
              )}
              {submitted && (
                <div className="rounded-lg border border-line bg-white p-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-mute">
                    you
                  </span>
                  <p className="mt-0.5 text-[13px] text-ink-deep">{submitted}</p>
                </div>
              )}
              <Trace events={events} running={running} />
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

/** Renders the tool-calling loop as a timeline. */
function Trace({ events, running }: { events: ToolLoopEvent[]; running: boolean }) {
  const yfBlocks = events.filter((e): e is Extract<ToolLoopEvent, { kind: 'yf' }> => e.kind === 'yf');
  const finalEvent = events.find(
    (e): e is Extract<ToolLoopEvent, { kind: 'final' }> => e.kind === 'final'
  );

  return (
    <div className="space-y-3">
      {events.map((e, i) => {
        if (e.kind === 'assistant') {
          return (
            <div key={i} className="rounded-lg border border-brand-200 bg-brand-50/40 p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-700">
                  round {e.round + 1} · model requested {e.toolCalls.length} tool call
                  {e.toolCalls.length === 1 ? '' : 's'}
                </span>
                <span className="ml-auto text-[10px] text-ink-mute tabular-nums">
                  finish_reason: tool_calls
                </span>
              </div>
              {e.content && <p className="mb-2 text-[12px] text-ink-soft italic">“{e.content}”</p>}
              <ul className="space-y-1">
                {e.toolCalls.map((c) => (
                  <li key={c.id} className="text-[12px]">
                    <code className="text-brand-700">{c.function.name}</code>
                    <code className="text-ink-mute">({c.function.arguments || '{}'})</code>
                  </li>
                ))}
              </ul>
            </div>
          );
        }
        if (e.kind === 'tool_result') {
          return (
            <div
              key={i}
              className="ml-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                tool result · {e.name} (ran in browser)
              </span>
              <pre className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-ink font-mono bg-white border border-line-soft rounded p-1.5">
                {e.result}
              </pre>
            </div>
          );
        }
        if (e.kind === 'final') {
          return (
            <div key={i} className="rounded-lg border border-line bg-white p-3 shadow-card">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-mute">
                final answer
              </span>
              <p className="mt-1 text-[14px] leading-relaxed text-ink-deep whitespace-pre-wrap">
                {e.content || '(no text)'}
              </p>
              <p className="mt-2 text-[10px] text-ink-mute tabular-nums">
                total usage · {e.usage.prompt_tokens} prompt + {e.usage.completion_tokens} completion
                = {e.usage.total_tokens} tokens
              </p>
            </div>
          );
        }
        return null;
      })}

      {running && !finalEvent && (
        <div className="flex items-center gap-2 text-[12px] text-ink-mute pl-1">
          <span className="h-3 w-3 rounded-full border-2 border-brand-200 border-t-brand-600 animate-spin" />
          calling the model…
        </div>
      )}

      {yfBlocks.length > 0 && <YfPanel blocks={yfBlocks.map((b) => b.yf)} />}
    </div>
  );
}

/** Shows the `yf` extension's server-side activity: grounding sources
 *  and the server-executed builtin tool calls (rag_search). */
function YfPanel({ blocks }: { blocks: YfBlock[] }) {
  const sources = blocks.flatMap((b) => b.sources ?? []);
  const activity = blocks.flatMap((b) => b.tool_activity ?? []);
  const grounded = blocks.some((b) => b.grounded);
  if (!grounded && sources.length === 0 && activity.length === 0) return null;

  return (
    <div className="rounded-lg border border-line bg-surface-alt p-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-mute">
        yf extension · server-side
      </span>
      <div className="mt-1.5 text-[11px] text-ink-soft space-y-1">
        <div>
          grounded: <span className="tabular-nums">{String(grounded)}</span> · sources:{' '}
          <span className="tabular-nums">{sources.length}</span> · server tool calls:{' '}
          <span className="tabular-nums">{activity.length}</span>
        </div>
        {sources.slice(0, 5).map((s, i) => (
          <div key={i} className="truncate text-ink-mute">
            • {String((s as Record<string, unknown>).label ?? (s as Record<string, unknown>).id ?? JSON.stringify(s))}
          </div>
        ))}
      </div>
    </div>
  );
}
