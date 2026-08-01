import React, { useState, useEffect } from 'react';
import { Activity, RefreshCw, CheckCircle2, XCircle, Clock, Play, Zap, ShieldAlert, BarChart3, Wifi } from 'lucide-react';
import { PublicApiItem, HealthStatusItem, RequestConfig } from '../types';

interface StatusMonitorProps {
  apis: PublicApiItem[];
  healthMap: Record<string, HealthStatusItem>;
  onBatchPing: (selectedApis: PublicApiItem[]) => Promise<void>;
  onSelectForPlayground: (config: RequestConfig) => void;
}

export const StatusMonitor: React.FC<StatusMonitorProps> = ({
  apis,
  healthMap,
  onBatchPing,
  onSelectForPlayground,
}) => {
  const [isPinging, setIsPinging] = useState(false);
  const [autoPollInterval, setAutoPollInterval] = useState<number>(0); // 0 = off

  // Auto poll timer
  useEffect(() => {
    if (autoPollInterval <= 0) return;

    const timer = setInterval(() => {
      handleRunBatchPing();
    }, autoPollInterval * 1000);

    return () => clearInterval(timer);
  }, [autoPollInterval, apis]);

  const handleRunBatchPing = async () => {
    setIsPinging(true);
    try {
      await onBatchPing(apis);
    } finally {
      setIsPinging(false);
    }
  };

  const healthItems: HealthStatusItem[] = Object.values(healthMap);
  const totalChecked = healthItems.length;
  const healthyCount = healthItems.filter((h: HealthStatusItem) => h.ok).length;
  const failingCount = totalChecked - healthyCount;
  const avgLatency =
    totalChecked > 0
      ? Math.round(healthItems.reduce((acc: number, h: HealthStatusItem) => acc + (h.latency || 0), 0) / totalChecked)
      : 0;
  const uptimePercent = totalChecked > 0 ? ((healthyCount / totalChecked) * 100).toFixed(1) : '100';

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner & Control Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold mb-2">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>Real-Time Health & Uptime Monitor</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-100">
              API Directory Health Check & Latency Monitor
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Ping public API endpoints in batch to measure real-time latency, HTTP status codes, and server availability.
            </p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* Auto Poll Select */}
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Auto Poll:</span>
              <select
                value={autoPollInterval}
                onChange={(e) => setAutoPollInterval(Number(e.target.value))}
                className="bg-transparent text-cyan-400 font-semibold focus:outline-none cursor-pointer"
              >
                <option value={0} className="bg-slate-900 text-slate-200">Manual</option>
                <option value={15} className="bg-slate-900 text-slate-200">Every 15s</option>
                <option value={30} className="bg-slate-900 text-slate-200">Every 30s</option>
                <option value={60} className="bg-slate-900 text-slate-200">Every 60s</option>
              </select>
            </div>

            {/* Run Batch Ping Button */}
            <button
              id="btn-run-batch-ping"
              onClick={handleRunBatchPing}
              disabled={isPinging}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 disabled:opacity-50 transition-all active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-white ${isPinging ? 'animate-spin' : ''}`} />
              <span>{isPinging ? 'Pinging All...' : 'Run Batch Health Check'}</span>
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-emerald-400">{uptimePercent}%</div>
            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mt-1">Uptime Health</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-cyan-400">{avgLatency} ms</div>
            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mt-1">Avg Latency</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-emerald-300">{healthyCount}</div>
            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mt-1">Active (200 OK)</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-rose-400">{failingCount}</div>
            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mt-1">Degraded / Error</div>
          </div>
        </div>
      </div>

      {/* API Health Status Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <span>Public APIs Status Board</span>
          </h3>
          <span className="text-xs font-mono text-slate-400">
            Showing {apis.length} monitored endpoints
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400">
                <th className="py-3 px-4">API Name</th>
                <th className="py-3 px-4">Target Sample Endpoint</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Latency</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {apis.map((api) => {
                const health = healthMap[api.id];

                return (
                  <tr key={api.id} className="hover:bg-slate-950/60 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-200">
                      <div className="flex items-center gap-2">
                        <span>{api.name}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                          {api.category}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono text-slate-400 max-w-[240px] truncate">
                      {api.sampleEndpoint}
                    </td>

                    <td className="py-3 px-4">
                      {health ? (
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold border ${
                            health.ok
                              ? 'bg-emerald-950 border-emerald-800 text-emerald-400'
                              : 'bg-rose-950 border-rose-800 text-rose-400'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${health.ok ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          <span>{health.ok ? `${health.status} OK` : `Error (${health.status || 'Fail'})`}</span>
                        </span>
                      ) : (
                        <span className="text-slate-500 font-mono text-[11px]">Unchecked</span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-mono text-slate-300">
                      {health ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                            <div
                              className={`h-full ${
                                health.latency < 200
                                  ? 'bg-emerald-400'
                                  : health.latency < 500
                                  ? 'bg-amber-400'
                                  : 'bg-rose-400'
                              }`}
                              style={{ width: `${Math.min(100, (health.latency / 1000) * 100)}%` }}
                            />
                          </div>
                          <span>{health.latency}ms</span>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() =>
                          onSelectForPlayground({
                            name: api.name,
                            method: api.defaultMethod || 'GET',
                            url: api.sampleEndpoint,
                            params: (api.defaultParams || []).map((p, idx) => ({
                              id: String(idx + 1),
                              key: p.key,
                              value: p.value,
                              enabled: true,
                            })),
                            headers: [],
                            authType: api.auth,
                            authConfig: {},
                            bodyType: 'none',
                            body: '',
                            useProxy: true,
                          })
                        }
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-semibold rounded-lg border border-slate-700 transition-all"
                      >
                        Test
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
