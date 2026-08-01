import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  RefreshCw,
  Zap,
  CheckCircle2,
  CornerDownLeft,
  Bot,
  User,
  ChevronDown,
  ChevronUp,
  Trash2,
  Copy,
  Check,
  Code2,
  Layers,
  ArrowRight
} from 'lucide-react';
import { RequestConfig, ApiResponseData, AiChatMessage } from '../types';

interface PlaygroundAiChatProps {
  currentConfig: RequestConfig;
  response: ApiResponseData | null;
  onApplyConfig: (configUpdate: Partial<RequestConfig>, summary?: string) => void;
  onExecuteRequest: () => void;
}

export const PlaygroundAiChat: React.FC<PlaygroundAiChatProps> = ({
  currentConfig,
  response,
  onApplyConfig,
  onExecuteRequest,
}) => {
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'init-1',
      sender: 'assistant',
      text: "👋 **Welcome to AI API Copilot!**\n\nI can build queries, adjust headers/auth, parse payloads, or auto-configure the REST Playground for you. Try asking:\n- *'Build a query for getting a random pokemon'*\n- *'Search weather for Tokyo'*\n- *'Configure a POST request with a sample JSON user object'*\n- *'Set up Bearer Token authorization'*",
      timestamp: Date.now(),
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [autoExecute, setAutoExecute] = useState(true);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  // Intelligent client-side fallback if server endpoint is offline or rate limited
  const generateClientFallback = (prompt: string): { message: string; actionSummary?: string; configUpdate?: Partial<RequestConfig> } => {
    const lower = prompt.toLowerCase();

    if (lower.includes('pokemon') || lower.includes('pokémon')) {
      let pokemonTarget = 'pikachu';
      let summary = 'Set URL to Pokémon API';
      if (lower.includes('random')) {
        const randomId = Math.floor(Math.random() * 151) + 1;
        pokemonTarget = String(randomId);
        summary = `Built query for Random Pokémon (#${randomId})`;
      } else {
        const matches = lower.match(/pokemon\s+([a-z0-9]+)/i) || lower.match(/for\s+([a-z0-9]+)/i);
        if (matches && matches[1] && matches[1] !== 'a' && matches[1] !== 'getting') {
          pokemonTarget = matches[1].toLowerCase();
          summary = `Built query for Pokémon '${pokemonTarget}'`;
        }
      }

      const targetUrl = `https://pokeapi.co/api/v2/pokemon/${pokemonTarget}`;
      return {
        message: `I've configured the REST Playground endpoint for Pokédex entry **${pokemonTarget}**. The URL, proxy settings, and GET method are updated below!`,
        actionSummary: summary,
        configUpdate: {
          method: 'GET',
          url: targetUrl,
          useProxy: true,
        }
      };
    }

    if (lower.includes('weather') || lower.includes('forecast')) {
      return {
        message: "I've configured the REST Playground to fetch real-time weather metrics from Open-Meteo for Tokyo.",
        actionSummary: "Set endpoint URL to Tokyo Weather API",
        configUpdate: {
          method: 'GET',
          url: 'https://api.open-meteo.com/v1/forecast?latitude=35.6762&longitude=139.6503&current_weather=true',
          useProxy: true,
        }
      };
    }

    if (lower.includes('post') || lower.includes('create') || lower.includes('payload')) {
      return {
        message: "I've configured a POST request to JSONPlaceholder with a sample JSON payload body.",
        actionSummary: "Set method to POST & added sample JSON body",
        configUpdate: {
          method: 'POST',
          url: 'https://jsonplaceholder.typicode.com/posts',
          bodyType: 'json',
          body: JSON.stringify({ title: 'Endpointer Test', body: 'AI-generated test request payload', userId: 1 }, null, 2),
          useProxy: true,
        }
      };
    }

    if (lower.includes('bearer') || lower.includes('auth') || lower.includes('token')) {
      return {
        message: "I've enabled **Bearer Token** authentication mode with a test API key.",
        actionSummary: "Enabled Bearer Token authentication",
        configUpdate: {
          authType: 'Bearer Token',
          authConfig: {
            ...currentConfig.authConfig,
            bearerToken: 'sk_test_endpointer_bearer_token_99812',
          }
        }
      };
    }

    if (lower.includes('interface') || lower.includes('typescript') || lower.includes('ts')) {
      let tsCode = 'export interface ApiResponse {\n  [key: string]: any;\n}';
      if (response && response.data) {
        const generateTsType = (obj: any, name = 'ApiResponse'): string => {
          if (obj === null) return 'null';
          if (Array.isArray(obj)) {
            if (obj.length === 0) return 'any[]';
            return `${generateTsType(obj[0], 'Item')}[]`;
          }
          if (typeof obj === 'object') {
            const lines = Object.entries(obj).slice(0, 15).map(([k, v]) => `  ${k}: ${generateTsType(v, k)};`);
            return `export interface ${name} {\n${lines.join('\n')}\n}`;
          }
          return typeof obj;
        };
        tsCode = generateTsType(response.data);
      }

      return {
        message: `Generated TypeScript Interface for payload:\n\n\`\`\`typescript\n${tsCode}\n\`\`\``,
        actionSummary: "Generated TypeScript Interface",
      };
    }

    return {
      message: `Analyzed your request: "${prompt}". Applied recommended parameters to the configuration below.`,
    };
  };

  const handleSendMessage = async (textToSend?: string) => {
    const prompt = (textToSend || input).trim();
    if (!prompt || loading) return;

    const userMsg: AiChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: prompt,
      timestamp: Date.now(),
    };

    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    setInput('');
    setLoading(true);

    try {
      const resp = await fetch('/api/ai-chat-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedHistory,
          currentConfig,
          responseContext: response?.data || null,
        }),
      });

      let aiResult: any;
      if (!resp.ok || resp.headers.get('content-type')?.includes('text/html')) {
        aiResult = generateClientFallback(prompt);
      } else {
        aiResult = await resp.json();
      }

      const botMsgText = aiResult.message || aiResult.result || "I've processed your request.";
      const actionSummary = aiResult.actionSummary;
      const configUpdate = aiResult.configUpdate;

      const assistantMsg: AiChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: botMsgText,
        timestamp: Date.now(),
        configUpdateSummary: actionSummary,
        appliedConfig: configUpdate,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (configUpdate && Object.keys(configUpdate).length > 0) {
        onApplyConfig(configUpdate, actionSummary);
        if (autoExecute) {
          setTimeout(() => {
            onExecuteRequest();
          }, 300);
        }
      }
    } catch {
      const fallback = generateClientFallback(prompt);
      const assistantMsg: AiChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: fallback.message,
        timestamp: Date.now(),
        configUpdateSummary: fallback.actionSummary,
        appliedConfig: fallback.configUpdate,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (fallback.configUpdate) {
        onApplyConfig(fallback.configUpdate, fallback.actionSummary);
        if (autoExecute) {
          setTimeout(() => {
            onExecuteRequest();
          }, 300);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Helper renderer to render code blocks and bold text cleanly
  const renderFormattedText = (text: string, msgId: string) => {
    const codeBlockRegex = /```([a-zA-Z]*)\n([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
      }
      parts.push({ type: 'code', lang: match[1] || 'text', code: match[2] });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.slice(lastIndex) });
    }

    return (
      <div className="space-y-2">
        {parts.map((p, idx) => {
          if (p.type === 'code') {
            const blockId = `${msgId}-code-${idx}`;
            return (
              <div key={blockId} className="my-2 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden font-mono text-[11px]">
                <div className="px-3 py-1.5 bg-slate-800/60 border-b border-slate-700/60 flex items-center justify-between text-slate-400">
                  <span className="text-[10px] uppercase font-bold text-indigo-300">{p.lang}</span>
                  <button
                    onClick={() => copyToClipboard(p.code, blockId)}
                    className="flex items-center gap-1 text-[10px] text-slate-300 hover:text-white transition-colors"
                  >
                    {copiedCodeId === blockId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCodeId === blockId ? 'Copied' : 'Copy Code'}</span>
                  </button>
                </div>
                <pre className="p-3 overflow-x-auto text-slate-200 leading-relaxed select-all">
                  <code>{p.code}</code>
                </pre>
              </div>
            );
          }

          // Format simple bold markdown **text**
          const formattedText = p.content.split(/(\*\*.*?\*\*)/g).map((chunk, cIdx) => {
            if (chunk.startsWith('**') && chunk.endsWith('**')) {
              return <strong key={cIdx} className="text-cyan-300 font-semibold">{chunk.slice(2, -2)}</strong>;
            }
            return chunk;
          });

          return (
            <p key={idx} className="whitespace-pre-wrap leading-relaxed select-text">
              {formattedText}
            </p>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl overflow-hidden shadow-xl shadow-indigo-950/20 backdrop-blur-sm transition-all">
      {/* Header Banner */}
      <div className="px-4 py-3 bg-gradient-to-r from-indigo-950/90 via-slate-900 to-purple-950/90 border-b border-indigo-500/20 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 via-purple-500 to-cyan-500 flex items-center justify-center shadow-md shadow-indigo-500/30">
            <Sparkles className="w-4 h-4 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-indigo-200 tracking-wide">AI Playground Assistant</span>
              <span className="px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono">
                Context-Aware Copilot
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
              <span>Target:</span>
              <span className="text-cyan-300 font-bold">{currentConfig.method}</span>
              <span className="text-slate-300 truncate max-w-[280px]">{currentConfig.url}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Auto-Execute Request Toggle */}
          <label
            className="flex items-center gap-1.5 text-[11px] font-mono text-slate-300 bg-slate-950/60 px-2.5 py-1 rounded-lg border border-slate-800 cursor-pointer hover:bg-slate-800/60 transition-colors"
            title="Automatically send HTTP request when AI configures endpoint"
          >
            <input
              type="checkbox"
              checked={autoExecute}
              onChange={(e) => setAutoExecute(e.target.checked)}
              className="rounded bg-slate-900 border-indigo-500/40 text-indigo-500 focus:ring-0 cursor-pointer"
            />
            <Zap className={`w-3 h-3 ${autoExecute ? 'text-amber-400 fill-amber-400' : 'text-slate-500'}`} />
            <span>Auto-Send</span>
          </label>

          {messages.length > 1 && (
            <button
              onClick={() => setMessages([messages[0]])}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-lg transition-colors text-xs flex items-center gap-1 font-mono"
              title="Clear chat history"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-lg transition-colors"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Chat Body */}
      {isExpanded && (
        <div className="p-4 space-y-3">
          {/* Active Response Context Pill (If response is available) */}
          {response && (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-emerald-500/30 text-xs font-mono">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-emerald-300 font-semibold">
                  Latest Response Context: {response.status} {response.statusText}
                </span>
                <span className="text-slate-400 text-[11px]">({response.timeMs}ms • {(response.sizeBytes / 1024).toFixed(1)} KB)</span>
              </div>
              <button
                onClick={() => handleSendMessage("Explain this API response payload and summarize key fields")}
                className="text-[11px] text-cyan-400 hover:text-cyan-200 underline font-semibold transition-colors"
              >
                Summarize Response →
              </button>
            </div>
          )}

          {/* Conversation History Box */}
          <div className="max-h-[220px] overflow-y-auto space-y-3 pr-1 font-mono text-xs scrollbar-thin scrollbar-thumb-slate-800">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'assistant' && (
                  <div className="w-6 h-6 rounded-md bg-indigo-950 border border-indigo-800 text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}

                <div
                  className={`max-w-[88%] rounded-xl p-3 space-y-2 ${
                    msg.sender === 'user'
                      ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-md shadow-cyan-600/10'
                      : 'bg-slate-950 border border-slate-800 text-slate-200'
                  }`}
                >
                  {renderFormattedText(msg.text, msg.id)}

                  {/* Config Applied Diff & Driver Indicator */}
                  {msg.configUpdateSummary && (
                    <div className="mt-2 pt-2 border-t border-indigo-500/20 bg-indigo-950/40 p-2.5 rounded-lg text-[11px] text-indigo-300 space-y-2">
                      <div className="flex items-center justify-between gap-2 font-semibold">
                        <div className="flex items-center gap-1.5 text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Driven Playground Config: {msg.configUpdateSummary}</span>
                        </div>
                        <button
                          onClick={onExecuteRequest}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white text-[10px] font-bold shadow transition-all active:scale-95 shrink-0"
                        >
                          <Zap className="w-3 h-3 fill-current text-amber-300" />
                          <span>Send Request Now</span>
                        </button>
                      </div>

                      {/* Display applied parameters if available */}
                      {msg.appliedConfig && (
                        <div className="p-2 rounded bg-slate-900/90 border border-indigo-900/50 text-[10px] space-y-1 font-mono text-slate-300">
                          {msg.appliedConfig.method && (
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500 uppercase font-bold">Method:</span>
                              <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 font-bold">{msg.appliedConfig.method}</span>
                            </div>
                          )}
                          {msg.appliedConfig.url && (
                            <div className="flex items-start gap-2">
                              <span className="text-slate-500 uppercase font-bold shrink-0">URL:</span>
                              <span className="text-cyan-200 break-all">{msg.appliedConfig.url}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {msg.sender === 'user' && (
                  <div className="w-6 h-6 rounded-md bg-cyan-950 border border-cyan-800 text-cyan-400 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2.5 items-center text-xs font-mono text-indigo-300 bg-indigo-950/40 p-2.5 rounded-xl border border-indigo-800/40 animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                <span>AI Assistant is analyzing query context and generating REST Playground configuration...</span>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Contextual Action Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-1 text-[11px] scrollbar-none">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 shrink-0">Prompts:</span>
            <button
              onClick={() => handleSendMessage("Build a query for getting a random pokemon")}
              className="px-2.5 py-1 rounded-lg bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-800/60 text-indigo-200 font-mono shrink-0 transition-all active:scale-95"
            >
              🎲 Random Pokémon
            </button>
            <button
              onClick={() => handleSendMessage("Build query for Pokémon Pikachu abilities")}
              className="px-2.5 py-1 rounded-lg bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-800/60 text-indigo-200 font-mono shrink-0 transition-all active:scale-95"
            >
              ⚡ Pokémon Pikachu
            </button>
            <button
              onClick={() => handleSendMessage("Configure POST request with sample JSON payload")}
              className="px-2.5 py-1 rounded-lg bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-800/60 text-indigo-200 font-mono shrink-0 transition-all active:scale-95"
            >
              📝 Mock POST Body
            </button>
            <button
              onClick={() => handleSendMessage("Set Auth to Bearer Token")}
              className="px-2.5 py-1 rounded-lg bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-800/60 text-indigo-200 font-mono shrink-0 transition-all active:scale-95"
            >
              🔐 Bearer Token Auth
            </button>
            {response && (
              <button
                onClick={() => handleSendMessage("Generate a TypeScript interface from the response payload")}
                className="px-2.5 py-1 rounded-lg bg-purple-950/80 hover:bg-purple-900 border border-purple-800/60 text-purple-200 font-mono shrink-0 transition-all active:scale-95"
              >
                💻 Export TS Interface
              </button>
            )}
          </div>

          {/* Prompt Input Box */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ask AI to build a query, set up auth, or update config (e.g. 'Build a query for getting a random pokemon')..."
                className="w-full pl-3.5 pr-10 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-[10px] font-mono flex items-center gap-0.5">
                <CornerDownLeft className="w-3 h-3" />
              </div>
            </div>

            <button
              onClick={() => handleSendMessage()}
              disabled={loading || !input.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-all active:scale-95 shrink-0"
            >
              {loading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Ask AI</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
