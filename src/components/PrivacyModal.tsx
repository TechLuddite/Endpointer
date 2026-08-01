import React from 'react';
import { X, ShieldCheck, Lock, Database, EyeOff, Server, CheckCircle2 } from 'lucide-react';

interface PrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyModal: React.FC<PrivacyModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl shadow-emerald-950/30 flex flex-col font-mono text-slate-200">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-950 via-slate-900 to-cyan-950 border-b border-emerald-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white tracking-wide">
                Privacy & Data Security Policy
              </h3>
              <p className="text-xs text-emerald-300">How Endpointer protects developer privacy</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 text-xs text-slate-300 leading-relaxed overflow-y-auto max-h-[75vh]">
          {/* Card 1: Local Storage */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
              <Database className="w-4 h-4 text-cyan-400" />
              <span>100% Client-Side Local Storage</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              All saved API request collections, custom presets, favorited endpoints, and request history items are stored strictly in your browser&apos;s <code className="text-cyan-300 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">localStorage</code>. No collection data ever leaves your device.
            </p>
          </div>

          {/* Card 2: Transient Proxying */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <Server className="w-4 h-4 text-emerald-400" />
              <span>CORS Proxy Transparency</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              When you execute requests via the Endpointer CORS-free proxy, HTTP payloads and headers are forwarded directly to the requested external API endpoint. The proxy server operates ephemerally without persisting request bodies, auth keys, or tokens.
            </p>
          </div>

          {/* Card 3: Zero Telemetry */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
              <EyeOff className="w-4 h-4 text-purple-400" />
              <span>No Tracking or Telemetry</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Endpointer contains zero analytics scripts, no user tracking cookies, and no telemetry services. Your debugging sessions remain completely private.
            </p>
          </div>

          {/* Card 4: API Keys */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
              <Lock className="w-4 h-4 text-amber-400" />
              <span>API Key Protection</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Any custom API keys or Bearer tokens configured in the REST Playground are kept in runtime memory or local storage. Never commit sensitive keys to shared presets.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Open Source & Privacy First</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all"
          >
            Understood
          </button>
        </div>
      </div>
    </div>
  );
};
