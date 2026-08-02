import { Github, Heart, ShieldCheck, Terminal } from 'lucide-react';
import type { Capabilities } from '../types';

interface FooterProps {
  capabilities: Capabilities;
  onOpenSupport: () => void;
  onOpenPrivacy: () => void;
}

export function Footer({ capabilities, onOpenSupport, onOpenPrivacy }: FooterProps) {
  return (
    <footer className="border-t border-slate-900 bg-slate-950/90 px-4 py-6 font-mono text-xs text-slate-400 backdrop-blur-md md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 md:flex-row">
        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white">
            <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
          <div>
            <span className="font-bold text-slate-200">Endpointer</span>
            <p className="text-[11px] text-slate-500">
              {/* States the actual deployment shape rather than a fixed badge. */}
              {capabilities.proxy.available
                ? 'Browser client + proxy'
                : 'Runs entirely in your browser'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onOpenSupport}
            className="flex items-center gap-1.5 rounded-xl border border-pink-500/30 bg-gradient-to-r from-pink-500/10 via-rose-500/10 to-purple-500/10 px-3 py-1.5 font-semibold text-pink-300 transition-all hover:border-pink-400 hover:text-pink-200 active:scale-95"
          >
            <Heart className="h-3.5 w-3.5 fill-current text-pink-400" aria-hidden="true" />
            Support
          </button>
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 font-semibold text-slate-300 transition-all hover:border-emerald-500/50 hover:text-emerald-300 active:scale-95"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            Privacy
          </button>
        </div>

        <div className="flex items-center gap-4 text-[11px] text-slate-500">
          <a
            href="https://github.com/TechLuddite/Endpointer"
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1.5 text-slate-400 transition-colors hover:text-cyan-300"
          >
            <Github className="h-4 w-4" aria-hidden="true" />
            Source
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://github.com/TechLuddite/Endpointer/blob/main/LICENSE"
            target="_blank"
            rel="noreferrer noopener"
            className="transition-colors hover:text-slate-300"
          >
            MIT
          </a>
        </div>
      </div>
    </footer>
  );
}
