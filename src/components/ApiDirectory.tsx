import { useMemo, useState } from 'react';
import {
  BookOpen,
  CloudSun,
  Code,
  Coins,
  Database,
  Dog,
  ExternalLink,
  Filter,
  Gamepad2,
  Globe,
  Grid,
  Key,
  Newspaper,
  Play,
  Quote,
  Search,
  Star,
  Utensils,
} from 'lucide-react';
import type { PublicApiItem, RequestConfig, StatusEntry, StatusFile } from '../types';
import { API_CATEGORIES } from '../data/publicApis';
import { corsBadge, formatAge } from '../utils/status';
import { splitUrl } from '../utils/requestUrl';

interface ApiDirectoryProps {
  apis: PublicApiItem[];
  favorites: string[];
  statusById: Map<string, StatusEntry>;
  statusFile: StatusFile | null;
  onToggleFavorite: (id: string) => void;
  onSelectForPlayground: (config: RequestConfig) => void;
}

const CATEGORY_ICONS: Record<string, typeof Grid> = {
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

const BADGE_STYLES = {
  yes: 'border-emerald-800 bg-emerald-950/80 text-emerald-300',
  no: 'border-amber-800 bg-amber-950/80 text-amber-300',
  unknown: 'border-slate-700 bg-slate-900 text-slate-400',
} as const;

type BrowserFilter = 'all' | 'browser-ready' | 'no-auth';

/**
 * Build a playground config from a directory entry.
 *
 * The sample endpoint's query string is split out into params rather than being
 * left in the URL *and* duplicated by defaultParams — which is exactly what
 * made every "Test endpoint" click send each parameter twice.
 */
export function configFromApi(api: PublicApiItem): RequestConfig {
  const { base, params } = splitUrl(api.sampleEndpoint);
  const existingKeys = new Set(params.map((p) => p.key));

  for (const [index, param] of (api.defaultParams ?? []).entries()) {
    if (existingKeys.has(param.key)) {
      // Attach the documentation to the row that already exists.
      const row = params.find((p) => p.key === param.key);
      if (row && param.description) row.description = param.description;
      continue;
    }
    params.push({
      id: `default-${index}`,
      key: param.key,
      value: param.value,
      enabled: false, // extras are offered, not silently applied
      description: param.description,
    });
    existingKeys.add(param.key);
  }

  return {
    name: api.name,
    method: api.defaultMethod ?? 'GET',
    url: base,
    params,
    headers: (api.defaultHeaders ?? []).map((h, index) => ({
      id: `dh-${index}`,
      key: h.key,
      value: h.value,
      enabled: true,
    })),
    authType: api.auth,
    authConfig: { apiKeyIn: 'query' },
    bodyType: api.defaultBody ? 'json' : 'none',
    body: api.defaultBody ?? '',
    // Only meaningful when a proxy exists; the toggle reflects availability.
    useProxy: false,
  };
}

export function ApiDirectory({
  apis,
  favorites,
  statusById,
  statusFile,
  onToggleFavorite,
  onSelectForPlayground,
}: ApiDirectoryProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [browserFilter, setBrowserFilter] = useState<BrowserFilter>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return apis.filter((api) => {
      const matchesSearch =
        !query ||
        api.name.toLowerCase().includes(query) ||
        api.description.toLowerCase().includes(query) ||
        api.baseUrl.toLowerCase().includes(query) ||
        api.tags.some((tag) => tag.toLowerCase().includes(query));

      const matchesCategory = category === 'all' || api.category === category;
      const status = statusById.get(api.id);
      const matchesBrowser =
        browserFilter === 'all' ||
        (browserFilter === 'no-auth' && api.auth === 'No Auth') ||
        (browserFilter === 'browser-ready' && status?.cors === 'yes' && status.ok);
      const matchesFavorite = !favoritesOnly || favorites.includes(api.id);

      return matchesSearch && matchesCategory && matchesBrowser && matchesFavorite;
    });
  }, [apis, search, category, browserFilter, favoritesOnly, favorites, statusById]);

  const summary = statusFile?.summary;

  return (
    <div className="space-y-6 pb-12">
      <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 shadow-xl sm:p-8">
        <div className="pointer-events-none absolute right-0 top-0 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-100 sm:text-3xl">
                Public API directory
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                {summary ? (
                  <>
                    Every endpoint re-verified automatically. Last check{' '}
                    {formatAge(statusFile?.generatedAt)}.
                  </>
                ) : (
                  <>
                    Reachability and browser compatibility are verified by a scheduled job. No
                    results yet — the badges will fill in after the first run.
                  </>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Stat label="APIs" value={apis.length} tone="text-cyan-400" />
              <Stat
                label="Browser-ready"
                value={summary ? summary.browserUsable : '—'}
                tone="text-emerald-400"
                title="Verified to send CORS headers, so they work directly from this page."
              />
              <Stat
                label="No auth"
                value={apis.filter((a) => a.auth === 'No Auth').length}
                tone="text-purple-400"
              />
              {summary && summary.failing > 0 && (
                <Stat label="Unreachable" value={summary.failing} tone="text-rose-400" />
              )}
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-3 pt-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <label className="sr-only" htmlFor="directory-search">
                Search APIs
              </label>
              <input
                id="directory-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, tag or domain…"
                className="w-full rounded-xl border border-slate-800 bg-slate-950/90 py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder-slate-500 transition-all focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="browser-filter">
                Filter by compatibility
              </label>
              <select
                id="browser-filter"
                value={browserFilter}
                onChange={(e) => setBrowserFilter(e.target.value as BrowserFilter)}
                className="cursor-pointer rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2.5 text-xs text-slate-300 focus:border-cyan-500 focus:outline-none"
              >
                <option value="all">All APIs</option>
                <option value="browser-ready">Browser-ready only</option>
                <option value="no-auth">No auth required</option>
              </select>

              <button
                type="button"
                onClick={() => setFavoritesOnly((v) => !v)}
                aria-pressed={favoritesOnly}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-2.5 text-xs font-medium transition-all ${
                  favoritesOnly
                    ? 'border-amber-500/50 bg-amber-500/20 font-semibold text-amber-300'
                    : 'border-slate-800 bg-slate-950/90 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Star
                  className={`h-3.5 w-3.5 ${favoritesOnly ? 'fill-amber-400 text-amber-400' : ''}`}
                  aria-hidden="true"
                />
                Starred ({favorites.length})
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {API_CATEGORIES.map((cat) => {
          const Icon = CATEGORY_ICONS[cat.icon] ?? Grid;
          const selected = category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              aria-pressed={selected}
              title={cat.description}
              className={`flex items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 py-2 text-xs font-medium transition-all ${
                selected
                  ? 'border-cyan-500/50 bg-cyan-500/10 font-semibold text-cyan-300'
                  : 'border-slate-800/80 bg-slate-900/60 text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {cat.name}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-slate-800/60 bg-slate-900/40 p-8 text-center">
          <Filter className="mx-auto h-10 w-10 text-slate-600" aria-hidden="true" />
          <h2 className="text-lg font-bold text-slate-300">Nothing matches those filters</h2>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setCategory('all');
              setBrowserFilter('all');
              setFavoritesOnly(false);
            }}
            className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-cyan-400 hover:bg-slate-700"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((api) => {
            const isFavorite = favorites.includes(api.id);
            const status = statusById.get(api.id);
            const badge = corsBadge(status);

            return (
              <li
                key={api.id}
                className="group flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/80 p-5 transition-all hover:border-slate-700 hover:bg-slate-900 hover:shadow-xl hover:shadow-cyan-950/20"
              >
                <div>
                  <div className="mb-2.5 flex items-start justify-between gap-3">
                    <h3 className="font-bold text-slate-100 transition-colors group-hover:text-cyan-300">
                      {api.name}
                    </h3>
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(api.id)}
                      aria-label={isFavorite ? `Unstar ${api.name}` : `Star ${api.name}`}
                      aria-pressed={isFavorite}
                      className="p-1 text-slate-500 transition-colors hover:text-amber-400"
                    >
                      <Star
                        className={`h-4 w-4 ${isFavorite ? 'fill-amber-400 text-amber-400' : ''}`}
                        aria-hidden="true"
                      />
                    </button>
                  </div>

                  <div className="mb-3 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium ${BADGE_STYLES[badge.level]}`}
                      title={badge.detail}
                    >
                      {badge.label}
                    </span>
                    {status?.ok && (
                      <span
                        className="rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 font-mono text-[10px] text-slate-400"
                        title={`${status.uptimePercent}% of ${status.samples} scheduled checks succeeded`}
                      >
                        {status.p50Latency}ms · {status.uptimePercent}% up
                      </span>
                    )}
                  </div>

                  <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-slate-400">
                    {api.description}
                  </p>

                  <div className="mb-4 flex flex-wrap items-center gap-1.5">
                    {api.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md border border-slate-800 bg-slate-950 px-2 py-0.5 font-mono text-[10px] text-slate-400"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>

                  <p className="mb-4 flex items-center gap-1.5 rounded-xl border border-slate-800/80 bg-slate-950/60 p-2.5 font-mono text-[11px] text-slate-400">
                    <Key className="h-3 w-3 text-cyan-400" aria-hidden="true" />
                    <span className="font-semibold text-slate-300">{api.auth}</span>
                    <span className="text-slate-600">·</span>
                    <span>{api.https ? 'HTTPS' : 'HTTP'}</span>
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-slate-800/80 pt-3">
                  <a
                    href={api.documentationUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 transition-colors hover:text-slate-200"
                  >
                    Docs
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                  <button
                    type="button"
                    onClick={() => onSelectForPlayground(configFromApi(api))}
                    className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-slate-100 shadow-md shadow-cyan-600/20 transition-all hover:from-cyan-500 hover:to-indigo-500 active:scale-95"
                  >
                    <Play className="h-3 w-3 fill-slate-100" aria-hidden="true" />
                    Open
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: number | string;
  tone: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      className="min-w-[92px] rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-center"
    >
      <div className={`text-xl font-bold ${tone}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
    </div>
  );
}
