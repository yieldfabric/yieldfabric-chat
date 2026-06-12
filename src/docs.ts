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
  /** Agents API reference — every endpoint this app calls. */
  agentsApi: `${DOCS_BASE}/docs/api/agents`,
  opChat: `${DOCS_BASE}/docs/api/agents/post-chat`,
  opModels: `${DOCS_BASE}/docs/api/agents/get-api-models`,
  opChatHistory: `${DOCS_BASE}/docs/api/agents/get-chat-history-thread_id`,
  opUsageDetail: `${DOCS_BASE}/docs/api/agents/get-api-usage-detail`,
  opUsageSummary: `${DOCS_BASE}/docs/api/agents/get-api-usage-summary`,
  opCallLog: `${DOCS_BASE}/docs/api/agents/get-api-usage-calls-usage_event_id-log`,
};
