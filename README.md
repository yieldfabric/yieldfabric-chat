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

Every LLM call is authenticated, per-entity metered, and (when you add
`working_group_id` / `kg_id`) grounded in your YieldFabric knowledge
substrate — without your app holding any upstream LLM keys.

## Prerequisites

- Node 18+
- A reachable YieldFabric deployment and a user account on it. Either:
  - a **local stack** (auth `:3000`, payments `:3002`, agents `:3001`), or
  - the **hosted platform** (`auth.yieldfabric.com` / `agents.yieldfabric.com`).
- This example consumes `@yieldfabric/wallet` and
  `@yieldfabric/terminal` **from source** as `file:` dependencies two
  directories up (`../../yieldfabric-wallet-sdk`,
  `../../yieldfabric-terminal`), exactly like the first-party app. If
  you copy this example out of the repo, update the two `file:` paths
  in `package.json` (and the mirrored paths in `craco.config.js`,
  `tsconfig.json`, `tailwind.config.js`, plus the `postinstall`
  script) to wherever you vendor the packages.

## Run it

```bash
cp .env.example .env     # point the URLs at your YF deployment
npm install
npm start                # http://localhost:3020
```

Production build: `npm run build`. Type check: `npm run typecheck`.

Two things the scripts handle for you, worth knowing about:

- **SDK dependencies** — npm does *not* install the dependencies of
  `file:`-linked packages, so this app's `postinstall` runs
  `npm install` inside both SDK directories. Without it, a fresh
  clone fails to build with missing-module errors from the SDK
  sources.
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
- **Backend/server-side LLM access**: point any **OpenAI SDK** at
  `…/v1` with a `yf_api_…` API key as the `api_key` — chat
  completions, tool calling, embeddings, and the `yf` extension for
  RAG grounding and server-executed tools.
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
