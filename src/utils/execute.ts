/**
 * Request execution.
 *
 * Replaces the old direct-fetch path, which had no timeout and no way to
 * cancel — a hanging endpoint left "Sending…" spinning forever — and which
 * labelled every possible failure "CORS / Direct Network Error", including DNS
 * failures, offline browsers and TLS problems. That mislabelling is also why
 * the health board reported healthy-but-CORS-less APIs as down.
 */

import type { ApiResponseData, ErrorKind, RequestConfig } from '../types';
import { buildFullUrl, buildHeadersRecord, hasRequestBody } from './codeGenerators';

export interface ExecuteOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Proxy endpoint to use when config.useProxy is set. Null means unavailable. */
  proxyUrl?: string | null;
}

const DEFAULT_TIMEOUT = 30_000;

/**
 * Work out why a browser fetch failed.
 *
 * The browser deliberately gives almost nothing here — a CORS rejection and a
 * dead host both surface as an opaque TypeError — so this combines the message
 * text with what we can observe (navigator.onLine, whether the failure was fast
 * enough to be a preflight rejection) and is careful not to over-claim.
 */
export function classifyFetchError(
  error: unknown,
  context: { elapsed: number; url: string },
): { kind: ErrorKind; message: string } {
  const err = error as { name?: string; message?: string };
  const message = err?.message ?? String(error);

  if (err?.name === 'AbortError') {
    return { kind: 'aborted', message: 'Request cancelled.' };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { kind: 'offline', message: 'Your browser reports no network connection.' };
  }

  const lower = message.toLowerCase();
  if (lower.includes('certificate') || lower.includes('ssl') || lower.includes('tls')) {
    return { kind: 'tls', message: `TLS/certificate error: ${message}` };
  }
  if (lower.includes('name_not_resolved') || lower.includes('enotfound') || lower.includes('dns')) {
    return { kind: 'dns', message: `Hostname could not be resolved: ${hostOf(context.url)}` };
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return { kind: 'timeout', message: 'The request timed out.' };
  }

  // A cross-origin rejection is refused by the browser almost immediately,
  // because the preflight either never runs or comes back without the header.
  // A dead host normally takes longer to give up.
  if (
    lower.includes('failed to fetch') ||
    lower.includes('load failed') ||
    lower.includes('networkerror')
  ) {
    if (context.elapsed < 2000) {
      return {
        kind: 'cors',
        message: `Blocked by the browser's same-origin policy: ${hostOf(context.url)} did not return an Access-Control-Allow-Origin header. This is enforced by the browser and cannot be worked around from client-side code — use the proxy, or run the generated cURL snippet.`,
      };
    }
    return {
      kind: 'network',
      message: `The connection to ${hostOf(context.url)} failed before a response arrived. The host may be unreachable, or it may be refusing cross-origin requests.`,
    };
  }

  return { kind: 'unknown', message: message || 'The request failed for an unknown reason.' };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function byteLength(text: string): number {
  // The old code used String.length, which counts UTF-16 code units and
  // undercounts every multi-byte character.
  return new TextEncoder().encode(text).length;
}

function parseBody(text: string, contentType: string): unknown {
  const looksJson =
    contentType.includes('json') ||
    ((text.trimStart().startsWith('{') || text.trimStart().startsWith('[')) && text.length > 1);
  if (!looksJson) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Combine an external abort signal with a timeout. */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('Timeout', 'TimeoutError')),
    timeoutMs,
  );
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

async function executeDirect(
  config: RequestConfig,
  options: ExecuteOptions,
): Promise<ApiResponseData> {
  const started = Date.now();
  const url = buildFullUrl(config);
  const { signal, cleanup } = withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT);

  try {
    const init: RequestInit = {
      method: config.method,
      headers: buildHeadersRecord(config),
      signal,
    };
    if (hasRequestBody(config)) init.body = config.body;

    const response = await fetch(url, init);
    const text = await response.text();
    const contentType = response.headers.get('content-type') ?? '';

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText || (response.ok ? 'OK' : 'Error'),
      headers,
      data: parseBody(text, contentType),
      contentType,
      duration: Date.now() - started,
      sizeBytes: byteLength(text),
      timestamp: Date.now(),
      transport: 'direct',
    };
  } catch (error) {
    const elapsed = Date.now() - started;
    const isTimeout = (error as DOMException)?.name === 'TimeoutError';
    const classified = isTimeout
      ? ({
          kind: 'timeout',
          message: `The request timed out after ${options.timeoutMs ?? DEFAULT_TIMEOUT}ms.`,
        } as const)
      : classifyFetchError(error, { elapsed, url });

    return {
      ok: false,
      status: 0,
      statusText: errorTitle(classified.kind),
      headers: {},
      data: null,
      contentType: '',
      duration: elapsed,
      sizeBytes: 0,
      timestamp: Date.now(),
      error: classified.message,
      errorKind: classified.kind,
      transport: 'direct',
    };
  } finally {
    cleanup();
  }
}

function errorTitle(kind: ErrorKind): string {
  return {
    cors: 'Blocked by CORS',
    dns: 'DNS failure',
    timeout: 'Timed out',
    tls: 'TLS error',
    offline: 'Offline',
    aborted: 'Cancelled',
    network: 'Network error',
    proxy: 'Proxy error',
    unknown: 'Request failed',
  }[kind];
}

async function executeViaProxy(
  config: RequestConfig,
  proxyUrl: string,
  options: ExecuteOptions,
): Promise<ApiResponseData> {
  const started = Date.now();
  const { signal, cleanup } = withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT);

  try {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        url: buildFullUrl(config),
        method: config.method,
        headers: buildHeadersRecord(config),
        body: hasRequestBody(config) ? config.body : undefined,
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT,
      }),
    });

    // A static host answers unknown paths with index.html, so a 200 alone does
    // not prove the proxy exists.
    if (!(response.headers.get('content-type') ?? '').includes('json')) {
      throw new Error('The proxy endpoint did not return JSON — it is probably not deployed here.');
    }

    const payload = (await response.json()) as Partial<ApiResponseData> & { error?: string };

    if (!response.ok || payload.ok === false) {
      return {
        ok: false,
        status: payload.status ?? response.status,
        statusText: payload.statusText ?? 'Proxy error',
        headers: payload.headers ?? {},
        data: payload.data ?? null,
        contentType: payload.contentType ?? '',
        duration: Date.now() - started,
        sizeBytes: payload.sizeBytes ?? 0,
        timestamp: Date.now(),
        error: payload.error ?? `Proxy returned HTTP ${response.status}.`,
        errorKind: 'proxy',
        transport: 'proxy',
      };
    }

    return {
      ok: Boolean(payload.ok),
      status: payload.status ?? 0,
      statusText: payload.statusText ?? '',
      headers: payload.headers ?? {},
      data: payload.data ?? null,
      contentType: payload.contentType ?? '',
      duration: payload.duration ?? Date.now() - started,
      sizeBytes: payload.sizeBytes ?? 0,
      timestamp: Date.now(),
      transport: 'proxy',
    };
  } catch (error) {
    const classified = classifyFetchError(error, {
      elapsed: Date.now() - started,
      url: proxyUrl,
    });
    return {
      ok: false,
      status: 0,
      statusText: 'Proxy unreachable',
      headers: {},
      data: null,
      contentType: '',
      duration: Date.now() - started,
      sizeBytes: 0,
      timestamp: Date.now(),
      error: classified.message,
      errorKind: 'proxy',
      transport: 'proxy',
    };
  } finally {
    cleanup();
  }
}

/**
 * Execute a request.
 *
 * Takes the config as an argument rather than reading component state. The old
 * auto-send path fired `setTimeout(handleExecute, 300)` and hoped React had
 * re-rendered by then, so it could send the *previous* configuration.
 */
export async function executeRequest(
  config: RequestConfig,
  options: ExecuteOptions = {},
): Promise<ApiResponseData> {
  const proxyUrl = options.proxyUrl ?? null;
  if (config.useProxy && proxyUrl) return executeViaProxy(config, proxyUrl, options);
  return executeDirect(config, options);
}
