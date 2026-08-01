import React from 'react';
import { Terminal, Globe, Zap, Activity, FolderGit2, ShieldCheck, Sparkles } from 'lucide-react';

interface HeaderProps {
  activeTab: 'directory' | 'playground' | 'monitor' | 'collections';
  setActiveTab: (tab: 'directory' | 'playground' | 'monitor' | 'collections') => void;
  apiCount: number;
  openAiModal: () => void;
  proxyActive: boolean;
  historyCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  apiCount,
  openAiModal,
  proxyActive,
  historyCount,
}) => {
  return (
    <header id="main-header" className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('directory')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-600 p-0.5 shadow-lg shadow-cyan-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Terminal className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-cyan-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
                  Endpointer
                </span>
                <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/50">
                  GitHub Pages Ready
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Interactive API Playground & Health Tester</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center p-1 bg-slate-950/80 rounded-xl border border-slate-800/80">
            <button
              id="nav-tab-directory"
              onClick={() => setActiveTab('directory')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'directory'
                  ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700/60 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>API Directory</span>
              <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-900 text-slate-300 border border-slate-700">
                {apiCount}
              </span>
            </button>

            <button
              id="nav-tab-playground"
              onClick={() => setActiveTab('playground')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'playground'
                  ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700/60 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>REST Playground</span>
            </button>

            <button
              id="nav-tab-monitor"
              onClick={() => setActiveTab('monitor')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'monitor'
                  ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700/60 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>Status Monitor</span>
            </button>

            <button
              id="nav-tab-collections"
              onClick={() => setActiveTab('collections')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'collections'
                  ? 'bg-slate-800 text-purple-400 shadow-sm border border-slate-700/60 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <FolderGit2 className="w-3.5 h-3.5 text-purple-400" />
              <span>Collections</span>
              {historyCount > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-purple-950 text-purple-300 border border-purple-800">
                  {historyCount}
                </span>
              )}
            </button>
          </nav>

          {/* Right Action Bar */}
          <div className="flex items-center gap-2.5">
            {/* Client-side engine status pill */}
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border bg-cyan-950/60 border-cyan-800/80 text-cyan-300"
              title="100% Client-side execution mode — runs directly in browser (compatible with GitHub Pages)"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Client Fetch: Ready</span>
            </div>

            {/* AI Assistant Button */}
            <button
              id="btn-open-ai-modal"
              onClick={openAiModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold shadow-md shadow-indigo-500/20 transition-all active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">AI Schema Helper</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Row */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-slate-800/60 text-xs">
          <button
            id="mobile-tab-directory"
            onClick={() => setActiveTab('directory')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${
              activeTab === 'directory' ? 'text-cyan-400 font-bold bg-slate-800' : 'text-slate-400'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Directory</span>
          </button>
          <button
            id="mobile-tab-playground"
            onClick={() => setActiveTab('playground')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${
              activeTab === 'playground' ? 'text-amber-400 font-bold bg-slate-800' : 'text-slate-400'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Playground</span>
          </button>
          <button
            id="mobile-tab-monitor"
            onClick={() => setActiveTab('monitor')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${
              activeTab === 'monitor' ? 'text-emerald-400 font-bold bg-slate-800' : 'text-slate-400'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Monitor</span>
          </button>
          <button
            id="mobile-tab-collections"
            onClick={() => setActiveTab('collections')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${
              activeTab === 'collections' ? 'text-purple-400 font-bold bg-slate-800' : 'text-slate-400'
            }`}
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            <span>Saved</span>
          </button>
        </div>
      </div>
    </header>
  );
};
