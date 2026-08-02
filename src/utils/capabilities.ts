/**
 * Runtime feature detection.
 *
 * Endpointer ships in two very different shapes: a static bundle on GitHub
 * Pages with no origin server, and a local/self-hosted deployment where
 * server.ts is running. Previously the UI assumed the second shape
 * unconditionally — it advertised a proxy that did not exist and an AI copilot
 * that was actually a local keyword matcher.
 *
 * This module asks once, at startup, what is really available, so every claim
 * in the interface can be conditioned on the answer.
 */

import type { Capabilities } from '../types';

/** Baked in at build time; see worker/README.md. */
const CONFIGURED_PROXY_URL = (import.meta.env?.VITE_PROXY_URL ?? '').trim();

export const UNKNOWN_CAPABILITIES: Capabilities = {
  ai: { available: false, model: null },
  proxy: { available: false },
  checkedAt: 0,
};

async function fetchJson(url: string, timeoutMs = 4000): Promise<unknown | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    // A static host answers unknown paths with index.html, so a 200 alone is
    // not evidence the endpoint exists — the content type has to be JSON too.
    if (!res.ok) return null;
    if (!(res.headers.get('content-type') ?? '').includes('json')) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Probe the origin server, then the optional edge proxy. Never throws; an
 * unreachable server simply means the features are reported unavailable.
 */
export async function detectCapabilities(): Promise<Capabilities> {
  const server = (await fetchJson('/api/capabilities')) as {
    ai?: { available?: boolean; model?: string | null };
    proxy?: { available?: boolean };
  } | null;

  const result: Capabilities = {
    ai: {
      available: Boolean(server?.ai?.available),
      model: server?.ai?.model ?? null,
    },
    proxy: { available: Boolean(server?.proxy?.available) },
    checkedAt: Date.now(),
  };

  // The Worker proxy is independent of the Node server: a static deployment can
  // have the proxy without the AI, and vice versa.
  if (!result.proxy.available && CONFIGURED_PROXY_URL) {
    const health = await fetchJson(`${CONFIGURED_PROXY_URL.replace(/\/$/, '')}/health`);
    if (health) {
      result.proxy = { available: true, url: CONFIGURED_PROXY_URL };
    }
  } else if (result.proxy.available) {
    result.proxy.url = '/api/proxy';
  }

  return result;
}

export function proxyEndpoint(capabilities: Capabilities): string | null {
  if (!capabilities.proxy.available) return null;
  const url = capabilities.proxy.url ?? '/api/proxy';
  return url === '/api/proxy' ? url : url.replace(/\/$/, '');
}
