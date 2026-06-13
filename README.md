# YieldFabric Chat — reference implementation

An open-source, minimal-but-real **chat / LLM / agent app** built on
YieldFabric. Use it as the starting point for your own product: it
shows the canonical way to wire **authentication**, **streaming
chat**, **model selection**, and **conversation history** with the two
official frontend packages — the same ones YieldFabric's first-party
app is built from.

```
Browser ── @yieldfabric/wallet ──► auth service      (sign-in, JWT, refresh)
        ── @yieldfabric/terminal ─► agents service   (POST /chat SSE,
                                                      GET /api/models,
                                                      GET /chat/history/{id})
```

What you get out of the box:

- **Sign-in** via the wallet-SDK (`LoginComponent` + `LoginAltMethods`):
  email/password plus whatever alternative methods your auth service
  advertises (wallet signature, passkey, providers). Session restore,
  token refresh, and logout are SDK-owned.
- **Streaming chat** through the terminal package's `StandardTerminal`
  — the host wires exactly one callback (`onStreamRequest`) and gets
  token streaming, markdown rendering, and source citations for free.
- **Per-request model selection** from the deployment's catalog
  (`GET /api/models` → `default`, `mini`, …).
- **Fast mode** — `reasoning: false` + `skip_rag: true` for the
  shortest path to the LLM (great for cheap, snappy turns on `mini`).
- **Durable conversations** — a client-generated thread id, persisted
  locally and restored from the server via
  `GET /chat/history/{thread_id}` on reload.
- **Per-message token metering with audit** — a Usage drawer showing
  per-model aggregates (the unit that maps to cost), every message's
  prompt/completion split with the per-call breakdown behind it
  (classifier, retrieval, completion), the exact prompt + output of
  any call for audit (`GET /api/usage/calls/{id}/log`), and your
  7-day rollups by model and feature.
- **Tool calling on `/v1`** — a **Tools** page (the second tab) that
  drives the OpenAI-compatible `POST /v1/chat/completions` endpoint
  with `tools` / `tool_choice`, runs the standard agent loop with
  browser-executed tools, and renders each step (model requests tool →
  browser runs it → result fed back → final answer). Optionally adds
  the `yf` extension (workspace grounding + the server-side
  `rag_search` builtin).
- **Cross-surface Analytics** — an **Analytics** page (third tab) that
  shows *all* your LLM usage across every surface (native chat, `/v1`
  tools, embeddings, …) from `GET /api/usage/aggregate`: live totals
  (incl. failures and today's calls), breakdowns by surface and model,
  and a recent-activity feed with the same per-call audit drill-down.
- **Multi-agent reasoning** — a **Reasoning** page that starts a run
  (`POST /pipelines/run`, kind: reasoning), streams the agents'
  narrative + KG growth live over SSE, **surfaces the agent team as it
  forms** (the `team_setup` events — roles, expertise, core/extended),
  and handles the human-in-the-loop pauses. On completion you can:
  **chat with the resulting KG** (grounded `POST /chat` with `kg_id`)
  **as any of its agents** (the `as_agent` picker, sourced from the
  surfaced team), or **"Reason over this KG"** to chain a fresh run
  with the result as context.
- **File → knowledge graph** — a **Knowledge** page that uploads a
  document (`POST /pipelines/ingest-document-upload`; the server
  chunks, embeds, and extracts frames), streams ingestion over the
  same SSE, and renders the resulting graph (frame counts + the typed
  frames) — with the same chat-with-the-KG and reason-over affordances.
  All of it shares one `pipelines.ts` service and the `PipelineRunView`
  / `KgView` / `KgChat` components.

Every LLM call is authenticated, per-entity metered, and (when you add
`working_group_id` / `kg_id`) grounded in your YieldFabric knowledge
substrate — without your app holding any upstream LLM keys.

## Prerequisites

- Node 18+
- A reachable YieldFabric deployment and a user account on it. Either:
  - a **local stack** (auth `:3000`, payments `:3002`, agents `:3001`), or
  - the **hosted platform** (`auth.yieldfabric.com` / `agents.yieldfabric.com`).
- **SDK resolution is automatic — local source if present, else the
  published packages.** No manual switch:
  - **In the monorepo** (the sibling repos exist at
    `../../yieldfabric-wallet-sdk` and `../../yieldfabric-terminal`), the
    SDKs build from their **live source** — edit `@yieldfabric/wallet` or
    `@yieldfabric/terminal` and it shows up here with no rebuild, just like
    `yieldfabric-app`.
  - **Standalone** (copy this folder anywhere, no siblings), `npm install`
    pulls `@yieldfabric/*` from the **public npm registry** and builds from
    the published dist — no token, no `.npmrc` scope config needed.

  The detection lives in `craco.config.js` / `tailwind.config.js` (presence
  check) and `tsconfig.json` (two-entry `paths`, src first). Force the
  published path from inside the monorepo with `YF_FORCE_REGISTRY=1`.

## Run it

```bash
cp .env.example .env     # point the URLs at your YF deployment
npm install              # monorepo: links local SDK src · standalone: pulls from public npm
npm start                # http://localhost:3020
```

Production build: `npm run build`. Type check: `npm run typecheck`.
Force the published-package path: `YF_FORCE_REGISTRY=1 npm run build`.

Two things worth knowing about:

- **SDK deps.** `@yieldfabric/*` are `optionalDependencies` (so a monorepo
  install doesn't require the registry while you work locally). The
  `postinstall` (`scripts/setup-sdks.js`) installs the siblings' own deps
  when they're present; otherwise it's a no-op and the published packages
  bring their own tree. The wallet's optional Stripe-KYC provider needs
  `@stripe/stripe-js` (already in `dependencies`) so the build resolves its
  lazy import; drop it if you strip the KYC surface.
- **Dev port** — `.env` pins `PORT=3020` because CRA's default
  (`:3000`) collides with the local YF auth service.

## How it's wired — the four files that matter

### 1. `src/App.tsx` — the wallet-SDK mount

`<WalletProvider config={…}>` is the single auth mount point. After
it, any component can call `useAuth()` for `{ user, isAuthenticated,
login, logout }`, and the SDK keeps tokens fresh in the background.
`RequireAuth` (used on the `/chat` route) is the whole route-guard
story.

### 2. `src/pages/Login.tsx` — sign-in without auth code

`<LoginComponent render={…}>` owns form state, validation, submission,
and errors — the page only describes JSX. `<LoginAltMethods />` adds
the alternative sign-in chips automatically based on the auth
service's provider config. Both are themed by the **semantic Tailwind
tokens** in `tailwind.config.js` (`surface`, `chip`, `cta`,
`text-primary`, …) — change those values and every SDK surface
re-skins to your brand.

Theming note: the **terminal** has its own theme system (its default
is dark). `src/theme/terminalTheme.ts` defines this example's light
overrides and Chat.tsx passes them via the `theme` prop — restyle the
conversation surface there, and the SDK chrome via the Tailwind
tokens.

### 3. `src/services/chat.ts` — the whole YF chat integration

Three calls against the agents service, each a few lines:

| Call | Endpoint | Notes |
|---|---|---|
| `streamChat(body, handlers)` | `POST /chat` (SSE) | Bearer JWT from the SDK's `tokenManager`; wire-level SSE handled by the terminal's `handleSSEStream`. |
| `listModels()` | `GET /api/models` | The deployment's model catalog; pass an `id` back as `body.model`. |
| `fetchChatHistory(threadId)` | `GET /chat/history/{id}` | Maps server history to the terminal's `TerminalEntry[]` for restore. |

Metering lives in its own sibling, `src/services/usage.ts`:

| Call | Endpoint | Notes |
|---|---|---|
| `fetchThreadUsage(threadId)` | `GET /api/usage/detail?thread_id=…` | One row per LLM call; **all calls answering one message share a `request_id`** — group on it for per-message costs. |
| `fetchUsageSummary(days)` | `GET /api/usage/summary` | The caller's daily rollups by model + feature. Entity-scoped server-side. |

### 4. `src/pages/Chat.tsx` — one callback to a full chat UI

`<StandardTerminal config={…} onStreamRequest={…} />`. The callback
receives the user's message and `{ onChunk, onComplete, onError }`
handlers; everything else (streaming text, markdown, citations,
input UX) is the terminal's job.

### 5. The Tools tab — OpenAI-compatible tool calling

A second surface (`/tools`), separate because tool calling is the
**OpenAI-compatible `/v1` agent loop**, not the native terminal:

| File | What |
|---|---|
| `src/services/v1.ts` | A thin `fetch` client for `POST /v1/chat/completions` in the OpenAI wire shape, plus `runToolLoop()` — the standard loop (model → `tool_calls` → execute → `tool` results → repeat → final). |
| `src/tools/clientTools.ts` | The browser-executed tools the model can call (`get_current_time`, `calculate` — with a safe arithmetic evaluator; never `eval`). |
| `src/pages/Tools.tsx` | Renders the loop step by step, with `tool_choice` control and the optional `yf` extension (workspace grounding + server-side `rag_search`). |

The page uses `fetch` for transparency; the same request shapes work
**unchanged** with the official OpenAI SDK in a backend
(`new OpenAI({ baseURL, apiKey: 'yf_api_…' })`).

### 6. The Analytics tab — usage across every surface

Because `/v1` is stateless (no conversation thread), its traffic
doesn't appear in the chat Usage drawer's per-conversation view. The
**Analytics** tab (`/analytics`) is the "see everything" view:
`src/pages/Analytics.tsx` calls `GET /api/usage/aggregate` (in
`src/services/usage.ts`) — a live, entity-scoped rollup of every
metered call grouped by feature + model, including failures and
today's activity — and renders totals, by-surface / by-model
breakdowns, and a cross-surface activity feed (each call drilling into
the same `…/calls/{id}/log` audit panel as the chat drawer).

## Where to go from here

The request body in `src/services/chat.ts` is the doorway to the rest
of the platform — each of these is one field, not one integration:

- **Ground answers in your workspace**: add `working_group_id` /
  `kg_id` to the chat body and responses cite your documents and
  knowledge graphs (`sources` arrive on the final stream chunk and the
  terminal renders them).
- **Multi-party + agent collaboration**: working-group threads with
  named agents — see the threads/SSE surface in the agents API
  reference.
- **Multi-agent reasoning**: `POST /pipelines/run` with
  `kind: "reasoning"`, then chat over the resulting knowledge graph.
- **Tool calling & the OpenAI-compatible `/v1` surface**: see the
  **Tools** tab and its files (`src/services/v1.ts`,
  `src/tools/clientTools.ts`, `src/pages/Tools.tsx`). It uses a thin
  `fetch` client so you can read the exact wire shapes; a Node
  backend would use the official OpenAI SDK unchanged —
  `new OpenAI({ baseURL: '…/v1', apiKey: 'yf_api_…' })` — with the
  same `tools` / `tool_choice` / `tool_calls` protocol.
- **Payments and obligations**: this example disables the global
  on-chain signer; `tncshell/frontend` in the same repo is the
  reference for adding financial rails (mount `<SignatureWorkflow />`
  and drop `disableGlobalSigner`).

## Documentation

The app itself is a guided tour: every surface that demonstrates a
platform concept carries a `docs ↗` link to the page explaining it
(the model picker → choosing a model; the usage drawer → metering;
the footer under the chat → the `/chat` + history wire contract).
All links live in one registry, `src/docs.ts`, overridable via
`REACT_APP_DOCS_BASE_URL` for self-hosted docs.

- **LLM access guide** (models, tools, `yf` extension, tutorials):
  `yieldfabric.com/docs/guides/llm-access`
- **Agents API reference** (every endpoint):
  `yieldfabric.com/docs/api/agents`
- **Building with YieldFabric** (auth flows, the full platform map):
  `yieldfabric.com/docs/guides/building-with-yf`

## License

The example app's own code is MIT — see [LICENSE](./LICENSE).

The two SDK packages it consumes (`@yieldfabric/wallet`,
`@yieldfabric/terminal`) are **licensed separately by YieldFabric**
and are not covered by this MIT grant. Contact YieldFabric for the
distribution terms that apply to your integration before vendoring
or redistributing them.
