import React from 'react';
import { useNavigate } from 'react-router-dom';
import { StandardTerminal } from '@yieldfabric/terminal';
import type { TerminalConfig, TerminalEntry } from '@yieldfabric/terminal';
import { useAuth } from '@yieldfabric/wallet';

import {
  type ChatModel,
  fetchChatHistory,
  listModels,
  newThreadId,
  streamChat,
} from '../services/chat';
import { type ThreadUsage, fetchThreadUsage, formatTokens } from '../services/usage';
import UsageDrawer from '../components/UsageDrawer';
import DocLink from '../components/DocLink';
import ModeNav from '../components/ModeNav';
import { lightTerminalTheme } from '../theme/terminalTheme';
import { AGENTS_API_URL } from '../config';
import { DOCS } from '../docs';

const THREAD_KEY = 'yf-chat-thread-id';
const MODEL_KEY = 'yf-chat-model';

/**
 * The chat screen. The terminal package renders the conversation
 * (streaming text, sources, markdown); this page wires it to
 * YieldFabric with exactly one callback — `onStreamRequest` — plus a
 * thin header for model selection and conversation control.
 *
 * What the wiring demonstrates:
 *   - per-request model selection (`model: "mini" | "default"`)
 *   - fast mode (`reasoning: false`, `skip_rag: true` → direct LLM)
 *   - thread continuity: a client-generated UUID thread id, persisted
 *     per signed-in user; server-side history restores on reload via
 *     `GET /chat/history/{thread_id}`
 */
export default function Chat() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Thread ids are namespaced PER USER. The history endpoint
  // authenticates the caller but does not scope threads to an owner,
  // so a shared global key would restore (and append to) the previous
  // account's conversation on a shared machine.
  const threadStorageKey = user?.id ? `${THREAD_KEY}:${user.id}` : null;
  const [threadId, setThreadId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!threadStorageKey) return;
    setThreadId(localStorage.getItem(threadStorageKey) || newThreadId());
  }, [threadStorageKey]);
  React.useEffect(() => {
    if (threadStorageKey && threadId) {
      localStorage.setItem(threadStorageKey, threadId);
    }
  }, [threadStorageKey, threadId]);

  const [models, setModels] = React.useState<ChatModel[]>([]);
  const [model, setModel] = React.useState<string>(
    () => localStorage.getItem(MODEL_KEY) || 'default'
  );
  const [fastMode, setFastMode] = React.useState(false);
  const [initialHistory, setInitialHistory] = React.useState<TerminalEntry[] | null>(null);

  // ── Token metering ────────────────────────────────────────────────
  // The fetch lives in an effect keyed by (threadId, usageVersion)
  // with a cancellation flag, so a slow response for an old thread —
  // or a refresh timer armed before a thread switch — can never
  // overwrite the new thread's state.
  const [usageOpen, setUsageOpen] = React.useState(false);
  const [threadUsage, setThreadUsage] = React.useState<ThreadUsage | null>(null);
  const [threadUsageError, setThreadUsageError] = React.useState<string | null>(null);
  const [usageRefreshing, setUsageRefreshing] = React.useState(false);
  const [usageVersion, setUsageVersion] = React.useState(0);
  const usageTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestUsageRefresh = React.useCallback(() => setUsageVersion((v) => v + 1), []);

  React.useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    setUsageRefreshing(true);
    setThreadUsageError(null);
    fetchThreadUsage(threadId)
      .then((usage) => {
        if (!cancelled) setThreadUsage(usage);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setThreadUsageError(err instanceof Error ? err.message : String(err));
        setThreadUsage((prev) => prev ?? { messages: [], truncated: false });
      })
      .finally(() => {
        if (!cancelled) setUsageRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [threadId, usageVersion]);

  // Thread switch: drop stale usage state and any pending refresh timer.
  React.useEffect(() => {
    setThreadUsage(null);
    setThreadUsageError(null);
    if (usageTimer.current) {
      clearTimeout(usageTimer.current);
      usageTimer.current = null;
    }
  }, [threadId]);
  React.useEffect(
    () => () => {
      if (usageTimer.current) clearTimeout(usageTimer.current);
    },
    []
  );

  const conversationTokens = (threadUsage?.messages ?? []).reduce(
    (n, m) => n + m.totalTokens,
    0
  );

  React.useEffect(() => {
    localStorage.setItem(MODEL_KEY, model);
  }, [model]);

  // Model catalog — what this YF deployment serves.
  React.useEffect(() => {
    listModels()
      .then(setModels)
      .catch(() => setModels([]));
  }, []);

  // Restore this thread's server-side history once per thread. A
  // failure (agents service down, expired session) must never strand
  // the page on the restoring spinner — surface it in the terminal.
  React.useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    setInitialHistory(null);
    fetchChatHistory(threadId)
      .then((entries) => {
        if (!cancelled) setInitialHistory(entries);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setInitialHistory([
          {
            id: 'history-error',
            type: 'error',
            content:
              `Could not restore conversation history: ${message}. ` +
              `Check that the agents service is reachable at ${AGENTS_API_URL}.`,
            timestamp: new Date(),
          },
        ]);
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  const config = React.useMemo<TerminalConfig>(
    () => ({
      endpoints: [],
      agentsApiUrl: AGENTS_API_URL,
      welcomeMessage:
        'Connected to YieldFabric. Messages stream from the agents service — ' +
        'authenticated, metered, and grounded in your workspace when configured.',
      showWelcomeMessage: true,
    }),
    []
  );

  const onStreamRequest = React.useCallback(
    (
      message: string,
      handlers: {
        onChunk: (chunk: any) => void;
        onComplete: () => void;
        onError: (error: string) => void;
      }
    ) =>
      streamChat(
        {
          message,
          thread_id: threadId,
          model,
          ...(fastMode ? { reasoning: false, skip_rag: true } : {}),
        },
        {
          ...handlers,
          // The backend attaches `page_suggestions` pointing at
          // yieldfabric.com site pages ("Contact & Sales", …). They
          // make sense in YF's own products, not in a standalone app —
          // strip them so the terminal doesn't render foreign
          // navigation cards.
          onChunk: (chunk) => handlers.onChunk({ ...chunk, page_suggestions: undefined }),
          // Refresh metering shortly after the reply lands: the usage
          // writer persists events asynchronously, so give it a beat.
          // The timer only bumps a version — the effect reads the
          // CURRENT thread, so a thread switch can't resurrect stale
          // data (and the switch effect clears the timer anyway).
          onComplete: () => {
            handlers.onComplete();
            if (usageTimer.current) clearTimeout(usageTimer.current);
            usageTimer.current = setTimeout(requestUsageRefresh, 1500);
          },
        }
      ),
    [threadId, model, fastMode, requestUsageRefresh]
  );

  const startNewConversation = () => {
    if (threadStorageKey) localStorage.removeItem(threadStorageKey);
    setThreadId(newThreadId());
  };

  return (
    <div className="h-screen flex flex-col bg-surface-alt">
      <header className="flex items-center gap-4 px-5 py-3 bg-white border-b border-line">
        <span className="inline-flex items-center gap-2 font-semibold text-ink-deep">
          <span className="h-7 w-7 rounded-lg bg-brand-600 text-white grid place-items-center text-xs font-bold">
            YF
          </span>
          YieldFabric Chat
          <span className="hidden md:inline-flex items-center gap-1.5 ml-2 text-[11px] font-normal text-ink-mute">
            tutorial app ·{' '}
            <DocLink href={DOCS.guide} title="The LLM-access guide this app follows">
              guide
            </DocLink>{' '}
            ·{' '}
            <DocLink href={DOCS.agentsApi} title="API reference for every endpoint this app calls">
              API
            </DocLink>
          </span>
        </span>
        <ModeNav active="chat" />

        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-ink-soft">
            <DocLink
              href={DOCS.guideModels}
              title="Choosing a model — per-request selection from GET /api/models"
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

          <label
            className="flex items-center gap-1.5 text-xs text-ink-soft cursor-pointer select-none"
            title="Skip intent classification and retrieval — fastest direct-LLM path"
          >
            <input
              type="checkbox"
              checked={fastMode}
              onChange={(e) => setFastMode(e.target.checked)}
              className="accent-brand-600"
            />
            Fast mode
          </label>

          <button
            onClick={() => setUsageOpen(true)}
            className="rounded-md border border-line bg-white px-3 py-1.5 text-xs text-ink hover:bg-chip-hover tabular-nums"
            title="Token usage for this conversation"
          >
            Usage{conversationTokens > 0 ? ` · ${formatTokens(conversationTokens)}` : ''}
          </button>

          <button
            onClick={startNewConversation}
            className="rounded-md border border-line bg-white px-3 py-1.5 text-xs text-ink hover:bg-chip-hover"
          >
            New conversation
          </button>

          <span className="hidden sm:block text-xs text-ink-mute max-w-[180px] truncate">
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

      <main className="flex-1 min-h-0 p-4 flex flex-col">
        <div className="flex-1 min-h-0 max-w-4xl w-full mx-auto rounded-xl border border-line bg-white shadow-card overflow-hidden">
          {threadId === null || initialHistory === null ? (
            <div className="h-full grid place-items-center text-sm text-ink-mute">
              Restoring conversation…
            </div>
          ) : (
            <StandardTerminal
              key={threadId}
              config={config}
              // The terminal's default theme is DARK; on this light
              // page we pass the light overrides (src/theme/) — the
              // same pattern the first-party app uses.
              theme={lightTerminalTheme}
              // The app renders its own header above; the terminal's
              // built-in chrome bar would double it.
              showHeader={false}
              initialHistory={initialHistory}
              onStreamRequest={onStreamRequest}
              // Hide the terminal's built-in Auto/Reason selector: this
              // example doesn't wire multi-agent reasoning (that's
              // `POST /pipelines/run` — see the README's "Where to go
              // from here"), and a visible control must never be a
              // no-op in a reference app. Note: the slot uses `??`, so
              // pass a fragment — `null` would NOT suppress it.
              slots={{ modeSelector: <></> }}
              className="h-full"
            />
          )}
        </div>
        <p className="max-w-4xl w-full mx-auto mt-2 px-1 text-[10px] text-ink-mute">
          This conversation streams via{' '}
          <DocLink href={DOCS.opChat} title="API reference: POST /chat">
            <code className="text-[10px]">POST /chat</code>
          </DocLink>{' '}
          (SSE) and restores via{' '}
          <DocLink href={DOCS.opChatHistory} title="API reference: GET /chat/history/{thread_id}">
            <code className="text-[10px]">GET /chat/history/{'{thread_id}'}</code>
          </DocLink>
          {' — '}
          <DocLink href={DOCS.guideHistory} title="How chat persistence works">
            how persistence works
          </DocLink>
        </p>
      </main>

      <UsageDrawer
        open={usageOpen}
        onClose={() => setUsageOpen(false)}
        threadUsage={threadUsage}
        threadUsageError={threadUsageError}
        onRefresh={requestUsageRefresh}
        refreshing={usageRefreshing}
        refreshVersion={usageVersion}
      />
    </div>
  );
}
