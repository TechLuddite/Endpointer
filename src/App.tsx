import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from './components/Header';
import { ApiDirectory, configFromApi } from './components/ApiDirectory';
import { Playground } from './components/Playground';
import { StatusMonitor } from './components/StatusMonitor';
import { CollectionsManager } from './components/CollectionsManager';
import { AiAssistantModal } from './components/AiAssistantModal';
import { EnvironmentManager } from './components/EnvironmentManager';
import { CommandPalette, type Command } from './components/CommandPalette';
import { SupportModal } from './components/SupportModal';
import { PrivacyModal } from './components/PrivacyModal';
import { Footer } from './components/Footer';
import { Toasts, type Toast } from './components/Toasts';
import { PUBLIC_APIS } from './data/publicApis';
import type {
  ApiResponseData,
  Capabilities,
  CollectionItem,
  Environment,
  HealthStatusItem,
  PublicApiItem,
  RequestConfig,
  RequestHistoryItem,
  StatusFile,
} from './types';
import {
  clearHistoryStorage,
  getActiveEnvironmentId,
  getEnvironments,
  getFavoriteApis,
  getSavedCollections,
  getSavedHistory,
  migrateIfNeeded,
  saveCollections,
  saveEnvironments,
  saveHistoryItem,
  setActiveEnvironmentId,
  toggleFavoriteApi,
} from './utils/storage';
import { detectCapabilities, proxyEndpoint, UNKNOWN_CAPABILITIES } from './utils/capabilities';
import { indexStatus, loadStatusFile } from './utils/status';
import { executeRequest } from './utils/execute';
import { applyVariables, resolveEnvironment } from './utils/variables';
import { decodeRequest, encodeRequest } from './utils/shareLink';
import { TAB_TITLES, useHashRoute, type TabId } from './hooks/useHashRoute';

export default function App() {
  const { route, navigate } = useHashRoute();

  const [favorites, setFavorites] = useState<string[]>([]);
  const [history, setHistory] = useState<RequestHistoryItem[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [activeEnvId, setActiveEnvId] = useState<string | null>(null);

  const [capabilities, setCapabilities] = useState<Capabilities>(UNKNOWN_CAPABILITIES);
  const [statusFile, setStatusFile] = useState<StatusFile | null>(null);
  const [liveResults, setLiveResults] = useState<Record<string, HealthStatusItem>>({});

  const [playgroundConfig, setPlaygroundConfig] = useState<RequestConfig | null>(null);
  const [currentConfig, setCurrentConfig] = useState<RequestConfig | null>(null);
  const [lastResponse, setLastResponse] = useState<unknown>(null);

  const [aiModal, setAiModal] = useState<{ open: boolean; prompt: string }>({
    open: false,
    prompt: '',
  });
  const [envModalOpen, setEnvModalOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((message: string, tone: 'info' | 'error' = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((current) => [...current.slice(-3), { id, message, tone }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 6000);
  }, []);

  /* ------------------------------ bootstrap ------------------------------ */

  useEffect(() => {
    migrateIfNeeded();
    setFavorites(getFavoriteApis());
    setHistory(getSavedHistory());
    setCollections(getSavedCollections());
    setEnvironments(getEnvironments());
    setActiveEnvId(getActiveEnvironmentId());

    void detectCapabilities().then(setCapabilities);
    void loadStatusFile().then(setStatusFile);
  }, []);

  const statusById = useMemo(() => indexStatus(statusFile), [statusFile]);

  // Overlay the verified CORS data onto the directory, so the badge reflects
  // measurement rather than the hand-written value in the source file.
  const apis = useMemo<PublicApiItem[]>(
    () =>
      PUBLIC_APIS.map((api) => {
        const status = statusById.get(api.id);
        return status ? { ...api, cors: status.cors } : api;
      }),
    [statusById],
  );

  const environment = useMemo(
    () => environments.find((env) => env.id === activeEnvId) ?? null,
    [environments, activeEnvId],
  );

  /**
   * The most recent stored response for the request currently open, so the
   * playground can diff against it. History is already persisted; this just
   * reads it back.
   */
  const previousResponse = useMemo(() => {
    if (!currentConfig) return null;
    const key = `${currentConfig.method} ${currentConfig.url}`;
    return (
      history.find((item) => `${item.config.method} ${item.config.url}` === key)?.response ?? null
    );
  }, [history, currentConfig]);

  /* ------------------------- shared request links ------------------------ */

  useEffect(() => {
    const encoded = route.params.get('r');
    if (!encoded) return;
    const decoded = decodeRequest(encoded);
    if (decoded) {
      setPlaygroundConfig(decoded);
      notify('Loaded a shared request. Credentials are never included in a link.');
    } else {
      notify('That share link could not be decoded.', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params.get('r')]);

  useEffect(() => {
    document.title = `${TAB_TITLES[route.tab]} · Endpointer`;
  }, [route.tab]);

  /* ---------------------------- request execution ------------------------ */

  const runRequest = useCallback(
    async (config: RequestConfig, options: { signal: AbortSignal }): Promise<ApiResponseData> => {
      const vars = resolveEnvironment(environment);
      const resolved = applyVariables(config, vars);

      const response = await executeRequest(resolved, {
        signal: options.signal,
        proxyUrl: proxyEndpoint(capabilities),
      });

      setLastResponse(response.data);

      // The returned list is the truth; saveHistoryItem sheds weight rather
      // than reporting an empty history when the quota is hit.
      setHistory(
        saveHistoryItem({
          id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: config.name ?? `${config.method} ${config.url}`,
          timestamp: Date.now(),
          config,
          response,
        }),
      );

      return response;
    },
    [capabilities, environment],
  );

  const livePing = useCallback(
    async (targets: PublicApiItem[]) => {
      const CONCURRENCY = 6;
      const queue = [...targets];
      const results: Record<string, HealthStatusItem> = {};

      const worker = async () => {
        while (queue.length > 0) {
          const api = queue.shift();
          if (!api) return;
          const started = Date.now();
          const controller = new AbortController();
          const response = await executeRequest(
            { ...configFromApi(api), useProxy: false },
            { signal: controller.signal, timeoutMs: 8000, proxyUrl: null },
          );
          results[api.id] = {
            id: api.id,
            url: api.sampleEndpoint,
            status: response.status,
            ok: response.ok,
            latency: Date.now() - started,
            timestamp: Date.now(),
            error: response.error,
          };
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => worker()),
      );
      setLiveResults((current) => ({ ...current, ...results }));
      const reachable = Object.values(results).filter((r) => r.ok).length;
      notify(`Pinged ${targets.length} endpoints from your browser — ${reachable} responded.`);
    },
    [notify],
  );

  /* ------------------------------- handlers ------------------------------ */

  const openInPlayground = useCallback(
    (config: RequestConfig) => {
      setPlaygroundConfig(config);
      navigate('playground');
    },
    [navigate],
  );

  const persistCollections = useCallback(
    (next: CollectionItem[]) => {
      setCollections(next);
      const result = saveCollections(next);
      if (!result.ok) {
        notify(
          result.reason === 'quota'
            ? 'Browser storage is full — remove some collections or history.'
            : 'Storage is unavailable, so this change will not survive a reload.',
          'error',
        );
      }
    },
    [notify],
  );

  const persistEnvironments = useCallback((next: Environment[]) => {
    setEnvironments(next);
    saveEnvironments(next);
  }, []);

  const selectEnvironment = useCallback((id: string | null) => {
    setActiveEnvId(id);
    setActiveEnvironmentId(id);
  }, []);

  /**
   * Save into a chosen collection, without mutating existing state objects. The
   * previous version shallow-copied the array and then pushed into
   * `updatedCols[0].requests`, mutating the live object, and always targeted
   * collection zero with no way to pick.
   */
  const saveToCollection = useCallback(
    (config: RequestConfig) => {
      const target =
        collections.length === 1
          ? collections[0]
          : collections.find(
              (c) =>
                c.name ===
                window.prompt(
                  `Save to which collection?\n\n${collections.map((c) => `• ${c.name}`).join('\n')}`,
                  collections[0]?.name ?? '',
                ),
            );

      if (collections.length === 0) {
        persistCollections([
          {
            id: `col-${Date.now()}`,
            name: 'My requests',
            description: 'Saved from the playground',
            createdAt: Date.now(),
            requests: [config],
          },
        ]);
        notify('Created “My requests” and saved this request.');
        return;
      }

      if (!target) {
        notify('Save cancelled.');
        return;
      }

      persistCollections(
        collections.map((collection) =>
          collection.id === target.id
            ? { ...collection, requests: [...collection.requests, { ...config }] }
            : collection,
        ),
      );
      notify(`Saved to “${target.name}”.`);
    },
    [collections, persistCollections, notify],
  );

  /* --------------------------- command palette --------------------------- */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const commands = useMemo<Command[]>(() => {
    const tabCommands: Command[] = (Object.keys(TAB_TITLES) as TabId[]).map((tab) => ({
      id: `tab-${tab}`,
      group: 'Go to',
      label: TAB_TITLES[tab],
      run: () => navigate(tab),
    }));

    const apiCommands: Command[] = apis.map((api) => ({
      id: `api-${api.id}`,
      group: 'API',
      label: api.name,
      hint: statusById.get(api.id)?.cors === 'yes' ? 'browser-ready' : undefined,
      run: () => openInPlayground(configFromApi(api)),
    }));

    const actionCommands: Command[] = [
      {
        id: 'action-share',
        group: 'Action',
        label: 'Copy share link for the current request',
        run: () => {
          if (!currentConfig) return notify('Open a request first.', 'error');
          void navigator.clipboard
            .writeText(
              `${window.location.origin}${window.location.pathname}#/playground?r=${encodeRequest(currentConfig)}`,
            )
            .then(() => notify('Share link copied.'));
        },
      },
      {
        id: 'action-env',
        group: 'Action',
        label: 'Manage environments and variables',
        run: () => setEnvModalOpen(true),
      },
      {
        id: 'action-analyse',
        group: 'Action',
        label: 'Analyse the last response',
        run: () => setAiModal({ open: true, prompt: 'Analyse this response payload.' }),
      },
      {
        id: 'action-privacy',
        group: 'Action',
        label: 'Privacy policy',
        run: () => setPrivacyOpen(true),
      },
    ];

    return [...tabCommands, ...actionCommands, ...apiCommands];
  }, [apis, statusById, navigate, openInPlayground, currentConfig, notify]);

  /* -------------------------------- render ------------------------------- */

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 font-sans text-slate-100 antialiased selection:bg-cyan-500 selection:text-slate-950">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-cyan-500 focus:px-4 focus:py-2 focus:font-semibold focus:text-slate-950"
      >
        Skip to content
      </a>

      <Header
        activeTab={route.tab}
        onNavigate={navigate}
        apiCount={apis.length}
        historyCount={history.length}
        capabilities={capabilities}
        environments={environments}
        activeEnvironmentId={activeEnvId}
        onSelectEnvironment={selectEnvironment}
        onOpenEnvironments={() => setEnvModalOpen(true)}
        onOpenAiModal={() => setAiModal({ open: true, prompt: 'Analyse this response payload.' })}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 sm:px-6 lg:px-8">
        {route.tab === 'directory' && (
          <ApiDirectory
            apis={apis}
            favorites={favorites}
            statusById={statusById}
            statusFile={statusFile}
            onToggleFavorite={(id) => setFavorites(toggleFavoriteApi(id))}
            onSelectForPlayground={openInPlayground}
          />
        )}

        {route.tab === 'playground' && (
          <Playground
            initialConfig={playgroundConfig}
            capabilities={capabilities}
            environment={environment}
            onExecuteRequest={runRequest}
            onSaveToCollection={saveToCollection}
            onOpenAiModal={(prompt, context) => {
              setLastResponse(context);
              setAiModal({ open: true, prompt });
            }}
            onConfigChange={setCurrentConfig}
            onNotify={notify}
            previousResponse={previousResponse}
          />
        )}

        {route.tab === 'monitor' && (
          <StatusMonitor
            apis={apis}
            statusById={statusById}
            statusFile={statusFile}
            liveResults={liveResults}
            onLivePing={livePing}
            onSelectForPlayground={openInPlayground}
          />
        )}

        {route.tab === 'collections' && (
          <CollectionsManager
            collections={collections}
            history={history}
            environment={environment}
            onSaveCollections={persistCollections}
            onSelectRequestForPlayground={openInPlayground}
            onClearHistory={() => {
              clearHistoryStorage();
              setHistory([]);
              notify('History cleared.');
            }}
            onExecuteRequest={runRequest}
            onNotify={notify}
          />
        )}
      </main>

      <AiAssistantModal
        isOpen={aiModal.open}
        onClose={() => setAiModal({ open: false, prompt: '' })}
        capabilities={capabilities}
        initialPrompt={aiModal.prompt}
        context={lastResponse}
      />

      <EnvironmentManager
        isOpen={envModalOpen}
        onClose={() => setEnvModalOpen(false)}
        environments={environments}
        activeId={activeEnvId}
        onSave={persistEnvironments}
        onSelect={selectEnvironment}
      />

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
      />

      <SupportModal isOpen={supportOpen} onClose={() => setSupportOpen(false)} />
      <PrivacyModal isOpen={privacyOpen} onClose={() => setPrivacyOpen(false)} />

      <Toasts toasts={toasts} onDismiss={(id) => setToasts((c) => c.filter((t) => t.id !== id))} />

      <Footer
        capabilities={capabilities}
        onOpenSupport={() => setSupportOpen(true)}
        onOpenPrivacy={() => setPrivacyOpen(true)}
      />
    </div>
  );
}
