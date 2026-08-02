import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Code,
  Copy,
  Database,
  FileText,
  Link2,
  Lock,
  Play,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import type {
  ApiResponseData,
  Assertion,
  AssertionResult,
  AuthType,
  BodyType,
  Capabilities,
  CodeLanguage,
  Environment,
  HttpMethod,
  RequestConfig,
} from '../types';
import { buildFullUrl, generateCodeSnippet } from '../utils/codeGenerators';
import { displayUrl, isSendableUrl, mergeUrlIntoParams } from '../utils/requestUrl';
import { describeAssertion, evaluateAssertions, suggestAssertions } from '../utils/assertions';
import { buildShareUrl, hasUnshareableSecrets } from '../utils/shareLink';
import { looksLikeCurl, parseCurl } from '../utils/curlParser';
import { findUnresolvedInConfig, resolveEnvironment } from '../utils/variables';
import { explainStatus } from '../utils/offlineAssistant';
import { diffPayloads, formatValue, summarizeDiff } from '../utils/diff';
import { KeyValueTable } from './KeyValueTable';
import { JsonViewer, ResponsePreview } from './JsonViewer';
import { PlaygroundAiChat } from './PlaygroundAiChat';

interface PlaygroundProps {
  initialConfig: RequestConfig | null;
  capabilities: Capabilities;
  environment: Environment | null;
  onExecuteRequest: (
    config: RequestConfig,
    options: { signal: AbortSignal },
  ) => Promise<ApiResponseData>;
  onSaveToCollection: (config: RequestConfig) => void;
  onOpenAiModal: (prompt: string, context: unknown) => void;
  onConfigChange: (config: RequestConfig) => void;
  onNotify: (message: string, tone?: 'info' | 'error') => void;
  /** Most recent previous response for this exact request, if any. */
  previousResponse: ApiResponseData | null;
}

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  POST: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  PUT: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  DELETE: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  PATCH: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  HEAD: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  OPTIONS: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
};

const CODE_LANGUAGES: Array<{ id: CodeLanguage; label: string }> = [
  { id: 'fetch', label: 'JavaScript — fetch' },
  { id: 'axios', label: 'JavaScript — axios' },
  { id: 'curl', label: 'cURL' },
  { id: 'python', label: 'Python — requests' },
  { id: 'node', label: 'Node.js' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'php', label: 'PHP' },
];

export const DEFAULT_CONFIG: RequestConfig = {
  method: 'GET',
  url: 'https://api.open-meteo.com/v1/forecast',
  params: [
    { id: 'p-lat', key: 'latitude', value: '37.7749', enabled: true },
    { id: 'p-lon', key: 'longitude', value: '-122.4194', enabled: true },
    { id: 'p-cw', key: 'current_weather', value: 'true', enabled: true },
  ],
  headers: [{ id: 'h-accept', key: 'Accept', value: 'application/json', enabled: true }],
  authType: 'No Auth',
  authConfig: { apiKeyIn: 'query' },
  bodyType: 'none',
  body: '',
  useProxy: false,
};

type RequestTab = 'params' | 'headers' | 'auth' | 'body' | 'assertions' | 'code';
type ResponseTab = 'body' | 'raw' | 'headers' | 'preview' | 'assertions' | 'diff';

export function Playground({
  initialConfig,
  capabilities,
  environment,
  onExecuteRequest,
  onSaveToCollection,
  onOpenAiModal,
  onConfigChange,
  onNotify,
  previousResponse,
}: PlaygroundProps) {
  const [config, setConfig] = useState<RequestConfig>(initialConfig ?? DEFAULT_CONFIG);
  /**
   * The URL bar keeps its own draft text.
   *
   * Deriving the input's value from state on every keystroke means the field
   * fights the user: typing "?q=hello" round-trips through split/join, so the
   * partially-typed "?q" comes back as "?q=" and the next character lands in
   * the wrong place. The draft is what the user typed; the parsed result feeds
   * the params table; and the draft is only overwritten when the config changes
   * from somewhere else (a directory pick, the copilot, a share link, or a row
   * being edited in the params table).
   */
  const [urlDraft, setUrlDraft] = useState(() =>
    displayUrl((initialConfig ?? DEFAULT_CONFIG).url, (initialConfig ?? DEFAULT_CONFIG).params),
  );
  const urlDraftIsAuthoritative = useRef(false);
  const [reqTab, setReqTab] = useState<RequestTab>('params');
  const [resTab, setResTab] = useState<ResponseTab>('body');
  const [codeLang, setCodeLang] = useState<CodeLanguage>('fetch');
  const [jsonFilter, setJsonFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ApiResponseData | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Replacing the whole config avoids the old merge-only-truthy-fields
  // behaviour, which left a stale body behind when a GET was loaded over a POST
  // and did nothing at all when the same entry was selected twice.
  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
      setUrlDraft(displayUrl(initialConfig.url, initialConfig.params));
      urlDraftIsAuthoritative.current = false;
      setResponse(null);
    }
  }, [initialConfig]);

  // Reflect param-table edits back into the URL bar, but never while the user
  // is the one typing there.
  const canonicalUrl = useMemo(
    () => displayUrl(config.url, config.params),
    [config.url, config.params],
  );
  useEffect(() => {
    if (!urlDraftIsAuthoritative.current) setUrlDraft(canonicalUrl);
  }, [canonicalUrl]);

  useEffect(() => {
    onConfigChange(config);
  }, [config, onConfigChange]);

  const vars = useMemo(() => resolveEnvironment(environment), [environment]);
  const knownVariables = useMemo(() => [...vars.values.keys()], [vars]);
  const unresolved = useMemo(() => findUnresolvedInConfig(config, vars), [config, vars]);

  const proxyAvailable = capabilities.proxy.available;

  const patch = useCallback((changes: Partial<RequestConfig>) => {
    setConfig((current) => ({ ...current, ...changes }));
  }, []);

  /** URL bar edits flow into the params table; disabled rows are preserved. */
  const handleUrlChange = (raw: string) => {
    urlDraftIsAuthoritative.current = true;
    setUrlDraft(raw);
    setConfig((current) => {
      const { base, params } = mergeUrlIntoParams(raw, current.params);
      return { ...current, url: base, params };
    });
  };

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      onNotify('Could not access the clipboard.', 'error');
    }
  };

  /**
   * Executes the config passed in, not whatever is in state when a timer fires.
   * The AI auto-send path used to be `setTimeout(handleExecute, 300)`, which
   * raced React's re-render and could send the previous configuration.
   */
  const execute = useCallback(
    async (target?: RequestConfig) => {
      const toSend = target ?? config;
      if (!isSendableUrl(toSend.url)) {
        onNotify('Enter a valid http(s) URL first.', 'error');
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setResponse(null);
      try {
        const result = await onExecuteRequest(toSend, { signal: controller.signal });
        const assertionResults = evaluateAssertions(toSend.assertions, result);
        setResponse({ ...result, assertionResults });
        setResTab(assertionResults.length > 0 ? 'assertions' : 'body');
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setLoading(false);
      }
    },
    [config, onExecuteRequest, onNotify],
  );

  const cancel = () => {
    abortRef.current?.abort();
    onNotify('Request cancelled.');
  };

  // ⌘/Ctrl+Enter sends from anywhere on the page.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void execute();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [execute]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handlePasteCurl = async () => {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      onNotify('Clipboard access was denied by the browser.', 'error');
      return;
    }
    if (!looksLikeCurl(text)) {
      onNotify('The clipboard does not contain a curl command.', 'error');
      return;
    }
    const { config: parsed, warnings } = parseCurl(text);
    if (!parsed) {
      onNotify(warnings[0] ?? 'That curl command could not be parsed.', 'error');
      return;
    }
    setConfig(parsed);
    setResponse(null);
    onNotify(warnings.length ? `Imported. ${warnings.join(' ')}` : 'curl command imported.');
  };

  const handleShare = async () => {
    await copy(buildShareUrl(config), 'share');
    onNotify(
      hasUnshareableSecrets(config)
        ? 'Link copied. Credentials were deliberately left out — the recipient supplies their own.'
        : 'Share link copied to clipboard.',
    );
  };

  const snippet = useMemo(() => generateCodeSnippet(config, codeLang), [config, codeLang]);
  const assertionResults = response?.assertionResults ?? [];

  // Comparing against the last run of the same request is the question people
  // actually have when an API starts misbehaving: what changed?
  const diff = useMemo(
    () =>
      response && previousResponse ? diffPayloads(previousResponse.data, response.data) : null,
    [response, previousResponse],
  );
  const diffSummary = diff ? summarizeDiff(diff) : null;
  const failedAssertions = assertionResults.filter((r) => !r.passed).length;
  const rawText =
    typeof response?.data === 'string' ? response.data : JSON.stringify(response?.data ?? null);

  return (
    <div className="space-y-6 pb-12">
      <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-xl sm:p-5">
        <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
          <label className="sr-only" htmlFor="method-select">
            HTTP method
          </label>
          <select
            id="method-select"
            value={config.method}
            onChange={(e) => patch({ method: e.target.value as HttpMethod })}
            className={`min-w-[120px] cursor-pointer appearance-none rounded-xl border px-3.5 py-2.5 text-center font-mono text-sm font-bold transition-all ${METHOD_COLORS[config.method]}`}
          >
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m} className="bg-slate-900 font-mono text-slate-100">
                {m}
              </option>
            ))}
          </select>

          <div className="relative flex-1">
            <label className="sr-only" htmlFor="url-input">
              Request URL
            </label>
            <input
              id="url-input"
              type="text"
              value={urlDraft}
              onChange={(e) => handleUrlChange(e.target.value)}
              onBlur={() => {
                // Normalise once the user is done, so the bar settles on the
                // canonical form instead of keeping stray typing artefacts.
                urlDraftIsAuthoritative.current = false;
                setUrlDraft(displayUrl(config.url, config.params));
              }}
              placeholder="https://api.example.com/v1/items?limit=10"
              spellCheck={false}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 font-mono text-sm text-slate-200 placeholder-slate-600 transition-all focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          <button
            type="button"
            onClick={() => patch({ useProxy: !config.useProxy })}
            disabled={!proxyAvailable}
            title={
              proxyAvailable
                ? config.useProxy
                  ? 'Requests are routed through the configured proxy.'
                  : 'Requests run directly from your browser and are subject to CORS.'
                : 'No proxy is configured on this deployment — see worker/README.md.'
            }
            className={`flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 font-mono text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
              config.useProxy && proxyAvailable
                ? 'border-emerald-800 bg-emerald-950/80 text-emerald-300'
                : 'border-cyan-800 bg-cyan-950/80 text-cyan-300'
            }`}
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span>{config.useProxy && proxyAvailable ? 'Via proxy' : 'Direct'}</span>
          </button>

          {loading ? (
            <button
              type="button"
              onClick={cancel}
              className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-rose-500 active:scale-95"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              <span>Cancel</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void execute()}
              disabled={!isSendableUrl(config.url)}
              title="Send request (⌘/Ctrl + Enter)"
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-cyan-500/20 transition-all hover:from-cyan-400 hover:to-purple-500 disabled:opacity-50 active:scale-95"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              <span>Send</span>
            </button>
          )}
        </div>

        {unresolved.length > 0 && (
          <p className="flex items-center gap-2 rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Undefined variable{unresolved.length > 1 ? 's' : ''}:{' '}
              <code className="font-bold">{unresolved.join(', ')}</code>. The literal placeholder
              will be sent unless you define them.
            </span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800/60 pt-2 text-xs">
          <button
            type="button"
            onClick={handlePasteCurl}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 font-mono text-[11px] text-slate-300 hover:bg-slate-800"
          >
            <Terminal className="h-3 w-3" aria-hidden="true" />
            Paste cURL
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 font-mono text-[11px] text-slate-300 hover:bg-slate-800"
          >
            {copied === 'share' ? (
              <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
            ) : (
              <Link2 className="h-3 w-3" aria-hidden="true" />
            )}
            {copied === 'share' ? 'Link copied' : 'Copy share link'}
          </button>
          <button
            type="button"
            onClick={() => onSaveToCollection(config)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 font-mono text-[11px] text-slate-300 hover:bg-slate-800"
          >
            <Database className="h-3 w-3" aria-hidden="true" />
            Save to collection
          </button>
        </div>
      </section>

      <PlaygroundAiChat
        config={config}
        response={response}
        capabilities={capabilities}
        onApplyConfig={(update) => {
          const next = { ...config, ...update };
          setConfig(next);
          return next;
        }}
        onExecute={execute}
        onNotify={onNotify}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
          <div
            role="tablist"
            aria-label="Request configuration"
            className="flex items-center gap-1 overflow-x-auto border-b border-slate-800 pb-2"
          >
            {(
              [
                [
                  'params',
                  `Params (${config.params.filter((p) => p.enabled && p.key).length})`,
                  null,
                ],
                [
                  'headers',
                  `Headers (${config.headers.filter((h) => h.enabled && h.key).length})`,
                  null,
                ],
                ['auth', `Auth: ${config.authType}`, Lock],
                ['body', `Body: ${config.bodyType}`, FileText],
                ['assertions', `Assertions (${config.assertions?.length ?? 0})`, CheckCircle2],
                ['code', 'Code', Code],
              ] as Array<[RequestTab, string, typeof Lock | null]>
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={reqTab === id}
                onClick={() => setReqTab(id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  reqTab === id
                    ? 'border border-slate-700 bg-slate-800 text-cyan-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="min-h-[300px] flex-1 pt-4">
            {reqTab === 'params' && (
              <KeyValueTable
                rows={config.params}
                onChange={(params) => patch({ params })}
                keyPlaceholder="Parameter"
                valuePlaceholder="Value"
                addLabel="Add parameter"
                emptyMessage="No query parameters. Add one here, or type them into the URL above — the two stay in sync."
                idPrefix="param"
                knownVariables={knownVariables}
              />
            )}

            {reqTab === 'headers' && (
              <KeyValueTable
                rows={config.headers}
                onChange={(headers) => patch({ headers })}
                keyPlaceholder="Header name"
                valuePlaceholder="Header value"
                addLabel="Add header"
                emptyMessage="No custom headers."
                idPrefix="header"
                knownVariables={knownVariables}
              />
            )}

            {reqTab === 'auth' && <AuthPanel config={config} onChange={patch} />}

            {reqTab === 'body' && (
              <BodyPanel config={config} onChange={patch} onNotify={onNotify} />
            )}

            {reqTab === 'assertions' && (
              <AssertionsPanel
                assertions={config.assertions ?? []}
                response={response}
                onChange={(assertions) => patch({ assertions })}
              />
            )}

            {reqTab === 'code' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="sr-only" htmlFor="code-language">
                    Snippet language
                  </label>
                  <select
                    id="code-language"
                    value={codeLang}
                    onChange={(e) => setCodeLang(e.target.value as CodeLanguage)}
                    className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 font-mono text-xs font-bold text-slate-200 focus:border-cyan-500 focus:outline-none"
                  >
                    {CODE_LANGUAGES.map((lang) => (
                      <option key={lang.id} value={lang.id}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void copy(snippet, 'code')}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                  >
                    {copied === 'code' ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {copied === 'code' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="max-h-[320px] overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-[11px] leading-relaxed text-cyan-300">
                  {snippet}
                </pre>
              </div>
            )}
          </div>

          <p className="truncate border-t border-slate-800 pt-3 font-mono text-[11px] text-slate-500">
            {config.method} {buildFullUrl(config)}
          </p>
        </section>

        <section className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Response
              </h2>
              {response && (
                <span
                  className={`rounded-full border px-2.5 py-0.5 font-mono text-xs font-bold ${
                    response.ok
                      ? 'border-emerald-800 bg-emerald-950 text-emerald-400'
                      : 'border-rose-800 bg-rose-950 text-rose-400'
                  }`}
                >
                  {response.status || '—'} {response.statusText}
                </span>
              )}
              {assertionResults.length > 0 && (
                <span
                  className={`rounded-full border px-2.5 py-0.5 font-mono text-xs font-bold ${
                    failedAssertions === 0
                      ? 'border-emerald-800 bg-emerald-950 text-emerald-400'
                      : 'border-rose-800 bg-rose-950 text-rose-400'
                  }`}
                >
                  {assertionResults.length - failedAssertions}/{assertionResults.length} assertions
                </span>
              )}
            </div>

            {response && (
              <div className="flex items-center gap-3 font-mono text-xs text-slate-400">
                <span className="flex items-center gap-1" title="Round trip time">
                  <Clock className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
                  {response.duration} ms
                </span>
                <span className="flex items-center gap-1" title="Payload size">
                  <Database className="h-3.5 w-3.5 text-indigo-400" aria-hidden="true" />
                  {(response.sizeBytes / 1024).toFixed(2)} KB
                </span>
                <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] uppercase">
                  {response.transport ?? 'direct'}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 pt-3">
            <div role="tablist" aria-label="Response view" className="flex items-center gap-1">
              {(
                [
                  ['body', 'Body'],
                  ['raw', 'Raw'],
                  ['headers', `Headers (${response ? Object.keys(response.headers).length : 0})`],
                  ['preview', 'Preview'],
                  ['assertions', `Assertions (${assertionResults.length})`],
                  ['diff', diffSummary ? `Diff · ${diffSummary}` : 'Diff'],
                ] as Array<[ResponseTab, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={resTab === id}
                  onClick={() => setResTab(id)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                    resTab === id
                      ? 'border border-slate-700 bg-slate-800 text-cyan-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {response && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copy(rawText, 'response')}
                  aria-label="Copy response body"
                  className="rounded-lg border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:text-slate-200"
                >
                  {copied === 'response' ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onOpenAiModal(
                      'Analyse this response: generate types, explain the key fields, and suggest edge cases worth testing.',
                      response.data,
                    )
                  }
                  className="flex items-center gap-1 rounded-lg border border-indigo-800 bg-indigo-950 px-2.5 py-1 text-xs font-semibold text-indigo-300 hover:bg-indigo-900"
                >
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  Analyse
                </button>
              </div>
            )}
          </div>

          <div className="min-h-[300px] flex-1">
            {loading && (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-800/80 bg-slate-950/60 py-20 text-center">
                <RefreshCw className="h-8 w-8 animate-spin text-cyan-400" aria-hidden="true" />
                <p className="font-mono text-xs text-cyan-300">
                  {config.useProxy && proxyAvailable
                    ? 'Sending via the proxy…'
                    : 'Sending directly from your browser…'}
                </p>
                <button
                  type="button"
                  onClick={cancel}
                  aria-label="Cancel the in-flight request"
                  className="text-[11px] text-slate-400 underline hover:text-slate-200"
                >
                  Cancel request
                </button>
              </div>
            )}

            {!loading && !response && (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-800/80 bg-slate-950/60 py-20 text-center text-slate-500">
                <Play className="h-10 w-10 text-slate-700" aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold text-slate-400">Nothing sent yet</p>
                  <p className="text-xs text-slate-600">
                    Press Send, or ⌘/Ctrl + Enter from anywhere on this page.
                  </p>
                </div>
              </div>
            )}

            {!loading && response && (
              <div className="space-y-2">
                {response.error && (
                  <div className="space-y-2 rounded-xl border border-rose-800 bg-rose-950/60 p-3 text-xs text-rose-200">
                    <p className="flex items-center gap-2 font-bold">
                      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {response.statusText}
                    </p>
                    <p className="leading-relaxed text-rose-300/90">{response.error}</p>
                    {response.errorKind === 'cors' && !proxyAvailable && (
                      <p className="text-rose-300/80">
                        No proxy is configured here. Run{' '}
                        <code className="rounded bg-rose-950 px-1">npm run dev</code> locally, or
                        deploy the Cloudflare Worker in <code>worker/</code>.
                      </p>
                    )}
                    {response.errorKind === 'cors' && proxyAvailable && !config.useProxy && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...config, useProxy: true };
                          setConfig(next);
                          void execute(next);
                        }}
                        className="rounded-lg border border-rose-700 bg-rose-900/60 px-3 py-1 font-semibold text-rose-100 hover:bg-rose-900"
                      >
                        Retry via proxy
                      </button>
                    )}
                  </div>
                )}

                {resTab === 'body' && (
                  <>
                    <label className="sr-only" htmlFor="json-filter">
                      Filter response with a JSONPath expression
                    </label>
                    <input
                      id="json-filter"
                      type="text"
                      value={jsonFilter}
                      onChange={(e) => setJsonFilter(e.target.value)}
                      placeholder="Filter with JSONPath, e.g. $.results[*].name"
                      className="mb-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 font-mono text-xs text-slate-300 placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
                    />
                    <div className="max-h-[340px] overflow-auto">
                      <JsonViewer data={response.data} filter={jsonFilter} />
                    </div>
                  </>
                )}

                {resTab === 'raw' && (
                  <pre className="max-h-[340px] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-300">
                    {rawText}
                  </pre>
                )}

                {resTab === 'headers' && (
                  <dl className="max-h-[340px] space-y-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-xs">
                    {Object.entries(response.headers).map(([key, value]) => (
                      <div
                        key={key}
                        className="flex items-start justify-between gap-3 border-b border-slate-900 py-1 last:border-0"
                      >
                        <dt className="font-semibold text-cyan-400">{key}</dt>
                        <dd className="max-w-[60%] break-all text-right text-slate-300">{value}</dd>
                      </div>
                    ))}
                    {Object.keys(response.headers).length === 0 && (
                      <p className="py-4 text-center leading-relaxed text-slate-500">
                        No headers. A cross-origin response only exposes a safelisted subset unless
                        the API sends Access-Control-Expose-Headers, and a failed request exposes
                        none.
                      </p>
                    )}
                  </dl>
                )}

                {resTab === 'preview' && (
                  <ResponsePreview
                    data={response.data}
                    contentType={response.contentType}
                    url={buildFullUrl(config)}
                  />
                )}

                {resTab === 'diff' && (
                  <div className="space-y-2">
                    {!diff ? (
                      <p className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-8 text-center text-xs leading-relaxed text-slate-500">
                        Nothing to compare against yet. Send this exact request a second time and
                        the previous payload becomes the baseline.
                      </p>
                    ) : diff.identical ? (
                      <p className="rounded-xl border border-emerald-900 bg-emerald-950/40 px-4 py-8 text-center text-xs text-emerald-300">
                        Identical to the previous run.
                      </p>
                    ) : (
                      <>
                        <p className="font-mono text-[11px] text-slate-400">
                          {diffSummary} versus the previous run
                          {diff.truncated && ' — list truncated'}
                        </p>
                        <ul className="max-h-[300px] space-y-1 overflow-y-auto">
                          {diff.changes.map((change, index) => (
                            <li
                              key={`${change.path}-${index}`}
                              className="rounded-lg border border-slate-800 bg-slate-950 p-2 font-mono text-[11px]"
                            >
                              <span className="flex items-center gap-2">
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                    change.kind === 'added'
                                      ? 'bg-emerald-950 text-emerald-400'
                                      : change.kind === 'removed'
                                        ? 'bg-rose-950 text-rose-400'
                                        : 'bg-amber-950 text-amber-400'
                                  }`}
                                >
                                  {change.kind}
                                </span>
                                <span className="truncate text-cyan-300">{change.path}</span>
                              </span>
                              {change.kind !== 'added' && (
                                <span className="mt-1 block text-rose-300">
                                  − {formatValue(change.before)}
                                </span>
                              )}
                              {change.kind !== 'removed' && (
                                <span className="block text-emerald-300">
                                  + {formatValue(change.after)}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}

                {resTab === 'assertions' && (
                  <div className="space-y-2">
                    {assertionResults.length === 0 ? (
                      <p className="rounded-xl border border-slate-800 bg-slate-950 py-8 text-center text-xs text-slate-500">
                        No assertions on this request. Add some in the Assertions tab.
                      </p>
                    ) : (
                      assertionResults.map((result, index) => (
                        <AssertionRow key={index} result={result} />
                      ))
                    )}
                  </div>
                )}

                {response.status > 0 && !response.ok && (
                  <details className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
                    <summary className="cursor-pointer font-semibold text-slate-300">
                      What does {response.status} mean?
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap leading-relaxed">
                      {explainStatus(response)}
                    </p>
                  </details>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function AssertionRow({ result }: { result: AssertionResult }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border p-2.5 font-mono text-xs ${
        result.passed
          ? 'border-emerald-900 bg-emerald-950/40 text-emerald-300'
          : 'border-rose-900 bg-rose-950/40 text-rose-300'
      }`}
    >
      {result.passed ? (
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      <span>{result.message}</span>
    </div>
  );
}

function AuthPanel({
  config,
  onChange,
}: {
  config: RequestConfig;
  onChange: (changes: Partial<RequestConfig>) => void;
}) {
  const setAuth = (next: Partial<RequestConfig['authConfig']>) =>
    onChange({ authConfig: { ...config.authConfig, ...next } });

  const field =
    'w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-200 focus:border-cyan-500 focus:outline-none';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label htmlFor="auth-type" className="font-mono text-xs text-slate-400">
          Auth type
        </label>
        <select
          id="auth-type"
          value={config.authType}
          onChange={(e) => onChange({ authType: e.target.value as AuthType })}
          className="cursor-pointer rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 focus:border-cyan-500 focus:outline-none"
        >
          {(['No Auth', 'API Key', 'Bearer Token', 'Basic Auth'] as AuthType[]).map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <p className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
        Credentials stay in this browser. They are redacted before any AI request, and are excluded
        from share links and collection exports.
      </p>

      {config.authType === 'API Key' && (
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div>
            <label htmlFor="api-key-name" className="font-mono text-[11px] text-slate-400">
              Key name
            </label>
            <input
              id="api-key-name"
              type="text"
              placeholder="X-API-Key"
              value={config.authConfig.apiKeyName ?? ''}
              onChange={(e) => setAuth({ apiKeyName: e.target.value })}
              className={`mt-1 ${field}`}
            />
          </div>
          <div>
            <label htmlFor="api-key-value" className="font-mono text-[11px] text-slate-400">
              Key value
            </label>
            <input
              id="api-key-value"
              type="password"
              autoComplete="off"
              placeholder="Your key, or {{apiKey}}"
              value={config.authConfig.apiKeyValue ?? ''}
              onChange={(e) => setAuth({ apiKeyValue: e.target.value })}
              className={`mt-1 ${field}`}
            />
          </div>
          <fieldset className="flex items-center gap-4 font-mono text-xs text-slate-300">
            <legend className="sr-only">Where to send the API key</legend>
            {(['query', 'header'] as const).map((where) => (
              <label key={where} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="apiKeyIn"
                  checked={(config.authConfig.apiKeyIn ?? 'query') === where}
                  onChange={() => setAuth({ apiKeyIn: where })}
                />
                <span>In {where === 'query' ? 'query params' : 'headers'}</span>
              </label>
            ))}
          </fieldset>
        </div>
      )}

      {config.authType === 'Bearer Token' && (
        <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950 p-4">
          <label htmlFor="bearer-token" className="font-mono text-[11px] text-slate-400">
            Bearer token
          </label>
          <input
            id="bearer-token"
            type="password"
            autoComplete="off"
            placeholder="Your token, or {{token}}"
            value={config.authConfig.bearerToken ?? ''}
            onChange={(e) => setAuth({ bearerToken: e.target.value })}
            className={field}
          />
        </div>
      )}

      {config.authType === 'Basic Auth' && (
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div>
            <label htmlFor="basic-user" className="font-mono text-[11px] text-slate-400">
              Username
            </label>
            <input
              id="basic-user"
              type="text"
              autoComplete="off"
              value={config.authConfig.basicUsername ?? ''}
              onChange={(e) => setAuth({ basicUsername: e.target.value })}
              className={`mt-1 ${field}`}
            />
          </div>
          <div>
            <label htmlFor="basic-pass" className="font-mono text-[11px] text-slate-400">
              Password
            </label>
            <input
              id="basic-pass"
              type="password"
              autoComplete="off"
              value={config.authConfig.basicPassword ?? ''}
              onChange={(e) => setAuth({ basicPassword: e.target.value })}
              className={`mt-1 ${field}`}
            />
          </div>
        </div>
      )}

      {config.authType === 'No Auth' && (
        <p className="rounded-xl border border-slate-800 bg-slate-950 py-8 text-center text-xs text-slate-500">
          No authentication is attached to this request.
        </p>
      )}
    </div>
  );
}

function BodyPanel({
  config,
  onChange,
  onNotify,
}: {
  config: RequestConfig;
  onChange: (changes: Partial<RequestConfig>) => void;
  onNotify: (message: string, tone?: 'info' | 'error') => void;
}) {
  const formatJson = () => {
    try {
      onChange({ body: JSON.stringify(JSON.parse(config.body), null, 2) });
    } catch (err) {
      onNotify(`Body is not valid JSON: ${(err as Error).message}`, 'error');
    }
  };

  const jsonError = useMemo(() => {
    if (config.bodyType !== 'json' || !config.body.trim()) return null;
    try {
      JSON.parse(config.body);
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }, [config.body, config.bodyType]);

  const methodCarriesBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(config.method);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between font-mono text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <label htmlFor="body-type">Body type</label>
          <select
            id="body-type"
            value={config.bodyType}
            onChange={(e) => onChange({ bodyType: e.target.value as BodyType })}
            className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 font-semibold text-slate-200"
          >
            <option value="none">none</option>
            <option value="json">JSON</option>
            <option value="raw">raw</option>
          </select>
        </div>
        {config.bodyType === 'json' && (
          <button
            type="button"
            onClick={formatJson}
            className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300"
          >
            Format
          </button>
        )}
      </div>

      {!methodCarriesBody && config.bodyType !== 'none' && (
        <p className="rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
          {config.method} requests do not carry a body — it will not be sent.
        </p>
      )}

      {config.bodyType === 'none' ? (
        <p className="rounded-xl border border-slate-800 bg-slate-950 py-10 text-center text-xs text-slate-500">
          No request body. Choose JSON or raw above to add one.
        </p>
      ) : (
        <>
          <label className="sr-only" htmlFor="request-body">
            Request body
          </label>
          <textarea
            id="request-body"
            value={config.body}
            onChange={(e) => onChange({ body: e.target.value })}
            placeholder={config.bodyType === 'json' ? '{\n  "key": "value"\n}' : 'Raw payload…'}
            rows={10}
            spellCheck={false}
            className={`w-full rounded-xl border bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-200 focus:outline-none ${
              jsonError
                ? 'border-rose-700 focus:border-rose-500'
                : 'border-slate-800 focus:border-cyan-500'
            }`}
          />
          {jsonError && (
            <p className="font-mono text-[11px] text-rose-400">Invalid JSON: {jsonError}</p>
          )}
        </>
      )}
    </div>
  );
}

function AssertionsPanel({
  assertions,
  response,
  onChange,
}: {
  assertions: Assertion[];
  response: ApiResponseData | null;
  onChange: (assertions: Assertion[]) => void;
}) {
  const update = (id: string, next: Partial<Assertion>) =>
    onChange(assertions.map((a) => (a.id === id ? { ...a, ...next } : a)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-slate-400">
        <span>Checks run automatically after every send</span>
        <div className="flex items-center gap-2">
          {response && (
            <button
              type="button"
              onClick={() => onChange([...assertions, ...suggestAssertions(response)])}
              className="flex items-center gap-1 font-semibold text-purple-300 hover:text-purple-200"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Suggest from response
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              onChange([
                ...assertions,
                {
                  id: `assert-${Date.now()}`,
                  source: 'status',
                  operator: 'equals',
                  expected: '200',
                  enabled: true,
                },
              ])
            }
            className="flex items-center gap-1 font-semibold text-cyan-400 hover:text-cyan-300"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add
          </button>
        </div>
      </div>

      {assertions.length === 0 ? (
        <p className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-8 text-center text-xs leading-relaxed text-slate-500">
          No assertions yet. Send a request and use <strong>Suggest from response</strong> to derive
          them from the real payload — a collection with assertions can be run as a test suite.
        </p>
      ) : (
        <ul className="space-y-2">
          {assertions.map((assertion) => (
            <li
              key={assertion.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-2"
            >
              <input
                type="checkbox"
                checked={assertion.enabled}
                onChange={(e) => update(assertion.id, { enabled: e.target.checked })}
                aria-label={`Enable assertion: ${describeAssertion(assertion)}`}
                className="cursor-pointer rounded border-slate-700 bg-slate-900 text-cyan-500"
              />
              <select
                value={assertion.source}
                onChange={(e) =>
                  update(assertion.id, { source: e.target.value as Assertion['source'] })
                }
                aria-label="Assertion source"
                className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-200"
              >
                <option value="status">status</option>
                <option value="duration">duration</option>
                <option value="header">header</option>
                <option value="body">body</option>
                <option value="jsonPath">jsonPath</option>
              </select>
              {(assertion.source === 'header' || assertion.source === 'jsonPath') && (
                <input
                  type="text"
                  value={assertion.target ?? ''}
                  onChange={(e) => update(assertion.id, { target: e.target.value })}
                  placeholder={assertion.source === 'header' ? 'content-type' : '$.results[0].id'}
                  aria-label="Assertion target"
                  className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-200"
                />
              )}
              <select
                value={assertion.operator}
                onChange={(e) =>
                  update(assertion.id, { operator: e.target.value as Assertion['operator'] })
                }
                aria-label="Assertion operator"
                className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-200"
              >
                {[
                  'equals',
                  'notEquals',
                  'contains',
                  'notContains',
                  'lessThan',
                  'greaterThan',
                  'exists',
                  'notExists',
                  'isArray',
                  'isNotEmpty',
                  'matches',
                ].map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              {!['exists', 'notExists', 'isArray', 'isNotEmpty'].includes(assertion.operator) && (
                <input
                  type="text"
                  value={assertion.expected ?? ''}
                  onChange={(e) => update(assertion.id, { expected: e.target.value })}
                  placeholder="expected"
                  aria-label="Expected value"
                  className="w-24 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-200"
                />
              )}
              <button
                type="button"
                onClick={() => onChange(assertions.filter((a) => a.id !== assertion.id))}
                aria-label={`Remove assertion: ${describeAssertion(assertion)}`}
                className="rounded p-1 text-slate-500 hover:text-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
