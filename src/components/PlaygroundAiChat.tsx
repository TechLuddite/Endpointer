/**
 * The copilot panel.
 *
 * The honesty rules live here, not just in the helper it calls:
 *
 *  - The header states plainly whether a real model is connected or the offline
 *    matcher is in use. The old panel said "AI Playground Assistant · Powered by
 *    Gemini" unconditionally, including on the static deployment where no
 *    backend existed at all.
 *  - Offline replies are visually distinct and labelled. They are not styled to
 *    look like model output.
 *  - The progress line says what is actually happening. It used to say "AI
 *    Assistant is analyzing query context and generating REST Playground
 *    configuration…" while running a chain of `String.includes` checks.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  CornerDownLeft,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  User,
  WifiOff,
  Zap,
} from 'lucide-react';
import type { AiChatMessage, ApiResponseData, Capabilities, RequestConfig } from '../types';
import { generateOfflineReply } from '../utils/offlineAssistant';

interface PlaygroundAiChatProps {
  config: RequestConfig;
  response: ApiResponseData | null;
  capabilities: Capabilities;
  /** Applies the update and returns the resulting config, so the caller can
   *  send exactly what was applied rather than racing a re-render. */
  onApplyConfig: (update: Partial<RequestConfig>) => RequestConfig;
  onExecute: (config?: RequestConfig) => Promise<void>;
  onNotify: (message: string, tone?: 'info' | 'error') => void;
}

const PROMPT_CHIPS = [
  { label: '🎲 Random Pokémon', prompt: 'Build a request for a random Pokémon' },
  { label: '🌤 Weather in Tokyo', prompt: 'Build a weather request for Tokyo' },
  { label: '📝 Sample POST', prompt: 'Configure a POST request with a sample JSON payload' },
  { label: '🔐 Bearer auth', prompt: 'Set up bearer token auth' },
];

export function PlaygroundAiChat({
  config,
  response,
  capabilities,
  onApplyConfig,
  onExecute,
  onNotify,
}: PlaygroundAiChatProps) {
  const aiAvailable = capabilities.ai.available;

  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [autoSend, setAutoSend] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const greeting = useMemo<AiChatMessage>(
    () => ({
      id: 'greeting',
      sender: 'assistant',
      source: 'system',
      timestamp: 0,
      text: aiAvailable
        ? `Connected to **${capabilities.ai.model}**. I can build requests, generate types from a real response, draft assertions, and explain errors.\n\nCredentials in your request are redacted before anything is sent.`
        : 'No AI backend is configured on this deployment, so I am running the **offline helper** — deterministic pattern matching in your browser, not a language model. It recognises a handful of specific requests.\n\nTo enable real AI, run Endpointer with a `GEMINI_API_KEY` set.',
    }),
    [aiAvailable, capabilities.ai.model],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      onNotify('Could not access the clipboard.', 'error');
    }
  };

  const send = async (text?: string) => {
    const prompt = (text ?? input).trim();
    if (!prompt || loading) return;

    const userMessage: AiChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: prompt,
      timestamp: Date.now(),
    };
    const history = [...messages, userMessage];
    setMessages(history);
    setInput('');
    setLoading(true);

    try {
      let reply: AiChatMessage;

      if (aiAvailable) {
        const res = await fetch('/api/ai-chat-assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: history,
            currentConfig: config,
            responseContext: response?.data ?? null,
          }),
        });

        if (!res.ok) {
          const detail = await res.json().catch(() => ({}) as { error?: string });
          reply = {
            id: `assistant-${Date.now()}`,
            sender: 'assistant',
            source: 'system',
            timestamp: Date.now(),
            text: `The AI request failed (HTTP ${res.status}). ${detail.error ?? ''}\n\nNothing in your request was changed.`,
          };
        } else {
          const data = (await res.json()) as {
            message?: string;
            actionSummary?: string;
            configUpdate?: Partial<RequestConfig>;
          };
          reply = {
            id: `assistant-${Date.now()}`,
            sender: 'assistant',
            source: 'ai',
            timestamp: Date.now(),
            text: data.message ?? 'The model returned an empty response.',
            configUpdateSummary: data.actionSummary || undefined,
            appliedConfig: data.configUpdate,
          };
        }
      } else {
        const offline = generateOfflineReply(prompt, { config, response });
        reply = {
          id: `assistant-${Date.now()}`,
          sender: 'assistant',
          source: 'offline',
          timestamp: Date.now(),
          text: offline.message,
          configUpdateSummary: offline.actionSummary,
          appliedConfig: offline.configUpdate,
        };
      }

      setMessages((current) => [...current, reply]);

      if (reply.appliedConfig && Object.keys(reply.appliedConfig).length > 0) {
        // Apply, then send *the applied config* — no timer, no stale closure.
        const applied = onApplyConfig(reply.appliedConfig);
        if (autoSend) await onExecute(applied);
      }
    } catch (err) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          sender: 'assistant',
          source: 'system',
          timestamp: Date.now(),
          text: `Could not reach the AI endpoint: ${(err as Error).message}. Your request was not changed.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const allMessages = [greeting, ...messages];

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-500/30 bg-slate-900/90 shadow-xl shadow-indigo-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-500/20 bg-gradient-to-r from-indigo-950/90 via-slate-900 to-purple-950/90 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-lg shadow-md ${
              aiAvailable
                ? 'bg-gradient-to-tr from-indigo-500 via-purple-500 to-cyan-500 shadow-indigo-500/30'
                : 'bg-slate-700'
            }`}
          >
            {aiAvailable ? (
              <Sparkles className="h-4 w-4 text-white" aria-hidden="true" />
            ) : (
              <WifiOff className="h-4 w-4 text-slate-300" aria-hidden="true" />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xs font-bold tracking-wide text-indigo-200">Request copilot</h2>
              {aiAvailable ? (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                  AI connected · {capabilities.ai.model}
                </span>
              ) : (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
                  AI offline · pattern matching only
                </span>
              )}
            </div>
            <p className="font-mono text-[11px] text-slate-400">
              <span className="font-bold text-cyan-300">{config.method}</span>{' '}
              <span className="text-slate-300">{config.url || '—'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 font-mono text-[11px] text-slate-300 hover:bg-slate-800/60">
            <input
              type="checkbox"
              checked={autoSend}
              onChange={(e) => setAutoSend(e.target.checked)}
              className="cursor-pointer rounded border-indigo-500/40 bg-slate-900 text-indigo-500"
            />
            <Zap
              className={`h-3 w-3 ${autoSend ? 'fill-amber-400 text-amber-400' : 'text-slate-500'}`}
              aria-hidden="true"
            />
            <span>Auto-send</span>
          </label>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              aria-label="Clear conversation"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800/80 hover:text-slate-200"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse copilot' : 'Expand copilot'}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800/80 hover:text-slate-200"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 p-4">
          {response && (
            <div
              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-slate-950 px-3 py-1.5 font-mono text-xs ${
                response.ok ? 'border-emerald-500/30' : 'border-rose-500/30'
              }`}
            >
              <span className={response.ok ? 'text-emerald-300' : 'text-rose-300'}>
                Response in context: {response.status || '—'} {response.statusText} (
                {response.duration}ms · {(response.sizeBytes / 1024).toFixed(1)} KB)
              </span>
              <button
                type="button"
                onClick={() => void send('Explain this response and summarise the key fields')}
                className="text-[11px] font-semibold text-cyan-400 underline hover:text-cyan-200"
              >
                Explain it →
              </button>
            </div>
          )}

          <div
            className="max-h-[240px] space-y-3 overflow-y-auto pr-1 font-mono text-xs"
            aria-live="polite"
          >
            {allMessages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-2.5 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.sender === 'assistant' && (
                  <div
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                      message.source === 'ai'
                        ? 'border-indigo-800 bg-indigo-950 text-indigo-400'
                        : 'border-slate-700 bg-slate-800 text-slate-400'
                    }`}
                  >
                    {message.source === 'ai' ? (
                      <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </div>
                )}

                <div
                  className={`max-w-[88%] space-y-2 rounded-xl p-3 ${
                    message.sender === 'user'
                      ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white'
                      : message.source === 'ai'
                        ? 'border border-indigo-900/60 bg-slate-950 text-slate-200'
                        : 'border border-dashed border-slate-700 bg-slate-950/60 text-slate-300'
                  }`}
                >
                  {message.sender === 'assistant' && message.source !== 'ai' && (
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400/80">
                      {message.source === 'offline' ? 'Offline helper — not AI' : 'System'}
                    </p>
                  )}

                  <FormattedText
                    text={message.text}
                    messageId={message.id}
                    onCopy={copy}
                    copiedId={copiedId}
                  />

                  {message.configUpdateSummary && (
                    <div className="mt-2 space-y-2 rounded-lg border-t border-indigo-500/20 bg-indigo-950/40 p-2.5 text-[11px] text-indigo-300">
                      <div className="flex items-center justify-between gap-2 font-semibold">
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          Applied: {message.configUpdateSummary}
                        </span>
                        <button
                          type="button"
                          onClick={() => void onExecute()}
                          className="flex shrink-0 items-center gap-1 rounded-md bg-gradient-to-r from-cyan-500 to-indigo-500 px-2.5 py-1 text-[10px] font-bold text-white hover:from-cyan-400 hover:to-indigo-400"
                        >
                          <Zap className="h-3 w-3 fill-current text-amber-300" aria-hidden="true" />
                          Send now
                        </button>
                      </div>
                      {message.appliedConfig?.url && (
                        <p className="break-all text-[10px] text-cyan-200">
                          {message.appliedConfig.method ?? config.method}{' '}
                          {message.appliedConfig.url}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {message.sender === 'user' && (
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-cyan-800 bg-cyan-950 text-cyan-400">
                    <User className="h-3.5 w-3.5" aria-hidden="true" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <p className="flex animate-pulse items-center gap-2.5 rounded-xl border border-indigo-800/40 bg-indigo-950/40 p-2.5 text-xs text-indigo-300">
                <RefreshCw
                  className="h-3.5 w-3.5 animate-spin text-indigo-400"
                  aria-hidden="true"
                />
                {aiAvailable
                  ? `Asking ${capabilities.ai.model}…`
                  : 'Matching against the offline patterns…'}
              </p>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 text-[11px]">
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-slate-500">
              Try:
            </span>
            {PROMPT_CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => void send(chip.prompt)}
                className="shrink-0 rounded-lg border border-indigo-800/60 bg-indigo-950/70 px-2.5 py-1 font-mono text-indigo-200 transition-all hover:bg-indigo-900 active:scale-95"
              >
                {chip.label}
              </button>
            ))}
            {response && (
              <button
                type="button"
                onClick={() => void send('Generate a TypeScript interface from the response')}
                className="shrink-0 rounded-lg border border-purple-800/60 bg-purple-950/80 px-2.5 py-1 font-mono text-purple-200 transition-all hover:bg-purple-900 active:scale-95"
              >
                💻 Types from response
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <label className="sr-only" htmlFor="copilot-input">
                Message the copilot
              </label>
              <input
                id="copilot-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={
                  aiAvailable
                    ? 'Ask for a request, types, assertions, or an explanation…'
                    : 'Offline helper: try "random pokemon" or "weather in Tokyo"…'
                }
                className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-3.5 pr-10 font-mono text-xs text-slate-200 placeholder-slate-500 transition-all focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <CornerDownLeft
                className="absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500"
                aria-hidden="true"
              />
            </div>
            <button
              type="button"
              onClick={() => void send()}
              disabled={loading || !input.trim()}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 px-4 py-2 text-xs font-bold text-white transition-all hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50 active:scale-95"
            >
              {loading ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Ask</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Minimal markdown: fenced code blocks, `inline code`, and **bold**. */
function FormattedText({
  text,
  messageId,
  onCopy,
  copiedId,
}: {
  text: string;
  messageId: string;
  onCopy: (text: string, id: string) => void;
  copiedId: string | null;
}) {
  type Part = { type: 'text'; content: string } | { type: 'code'; lang: string; code: string };

  const parts: Part[] = [];
  const fence = /```([a-zA-Z]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fence.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'code', lang: match[1] || 'text', code: match[2] ?? '' });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push({ type: 'text', content: text.slice(lastIndex) });

  return (
    <div className="space-y-2">
      {parts.map((part, index) => {
        if (part.type === 'code') {
          const blockId = `${messageId}-code-${index}`;
          return (
            <div
              key={blockId}
              className="my-2 overflow-hidden rounded-lg border border-slate-800 bg-slate-900 font-mono text-[11px]"
            >
              <div className="flex items-center justify-between border-b border-slate-700/60 bg-slate-800/60 px-3 py-1.5 text-slate-400">
                <span className="text-[10px] font-bold uppercase text-indigo-300">{part.lang}</span>
                <button
                  type="button"
                  onClick={() => onCopy(part.code, blockId)}
                  className="flex items-center gap-1 text-[10px] text-slate-300 hover:text-white"
                >
                  {copiedId === blockId ? (
                    <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3 w-3" aria-hidden="true" />
                  )}
                  {copiedId === blockId ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="overflow-x-auto p-3 leading-relaxed text-slate-200">
                <code>{part.code}</code>
              </pre>
            </div>
          );
        }

        return (
          <p key={index} className="whitespace-pre-wrap leading-relaxed">
            {part.content.split(/(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g).map((chunk, chunkIndex) => {
              if (chunk.startsWith('**') && chunk.endsWith('**')) {
                return (
                  <strong key={chunkIndex} className="font-semibold text-cyan-300">
                    {chunk.slice(2, -2)}
                  </strong>
                );
              }
              if (chunk.startsWith('`') && chunk.endsWith('`') && chunk.length > 2) {
                return (
                  <code key={chunkIndex} className="rounded bg-slate-800 px-1 text-cyan-200">
                    {chunk.slice(1, -1)}
                  </code>
                );
              }
              if (chunk.startsWith('_') && chunk.endsWith('_') && chunk.length > 2) {
                return (
                  <em key={chunkIndex} className="text-slate-400">
                    {chunk.slice(1, -1)}
                  </em>
                );
              }
              return chunk;
            })}
          </p>
        );
      })}
    </div>
  );
}
