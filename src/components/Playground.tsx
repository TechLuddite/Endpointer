import React, { useState, useEffect, useMemo } from 'react';
import {
  Play,
  Send,
  Code,
  Copy,
  Check,
  ShieldCheck,
  Sparkles,
  Plus,
  Trash2,
  FileText,
  Lock,
  Clock,
  Database,
  RefreshCw,
} from 'lucide-react';
import { HttpMethod, AuthType, KeyValuePair, RequestConfig, ApiResponseData } from '../types';
import { generateCodeSnippet, buildFullUrl } from '../utils/codeGenerators';
import { PlaygroundAiChat } from './PlaygroundAiChat';

interface PlaygroundProps {
  initialConfig?: RequestConfig | null;
  onExecuteRequest: (config: RequestConfig) => Promise<ApiResponseData>;
  onSaveToCollection: (config: RequestConfig, response?: ApiResponseData) => void;
  openAiModalWithContext: (prompt: string, context: any) => void;
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

export const Playground: React.FC<PlaygroundProps> = ({
  initialConfig,
  onExecuteRequest,
  onSaveToCollection,
  openAiModalWithContext,
}) => {
  // Request Configuration State
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState<string>(
    'https://api.open-meteo.com/v1/forecast?latitude=37.7749&longitude=-122.4194&current_weather=true',
  );
  const [params, setParams] = useState<KeyValuePair[]>([]);
  const [headers, setHeaders] = useState<KeyValuePair[]>([
    { id: '1', key: 'Accept', value: 'application/json', enabled: true },
  ]);
  const [authType, setAuthType] = useState<AuthType>('No Auth');
  const [authConfig, setAuthConfig] = useState({
    apiKeyName: '',
    apiKeyValue: '',
    apiKeyIn: 'query' as 'header' | 'query',
    bearerToken: '',
    basicUsername: '',
    basicPassword: '',
  });
  const [bodyType, setBodyType] = useState<'none' | 'json' | 'form-data' | 'raw'>('none');
  const [body, setBody] = useState<string>('');
  const [useProxy, setUseProxy] = useState<boolean>(false);

  // UI Tabs State
  const [reqTab, setReqTab] = useState<'params' | 'headers' | 'auth' | 'body' | 'code'>('params');
  const [resTab, setResTab] = useState<'parsed' | 'raw' | 'headers' | 'preview'>('parsed');
  const [codeLang, setCodeLang] = useState<any>('fetch');
  const [jsonSearchFilter, setJsonSearchFilter] = useState('');

  // Execution & Response State
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<ApiResponseData | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedResponse, setCopiedResponse] = useState<boolean>(false);

  // Load initial config when passed from Directory or History
  useEffect(() => {
    if (initialConfig) {
      if (initialConfig.method) setMethod(initialConfig.method);
      if (initialConfig.url) setUrl(initialConfig.url);
      if (initialConfig.params) setParams(initialConfig.params);
      if (initialConfig.headers) setHeaders(initialConfig.headers);
      if (initialConfig.authType) setAuthType(initialConfig.authType);
      if (initialConfig.authConfig) setAuthConfig({ ...authConfig, ...initialConfig.authConfig });
      if (initialConfig.bodyType) setBodyType(initialConfig.bodyType);
      if (initialConfig.body) setBody(initialConfig.body);
      if (typeof initialConfig.useProxy === 'boolean') setUseProxy(initialConfig.useProxy);
    }
  }, [initialConfig]);

  // Construct current request config object
  const currentConfig: RequestConfig = useMemo(
    () => ({
      method,
      url,
      params,
      headers,
      authType,
      authConfig,
      bodyType,
      body,
      useProxy,
    }),
    [method, url, params, headers, authType, authConfig, bodyType, body, useProxy],
  );

  // Sync Params with URL query string
  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    try {
      const parsed = new URL(newUrl);
      const urlParams: KeyValuePair[] = [];
      parsed.searchParams.forEach((val, key) => {
        urlParams.push({ id: Math.random().toString(), key, value: val, enabled: true });
      });
      if (urlParams.length > 0) {
        setParams(urlParams);
      }
    } catch {
      // Invalid URL input mid-type, keep current params
    }
  };

  const handleExecute = async () => {
    setLoading(true);
    setResponse(null);
    try {
      const res = await onExecuteRequest(currentConfig);
      setResponse(res);
    } catch (err: any) {
      setResponse({
        ok: false,
        status: 500,
        statusText: 'Execution Error',
        headers: {},
        data: { error: err?.message || 'Failed to send request' },
        contentType: 'application/json',
        duration: 0,
        sizeBytes: 0,
        timestamp: Date.now(),
        error: err?.message,
      });
    } finally {
      setLoading(false);
    }
  };

  // Callback to drive Playground configuration from AI Chat Assistant
  const handleApplyConfigFromAi = (configUpdate: Partial<RequestConfig>) => {
    if (configUpdate.method) setMethod(configUpdate.method);
    if (configUpdate.url) handleUrlChange(configUpdate.url);
    if (configUpdate.params && Array.isArray(configUpdate.params)) {
      setParams(
        configUpdate.params.map((p: any, idx: number) => ({
          id: p.id || `ai-param-${Date.now()}-${idx}`,
          key: p.key || '',
          value: String(p.value ?? ''),
          enabled: typeof p.enabled === 'boolean' ? p.enabled : true,
        })),
      );
    }
    if (configUpdate.headers && Array.isArray(configUpdate.headers)) {
      setHeaders(
        configUpdate.headers.map((h: any, idx: number) => ({
          id: h.id || `ai-header-${Date.now()}-${idx}`,
          key: h.key || '',
          value: String(h.value ?? ''),
          enabled: typeof h.enabled === 'boolean' ? h.enabled : true,
        })),
      );
    }
    if (configUpdate.authType) setAuthType(configUpdate.authType);
    if (configUpdate.authConfig) setAuthConfig((prev) => ({ ...prev, ...configUpdate.authConfig }));
    if (configUpdate.bodyType) setBodyType(configUpdate.bodyType);
    if (typeof configUpdate.body === 'string') setBody(configUpdate.body);
    if (typeof configUpdate.useProxy === 'boolean') setUseProxy(configUpdate.useProxy);
  };

  // Param Table Manipulations
  const addParamRow = () => {
    setParams([...params, { id: Date.now().toString(), key: '', value: '', enabled: true }]);
  };
  const removeParamRow = (id: string) => {
    setParams(params.filter((p) => p.id !== id));
  };
  const updateParamRow = (id: string, field: 'key' | 'value' | 'enabled', val: any) => {
    setParams(params.map((p) => (p.id === id ? { ...p, [field]: val } : p)));
  };

  // Header Table Manipulations
  const addHeaderRow = () => {
    setHeaders([...headers, { id: Date.now().toString(), key: '', value: '', enabled: true }]);
  };
  const removeHeaderRow = (id: string) => {
    setHeaders(headers.filter((h) => h.id !== id));
  };
  const updateHeaderRow = (id: string, field: 'key' | 'value' | 'enabled', val: any) => {
    setHeaders(headers.map((h) => (h.id === id ? { ...h, [field]: val } : h)));
  };

  // Code snippet text
  const currentSnippet = useMemo(() => {
    return generateCodeSnippet(currentConfig, codeLang);
  }, [currentConfig, codeLang]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentSnippet);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyResponse = () => {
    if (!response) return;
    const text =
      typeof response.data === 'object'
        ? JSON.stringify(response.data, null, 2)
        : String(response.data);
    navigator.clipboard.writeText(text);
    setCopiedResponse(true);
    setTimeout(() => setCopiedResponse(false), 2000);
  };

  // Pre-fill sample body templates
  const handleFormatJsonBody = () => {
    try {
      const parsed = JSON.parse(body);
      setBody(JSON.stringify(parsed, null, 2));
    } catch {
      // invalid json
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Request Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          {/* Method Selector */}
          <div className="relative min-w-[120px]">
            <select
              id="playground-method-select"
              value={method}
              onChange={(e) => setMethod(e.target.value as HttpMethod)}
              className={`w-full appearance-none px-3.5 py-2.5 rounded-xl border font-bold text-sm text-center font-mono cursor-pointer transition-all ${METHOD_COLORS[method]}`}
            >
              {HTTP_METHODS.map((m) => (
                <option key={m} value={m} className="bg-slate-900 text-slate-100 font-mono">
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* URL Input */}
          <div className="flex-1 relative">
            <input
              id="playground-url-input"
              type="text"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="Enter request endpoint URL (e.g. https://api.open-meteo.com/v1/forecast?latitude=37.77...)"
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 font-mono text-sm placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
            />
          </div>

          {/* Mode Toggle (Direct Browser Client vs Proxy) */}
          <button
            id="btn-toggle-proxy"
            onClick={() => setUseProxy(!useProxy)}
            className={`flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-mono font-medium transition-all ${
              !useProxy
                ? 'bg-cyan-950/80 border-cyan-800 text-cyan-300'
                : 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
            }`}
            title={
              useProxy
                ? 'Server proxy mode (requires backend proxy server)'
                : 'Direct browser execution (100% static & GitHub Pages ready)'
            }
          >
            <ShieldCheck
              className={`w-4 h-4 ${!useProxy ? 'text-cyan-400' : 'text-emerald-400'}`}
            />
            <span className="hidden sm:inline">Mode:</span>
            <span>{useProxy ? 'Server Proxy' : 'Direct (Browser)'}</span>
          </button>

          {/* Send Request Button */}
          <button
            id="btn-send-request"
            onClick={handleExecute}
            disabled={loading || !url}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-bold text-sm shadow-lg shadow-cyan-500/20 disabled:opacity-50 transition-all active:scale-95"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4 text-white" />
                <span>Send</span>
              </>
            )}
          </button>
        </div>

        {/* Quick Endpoint Presets Bar */}
        <div className="flex items-center gap-2 overflow-x-auto text-xs pt-1 border-t border-slate-800/60 text-slate-400">
          <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500">
            Quick Presets:
          </span>
          <button
            onClick={() => {
              setMethod('GET');
              setUrl(
                'https://api.open-meteo.com/v1/forecast?latitude=37.7749&longitude=-122.4194&current_weather=true',
              );
              handleUrlChange(
                'https://api.open-meteo.com/v1/forecast?latitude=37.7749&longitude=-122.4194&current_weather=true',
              );
            }}
            className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 font-mono border border-slate-800 text-[11px]"
          >
            Weather Forecast
          </button>
          <button
            onClick={() => {
              setMethod('GET');
              setUrl(
                'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd',
              );
              handleUrlChange(
                'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd',
              );
            }}
            className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 font-mono border border-slate-800 text-[11px]"
          >
            Crypto Prices
          </button>
          <button
            onClick={() => {
              setMethod('GET');
              setUrl('https://pokeapi.co/api/v2/pokemon/charizard');
              handleUrlChange('https://pokeapi.co/api/v2/pokemon/charizard');
            }}
            className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 font-mono border border-slate-800 text-[11px]"
          >
            Pokédex
          </button>
          <button
            onClick={() => {
              setMethod('POST');
              setUrl('https://jsonplaceholder.typicode.com/posts');
              setBodyType('json');
              setBody(
                JSON.stringify(
                  { title: 'Endpointer Test', body: 'Testing REST POST runner', userId: 1 },
                  null,
                  2,
                ),
              );
            }}
            className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 font-mono border border-slate-800 text-[11px]"
          >
            Mock JSON POST
          </button>
        </div>
      </div>

      {/* Interactive AI Chat Assistant Helper (Red Box Banner) */}
      <PlaygroundAiChat
        currentConfig={currentConfig}
        response={response}
        onApplyConfig={handleApplyConfigFromAi}
        onExecuteRequest={handleExecute}
      />

      {/* Main Grid: Left Request Builder, Right Response Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT PANEL: Request Configuration */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl flex flex-col justify-between">
          <div>
            {/* Request Tabs Header */}
            <div className="flex items-center gap-1 border-b border-slate-800 pb-2 overflow-x-auto">
              <button
                id="req-tab-params"
                onClick={() => setReqTab('params')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  reqTab === 'params'
                    ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Params</span>
                <span className="px-1.5 text-[10px] rounded-full bg-slate-950 text-slate-400">
                  {params.filter((p) => p.enabled && p.key).length}
                </span>
              </button>

              <button
                id="req-tab-headers"
                onClick={() => setReqTab('headers')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  reqTab === 'headers'
                    ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Headers</span>
                <span className="px-1.5 text-[10px] rounded-full bg-slate-950 text-slate-400">
                  {headers.filter((h) => h.enabled && h.key).length}
                </span>
              </button>

              <button
                id="req-tab-auth"
                onClick={() => setReqTab('auth')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  reqTab === 'auth'
                    ? 'bg-slate-800 text-amber-400 border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Lock className="w-3 h-3 text-amber-400" />
                <span>Auth ({authType})</span>
              </button>

              <button
                id="req-tab-body"
                onClick={() => setReqTab('body')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  reqTab === 'body'
                    ? 'bg-slate-800 text-purple-400 border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-3 h-3 text-purple-400" />
                <span>Body ({bodyType})</span>
              </button>

              <button
                id="req-tab-code"
                onClick={() => setReqTab('code')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  reqTab === 'code'
                    ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Code className="w-3 h-3 text-emerald-400" />
                <span>Code Generator</span>
              </button>
            </div>

            {/* TAB CONTENT */}
            <div className="pt-4 min-h-[280px]">
              {/* PARAMS TAB */}
              {reqTab === 'params' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400 px-1 font-mono">
                    <span>Query Parameters</span>
                    <button
                      onClick={addParamRow}
                      className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Key-Value</span>
                    </button>
                  </div>

                  {params.length === 0 ? (
                    <div className="text-center py-8 bg-slate-950 border border-slate-800 rounded-xl text-slate-500 text-xs">
                      No URL query parameters defined. Click 'Add Key-Value' above.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {params.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-2 bg-slate-950 p-2 rounded-xl border border-slate-800"
                        >
                          <input
                            type="checkbox"
                            checked={p.enabled}
                            onChange={(e) => updateParamRow(p.id, 'enabled', e.target.checked)}
                            className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0 cursor-pointer"
                          />
                          <input
                            type="text"
                            placeholder="Key"
                            value={p.key}
                            onChange={(e) => updateParamRow(p.id, 'key', e.target.value)}
                            className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                          />
                          <input
                            type="text"
                            placeholder="Value"
                            value={p.value}
                            onChange={(e) => updateParamRow(p.id, 'value', e.target.value)}
                            className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                          />
                          <button
                            onClick={() => removeParamRow(p.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* HEADERS TAB */}
              {reqTab === 'headers' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400 px-1 font-mono">
                    <span>HTTP Request Headers</span>
                    <button
                      onClick={addHeaderRow}
                      className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Header</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {headers.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center gap-2 bg-slate-950 p-2 rounded-xl border border-slate-800"
                      >
                        <input
                          type="checkbox"
                          checked={h.enabled}
                          onChange={(e) => updateHeaderRow(h.id, 'enabled', e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0 cursor-pointer"
                        />
                        <input
                          type="text"
                          placeholder="Header Name"
                          value={h.key}
                          onChange={(e) => updateHeaderRow(h.id, 'key', e.target.value)}
                          className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                        />
                        <input
                          type="text"
                          placeholder="Header Value"
                          value={h.value}
                          onChange={(e) => updateHeaderRow(h.id, 'value', e.target.value)}
                          className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                        />
                        <button
                          onClick={() => removeHeaderRow(h.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AUTH TAB */}
              {reqTab === 'auth' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-slate-400 font-mono">Auth Type:</label>
                    <select
                      value={authType}
                      onChange={(e) => setAuthType(e.target.value as AuthType)}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="No Auth">No Auth</option>
                      <option value="API Key">API Key</option>
                      <option value="Bearer Token">Bearer Token</option>
                      <option value="Basic Auth">Basic Auth</option>
                    </select>
                  </div>

                  {authType === 'API Key' && (
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                      <div>
                        <label className="text-[11px] text-slate-400 font-mono">Key Name</label>
                        <input
                          type="text"
                          placeholder="e.g. api_key or X-API-KEY"
                          value={authConfig.apiKeyName}
                          onChange={(e) =>
                            setAuthConfig({ ...authConfig, apiKeyName: e.target.value })
                          }
                          className="w-full mt-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 font-mono">Key Value</label>
                        <input
                          type="text"
                          placeholder="Secret API key string..."
                          value={authConfig.apiKeyValue}
                          onChange={(e) =>
                            setAuthConfig({ ...authConfig, apiKeyValue: e.target.value })
                          }
                          className="w-full mt-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-300 font-mono">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="apiKeyIn"
                            checked={authConfig.apiKeyIn === 'query'}
                            onChange={() => setAuthConfig({ ...authConfig, apiKeyIn: 'query' })}
                          />
                          <span>In Query Params</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="apiKeyIn"
                            checked={authConfig.apiKeyIn === 'header'}
                            onChange={() => setAuthConfig({ ...authConfig, apiKeyIn: 'header' })}
                          />
                          <span>In Headers</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {authType === 'Bearer Token' && (
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                      <label className="text-[11px] text-slate-400 font-mono">Bearer Token</label>
                      <input
                        type="text"
                        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                        value={authConfig.bearerToken}
                        onChange={(e) =>
                          setAuthConfig({ ...authConfig, bearerToken: e.target.value })
                        }
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  )}

                  {authType === 'Basic Auth' && (
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                      <div>
                        <label className="text-[11px] text-slate-400 font-mono">Username</label>
                        <input
                          type="text"
                          placeholder="Username"
                          value={authConfig.basicUsername}
                          onChange={(e) =>
                            setAuthConfig({ ...authConfig, basicUsername: e.target.value })
                          }
                          className="w-full mt-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 font-mono">Password</label>
                        <input
                          type="password"
                          placeholder="Password"
                          value={authConfig.basicPassword}
                          onChange={(e) =>
                            setAuthConfig({ ...authConfig, basicPassword: e.target.value })
                          }
                          className="w-full mt-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>
                  )}

                  {authType === 'No Auth' && (
                    <div className="text-center py-8 text-slate-500 text-xs bg-slate-950 border border-slate-800 rounded-xl">
                      This endpoint requires no authentication parameters.
                    </div>
                  )}
                </div>
              )}

              {/* BODY TAB */}
              {reqTab === 'body' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                    <div className="flex items-center gap-2">
                      <span>Body Type:</span>
                      <select
                        value={bodyType}
                        onChange={(e) => setBodyType(e.target.value as any)}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 font-semibold"
                      >
                        <option value="none">none</option>
                        <option value="json">JSON</option>
                        <option value="raw">raw text</option>
                      </select>
                    </div>

                    {bodyType === 'json' && (
                      <button
                        onClick={handleFormatJsonBody}
                        className="text-cyan-400 hover:text-cyan-300 font-semibold text-[11px]"
                      >
                        Format JSON
                      </button>
                    )}
                  </div>

                  {bodyType !== 'none' ? (
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder={
                        bodyType === 'json' ? '{\n  "key": "value"\n}' : 'Raw payload...'
                      }
                      rows={9}
                      className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-200 focus:outline-none focus:border-cyan-500 leading-relaxed"
                    />
                  ) : (
                    <div className="text-center py-10 text-slate-500 text-xs bg-slate-950 border border-slate-800 rounded-xl">
                      Request method ({method}) has no request body payload attached. Select JSON or
                      Raw above to edit.
                    </div>
                  )}
                </div>
              )}

              {/* CODE GENERATOR TAB */}
              {reqTab === 'code' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <select
                      value={codeLang}
                      onChange={(e) => setCodeLang(e.target.value as any)}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-slate-200 focus:outline-none focus:border-cyan-500"
                    >
                      <option value="fetch">JavaScript fetch()</option>
                      <option value="axios">JavaScript Axios</option>
                      <option value="curl">cURL (Terminal)</option>
                      <option value="python">Python requests</option>
                      <option value="node">Node.js (v18+ Fetch)</option>
                      <option value="go">Go net/http</option>
                      <option value="rust">Rust reqwest</option>
                      <option value="php">PHP cURL</option>
                    </select>

                    <button
                      onClick={handleCopyCode}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
                    >
                      {copiedCode ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
                    </button>
                  </div>

                  <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-cyan-300 overflow-x-auto leading-relaxed max-h-[260px]">
                    {currentSnippet}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono text-[11px]">
              Target: {buildFullUrl(currentConfig).slice(0, 45)}...
            </span>
            <button
              onClick={() => onSaveToCollection(currentConfig, response || undefined)}
              className="flex items-center gap-1.5 text-purple-400 hover:text-purple-300 font-semibold"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Save to Collection</span>
            </button>
          </div>
        </div>

        {/* RIGHT PANEL: Response Inspector */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            {/* Response Status Bar */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Response
                </span>
                {response && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${
                      response.ok
                        ? 'bg-emerald-950 border-emerald-800 text-emerald-400'
                        : 'bg-rose-950 border-rose-800 text-rose-400'
                    }`}
                  >
                    {response.status} {response.statusText}
                  </span>
                )}
              </div>

              {response && (
                <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
                  <div className="flex items-center gap-1" title="Execution Time">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{response.duration} ms</span>
                  </div>
                  <div className="flex items-center gap-1" title="Payload Size">
                    <Database className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{(response.sizeBytes / 1024).toFixed(2)} KB</span>
                  </div>
                </div>
              )}
            </div>

            {/* Response View Mode Tabs */}
            <div className="flex items-center justify-between pt-3 pb-2">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setResTab('parsed')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    resTab === 'parsed'
                      ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Parsed JSON
                </button>
                <button
                  onClick={() => setResTab('raw')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    resTab === 'raw'
                      ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Raw Body
                </button>
                <button
                  onClick={() => setResTab('headers')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    resTab === 'headers'
                      ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Response Headers ({response ? Object.keys(response.headers).length : 0})
                </button>
              </div>

              {response && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyResponse}
                    className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-950 rounded-lg border border-slate-800"
                    title="Copy Response Data"
                  >
                    {copiedResponse ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    onClick={() =>
                      openAiModalWithContext(
                        'Analyze this API response structure, generate TypeScript interface, and explain key fields.',
                        response.data,
                      )
                    }
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-950 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 text-xs font-semibold transition-all"
                  >
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                    <span>AI Insights</span>
                  </button>
                </div>
              )}
            </div>

            {/* RESPONSE CONTENT BODY */}
            <div className="mt-2 min-h-[290px]">
              {!response && !loading && (
                <div className="flex flex-col items-center justify-center py-20 text-center text-slate-500 space-y-3 bg-slate-950/60 border border-slate-800/80 rounded-xl">
                  <Play className="w-10 h-10 text-slate-700" />
                  <div>
                    <h4 className="font-bold text-slate-400 text-sm">No Request Executed Yet</h4>
                    <p className="text-xs text-slate-600">
                      Click 'Send' above to execute request & inspect response payload.
                    </p>
                  </div>
                </div>
              )}

              {loading && (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-3 bg-slate-950/60 border border-slate-800/80 rounded-xl">
                  <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
                  <p className="text-xs font-mono text-cyan-300">
                    Fetching endpoint response via server proxy...
                  </p>
                </div>
              )}

              {response && (
                <div className="space-y-2">
                  {/* JSON Search Filter for long payloads */}
                  {resTab === 'parsed' && typeof response.data === 'object' && (
                    <input
                      type="text"
                      value={jsonSearchFilter}
                      onChange={(e) => setJsonSearchFilter(e.target.value)}
                      placeholder="Filter JSON response fields..."
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500 mb-2"
                    />
                  )}

                  {/* PARSED TAB */}
                  {resTab === 'parsed' && (
                    <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-emerald-300 overflow-x-auto leading-relaxed max-h-[320px] select-text">
                      {typeof response.data === 'object'
                        ? JSON.stringify(response.data, null, 2)
                        : String(response.data)}
                    </pre>
                  )}

                  {/* RAW TAB */}
                  {resTab === 'raw' && (
                    <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-300 overflow-x-auto leading-relaxed max-h-[320px] whitespace-pre-wrap select-text">
                      {typeof response.data === 'object'
                        ? JSON.stringify(response.data)
                        : String(response.data)}
                    </pre>
                  )}

                  {/* HEADERS TAB */}
                  {resTab === 'headers' && (
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 max-h-[320px] overflow-y-auto space-y-1 font-mono text-xs">
                      {Object.entries(response.headers).map(([k, v]) => (
                        <div
                          key={k}
                          className="flex items-start justify-between py-1 border-b border-slate-900 last:border-0"
                        >
                          <span className="text-cyan-400 font-semibold">{k}:</span>
                          <span className="text-slate-300 text-right max-w-[60%] break-all">
                            {v}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {response && response.error && (
            <div className="mt-4 p-3 bg-rose-950/60 border border-rose-800 rounded-xl text-rose-300 text-xs font-mono">
              <strong>Proxy Error:</strong> {response.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
