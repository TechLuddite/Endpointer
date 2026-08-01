import React, { useState, useEffect } from 'react';
import { Sparkles, X, Send, Copy, Check, Code, HelpCircle, RefreshCw } from 'lucide-react';

interface AiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
  initialContext?: any;
}

function generateClientSideAnalysis(prompt: string, context: any): string {
  const json = typeof context === 'object' ? context : { data: context };
  
  if (prompt.toLowerCase().includes('interface') || prompt.toLowerCase().includes('typescript') || prompt.toLowerCase().includes('type')) {
    const generateTsType = (obj: any, name = 'ApiResponse'): string => {
      if (obj === null) return 'null';
      if (Array.isArray(obj)) {
        if (obj.length === 0) return 'any[]';
        return `${generateTsType(obj[0], 'Item')}[]`;
      }
      if (typeof obj === 'object') {
        const lines = Object.entries(obj).map(([k, v]) => {
          const typeStr = generateTsType(v, k);
          return `  ${k}: ${typeStr};`;
        });
        return `export interface ${name} {\n${lines.join('\n')}\n}`;
      }
      return typeof obj;
    };

    return `// Generated TypeScript Interface (Client-Side Mode)\n\n${generateTsType(json, 'ApiResponse')}`;
  }

  if (prompt.toLowerCase().includes('explain') || prompt.toLowerCase().includes('field')) {
    const fields = Object.keys(json || {});
    const explanations = fields.map(f => `- ${f}: (${typeof json[f]}) field representing ${f.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
    return `// JSON Payload Field Analysis (Client-Side Mode)\n\nDetected ${fields.length} top-level fields:\n\n${explanations.join('\n')}`;
  }

  return `// Payload Analysis (Client-Side Mode)\n\nData Type: ${Array.isArray(json) ? 'Array' : typeof json}\nKeys: ${Object.keys(json || {}).join(', ') || 'N/A'}\n\nSample Object:\n${JSON.stringify(json, null, 2)}`;
}

export const AiAssistantModal: React.FC<AiAssistantModalProps> = ({
  isOpen,
  onClose,
  initialPrompt,
  initialContext,
}) => {
  const [prompt, setPrompt] = useState(
    initialPrompt || 'Analyze this payload, list key data fields, and generate a TypeScript interface for it.'
  );
  const [context, setContext] = useState<any>(initialContext || { sample: 'Select an API response in Playground to analyze' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
    if (initialContext) setContext(initialContext);
  }, [initialPrompt, initialContext]);

  if (!isOpen) return null;

  const handleRunAi = async () => {
    setLoading(true);
    setResult('');
    setError('');

    try {
      const resp = await fetch('/api/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, context }),
      });

      if (!resp.ok || resp.headers.get('content-type')?.includes('text/html')) {
        setResult(generateClientSideAnalysis(prompt, context));
        return;
      }

      const data = await resp.json();
      setResult(data.result || generateClientSideAnalysis(prompt, context));
    } catch {
      setResult(generateClientSideAnalysis(prompt, context));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl relative overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/30">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">AI Schema & Payload Assistant</h3>
              <p className="text-xs text-slate-400">Powered by Gemini AI Engine</p>
            </div>
          </div>

          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg bg-slate-950">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Prompt Presets */}
        <div className="space-y-2">
          <label className="text-xs font-mono text-slate-400">Analysis Prompt:</label>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <button
              onClick={() => setPrompt('Generate a clean TypeScript type interface for this payload.')}
              className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 font-mono border border-slate-800 text-[11px]"
            >
              TypeScript Interfaces
            </button>
            <button
              onClick={() => setPrompt('Explain what each key field in this JSON response represents.')}
              className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 font-mono border border-slate-800 text-[11px]"
            >
              Field Explanations
            </button>
            <button
              onClick={() => setPrompt('Suggest 5 test cases and edge conditions for testing this API endpoint.')}
              className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 font-mono border border-slate-800 text-[11px]"
            >
              Test Case Ideas
            </button>
          </div>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Execute Button */}
        <button
          onClick={handleRunAi}
          disabled={loading || !prompt}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
        >
          {loading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-white" />
              <span>Analyzing with Gemini AI...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-white" />
              <span>Generate AI Analysis</span>
            </>
          )}
        </button>

        {/* Error message */}
        {error && (
          <div className="p-3 bg-rose-950/80 border border-rose-800 rounded-xl text-rose-300 text-xs font-mono">
            {error}
          </div>
        )}

        {/* AI Result Output */}
        {result && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>AI Insight Output:</span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-semibold"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-indigo-300 overflow-x-auto max-h-64 whitespace-pre-wrap leading-relaxed select-text">
              {result}
            </pre>
          </div>
        )}

      </div>
    </div>
  );
};
