/**
 * Service URLs.
 *
 * The wallet-SDK reads its own env vars directly
 * (`REACT_APP_AUTH_SERVICE_URL`, `REACT_APP_PAYMENTS_SERVICE_URL`,
 * `REACT_APP_API_URL`) — see `.env.example`. This module only carries
 * what the app itself calls: the agents service, which serves chat,
 * the model catalog, and conversation history.
 */
export const AGENTS_API_URL =
  process.env.REACT_APP_AGENTS_API_URL || 'http://localhost:3001';
