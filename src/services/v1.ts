/**
 * The OpenAI-compatible `/v1` surface — and the standard tool-calling
 * agent loop on top of it.
 *
 * This is a thin `fetch` client written against the exact OpenAI Chat
 * Completions wire shapes, so you can see what's actually on the wire.
 * A Node/backend service would use the official OpenAI SDK unchanged:
 *
 *   const client = new OpenAI({
 *     baseURL: `${AGENTS_API_URL}/v1`,
 *     apiKey: process.env.YF_API_KEY,   // a yf_api_… key
 *   });
 *   await client.chat.completions.create({ model, messages, tools, tool_choice });
 *
 * In THIS browser app the bearer is the signed-in user's own JWT
 * (managed by the wallet-SDK), not an API key — the user's session is
 * already in the browser, so there's no extra secret to expose.
 */
import { tokenManager } from '@yieldfabric/wallet';

import type { ClientTool, ToolSpec } from '../tools/clientTools';
import { AGENTS_API_URL } from '../config';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  /** Present on assistant turns the model produced with tool calls. */
  tool_calls?: ToolCall[];
  /** Present on `tool` messages — the call this result answers. */
  tool_call_id?: string;
}

export type ToolChoice = 'auto' | 'none' | 'required';

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** The YieldFabric vendor extension's response block. */
export interface YfBlock {
  grounded?: boolean;
  sources?: Array<Record<string, unknown>>;
  tool_activity?: Array<Record<string, unknown>>;
}

interface CompletionResponse {
  choices: Array<{
    message: { role: string; content: string | null; tool_calls?: ToolCall[] };
    finish_reason: string;
  }>;
  usage?: Usage;
  yf?: YfBlock;
}

export interface YfRequest {
  working_group_id: string;
  builtin_tools?: string[];
}

function authHeaders(): Record<string, string> {
  const token = tokenManager.getAuthToken({ purpose: 'user' });
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** One POST /v1/chat/completions call (non-streaming). */
async function createCompletion(body: Record<string, unknown>): Promise<CompletionResponse> {
  const res = await fetch(`${AGENTS_API_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    // /v1 errors use the OpenAI envelope: { error: { message, type } }.
    const message = json?.error?.message || `HTTP ${res.status}`;
    if (typeof message === 'string' && message.includes('not supported on this endpoint yet')) {
      throw new Error(
        'This agents deployment predates tool calling (API < 0.8.0). Rebuild and restart ' +
          'the agents service (cargo run --features service).'
      );
    }
    throw new Error(message);
  }
  return json as CompletionResponse;
}

// ── The agent loop ───────────────────────────────────────────────────

export type ToolLoopEvent =
  | { kind: 'assistant'; round: number; content: string | null; toolCalls: ToolCall[]; usage?: Usage }
  | { kind: 'tool_result'; round: number; id: string; name: string; args: unknown; result: string }
  | { kind: 'final'; content: string | null; usage: Usage }
  | { kind: 'yf'; yf: YfBlock };

const sumUsage = (a: Usage, b?: Usage): Usage => ({
  prompt_tokens: a.prompt_tokens + (b?.prompt_tokens ?? 0),
  completion_tokens: a.completion_tokens + (b?.completion_tokens ?? 0),
  total_tokens: a.total_tokens + (b?.total_tokens ?? 0),
});

/**
 * Run the standard tool-calling loop and emit each step as it happens.
 *
 * The loop: call the model → if it returns `tool_calls`, execute each
 * (client tools run here in the browser; `yf` builtins already ran
 * server-side and arrive in the `yf` block, never as client calls) →
 * append the assistant turn and `tool`-role results → repeat until the
 * model returns a final message or the round budget is spent.
 */
export async function runToolLoop(opts: {
  model: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  toolChoice: ToolChoice;
  clientTools: Record<string, ClientTool>;
  yf?: YfRequest;
  maxRounds?: number;
  onEvent: (event: ToolLoopEvent) => void;
}): Promise<void> {
  const { model, tools, toolChoice, clientTools, yf, onEvent } = opts;
  const maxRounds = opts.maxRounds ?? 6;
  const messages = [...opts.messages];
  let total: Usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  for (let round = 0; round < maxRounds; round++) {
    const resp = await createCompletion({
      model,
      messages,
      ...(tools.length ? { tools } : {}),
      // The caller's choice applies to the first round only; later
      // rounds use `auto` so the model can settle on a final answer.
      tool_choice: round === 0 ? toolChoice : 'auto',
      ...(yf ? { yf } : {}),
    });

    total = sumUsage(total, resp.usage);
    if (resp.yf) onEvent({ kind: 'yf', yf: resp.yf });

    const choice = resp.choices[0];
    const msg = choice.message;
    const toolCalls = msg.tool_calls ?? [];

    if (toolCalls.length === 0) {
      onEvent({ kind: 'final', content: msg.content, usage: total });
      return;
    }

    onEvent({ kind: 'assistant', round, content: msg.content, toolCalls, usage: resp.usage });

    // Echo the assistant turn (with its tool_calls), then answer each
    // call with a `tool`-role message — exact OpenAI protocol.
    messages.push({ role: 'assistant', content: msg.content, tool_calls: toolCalls });
    for (const call of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        args = {};
      }
      const tool = clientTools[call.function.name];
      const result = tool
        ? tool.run(args)
        : JSON.stringify({ error: `no client implementation for "${call.function.name}"` });
      onEvent({ kind: 'tool_result', round, id: call.id, name: call.function.name, args, result });
      messages.push({ role: 'tool', tool_call_id: call.id, content: result });
    }
  }

  onEvent({
    kind: 'final',
    content: '(stopped: the model kept requesting tools past the round limit)',
    usage: total,
  });
}
