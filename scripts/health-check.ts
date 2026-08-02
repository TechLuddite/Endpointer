/**
 * Scheduled directory verification.
 *
 * Runs in CI on a cron, probes every entry in the directory, and writes
 * public/status.json. This replaces two things the app used to guess at:
 *
 *  - the `cors` flag, which was hand-written as 'yes' for every single entry
 *    without anyone checking, and
 *  - "uptime", which was computed from whichever single ping the visitor's
 *    browser had most recently made.
 *
 * Because the results are committed, the health board renders real history on
 * first paint with no client-side requests — which also means it works for
 * endpoints the browser could never reach directly.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { PUBLIC_APIS } from '../src/data/publicApis.js';
import type {
  CorsSupport,
  PublicApiItem,
  StatusEntry,
  StatusFile,
  StatusSample,
} from '../src/types.js';

const STATUS_PATH = path.join(process.cwd(), 'public', 'status.json');
const HISTORY_LIMIT = 90; // ~3 months of daily samples
const TIMEOUT_MS = 15_000;
const CONCURRENCY = 6;
const PROBE_ORIGIN = 'https://endpointer.opsvibe.systems';

interface ProbeResult {
  ok: boolean;
  needsCredentials: boolean;
  status: number;
  latency: number;
  cors: CorsSupport;
  error?: string;
}

/**
 * Determine browser usability the same way a browser would: send an Origin
 * header and see whether the response comes back with a matching
 * Access-Control-Allow-Origin. A wildcard or an exact echo means a browser
 * fetch from the app would succeed.
 */
function classifyCors(headers: Headers): CorsSupport {
  const acao = headers.get('access-control-allow-origin');
  if (!acao) return 'no';
  const value = acao.trim();
  if (value === '*') return 'yes';
  if (value.toLowerCase() === PROBE_ORIGIN.toLowerCase()) return 'yes';
  // An echo of some other origin means the API is origin-restricted; a browser
  // request from Endpointer would still be blocked.
  return 'no';
}

/**
 * A 401/403 from an endpoint that declares it needs a key is the correct
 * response to a keyless request — the API is up. Treating it as an outage
 * would paint every keyed entry red forever and make the failure count useless.
 */
function classifyOutcome(status: number, requiresAuth: boolean) {
  const reachable = status >= 200 && status < 400;
  const authWall = requiresAuth && (status === 401 || status === 403);
  return { ok: reachable || authWall, needsCredentials: authWall };
}

/**
 * Probe an entry exactly as the app would send it.
 *
 * `defaultHeaders` has to be included: an entry that needs a documented header
 * to work (ReqRes requires `x-api-key`) would otherwise be probed in a
 * configuration the app never uses, and reported as broken while working fine
 * for every actual user.
 */
async function probe(api: PublicApiItem): Promise<ProbeResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const requiresAuth = api.auth !== 'No Auth';

  try {
    const res = await fetch(api.sampleEndpoint, {
      method: 'GET',
      headers: {
        Origin: PROBE_ORIGIN,
        'User-Agent': 'Endpointer-HealthCheck/1.0 (+https://github.com/TechLuddite/Endpointer)',
        Accept: 'application/json, text/plain, */*',
        ...Object.fromEntries((api.defaultHeaders ?? []).map((h) => [h.key, h.value])),
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    const outcome = classifyOutcome(res.status, requiresAuth);
    return {
      ok: outcome.ok,
      needsCredentials: outcome.needsCredentials,
      status: res.status,
      latency: Date.now() - started,
      cors: classifyCors(res.headers),
    };
  } catch (err) {
    clearTimeout(timer);
    const aborted = (err as Error)?.name === 'AbortError';
    return {
      ok: false,
      needsCredentials: false,
      status: 0,
      latency: Date.now() - started,
      cors: 'unknown',
      error: aborted ? 'Timeout' : ((err as Error)?.message ?? 'Unreachable'),
    };
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index] ?? 0;
}

async function loadExisting(): Promise<StatusFile | null> {
  try {
    return JSON.parse(await readFile(STATUS_PATH, 'utf8')) as StatusFile;
  } catch {
    return null;
  }
}

async function main() {
  const previous = await loadExisting();
  const previousById = new Map((previous?.entries ?? []).map((e) => [e.id, e]));
  const checkedAt = new Date().toISOString();

  const results: StatusEntry[] = new Array(PUBLIC_APIS.length);
  let cursor = 0;

  async function worker() {
    while (cursor < PUBLIC_APIS.length) {
      const index = cursor++;
      const api = PUBLIC_APIS[index];
      if (!api) continue;

      const result = await probe(api);
      const prior = previousById.get(api.id);

      const sample: StatusSample = {
        t: checkedAt,
        ok: result.ok,
        status: result.status,
        latency: result.latency,
      };
      const history = [...(prior?.history ?? []), sample].slice(-HISTORY_LIMIT);
      const latencies = history.filter((s) => s.ok).map((s) => s.latency);
      const okCount = history.filter((s) => s.ok).length;

      results[index] = {
        id: api.id,
        url: api.sampleEndpoint,
        ok: result.ok,
        needsCredentials: result.needsCredentials,
        status: result.status,
        latency: result.latency,
        cors: result.cors,
        error: result.error,
        checkedAt,
        // Consecutive-failure count drives the "quarantined" badge and the
        // auto-filed issue, so a single blip does not flag a healthy API.
        consecutiveFailures: result.ok ? 0 : (prior?.consecutiveFailures ?? 0) + 1,
        uptimePercent: history.length ? Math.round((okCount / history.length) * 1000) / 10 : 0,
        p50Latency: percentile(latencies, 50),
        p95Latency: percentile(latencies, 95),
        samples: history.length,
        history,
      };

      const label = result.needsCredentials
        ? `${result.status} needs-key`
        : result.ok
          ? `${result.status}`
          : `FAIL(${result.error ?? result.status})`;
      console.log(
        `${label.padEnd(22)} cors=${result.cors.padEnd(7)} ${String(result.latency).padStart(5)}ms  ${api.id}`,
      );
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const entries = results.filter(Boolean);
  const healthy = entries.filter((e) => e.ok).length;
  const browserUsable = entries.filter((e) => e.cors === 'yes').length;
  const needsCredentials = entries.filter((e) => e.needsCredentials).length;

  const file: StatusFile = {
    version: 1,
    generatedAt: checkedAt,
    summary: {
      total: entries.length,
      healthy,
      failing: entries.length - healthy,
      browserUsable,
      needsProxy: entries.filter((e) => e.ok && e.cors !== 'yes').length,
      needsCredentials,
    },
    entries,
  };

  await mkdir(path.dirname(STATUS_PATH), { recursive: true });
  await writeFile(STATUS_PATH, `${JSON.stringify(file, null, 2)}\n`, 'utf8');

  console.log(
    `\n${healthy}/${entries.length} reachable · ${browserUsable} browser-usable · ${needsCredentials} awaiting a user-supplied key`,
  );

  // Surface anything that has failed repeatedly so the workflow can open an issue.
  const broken = entries.filter((e) => e.consecutiveFailures >= 3);
  if (broken.length > 0) {
    console.log(`\n::warning::${broken.length} endpoint(s) failing 3+ consecutive checks:`);
    for (const e of broken) {
      console.log(`  ${e.id} — ${e.error ?? e.status} (${e.consecutiveFailures} in a row)`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
