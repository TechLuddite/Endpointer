/**
 * Payload analysis dialog.
 *
 * The old version reported "Analyzing with Gemini AI…" and "Powered by Gemini
 * AI Engine" regardless of whether any backend existed, and silently swapped in
 * a local function when the request failed. Here the local path is the labelled
 * default when AI is unavailable, and it does something the model cannot do
 * better anyway: derive types structurally from the actual payload.
 */

import { useEffect, useState } from 'react';
import { Check, Copy, RefreshCw, Sparkles, WifiOff } from 'lucide-react';
import type { Capabilities } from '../types';
import { Modal } from './Modal';
import { inferPython, inferTypeScript, inferZod } from '../utils/typeInference';

interface AiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  capabilities: Capabilities;
  initialPrompt?: string;
  context: unknown;
}

type LocalTool = 'typescript' | 'zod' | 'python' | 'shape';

const LOCAL_TOOLS: Array<{ id: LocalTool; label: string; description: string }> = [
  { id: 'typescript', label: 'TypeScript', description: 'Interfaces derived from the payload' },
  { id: 'zod', label: 'Zod', description: 'A runtime validation schema' },
  { id: 'python', label: 'Python', description: 'Dataclasses' },
  { id: 'shape', label: 'Field summary', description: 'Top-level keys and their types' },
];

function describeShape(context: unknown): string {
  if (Array.isArray(context)) {
    return `Array of ${context.length} item${context.length === 1 ? '' : 's'}.\n\nFirst element:\n${JSON.stringify(context[0], null, 2).slice(0, 2000)}`;
  }
  if (!context || typeof context !== 'object') {
    return `Payload is a ${context === null ? 'null' : typeof context} value: ${JSON.stringify(context)}`;
  }
  const entries = Object.entries(context as Record<string, unknown>);
  const lines = entries.map(([key, value]) => {
    const type = Array.isArray(value)
      ? `array(${value.length})`
      : value === null
        ? 'null'
        : typeof value;
    return `  ${key}: ${type}`;
  });
  return `${entries.length} top-level field${entries.length === 1 ? '' : 's'}:\n\n${lines.join('\n')}`;
}

export function AiAssistantModal({
  isOpen,
  onClose,
  capabilities,
  initialPrompt,
  context,
}: AiAssistantModalProps) {
  const aiAvailable = capabilities.ai.available;
  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [result, setResult] = useState('');
  const [resultSource, setResultSource] = useState<'ai' | 'local' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
  }, [initialPrompt]);

  useEffect(() => {
    if (isOpen) {
      setResult('');
      setResultSource(null);
      setError('');
    }
  }, [isOpen, context]);

  const hasContext = context !== null && context !== undefined;

  const runLocal = (tool: LocalTool) => {
    if (!hasContext) {
      setError('Send a request first — these are derived from a real response payload.');
      return;
    }
    setError('');
    setResultSource('local');
    setResult(
      tool === 'typescript'
        ? inferTypeScript(context)
        : tool === 'zod'
          ? inferZod(context)
          : tool === 'python'
            ? inferPython(context)
            : describeShape(context),
    );
  };

  const runAi = async () => {
    if (!prompt.trim()) {
      setError('Enter a question first.');
      return;
    }
    setLoading(true);
    setError('');
    setResult('');
    try {
      const res = await fetch('/api/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, context }),
      });
      const data = (await res.json()) as { result?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? `The AI request failed with HTTP ${res.status}.`);
        return;
      }
      setResultSource('ai');
      setResult(data.result ?? 'The model returned an empty response.');
    } catch (err) {
      setError(`Could not reach the AI endpoint: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not access the clipboard.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Analyse response"
      subtitle={
        aiAvailable
          ? `Local generators plus ${capabilities.ai.model}`
          : 'Local generators — no AI backend configured'
      }
      icon={
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-xl ${
            aiAvailable ? 'bg-gradient-to-tr from-indigo-500 to-purple-600' : 'bg-slate-700'
          }`}
        >
          {aiAvailable ? (
            <Sparkles className="h-4 w-4 text-white" aria-hidden="true" />
          ) : (
            <WifiOff className="h-4 w-4 text-slate-300" aria-hidden="true" />
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Derived from the payload
          </h3>
          <p className="text-[11px] leading-relaxed text-slate-500">
            These read the actual response structure, so they are correct for this sample by
            construction. No model involved, and they work offline.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {LOCAL_TOOLS.map((tool) => (
              <button
                key={tool.id}
                type="button"
                onClick={() => runLocal(tool.id)}
                disabled={!hasContext}
                title={tool.description}
                className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 font-mono text-[11px] text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {tool.label}
              </button>
            ))}
          </div>
          {!hasContext && (
            <p className="text-[11px] text-amber-400">
              No response captured yet. Send a request in the playground first.
            </p>
          )}
        </section>

        <section className="space-y-2 border-t border-slate-800 pt-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Ask the model
          </h3>
          {aiAvailable ? (
            <>
              <label className="sr-only" htmlFor="ai-prompt">
                Question for the model
              </label>
              <textarea
                id="ai-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder="e.g. Which of these fields are stable enough to key on, and what should I assert?"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void runAi()}
                disabled={loading || !prompt.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-2.5 text-xs font-bold text-white transition-all hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Asking {capabilities.ai.model}…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    Ask {capabilities.ai.model}
                  </>
                )}
              </button>
              <p className="text-[11px] text-slate-500">
                Credentials in the payload are redacted before it is sent.
              </p>
            </>
          ) : (
            <p className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs leading-relaxed text-slate-400">
              No AI backend is configured on this deployment. Set <code>GEMINI_API_KEY</code> and
              run the server (<code>npm run dev</code>) to enable open-ended analysis. The
              generators above work without it.
            </p>
          )}
        </section>

        {error && (
          <p className="rounded-xl border border-rose-800 bg-rose-950/80 p-3 font-mono text-xs text-rose-300">
            {error}
          </p>
        )}

        {result && (
          <section className="space-y-2 border-t border-slate-800 pt-4">
            <div className="flex items-center justify-between font-mono text-xs text-slate-400">
              <span>
                Output
                {resultSource === 'local' && (
                  <span className="ml-2 rounded border border-slate-700 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                    generated locally
                  </span>
                )}
                {resultSource === 'ai' && (
                  <span className="ml-2 rounded border border-indigo-700 px-1.5 py-0.5 text-[10px] uppercase text-indigo-300">
                    {capabilities.ai.model}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => void copy()}
                className="flex items-center gap-1 font-semibold text-cyan-400 hover:text-cyan-300"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-indigo-300">
              {result}
            </pre>
          </section>
        )}
      </div>
    </Modal>
  );
}
