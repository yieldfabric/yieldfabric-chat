import React from 'react';

import { newThreadId, streamChat } from '../services/chat';
import DocLink from './DocLink';
import { DOCS } from '../docs';

export interface KgChatAgent {
  /** The agent id passed as `as_agent`. */
  id: string;
  /** Display label. */
  label: string;
}

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  agent?: string;
  sources?: number;
}

/**
 * Chat grounded in a knowledge graph — and optionally AS one of the
 * agents that built it. Each turn is `POST /chat` with `kg_id` set (the
 * reply is grounded in that KG and cites it) and, when an agent is
 * picked, `as_agent` set (the backend loads that agent's persona +
 * the KG context). This is the lightweight, conversational counterpart
 * to starting a whole new reasoning run.
 */
export default function KgChat({
  kgId,
  agents,
  workingGroupId,
}: {
  kgId: string;
  agents: KgChatAgent[];
  workingGroupId?: string | null;
}) {
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState('');
  // Default to chatting AS the first team agent: that path renders the
  // KG into the agent's prompt directly (grounds even ungrouped KGs).
  // "workspace assistant" (no as_agent) grounds best when the KG is in
  // a working group.
  const [agent, setAgent] = React.useState(agents[0]?.id ?? '');
  const [busy, setBusy] = React.useState(false);
  const threadRef = React.useRef<string>(newThreadId());
  const bodyRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const agentLabel = agents.find((a) => a.id === agent)?.label;
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: '', agent: agentLabel },
    ]);

    const setLast = (fn: (m: Msg) => Msg) =>
      setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? fn(m) : m)));

    streamChat(
      {
        message: text,
        thread_id: threadRef.current,
        kg_id: kgId,
        working_group_id: workingGroupId || undefined,
        as_agent: agent || undefined,
        conversation_history: history,
      },
      {
        onChunk: (chunk) => {
          const c = chunk as any;
          const text = typeof c.chunk === 'string' ? c.chunk : '';
          const sources = Array.isArray(c.sources) ? c.sources.length : undefined;
          // The final frame repeats the FULL reply; earlier frames are
          // incremental. Replace on final, append otherwise.
          if (c.is_final) {
            setLast((m) => ({ ...m, content: text || m.content, sources }));
          } else if (text) {
            setLast((m) => ({ ...m, content: m.content + text }));
          }
        },
        onComplete: () => setBusy(false),
        onError: (err) => {
          setLast((m) => ({ ...m, content: m.content || `(error: ${err})` }));
          setBusy(false);
        },
      },
    );
  };

  return (
    <div className="rounded-lg border border-line bg-white">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
          Chat with this KG
        </span>
        {agents.length > 0 && (
          <label className="ml-auto flex items-center gap-1.5 text-[11px] text-ink-soft">
            as
            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              className="rounded-md border border-line bg-white px-1.5 py-1 text-[11px] text-ink focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              <option value="">workspace assistant</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div ref={bodyRef} className="max-h-72 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 && (
          <p className="text-[12px] text-ink-mute">
            Ask the knowledge graph a question — the reply is grounded in it (and cites it). Pick an
            agent above to talk to a specific member of the team.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <div
              className={`inline-block max-w-[88%] rounded-lg px-2.5 py-1.5 text-[12px] leading-relaxed whitespace-pre-wrap text-left ${
                m.role === 'user'
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-alt text-ink-deep border border-line'
              }`}
            >
              {m.role === 'assistant' && m.agent && (
                <span className="block text-[10px] font-semibold text-brand-700 mb-0.5">{m.agent}</span>
              )}
              {m.content || (busy && i === messages.length - 1 ? '…' : '')}
              {typeof m.sources === 'number' && m.sources > 0 && (
                <span className="block mt-0.5 text-[10px] text-ink-mute">{m.sources} source(s)</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 px-3 py-2 border-t border-line">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask the knowledge graph…"
          className="flex-1 rounded-md border border-line bg-white px-2.5 py-1.5 text-[12px] text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? '…' : 'Send'}
        </button>
      </div>
      <p className="px-3 pb-2 text-[10px] text-ink-mute">
        <DocLink href={DOCS.opChat} title="API reference: POST /chat">
          <code className="text-[10px]">POST /chat</code>
        </DocLink>{' '}
        with <code className="text-[10px]">kg_id</code>
        {agents.length > 0 ? (
          <>
            {' '}
            (+ <code className="text-[10px]">as_agent</code> for a team member)
          </>
        ) : null}
        .
      </p>
    </div>
  );
}
