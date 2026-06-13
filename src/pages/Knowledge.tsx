import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@yieldfabric/wallet';

import {
  type KgListItem,
  type PipelineRun,
  ingestDocument,
  listKgs,
  startReasoning,
} from '../services/pipelines';
import PipelineRunView from '../components/PipelineRunView';
import KgView from '../components/KgView';
import ModeNav from '../components/ModeNav';
import DocLink from '../components/DocLink';
import { DOCS } from '../docs';

const WG_KEY = 'yf-working-group';

/**
 * Knowledge — turn a file into a knowledge graph.
 *
 * Upload a document to `POST /pipelines/ingest-document-upload`
 * (multipart); the server chunks it, embeds it, and extracts typed
 * frames — you just send the file. It returns `{run_id, kg_id}` and
 * streams ingestion progress over the same SSE endpoint reasoning
 * uses, so the same `PipelineRunView` renders it. Below, the recent
 * knowledge graphs you can see.
 */
export default function Knowledge() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [file, setFile] = React.useState<File | null>(null);
  const [workingGroupId, setWorkingGroupId] = React.useState(
    () => localStorage.getItem(WG_KEY) || '',
  );
  const [run, setRun] = React.useState<PipelineRun | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [kgs, setKgs] = React.useState<KgListItem[] | null>(null);
  const [openKg, setOpenKg] = React.useState<string | null>(null);

  React.useEffect(() => {
    localStorage.setItem(WG_KEY, workingGroupId.trim());
  }, [workingGroupId]);

  const loadKgs = React.useCallback(() => {
    listKgs()
      .then(setKgs)
      .catch(() => setKgs([]));
  }, []);
  React.useEffect(() => {
    loadKgs();
  }, [loadKgs]);

  const ingest = async () => {
    if (!file || starting) return;
    setStarting(true);
    setError(null);
    setRun(null);
    try {
      const r = await ingestDocument(file, {
        workingGroupId: workingGroupId.trim() || undefined,
      });
      setRun(r);
      // Refresh the list shortly after — the KG row appears once the
      // run registers (and only if it's group-scoped).
      setTimeout(loadKgs, 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-surface-alt">
      <header className="flex items-center gap-4 px-5 py-3 bg-white border-b border-line">
        <span className="inline-flex items-center gap-2 font-semibold text-ink-deep">
          <span className="h-7 w-7 rounded-lg bg-brand-600 text-white grid place-items-center text-xs font-bold">
            YF
          </span>
          YieldFabric Chat
        </span>
        <ModeNav active="knowledge" />
        <span className="hidden md:inline text-[11px] text-ink-mute">
          file → knowledge graph ·{' '}
          <DocLink href={DOCS.guideFileKg} title="File → knowledge graph">
            guide
          </DocLink>
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden sm:block text-xs text-ink-mute max-w-[160px] truncate">
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

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          <section className="rounded-xl border border-line bg-white p-4 shadow-card">
            <h1 className="text-sm font-semibold text-ink-deep">File → knowledge graph</h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
              Upload a document (text or PDF). The server chunks, embeds, and extracts typed{' '}
              <strong>frames</strong> into a knowledge graph — you just send the file. Ingestion
              streams over the same SSE endpoint reasoning uses, and the result is a substrate you
              can read here and ground chat against.
            </p>
          </section>

          <section className="rounded-xl border border-line bg-white p-4 shadow-card">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
                Document
              </span>
              <input
                type="file"
                accept=".txt,.md,.csv,.json,.pdf,text/plain,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-[12px] text-ink-soft file:mr-3 file:rounded-md file:border file:border-line file:bg-surface-alt file:px-3 file:py-1.5 file:text-[12px] file:text-ink hover:file:bg-chip-hover"
              />
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={workingGroupId}
                onChange={(e) => setWorkingGroupId(e.target.value)}
                placeholder="working_group_id (optional)"
                className="flex-1 min-w-[200px] rounded-md border border-line bg-white px-2.5 py-1.5 text-[12px] text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
              <button
                onClick={ingest}
                disabled={starting || !file}
                className="ml-auto rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {starting ? 'Uploading…' : 'Ingest'}
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-ink-mute">
              Scope to a <code className="text-[10px]">working_group_id</code> to have the KG appear
              in the list below and be usable for grounded chat. Ungrouped ingests still build a KG
              (shown above by id).
            </p>
          </section>

          {error && (
            <div className="rounded-lg border border-status-error-text/20 bg-status-error-bg px-3 py-2 text-[12px] text-status-error-text">
              {error}
            </div>
          )}

          {run && (
            <section>
              <PipelineRunView
                runId={run.run_id}
                kgId={run.kg_id}
                workingGroupId={workingGroupId.trim() || undefined}
                startChild={(parentKgId, problem) =>
                  startReasoning({
                    problem,
                    parentKgId,
                    workingGroupId: workingGroupId.trim() || undefined,
                  })
                }
              />
            </section>
          )}

          {/* Recent KGs */}
          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-2">
              Recent knowledge graphs
            </h2>
            {kgs === null ? (
              <p className="text-xs text-ink-mute">Loading…</p>
            ) : kgs.length === 0 ? (
              <p className="text-xs text-ink-mute">
                None yet in your working groups.{' '}
                <DocLink href={DOCS.opKgList} title="GET /kgs — lists group-scoped KGs">
                  <code className="text-[10px]">GET /kgs</code>
                </DocLink>{' '}
                lists only KGs in groups you belong to.
              </p>
            ) : (
              <ul className="space-y-2">
                {kgs.map((kg) => (
                  <li key={kg.id} className="rounded-lg border border-line bg-white p-3">
                    <button
                      onClick={() => setOpenKg(openKg === kg.id ? null : kg.id)}
                      className="w-full text-left flex items-center gap-2"
                    >
                      <span className="text-[13px] font-medium text-ink-deep truncate">
                        {kg.name || kg.id.slice(0, 8)}
                      </span>
                      <span className="ml-auto text-[11px] text-ink-mute tabular-nums">
                        {kg.node_count} nodes · {kg.edge_count} edges
                      </span>
                      <span className="text-brand-600 text-[11px]">{openKg === kg.id ? '▾' : '▸'}</span>
                    </button>
                    {openKg === kg.id && (
                      <div className="mt-3">
                        <KgView kgId={kg.id} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
