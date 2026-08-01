import React from 'react';
import { Heart, ShieldCheck, Github, Sparkles, Terminal } from 'lucide-react';

interface FooterProps {
  onOpenSupport: () => void;
  onOpenPrivacy: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenSupport, onOpenPrivacy }) => {
  return (
    <footer className="border-t border-slate-900 bg-slate-950/90 py-6 px-4 md:px-8 text-xs font-mono text-slate-400 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Left branding */}
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
            <Terminal className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-200">Endpointer</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-mono">
                Static & GH Pages
              </span>
            </div>
            <p className="text-[11px] text-slate-500">Interactive API Playground & Real-Time Health Tester</p>
          </div>
        </div>

        {/* Middle Footer Buttons (Support and Privacy ONLY in footer) */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onOpenSupport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-pink-500/10 via-rose-500/10 to-purple-500/10 hover:from-pink-500/20 hover:to-purple-500/20 border border-pink-500/30 hover:border-pink-400 text-pink-300 hover:text-pink-200 font-semibold transition-all active:scale-95 shadow-sm"
          >
            <Heart className="w-3.5 h-3.5 text-pink-400 fill-current" />
            <span>Dev Support</span>
          </button>

          <button
            onClick={onOpenPrivacy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/50 text-slate-300 hover:text-emerald-300 font-semibold transition-all active:scale-95 shadow-sm"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Privacy Policy</span>
          </button>
        </div>

        {/* Right GitHub link & copyright */}
        <div className="flex items-center gap-4 text-slate-500 text-[11px]">
          <a
            href="https://github.com/TechLuddite/Endpointer"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-slate-400 hover:text-cyan-300 transition-colors"
          >
            <Github className="w-4 h-4" />
            <span>GitHub Repo</span>
          </a>
          <span>•</span>
          <span>Open Source MIT</span>
        </div>
      </div>
    </footer>
  );
};
