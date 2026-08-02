/**
 * Health board.
 *
 * Backed by public/status.json, which a scheduled job commits. The previous
 * version showed "Uptime Health: 100%" before anything had been checked, and
 * its "uptime" was whichever single browser ping had happened most recently.
 * It also pinged all 65 endpoints every 15 seconds with no in-flight guard, so
 * rounds stacked and the user's IP got rate-limited by CoinGecko and GitHub.
 *
 * Live pinging is still available, but it is an explicit action, it is bounded,
 * and its results are labelled as a browser-side probe rather than as uptime.
 */

import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, RefreshCw } from 'lucide-react';
import type {
  HealthStatusItem,
  PublicApiItem,
  RequestConfig,
  StatusEntry,
  StatusFile,
} from '../types';
import { corsBadge, formatAge } from '../utils/status';
import { configFromApi } from './ApiDirectory';

interface StatusMonitorProps {
  apis: PublicApiItem[];
  statusById: Map<string, StatusEntry>;
  statusFile: StatusFile | null;
  liveResults: Record<string, HealthStatusItem>;
  onLivePing: (apis: PublicApiItem[]) => Promise<void>;
  onSelectForPlayground: (config: RequestConfig) => void;
}

type SortKey = 'name' | 'latency' | 'uptime' | 'status';

/** Sparkline over the committed history. Pure SVG — no charting dependency. */
function Sparkline({ history }: { history: StatusEntry['history'] }) {
  const points = history.slice(-30);
  if (points.length < 2) {
    return <span className="font-mono text-[10px] text-slate-600">not enough data</span>;
  }

  const width = 90;
  const height = 20;
  const max = Math.max(...points.map((p) => p.latency), 1);
  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - (point.latency / max) * (height - 2) - 1;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Latency over the last ${points.length} checks, peaking at ${max}ms`}
      className="overflow-visible"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        className="text-cyan-500"
      />
      {points.map((point, index) =>
        point.ok ? null : (
          <circle
            key={index}
            cx={(index / (points.length - 1)) * width}
            cy={height - 1}
            r="1.6"
            className="fill-rose-500"
          />
        ),
      )}
    </svg>
  );
}

export function StatusMonitor({
  apis,
  statusById,
  statusFile,
  liveResults,
  onLivePing,
  onSelectForPlayground,
}: StatusMonitorProps) {
  const [pinging, setPinging] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');

  const summary = statusFile?.summary;

  const rows = useMemo(() => {
    const list = apis.map((api) => ({ api, status: statusById.get(api.id) }));
    return list.sort((a, b) => {
      switch (sortKey) {
        case 'latency':
          return (a.status?.p50Latency ?? Infinity) - (b.status?.p50Latency ?? Infinity);
        case 'uptime':
          return (b.status?.uptimePercent ?? -1) - (a.status?.uptimePercent ?? -1);
        case 'status':
          return Number(b.status?.ok ?? false) - Number(a.status?.ok ?? false);
        default:
          return a.api.name.localeCompare(b.api.name);
      }
    });
  }, [apis, statusById, sortKey]);

  const runLivePing = async () => {
    setPinging(true);
    try {
      // Bounded: only browser-reachable entries, and only the starred/failing
      // ones would be worth more. Everything is capped by the executor's own
      // concurrency limit.
      await onLivePing(apis.filter((api) => statusById.get(api.id)?.cors === 'yes'));
    } finally {
      setPinging(false);
    }
  };

  const browserReachable = apis.filter((api) => statusById.get(api.id)?.cors === 'yes').length;

  return (
    <div className="space-y-6 pb-12">
      <section className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <span className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
              <Activity className="h-3.5 w-3.5" aria-hidden="true" />
              Scheduled health checks
            </span>
            <h1 className="text-xl font-bold text-slate-100 sm:text-2xl">API health board</h1>
            <p className="mt-1 text-xs text-slate-400">
              {statusFile ? (
                <>
                  Measured from a daily job, not from your browser — so it covers endpoints your
                  browser could never reach. Last run {formatAge(statusFile.generatedAt)}.
                </>
              ) : (
                <>
                  No scheduled results yet. The daily workflow publishes{' '}
                  <code className="text-slate-300">public/status.json</code> on its first run.
                </>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void runLivePing()}
            disabled={pinging || browserReachable === 0}
            title={
              browserReachable === 0
                ? 'No entries are known to be browser-reachable yet.'
                : `Ping the ${browserReachable} browser-reachable endpoints from this tab.`
            }
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition-all hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 active:scale-95"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${pinging ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {pinging ? 'Pinging…' : `Ping from my browser (${browserReachable})`}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Metric
            label="Uptime"
            value={
              summary
                ? `${((summary.healthy / Math.max(summary.total, 1)) * 100).toFixed(1)}%`
                : '—'
            }
            tone="text-emerald-400"
            hint="Share of endpoints reachable in the most recent scheduled run"
          />
          <Metric
            label="Browser-ready"
            value={summary ? String(summary.browserUsable) : '—'}
            tone="text-cyan-400"
            hint="Send CORS headers, so they work directly from this page"
          />
          <Metric
            label="Need a proxy"
            value={summary ? String(summary.needsProxy) : '—'}
            tone="text-amber-400"
            hint="Reachable, but the browser blocks the response"
          />
          <Metric
            label="Needs a key"
            value={summary ? String(summary.needsCredentials ?? 0) : '—'}
            tone="text-slate-300"
            hint="Up, but answered the keyless check with 401/403 — add your own credential"
          />
          <Metric
            label="Unreachable"
            value={summary ? String(summary.failing) : '—'}
            tone="text-rose-400"
            hint="Failed the most recent scheduled check"
          />
        </div>

        {!statusFile && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-700/50 bg-amber-950/40 p-3 text-xs text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              These figures stay blank rather than showing a placeholder. An earlier version
              displayed 100% uptime before any check had run.
            </span>
          </p>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <h2 className="flex items-center gap-2 font-bold text-slate-100">
            <BarChart3 className="h-4 w-4 text-cyan-400" aria-hidden="true" />
            {apis.length} monitored endpoints
          </h2>
          <div className="flex items-center gap-2">
            <label className="font-mono text-xs text-slate-400" htmlFor="sort-key">
              Sort
            </label>
            <select
              id="sort-key"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-xs text-slate-300 focus:border-cyan-500 focus:outline-none"
            >
              <option value="name">Name</option>
              <option value="latency">Fastest first</option>
              <option value="uptime">Most reliable</option>
              <option value="status">Failing first</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              Reachability, browser compatibility and latency for every directory endpoint
            </caption>
            <thead>
              <tr className="border-b border-slate-800 font-mono text-[11px] uppercase text-slate-400">
                <th scope="col" className="px-4 py-3">
                  API
                </th>
                <th scope="col" className="px-4 py-3">
                  Browser
                </th>
                <th scope="col" className="px-4 py-3">
                  Last check
                </th>
                <th scope="col" className="px-4 py-3">
                  Uptime
                </th>
                <th scope="col" className="px-4 py-3">
                  Latency p50 / p95
                </th>
                <th scope="col" className="px-4 py-3">
                  Trend
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {rows.map(({ api, status }) => {
                const badge = corsBadge(status);
                const live = liveResults[api.id];
                return (
                  <tr key={api.id} className="transition-colors hover:bg-slate-950/60">
                    <th scope="row" className="px-4 py-3 text-left font-bold text-slate-200">
                      <span>{api.name}</span>
                      <span className="ml-2 rounded border border-slate-800 bg-slate-950 px-2 py-0.5 font-mono text-[10px] font-normal text-slate-400">
                        {api.category}
                      </span>
                    </th>

                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                          badge.level === 'yes'
                            ? 'border-emerald-800 bg-emerald-950 text-emerald-300'
                            : badge.level === 'no'
                              ? 'border-amber-800 bg-amber-950 text-amber-300'
                              : 'border-slate-700 bg-slate-900 text-slate-400'
                        }`}
                        title={badge.detail}
                      >
                        {badge.label}
                      </span>
                    </td>

                    <td className="px-4 py-3 font-mono text-slate-300">
                      {status ? (
                        <span className={status.ok ? 'text-emerald-400' : 'text-rose-400'}>
                          {status.ok ? status.status : (status.error ?? `HTTP ${status.status}`)}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                      {live && (
                        <span
                          className="ml-2 text-[10px] text-cyan-400"
                          title="Result of your browser ping, which is subject to CORS"
                        >
                          (you: {live.ok ? `${live.latency}ms` : (live.error ?? 'blocked')})
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 font-mono text-slate-300">
                      {status ? (
                        <span title={`${status.samples} scheduled checks`}>
                          {status.uptimePercent}%
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3 font-mono text-slate-300">
                      {status?.ok ? (
                        <>
                          {status.p50Latency}ms
                          <span className="text-slate-600"> / </span>
                          <span className="text-slate-400">{status.p95Latency}ms</span>
                        </>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {status ? (
                        <Sparkline history={status.history} />
                      ) : (
                        <span className="font-mono text-[10px] text-slate-600">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectForPlayground(configFromApi(api))}
                        className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-cyan-400 transition-all hover:bg-slate-700"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: string;
  hint: string;
}) {
  return (
    <div title={hint} className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-center">
      <div className={`text-2xl font-black ${tone}`}>{value}</div>
      <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-slate-400">
        {label}
      </div>
    </div>
  );
}
