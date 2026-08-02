/**
 * Endpointer edge CORS proxy.
 *
 * The hosted site is a static deployment with no origin server, so the Node
 * proxy in server.ts only exists during local development. This Worker fills
 * that gap: deploy it, set VITE_PROXY_URL at build time, and the "Server proxy"
 * toggle becomes real in production.
 *
 * It applies the same policy as the Node proxy: an explicit host allowlist, no
 * private/loopback/link-local/metadata targets, bounded response size, and
 * re-validation of every redirect hop.
 */

export interface Env {
  /** Comma-separated allowlist. "*" permits any public host. Empty disables. */
  ALLOWED_HOSTS?: string;
  /** Comma-separated origins permitted to call this Worker. */
  ALLOWED_ORIGINS?: string;
  /** Optional shared secret required in the X-Endpointer-Key header. */
  PROXY_SECRET?: string;
}

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 20_000;

const BLOCKED_V4: ReadonlyArray<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function isBlockedLiteral(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();

  if (host.includes(':')) {
    const mapped = host.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isBlockedLiteral(mapped[1]);
    return (
      host === '::' ||
      host === '::1' ||
      /^fe[89ab]/.test(host) ||
      /^f[cd]/.test(host) ||
      host.startsWith('ff') ||
      host.startsWith('64:ff9b')
    );
  }

  if (!/^[\d.]+$/.test(host)) return false; // a name, not a literal
  const value = ipv4ToInt(host);
  if (value === null) return true;
  return BLOCKED_V4.some(([network, bits]) => {
    const net = ipv4ToInt(network);
    if (net === null) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((value & mask) >>> 0) === ((net & mask) >>> 0);
  });
}

function hostAllowed(hostname: string, allowlist: string[]): boolean {
  if (allowlist.includes('*')) return true;
  return allowlist.some((pattern) => {
    if (pattern === hostname) return true;
    if (pattern.startsWith('*.')) return hostname.endsWith(pattern.slice(1));
    if (pattern.startsWith('.')) return hostname.endsWith(pattern);
    return false;
  });
}

function validate(raw: unknown, allowlist: string[]): { url?: URL; error?: string } {
  if (typeof raw !== 'string' || !raw.trim()) return { error: "A target 'url' string is required." };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: 'Target URL could not be parsed.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: `Only http and https are proxied (got "${url.protocol}").` };
  }
  if (isBlockedLiteral(url.hostname)) {
    return { error: `${url.hostname} is a private, loopback, link-local or reserved address.` };
  }
  if (allowlist.length === 0) {
    return { error: 'The proxy is disabled. Set ALLOWED_HOSTS to enable it.' };
  }
  if (!hostAllowed(url.hostname.toLowerCase(), allowlist)) {
    return { error: `${url.hostname} is not in ALLOWED_HOSTS.` };
  }
  return { url };
}

function parseList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function corsHeaders(origin: string | null, allowedOrigins: string[]): Record<string, string> {
  const allow =
    allowedOrigins.length === 0 || allowedOrigins.includes('*')
      ? (origin ?? '*')
      : origin && allowedOrigins.includes(origin.toLowerCase())
        ? origin
        : '';
  if (!allow) return {};
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Endpointer-Key',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowedOrigins = parseList(env.ALLOWED_ORIGINS);
    const cors = corsHeaders(request.headers.get('Origin'), allowedOrigins);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...cors },
      });

    const url = new URL(request.url);
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      return json({ status: 'ok', allowlistSize: parseList(env.ALLOWED_HOSTS).length });
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST a JSON body to this endpoint.' }, 405);
    }

    if (env.PROXY_SECRET && request.headers.get('X-Endpointer-Key') !== env.PROXY_SECRET) {
      return json({ error: 'Missing or invalid X-Endpointer-Key.' }, 401);
    }

    let payload: Record<string, unknown>;
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: 'Request body must be JSON.' }, 400);
    }

    const allowlist = parseList(env.ALLOWED_HOSTS);
    const { url: target, error } = validate(payload.url, allowlist);
    if (!target) {
      return json(
        { ok: false, status: 403, statusText: 'Blocked by proxy policy', error, data: null },
        403,
      );
    }

    const params = payload.params;
    if (params && typeof params === 'object') {
      for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
        if (v !== undefined && v !== null && v !== '') target.searchParams.append(k, String(v));
      }
    }

    const forbidden = new Set(['host', 'content-length', 'connection', 'cookie']);
    const headers = new Headers();
    if (payload.headers && typeof payload.headers === 'object') {
      for (const [k, v] of Object.entries(payload.headers as Record<string, unknown>)) {
        if (!forbidden.has(k.toLowerCase())) headers.set(k, String(v));
      }
    }
    if (!headers.has('user-agent')) {
      headers.set('User-Agent', 'Endpointer-Edge-Proxy/1.0');
    }

    const method = String(payload.method ?? 'GET').toUpperCase();
    let body: string | undefined;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && payload.body != null) {
      body = typeof payload.body === 'object' ? JSON.stringify(payload.body) : String(payload.body);
      if (!headers.has('content-type')) headers.set('Content-Type', 'application/json');
    }

    const started = Date.now();
    let current = target;

    try {
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const upstream = await fetch(current.toString(), {
          method,
          headers,
          body,
          redirect: 'manual',
          signal: controller.signal,
        });
        clearTimeout(timer);

        const location = upstream.headers.get('location');
        if (upstream.status >= 300 && upstream.status < 400 && location) {
          if (hop === MAX_REDIRECTS) {
            return json({ ok: false, error: `Exceeded ${MAX_REDIRECTS} redirects` }, 502);
          }
          const next = validate(new URL(location, current).toString(), allowlist);
          if (!next.url) {
            return json({ ok: false, error: `Blocked redirect: ${next.error}` }, 403);
          }
          current = next.url;
          continue;
        }

        const raw = await upstream.text();
        const truncated = raw.length > MAX_BYTES;
        const text = truncated ? raw.slice(0, MAX_BYTES) : raw;
        const contentType = upstream.headers.get('content-type') ?? '';

        let data: unknown = text;
        if (contentType.includes('json')) {
          try {
            data = JSON.parse(text);
          } catch {
            /* keep as text */
          }
        }

        const responseHeaders: Record<string, string> = {};
        upstream.headers.forEach((v, k) => {
          responseHeaders[k] = v;
        });

        return json({
          ok: upstream.ok,
          status: upstream.status,
          statusText: upstream.statusText,
          headers: responseHeaders,
          data,
          contentType,
          duration: Date.now() - started,
          sizeBytes: new TextEncoder().encode(text).length,
          truncated,
          finalUrl: current.toString(),
        });
      }

      return json({ ok: false, error: 'Redirect loop' }, 502);
    } catch (err) {
      const message = (err as Error)?.name === 'AbortError' ? 'Upstream timeout' : String(err);
      return json(
        {
          ok: false,
          status: 502,
          statusText: 'Bad Gateway / Proxy Error',
          error: message,
          duration: Date.now() - started,
          data: null,
        },
        502,
      );
    }
  },
};
