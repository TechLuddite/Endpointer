import { Activity, FolderGit2, Globe, Layers, Search, Sparkles, Terminal, Zap } from 'lucide-react';
import type { Capabilities, Environment } from '../types';
import type { TabId } from '../hooks/useHashRoute';

interface HeaderProps {
  activeTab: TabId;
  onNavigate: (tab: TabId) => void;
  apiCount: number;
  historyCount: number;
  capabilities: Capabilities;
  environments: Environment[];
  activeEnvironmentId: string | null;
  onSelectEnvironment: (id: string | null) => void;
  onOpenEnvironments: () => void;
  onOpenAiModal: () => void;
  onOpenPalette: () => void;
}

const TABS: Array<{ id: TabId; label: string; short: string; icon: typeof Globe; accent: string }> =
  [
    {
      id: 'directory',
      label: 'Directory',
      short: 'Directory',
      icon: Globe,
      accent: 'text-cyan-400',
    },
    { id: 'playground', label: 'Playground', short: 'Play', icon: Zap, accent: 'text-amber-400' },
    { id: 'monitor', label: 'Health', short: 'Health', icon: Activity, accent: 'text-emerald-400' },
    {
      id: 'collections',
      label: 'Collections',
      short: 'Saved',
      icon: FolderGit2,
      accent: 'text-purple-400',
    },
  ];

export function Header({
  activeTab,
  onNavigate,
  apiCount,
  historyCount,
  capabilities,
  environments,
  activeEnvironmentId,
  onSelectEnvironment,
  onOpenEnvironments,
  onOpenAiModal,
  onOpenPalette,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/90 text-slate-100 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => onNavigate('directory')}
            className="flex items-center gap-3 rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-600 p-0.5 shadow-lg shadow-cyan-500/20">
              <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-slate-950">
                <Terminal className="h-5 w-5 text-cyan-400" aria-hidden="true" />
              </div>
            </div>
            <div>
              <span className="bg-gradient-to-r from-cyan-400 via-indigo-300 to-purple-400 bg-clip-text text-xl font-extrabold tracking-tight text-transparent">
                Endpointer
              </span>
              <p className="hidden text-xs text-slate-400 sm:block">Browser-native API client</p>
            </div>
          </button>

          <nav
            aria-label="Main"
            className="hidden items-center rounded-xl border border-slate-800/80 bg-slate-950/80 p-1 md:flex"
          >
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onNavigate(tab.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all ${
                    active
                      ? 'border border-slate-700/60 bg-slate-800 font-semibold text-cyan-400 shadow-sm'
                      : 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-200'
                  }`}
                >
                  <Icon
                    className={`h-3.5 w-3.5 ${active ? 'text-cyan-400' : tab.accent}`}
                    aria-hidden="true"
                  />
                  <span>{tab.label}</span>
                  {tab.id === 'directory' && (
                    <span className="rounded-full border border-slate-700 bg-slate-900 px-1.5 text-[10px] text-slate-300">
                      {apiCount}
                    </span>
                  )}
                  {tab.id === 'collections' && historyCount > 0 && (
                    <span className="rounded-full border border-purple-800 bg-purple-950 px-1.5 text-[10px] text-purple-300">
                      {historyCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenPalette}
              title="Command palette (⌘/Ctrl + K)"
              aria-label="Open command palette"
              className="hidden items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-400 transition-colors hover:text-slate-200 sm:flex"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <kbd className="font-mono text-[10px]">⌘K</kbd>
            </button>

            <div className="hidden items-center gap-1 lg:flex">
              <label className="sr-only" htmlFor="environment-select">
                Active environment
              </label>
              <select
                id="environment-select"
                value={activeEnvironmentId ?? ''}
                onChange={(e) => onSelectEnvironment(e.target.value || null)}
                className="max-w-[140px] rounded-xl border border-slate-800 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-slate-300 focus:border-cyan-500 focus:outline-none"
              >
                <option value="">No environment</option>
                {environments.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onOpenEnvironments}
                aria-label="Manage environments and variables"
                title="Manage environments and variables"
                className="rounded-xl border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:text-slate-200"
              >
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            {/*
              States what is actually available on this deployment. The previous
              header showed a permanently green "Client Fetch: Ready" pill and
              advertised a proxy that did not exist in production.
            */}
            <div
              className="hidden items-center gap-1.5 rounded-full border border-slate-800 bg-slate-950/60 px-2.5 py-1 font-mono text-[11px] sm:flex"
              title={
                `AI: ${capabilities.ai.available ? `connected (${capabilities.ai.model})` : 'not configured'}\n` +
                `Proxy: ${capabilities.proxy.available ? 'available' : 'not configured'}`
              }
            >
              <span className={capabilities.ai.available ? 'text-emerald-400' : 'text-slate-500'}>
                ● AI
              </span>
              <span
                className={capabilities.proxy.available ? 'text-emerald-400' : 'text-slate-500'}
              >
                ● Proxy
              </span>
            </div>

            <button
              type="button"
              onClick={onOpenAiModal}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 transition-all hover:from-indigo-500 hover:to-purple-500 active:scale-95"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Analyse</span>
            </button>
          </div>
        </div>

        <nav
          aria-label="Main (compact)"
          className="flex items-center justify-around border-t border-slate-800/60 py-2 text-xs md:hidden"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onNavigate(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 ${
                  active ? `bg-slate-800 font-bold ${tab.accent}` : 'text-slate-400'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tab.short}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
