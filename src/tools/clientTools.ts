/**
 * Client-side tool implementations the model can call.
 *
 * These run entirely IN THE BROWSER — they are the tutorial's
 * demonstration of the standard OpenAI tool-calling loop, where the
 * model decides *when* to call a function, your code executes it, and
 * the result is fed back. (Contrast the `yf` extension's builtins like
 * `rag_search`, which execute server-side and never surface as client
 * tool calls.)
 *
 * Each tool is a JSON-Schema'd `spec` (sent to the model) plus a `run`
 * that takes parsed arguments and returns a string the model reads
 * back as the tool result.
 */

export interface ToolSpec {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ClientTool {
  spec: ToolSpec;
  run: (args: Record<string, unknown>) => string;
}

/**
 * A tiny SAFE arithmetic evaluator.
 *
 * We deliberately do NOT use `eval()` or `new Function()` on
 * model-produced strings — a tool must never hand model output to a
 * code interpreter. This recursive-descent parser supports only
 * `+ - * /`, parentheses, unary sign, and decimals.
 */
function evaluateArithmetic(input: string): number {
  const s = input;
  let i = 0;
  const peek = () => s[i];
  const skipWs = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };

  function parseNumber(): number {
    skipWs();
    const start = i;
    while (i < s.length && /[0-9.]/.test(s[i])) i++;
    const num = Number(s.slice(start, i));
    if (!Number.isFinite(num)) throw new Error(`invalid number near "${s.slice(start)}"`);
    return num;
  }
  function parseFactor(): number {
    skipWs();
    const c = peek();
    if (c === '(') {
      i++;
      const v = parseExpr();
      skipWs();
      if (peek() !== ')') throw new Error('missing ")"');
      i++;
      return v;
    }
    if (c === '-') {
      i++;
      return -parseFactor();
    }
    if (c === '+') {
      i++;
      return parseFactor();
    }
    return parseNumber();
  }
  function parseTerm(): number {
    let v = parseFactor();
    for (;;) {
      skipWs();
      const c = peek();
      if (c === '*') {
        i++;
        v *= parseFactor();
      } else if (c === '/') {
        i++;
        const d = parseFactor();
        if (d === 0) throw new Error('division by zero');
        v /= d;
      } else break;
    }
    return v;
  }
  function parseExpr(): number {
    let v = parseTerm();
    for (;;) {
      skipWs();
      const c = peek();
      if (c === '+') {
        i++;
        v += parseTerm();
      } else if (c === '-') {
        i++;
        v -= parseTerm();
      } else break;
    }
    return v;
  }

  const result = parseExpr();
  skipWs();
  if (i < s.length) throw new Error(`unexpected "${s.slice(i)}"`);
  return result;
}

export const CLIENT_TOOLS: Record<string, ClientTool> = {
  get_current_time: {
    spec: {
      type: 'function',
      function: {
        name: 'get_current_time',
        description:
          "Get the current date and time, optionally in a specific IANA timezone (e.g. 'Asia/Tokyo', 'Europe/Oslo').",
        parameters: {
          type: 'object',
          properties: {
            timezone: {
              type: 'string',
              description: "IANA timezone name. Defaults to the browser's local zone.",
            },
          },
        },
      },
    },
    run: (args) => {
      const requested = typeof args.timezone === 'string' ? args.timezone.trim() : '';
      const tz = requested || Intl.DateTimeFormat().resolvedOptions().timeZone;
      try {
        const now = new Date();
        const formatted = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          dateStyle: 'full',
          timeStyle: 'long',
        }).format(now);
        return JSON.stringify({ timezone: tz, now: formatted, iso: now.toISOString() });
      } catch {
        return JSON.stringify({ error: `unknown timezone "${tz}"` });
      }
    },
  },

  calculate: {
    spec: {
      type: 'function',
      function: {
        name: 'calculate',
        description:
          'Evaluate a basic arithmetic expression (+ - * /, parentheses, decimals). Use this instead of doing math yourself.',
        parameters: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description: 'e.g. "(1234 * 9) + 17" or "240 * 0.15"',
            },
          },
          required: ['expression'],
        },
      },
    },
    run: (args) => {
      const expr = typeof args.expression === 'string' ? args.expression : '';
      try {
        return JSON.stringify({ expression: expr, result: evaluateArithmetic(expr) });
      } catch (err) {
        return JSON.stringify({ expression: expr, error: err instanceof Error ? err.message : String(err) });
      }
    },
  },
};

/** The tool specs to send to the model. */
export function clientToolSpecs(): ToolSpec[] {
  return Object.values(CLIENT_TOOLS).map((t) => t.spec);
}
