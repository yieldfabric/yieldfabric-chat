/**
 * Documentation deep-links shown throughout this tutorial app.
 *
 * Every UI surface that demonstrates a platform concept links to the
 * page that explains it — the guide for the narrative, the API
 * reference for the wire contract. Override the base for a
 * self-hosted docs site via REACT_APP_DOCS_BASE_URL.
 */
const DOCS_BASE = process.env.REACT_APP_DOCS_BASE_URL || 'https://yieldfabric.com';

export const DOCS = {
  /** The LLM-access guide — the narrative this whole app follows. */
  guide: `${DOCS_BASE}/docs/guides/llm-access`,
  guideModels: `${DOCS_BASE}/docs/guides/llm-access#choosing-a-model`,
  guideMetering: `${DOCS_BASE}/docs/guides/llm-access#usage-metering`,
  guideHistory: `${DOCS_BASE}/docs/guides/llm-access#history-and-persistence-read-this-before-relying-on-it`,
  /** Auth flows (wallet-SDK sign-in, API keys). */
  auth: `${DOCS_BASE}/docs/guides/building-with-yf#authenticate-in-30-seconds`,
  /** The OpenAI-compatible /v1 surface (used by the Tools page). */
  guideV1: `${DOCS_BASE}/docs/guides/llm-access#the-openai-compatible-endpoint-v1`,
  guideYfExtension: `${DOCS_BASE}/docs/guides/llm-access#the-yf-extension-your-substrate-zero-plumbing`,
  /** Agents API reference — every endpoint this app calls. */
  agentsApi: `${DOCS_BASE}/docs/api/agents`,
  opChat: `${DOCS_BASE}/docs/api/agents/post-chat`,
  opModels: `${DOCS_BASE}/docs/api/agents/get-api-models`,
  opChatHistory: `${DOCS_BASE}/docs/api/agents/get-chat-history-thread_id`,
  opUsageDetail: `${DOCS_BASE}/docs/api/agents/get-api-usage-detail`,
  opUsageSummary: `${DOCS_BASE}/docs/api/agents/get-api-usage-summary`,
  opCallLog: `${DOCS_BASE}/docs/api/agents/get-api-usage-calls-usage_event_id-log`,
  opUsageAggregate: `${DOCS_BASE}/docs/api/agents/get-api-usage-aggregate`,
  opV1Chat: `${DOCS_BASE}/docs/api/agents/post-v1-chat-completions`,
  opV1Models: `${DOCS_BASE}/docs/api/agents/get-v1-models`,
  // Pipelines (reasoning) + knowledge graphs (file→KG).
  guideReasoning: `${DOCS_BASE}/docs/guides/llm-access#following-a-reasoning-run-end-to-end`,
  guideFileKg: `${DOCS_BASE}/docs/guides/llm-access#file-to-knowledge-graph`,
  guideFrames: `${DOCS_BASE}/docs/guides/llm-access#going-deeper-from-citation-to-frame`,
  opPipelineRun: `${DOCS_BASE}/docs/api/agents/post-pipelines-run`,
  opPipelineEvents: `${DOCS_BASE}/docs/api/agents/get-pipelines-run_id-events`,
  opKgSummary: `${DOCS_BASE}/docs/api/agents/get-kgs-id-summary`,
  opKgFrames: `${DOCS_BASE}/docs/api/agents/get-kgs-id-frames`,
  opKgList: `${DOCS_BASE}/docs/api/agents/get-kgs`,
  // Deployment verification: GET /version is unauthenticated and reports
  // the api_version a server actually serves — confirm your app integrates
  // against the version you expect before you hold a credential.
  opVersion: `${DOCS_BASE}/docs/api/agents/get-version`,
  guideVersioning: `${DOCS_BASE}/docs/guides/versioning`,
};
