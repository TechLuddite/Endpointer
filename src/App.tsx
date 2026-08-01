import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { ApiDirectory } from './components/ApiDirectory';
import { Playground } from './components/Playground';
import { StatusMonitor } from './components/StatusMonitor';
import { CollectionsManager } from './components/CollectionsManager';
import { AiAssistantModal } from './components/AiAssistantModal';
import { SupportModal } from './components/SupportModal';
import { PrivacyModal } from './components/PrivacyModal';
import { Footer } from './components/Footer';
import { PUBLIC_APIS } from './data/publicApis';
import { 
  RequestConfig, ApiResponseData, HealthStatusItem, 
  RequestHistoryItem, CollectionItem 
} from './types';
import { 
  getSavedHistory, saveHistoryItem, clearHistoryStorage,
  getSavedCollections, saveCollections,
  getFavoriteApis, toggleFavoriteApi
} from './utils/storage';
import { buildFullUrl, buildHeadersRecord } from './utils/codeGenerators';

export default function App() {
  const [activeTab, setActiveTab] = useState<'directory' | 'playground' | 'monitor' | 'collections'>('directory');
  
  // Storage & State
  const [favorites, setFavorites] = useState<string[]>([]);
  const [history, setHistory] = useState<RequestHistoryItem[]>([]);
  const [collections, setCollectionsState] = useState<CollectionItem[]>([]);
  const [healthMap, setHealthMap] = useState<Record<string, HealthStatusItem>>({});

  // Playground pre-loaded config
  const [playgroundConfig, setPlaygroundConfig] = useState<RequestConfig | null>(null);

  // AI Modal State
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiContext, setAiContext] = useState<any>(null);

  // Footer Modal States
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);

  // Initialize storage
  useEffect(() => {
    setFavorites(getFavoriteApis());
    setHistory(getSavedHistory());
    setCollectionsState(getSavedCollections());
  }, []);

  // Update page title dynamically based on active tab
  useEffect(() => {
    const titleMap: Record<string, string> = {
      directory: 'Endpointer - Public API Directory & Explorer',
      playground: 'Endpointer - Interactive REST API Playground',
      monitor: 'Endpointer - Real-time API Health & Status Monitor',
      collections: 'Endpointer - Saved API Collections & History',
    };
    document.title = titleMap[activeTab] || 'Endpointer - Interactive API Directory & REST Playground';
  }, [activeTab]);

  const handleToggleFavorite = (id: string) => {
    const updated = toggleFavoriteApi(id);
    setFavorites(updated);
  };

  // Direct playground loader from directory
  const handleSelectForPlayground = (config: RequestConfig) => {
    setPlaygroundConfig(config);
    setActiveTab('playground');
  };

  // Direct client-side fetch execution (Primary engine for GitHub Pages)
  const executeDirectFetch = async (config: RequestConfig): Promise<ApiResponseData> => {
    const start = Date.now();
    const fullUrl = buildFullUrl(config);
    const headersRecord = buildHeadersRecord(config);

    const options: RequestInit = {
      method: config.method,
      headers: headersRecord,
    };

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(config.method) && config.body) {
      options.body = config.body;
    }

    try {
      const resp = await fetch(fullUrl, options);
      const duration = Date.now() - start;
      const contentType = resp.headers.get('content-type') || 'text/plain';

      const responseHeaders: Record<string, string> = {};
      resp.headers.forEach((val, key) => {
        responseHeaders[key] = val;
      });

      const text = await resp.text();
      let parsed: any = text;
      if (contentType.includes('application/json') || (text.trim().startsWith('{') || text.trim().startsWith('['))) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }
      }

      return {
        ok: resp.ok,
        status: resp.status,
        statusText: resp.statusText || (resp.ok ? 'OK' : 'Error'),
        headers: responseHeaders,
        data: parsed,
        contentType,
        duration,
        sizeBytes: text.length,
        timestamp: Date.now(),
      };
    } catch (err: any) {
      const duration = Date.now() - start;
      return {
        ok: false,
        status: 0,
        statusText: 'CORS / Direct Network Error',
        headers: {},
        data: {
          error: err?.message || 'Direct browser fetch failed.',
          details: 'When hosting on GitHub Pages or static hosts, requests are executed directly in your browser. If the target API endpoint does not return CORS headers (`Access-Control-Allow-Origin: *`), browser security blocks the response.',
          suggestion: 'Ensure the API supports CORS (e.g. Open-Meteo, PokeAPI, JSONPlaceholder, CoinGecko), or use the generated cURL/Fetch snippets in terminal or Postman.',
        },
        contentType: 'application/json',
        duration,
        sizeBytes: 0,
        timestamp: Date.now(),
        error: err?.message || 'Browser CORS Restriction',
      };
    }
  };

  // Direct client ping for static hosts
  const pingDirectly = async (api: typeof PUBLIC_APIS[0]): Promise<HealthStatusItem> => {
    const start = Date.now();
    try {
      const resp = await fetch(api.sampleEndpoint, { method: api.defaultMethod || 'GET', mode: 'cors' });
      return {
        id: api.id,
        url: api.sampleEndpoint,
        status: resp.status,
        ok: resp.ok,
        latency: Date.now() - start,
        timestamp: Date.now(),
      };
    } catch {
      return {
        id: api.id,
        url: api.sampleEndpoint,
        status: 0,
        ok: false,
        latency: Date.now() - start,
        timestamp: Date.now(),
        error: 'CORS / Network Error',
      };
    }
  };

  // Execute request (Direct Browser Client as default)
  const handleExecuteRequest = async (config: RequestConfig): Promise<ApiResponseData> => {
    let responseData: ApiResponseData;

    if (config.useProxy) {
      try {
        const resp = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: config.url,
            method: config.method,
            params: config.params.filter(p => p.enabled && p.key).reduce((acc: any, curr) => {
              acc[curr.key] = curr.value;
              return acc;
            }, {}),
            headers: config.headers.filter(h => h.enabled && h.key).reduce((acc: any, curr) => {
              acc[curr.key] = curr.value;
              return acc;
            }, {}),
            body: config.body,
          }),
        });

        if (!resp.ok || resp.headers.get('content-type')?.includes('text/html')) {
          responseData = await executeDirectFetch(config);
        } else {
          responseData = await resp.json();
        }
      } catch {
        responseData = await executeDirectFetch(config);
      }
    } else {
      responseData = await executeDirectFetch(config);
    }

    // Save to history
    const historyItem: RequestHistoryItem = {
      id: `hist-${Date.now()}`,
      name: config.name || config.url,
      timestamp: Date.now(),
      config,
      response: responseData,
    };
    const updatedHistory = saveHistoryItem(historyItem);
    setHistory(updatedHistory);

    return responseData;
  };

  // Quick single API ping
  const handleQuickPing = async (api: typeof PUBLIC_APIS[0]) => {
    const item = await pingDirectly(api);
    setHealthMap(prev => ({ ...prev, [api.id]: item }));
  };

  // Batch health check for Status Monitor
  const handleBatchPing = useCallback(async (selectedApis: typeof PUBLIC_APIS) => {
    const directResults = await Promise.all(selectedApis.map(pingDirectly));
    const newMap: Record<string, HealthStatusItem> = {};
    directResults.forEach(r => { newMap[r.id] = r; });
    setHealthMap(prev => ({ ...prev, ...newMap }));
  }, []);

  // Save to collection
  const handleSaveToCollection = (config: RequestConfig, response?: ApiResponseData) => {
    const updatedCols = [...collections];
    if (updatedCols.length === 0) {
      updatedCols.push({
        id: `col-${Date.now()}`,
        name: 'My Saved Requests',
        description: 'Default saved endpoints',
        createdAt: Date.now(),
        requests: [config],
      });
    } else {
      updatedCols[0].requests.push(config);
    }

    saveCollections(updatedCols);
    setCollectionsState(updatedCols);
    alert('Request saved to collection!');
  };

  const handleClearHistory = () => {
    clearHistoryStorage();
    setHistory([]);
  };

  const handleOpenAiModal = (prompt?: string, context?: any) => {
    if (prompt) setAiPrompt(prompt);
    if (context) setAiContext(context);
    setIsAiModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-cyan-500 selection:text-slate-950 flex flex-col">
      {/* Navbar Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        apiCount={PUBLIC_APIS.length}
        openAiModal={() => handleOpenAiModal()}
        proxyActive={true}
        historyCount={history.length}
      />

      {/* Main View Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {activeTab === 'directory' && (
          <ApiDirectory
            apis={PUBLIC_APIS}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onSelectForPlayground={handleSelectForPlayground}
            healthMap={healthMap}
            onQuickPing={handleQuickPing}
          />
        )}

        {activeTab === 'playground' && (
          <Playground
            initialConfig={playgroundConfig}
            onExecuteRequest={handleExecuteRequest}
            onSaveToCollection={handleSaveToCollection}
            openAiModalWithContext={(prompt, context) => handleOpenAiModal(prompt, context)}
          />
        )}

        {activeTab === 'monitor' && (
          <StatusMonitor
            apis={PUBLIC_APIS}
            healthMap={healthMap}
            onBatchPing={handleBatchPing}
            onSelectForPlayground={handleSelectForPlayground}
          />
        )}

        {activeTab === 'collections' && (
          <CollectionsManager
            collections={collections}
            history={history}
            onSelectRequestForPlayground={handleSelectForPlayground}
            onClearHistory={handleClearHistory}
            onSaveCollections={(cols) => {
              saveCollections(cols);
              setCollectionsState(cols);
            }}
          />
        )}
      </main>

      {/* AI Assistant Modal */}
      <AiAssistantModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        initialPrompt={aiPrompt}
        initialContext={aiContext}
      />

      {/* Developer Support Modal */}
      <SupportModal
        isOpen={isSupportModalOpen}
        onClose={() => setIsSupportModalOpen(false)}
      />

      {/* Privacy Policy Modal */}
      <PrivacyModal
        isOpen={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
      />

      {/* Application Footer with Support & Privacy Buttons */}
      <Footer
        onOpenSupport={() => setIsSupportModalOpen(true)}
        onOpenPrivacy={() => setIsPrivacyModalOpen(true)}
      />
    </div>
  );
}
