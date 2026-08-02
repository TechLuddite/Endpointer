import { useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FolderGit2,
  History,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import type {
  ApiResponseData,
  CollectionItem,
  CollectionRunResult,
  Environment,
  RequestConfig,
  RequestHistoryItem,
} from '../types';
import { importAnyFormat } from '../utils/importers';
import { evaluateAssertions } from '../utils/assertions';
import { resolveEnvironment, stripSecrets } from '../utils/variables';
import { buildFullUrl } from '../utils/codeGenerators';

interface CollectionsManagerProps {
  collections: CollectionItem[];
  history: RequestHistoryItem[];
  environment: Environment | null;
  onSaveCollections: (collections: CollectionItem[]) => void;
  onSelectRequestForPlayground: (config: RequestConfig) => void;
  onClearHistory: () => void;
  onExecuteRequest: (
    config: RequestConfig,
    options: { signal: AbortSignal },
  ) => Promise<ApiResponseData>;
  onNotify: (message: string, tone?: 'info' | 'error') => void;
}

export function CollectionsManager({
  collections,
  history,
  environment,
  onSaveCollections,
  onSelectRequestForPlayground,
  onClearHistory,
  onExecuteRequest,
  onNotify,
}: CollectionsManagerProps) {
  const [tab, setTab] = useState<'collections' | 'history'>('collections');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<CollectionRunResult | null>(null);
  const [stripOnExport, setStripOnExport] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createCollection = () => {
    const name = newName.trim();
    if (!name) return;
    onSaveCollections([
      ...collections,
      { id: `col-${Date.now()}`, name, description: '', createdAt: Date.now(), requests: [] },
    ]);
    setNewName('');
    setCreating(false);
    onNotify(`Created “${name}”.`);
  };

  const removeRequest = (collectionId: string, index: number) => {
    onSaveCollections(
      collections.map((collection) =>
        collection.id === collectionId
          ? { ...collection, requests: collection.requests.filter((_, i) => i !== index) }
          : collection,
      ),
    );
  };

  const exportCollections = () => {
    const vars = resolveEnvironment(environment);
    const payload = stripOnExport
      ? collections.map((collection) => ({
          ...collection,
          requests: collection.requests.map((request) => stripSecrets(request, vars)),
        }))
      : collections;

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `endpointer-collections-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    // Without this the blob is retained for the lifetime of the document.
    URL.revokeObjectURL(url);
    onNotify(
      stripOnExport
        ? 'Exported with credentials replaced by placeholders.'
        : 'Exported including credential values — handle that file carefully.',
    );
  };

  const importFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      // Everything here is validated before it can reach state or storage.
      // Importing an unvalidated array used to persist a shape that threw
      // during render on every subsequent load.
      const result = importAnyFormat(String(reader.result ?? ''));
      if (result.collections.length === 0) {
        onNotify(result.warnings[0] ?? 'Nothing could be imported from that file.', 'error');
        return;
      }
      onSaveCollections([...collections, ...result.collections]);
      const count = result.collections.reduce((sum, c) => sum + c.requests.length, 0);
      onNotify(
        `Imported ${count} request${count === 1 ? '' : 's'} from ${result.format}.` +
          (result.warnings.length ? ` ${result.warnings.slice(0, 2).join(' ')}` : ''),
      );
    };
    reader.onerror = () => onNotify('That file could not be read.', 'error');
    reader.readAsText(file);
    event.target.value = '';
  };

  /** Run every request in a collection and report assertion results. */
  const runCollection = async (collection: CollectionItem) => {
    if (collection.requests.length === 0) {
      onNotify('That collection has no requests.', 'error');
      return;
    }
    setRunningId(collection.id);
    setRunResult(null);

    const controller = new AbortController();
    const startedAt = Date.now();
    const results: CollectionRunResult['requests'] = [];

    try {
      for (const config of collection.requests) {
        try {
          const response = await onExecuteRequest(config, { signal: controller.signal });
          const assertionResults = evaluateAssertions(config.assertions, response);
          // With no assertions, a 2xx counts as a pass — otherwise every
          // request without checks would show as failing.
          const passed =
            assertionResults.length > 0 ? assertionResults.every((r) => r.passed) : response.ok;
          results.push({ config, response, passed, assertionResults });
        } catch (err) {
          results.push({
            config,
            passed: false,
            assertionResults: [],
            error: (err as Error).message,
          });
        }
      }

      const passedCount = results.filter((r) => r.passed).length;
      setRunResult({
        collectionId: collection.id,
        startedAt,
        finishedAt: Date.now(),
        requests: results,
        passedCount,
        failedCount: results.length - passedCount,
      });
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <section className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-100 sm:text-2xl">
            Collections &amp; history
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Group requests into runnable suites. Imports Postman v2.1, OpenAPI 3 and HAR.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="Collections or history"
            className="flex items-center rounded-xl border border-slate-800 bg-slate-950 p-1"
          >
            {(
              [
                ['collections', `Collections (${collections.length})`, FolderGit2],
                ['history', `History (${history.length})`, History],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  tab === id
                    ? 'border border-purple-800 bg-purple-950 text-purple-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={exportCollections}
            className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 transition-all hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Export</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 transition-all hover:bg-slate-800"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Import</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.har,application/json"
            onChange={importFile}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>
      </section>

      {tab === 'collections' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={stripOnExport}
                onChange={(e) => setStripOnExport(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-cyan-500"
              />
              Replace credentials with placeholders on export
            </label>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-purple-600/20 transition-all hover:bg-purple-500"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              New collection
            </button>
          </div>

          {creating && (
            <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <label
                htmlFor="new-collection"
                className="text-xs font-bold uppercase text-slate-300"
              >
                Collection name
              </label>
              <input
                id="new-collection"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createCollection()}
                placeholder="e.g. Checkout API smoke tests"
                autoFocus
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200 focus:border-purple-500 focus:outline-none"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={createCollection}
                  disabled={!newName.trim()}
                  className="rounded-lg bg-purple-600 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>
          )}

          {collections.length === 0 ? (
            <p className="rounded-2xl border border-slate-800 bg-slate-900/60 py-16 text-center text-sm text-slate-400">
              No collections yet. Create one, or import a Postman/OpenAPI/HAR file.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {collections.map((collection) => (
                <section
                  key={collection.id}
                  className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="flex items-center gap-2 truncate font-bold text-slate-200">
                        <FolderGit2
                          className="h-4 w-4 shrink-0 text-purple-400"
                          aria-hidden="true"
                        />
                        {collection.name}
                      </h2>
                      {collection.description && (
                        <p className="mt-1 text-xs text-slate-400">{collection.description}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void runCollection(collection)}
                        disabled={runningId !== null || collection.requests.length === 0}
                        title="Run every request and evaluate its assertions"
                        className="flex items-center gap-1 rounded-lg border border-emerald-800 bg-emerald-950 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-900 disabled:opacity-40"
                      >
                        {runningId === collection.id ? (
                          <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
                        ) : (
                          <Play className="h-3 w-3" aria-hidden="true" />
                        )}
                        Run
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onSaveCollections(collections.filter((c) => c.id !== collection.id))
                        }
                        aria-label={`Delete collection ${collection.name}`}
                        className="p-1 text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 border-t border-slate-800 pt-2">
                    <p className="font-mono text-[11px] uppercase text-slate-500">
                      {collection.requests.length} request
                      {collection.requests.length === 1 ? '' : 's'}
                    </p>
                    {collection.requests.length === 0 ? (
                      <p className="text-xs italic text-slate-600">
                        Nothing here yet — save a request from the playground.
                      </p>
                    ) : (
                      <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                        {collection.requests.map((request, index) => (
                          <li
                            key={`${collection.id}-${index}`}
                            className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 p-2 font-mono text-xs"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="shrink-0 font-bold text-cyan-400">
                                {request.method}
                              </span>
                              <span
                                className="truncate text-slate-300"
                                title={buildFullUrl(request)}
                              >
                                {request.name ?? buildFullUrl(request)}
                              </span>
                              {request.assertions?.length ? (
                                <span className="shrink-0 rounded bg-slate-800 px-1 text-[10px] text-slate-400">
                                  {request.assertions.length} checks
                                </span>
                              ) : null}
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => onSelectRequestForPlayground(request)}
                                className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-cyan-400 hover:bg-slate-700"
                              >
                                Open
                              </button>
                              <button
                                type="button"
                                onClick={() => removeRequest(collection.id, index)}
                                aria-label="Remove request from collection"
                                className="p-1 text-slate-500 hover:text-rose-400"
                              >
                                <Trash2 className="h-3 w-3" aria-hidden="true" />
                              </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {runResult?.collectionId === collection.id && (
                    <div className="space-y-2 border-t border-slate-800 pt-3">
                      <p
                        className={`font-mono text-xs font-bold ${
                          runResult.failedCount === 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {runResult.passedCount}/{runResult.requests.length} passed in{' '}
                        {runResult.finishedAt - runResult.startedAt}ms
                      </p>
                      <ul className="max-h-48 space-y-1 overflow-y-auto">
                        {runResult.requests.map((result, index) => (
                          <li
                            key={index}
                            className={`flex items-start gap-2 rounded-lg border p-2 font-mono text-[11px] ${
                              result.passed
                                ? 'border-emerald-900 bg-emerald-950/40 text-emerald-300'
                                : 'border-rose-900 bg-rose-950/40 text-rose-300'
                            }`}
                          >
                            {result.passed ? (
                              <CheckCircle2
                                className="mt-0.5 h-3 w-3 shrink-0"
                                aria-hidden="true"
                              />
                            ) : (
                              <XCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                            )}
                            <span className="min-w-0">
                              <span className="block truncate">
                                {result.config.method} {result.config.name ?? result.config.url}
                              </span>
                              {result.error && <span className="block">{result.error}</span>}
                              {result.response?.error && (
                                <span className="block">{result.response.error}</span>
                              )}
                              {result.assertionResults
                                .filter((a) => !a.passed)
                                .map((a, i) => (
                                  <span key={i} className="block">
                                    ✗ {a.message}
                                  </span>
                                ))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="flex items-center gap-2 font-bold text-slate-200">
              <History className="h-4 w-4 text-purple-400" aria-hidden="true" />
              {history.length} recent request{history.length === 1 ? '' : 's'}
            </h2>
            {history.length > 0 && (
              <button
                type="button"
                onClick={onClearHistory}
                className="text-xs font-semibold text-rose-400 hover:text-rose-300"
              >
                Clear history
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">
              Nothing yet. Requests you send appear here.
            </p>
          ) : (
            <ul className="max-h-[500px] space-y-2 overflow-y-auto">
              {history.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-xs transition-all hover:border-slate-700"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="shrink-0 rounded border border-slate-800 bg-slate-900 px-2 py-0.5 font-bold text-cyan-400">
                      {item.config.method}
                    </span>
                    <span className="truncate text-slate-200">{item.name}</span>
                    {item.response && (
                      <span
                        className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-bold ${
                          item.response.ok
                            ? 'border-emerald-800 bg-emerald-950 text-emerald-400'
                            : 'border-rose-800 bg-rose-950 text-rose-400'
                        }`}
                      >
                        {item.response.status || 'ERR'} · {item.response.duration}ms
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <time
                      dateTime={new Date(item.timestamp).toISOString()}
                      className="hidden text-[10px] text-slate-500 sm:inline"
                    >
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </time>
                    <button
                      type="button"
                      onClick={() => onSelectRequestForPlayground(item.config)}
                      className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-cyan-400 hover:bg-slate-700"
                    >
                      Open
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
