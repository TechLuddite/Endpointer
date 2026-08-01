import React, { useState, useMemo } from 'react';
import { 
  Search, Star, ExternalLink, Play, CheckCircle2, XCircle, 
  Clock, Shield, Key, Wifi, Sparkles, Filter, 
  CloudSun, Database, Coins, Gamepad2, Dog, Code, Quote, Newspaper, Grid,
  Utensils, BookOpen, Globe
} from 'lucide-react';
import { PublicApiItem, HealthStatusItem, RequestConfig } from '../types';
import { API_CATEGORIES } from '../data/publicApis';

interface ApiDirectoryProps {
  apis: PublicApiItem[];
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onSelectForPlayground: (config: RequestConfig) => void;
  healthMap: Record<string, HealthStatusItem>;
  onQuickPing: (api: PublicApiItem) => void;
}

const CATEGORY_ICONS: Record<string, React.FC<{ className?: string }>> = {
  Grid,
  CloudSun,
  Database,
  Coins,
  Gamepad2,
  Dog,
  Code,
  Quote,
  Newspaper,
  Utensils,
  BookOpen,
  Globe,
};

export const ApiDirectory: React.FC<ApiDirectoryProps> = ({
  apis,
  favorites,
  onToggleFavorite,
  onSelectForPlayground,
  healthMap,
  onQuickPing,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedAuth, setSelectedAuth] = useState<string>('all');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Filter logic
  const filteredApis = useMemo(() => {
    return apis.filter((api) => {
      // Search
      const matchesSearch =
        searchTerm === '' ||
        api.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        api.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        api.tags.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase())) ||
        api.baseUrl.toLowerCase().includes(searchTerm.toLowerCase());

      // Category
      const matchesCategory = selectedCategory === 'all' || api.category === selectedCategory;

      // Auth
      const matchesAuth =
        selectedAuth === 'all' ||
        (selectedAuth === 'no-auth' && api.auth === 'No Auth') ||
        (selectedAuth === 'api-key' && api.auth === 'API Key');

      // Favorites
      const matchesFavorite = !showFavoritesOnly || favorites.includes(api.id);

      return matchesSearch && matchesCategory && matchesAuth && matchesFavorite;
    });
  }, [apis, searchTerm, selectedCategory, selectedAuth, showFavoritesOnly, favorites]);

  // Handle loading sample endpoint into playground
  const handleLoadPlayground = (api: PublicApiItem) => {
    const config: RequestConfig = {
      name: api.name,
      method: api.defaultMethod || 'GET',
      url: api.sampleEndpoint,
      params: (api.defaultParams || []).map((p, idx) => ({
        id: String(idx + 1),
        key: p.key,
        value: p.value,
        enabled: true,
        description: p.description,
      })),
      headers: (api.defaultHeaders || []).map((h, idx) => ({
        id: String(idx + 1),
        key: h.key,
        value: h.value,
        enabled: true,
      })),
      authType: api.auth,
      authConfig: {
        apiKeyName: api.auth === 'API Key' ? 'api_key' : '',
        apiKeyValue: api.auth === 'API Key' ? 'DEMO_KEY' : '',
        apiKeyIn: 'query',
      },
      bodyType: api.defaultBody ? 'json' : 'none',
      body: api.defaultBody || '',
      useProxy: true,
    };

    onSelectForPlayground(config);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Hero Header & Stats */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 p-6 sm:p-8 shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl -z-0 pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl -z-0 pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-semibold mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Public API Directory & Live Inspector</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-100 tracking-tight">
                Explore & Test Public APIs Real-Time
              </h1>
              <p className="text-slate-400 text-sm max-w-2xl mt-1">
                Browse curated REST APIs, test response payloads with zero CORS blocks, check real-time uptime health, and generate instant code snippets.
              </p>
            </div>

            {/* Metric Cards */}
            <div className="flex items-center gap-3">
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-center min-w-[100px]">
                <div className="text-xl font-bold text-cyan-400">{apis.length}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Total APIs</div>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-center min-w-[100px]">
                <div className="text-xl font-bold text-emerald-400">
                  {apis.filter((a) => a.auth === 'No Auth').length}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">No Auth Needed</div>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-center min-w-[100px]">
                <div className="text-xl font-bold text-purple-400">100%</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">HTTPS Safe</div>
              </div>
            </div>
          </div>

          {/* Search Bar & Secondary Controls */}
          <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                id="search-api-input"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search APIs by name, category, domain, or tag (e.g., weather, pokemon, crypto)..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950/90 border border-slate-800 rounded-xl text-slate-200 text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              {/* Auth Filter */}
              <select
                id="filter-auth-select"
                value={selectedAuth}
                onChange={(e) => setSelectedAuth(e.target.value)}
                className="bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value="all">All Auth Types</option>
                <option value="no-auth">No Auth Required</option>
                <option value="api-key">API Key Required</option>
              </select>

              {/* Favorites Toggle Button */}
              <button
                id="btn-favorites-toggle"
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all whitespace-nowrap ${
                  showFavoritesOnly
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-semibold'
                    : 'bg-slate-950/90 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${showFavoritesOnly ? 'fill-amber-400 text-amber-400' : ''}`} />
                <span>Starred ({favorites.length})</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-800">
        {API_CATEGORIES.map((cat) => {
          const IconComp = CATEGORY_ICONS[cat.icon] || Grid;
          const isSelected = selectedCategory === cat.id;

          return (
            <button
              key={cat.id}
              id={`cat-tab-${cat.id}`}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap border transition-all ${
                isSelected
                  ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300 font-semibold shadow-sm'
                  : 'bg-slate-900/60 border-slate-800/80 text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <IconComp className={`w-3.5 h-3.5 ${isSelected ? 'text-cyan-400' : 'text-slate-400'}`} />
              <span>{cat.name}</span>
            </button>
          );
        })}
      </div>

      {/* API Cards Grid */}
      {filteredApis.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/40 border border-slate-800/60 rounded-2xl p-8 space-y-3">
          <Filter className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-lg font-bold text-slate-300">No APIs found matching filters</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Try adjusting your search query or selecting a different category filter.
          </p>
          <button
            onClick={() => {
              setSearchTerm('');
              setSelectedCategory('all');
              setSelectedAuth('all');
              setShowFavoritesOnly(false);
            }}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-semibold rounded-xl border border-slate-700"
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredApis.map((api) => {
            const isFav = favorites.includes(api.id);
            const health = healthMap[api.id];

            return (
              <div
                key={api.id}
                id={`api-card-${api.id}`}
                className="group relative bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-cyan-950/20"
              >
                <div>
                  {/* Top Bar: Name, Health Status, Star */}
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base text-slate-100 group-hover:text-cyan-300 transition-colors">
                        {api.name}
                      </h3>
                      
                      {/* Health Indicator Ping */}
                      {health ? (
                        <div
                          className={`flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded-full border ${
                            health.ok
                              ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
                              : 'bg-rose-950/80 border-rose-800 text-rose-300'
                          }`}
                          title={`Last status: ${health.status} (${health.latency}ms)`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${health.ok ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                          <span>{health.ok ? `${health.latency}ms` : 'Error'}</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => onQuickPing(api)}
                          className="text-[10px] text-slate-500 hover:text-cyan-400 border border-slate-800 hover:border-slate-700 bg-slate-950 px-2 py-0.5 rounded-full flex items-center gap-1 transition-all"
                          title="Quick ping status test"
                        >
                          <Clock className="w-2.5 h-2.5" />
                          <span>Ping</span>
                        </button>
                      )}
                    </div>

                    <button
                      id={`btn-star-${api.id}`}
                      onClick={() => onToggleFavorite(api.id)}
                      className="text-slate-500 hover:text-amber-400 p-1 transition-colors"
                      title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Star className={`w-4 h-4 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                    </button>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-400 line-clamp-2 mb-3 leading-relaxed">
                    {api.description}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-4">
                    {api.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] font-mono bg-slate-950 text-slate-400 border border-slate-800 px-2 py-0.5 rounded-md"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>

                  {/* Meta Specs */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-950/60 rounded-xl p-2.5 border border-slate-800/80 mb-4 font-mono">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Key className="w-3 h-3 text-cyan-400" />
                      <span className="text-slate-300 font-semibold">{api.auth}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Shield className="w-3 h-3 text-emerald-400" />
                      <span className="text-slate-300">HTTPS Safe</span>
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <a
                    href={api.documentationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1"
                  >
                    <span>Docs</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>

                  <button
                    id={`btn-test-playground-${api.id}`}
                    onClick={() => handleLoadPlayground(api)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-slate-100 text-xs font-semibold shadow-md shadow-cyan-600/20 transition-all active:scale-95"
                  >
                    <Play className="w-3 h-3 fill-slate-100" />
                    <span>Test Endpoint</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
