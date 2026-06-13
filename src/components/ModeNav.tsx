import React from 'react';
import { Link } from 'react-router-dom';

/** Segmented nav across the demo surfaces:
 *   Chat      → native POST /chat (SSE) via the terminal package
 *   Tools     → OpenAI-compatible POST /v1/chat/completions with tools
 *   Reasoning → multi-agent run (POST /pipelines/run, kind: reasoning)
 *   Knowledge → file → KG (POST /pipelines/ingest-document-upload)
 *   Analytics → cross-surface usage (GET /api/usage/aggregate) */
export type ModeNavTab = 'chat' | 'tools' | 'reasoning' | 'knowledge' | 'analytics';

export default function ModeNav({ active }: { active: ModeNavTab }) {
  const base = 'px-2.5 py-1 rounded-md transition-colors whitespace-nowrap';
  const on = 'bg-white text-ink-deep shadow-sm font-medium';
  const off = 'text-ink-soft hover:text-ink';
  const cls = (tab: ModeNavTab) => `${base} ${active === tab ? on : off}`;
  return (
    <nav className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-alt p-0.5 text-xs">
      <Link to="/chat" className={cls('chat')}>
        Chat
      </Link>
      <Link to="/tools" className={cls('tools')}>
        Tools <span className="text-[10px] text-ink-mute">/v1</span>
      </Link>
      <Link to="/reasoning" className={cls('reasoning')}>
        Reasoning
      </Link>
      <Link to="/knowledge" className={cls('knowledge')}>
        Knowledge
      </Link>
      <Link to="/analytics" className={cls('analytics')}>
        Analytics
      </Link>
    </nav>
  );
}
