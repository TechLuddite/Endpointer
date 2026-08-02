/**
 * Outbound HTTP for the proxy, with the address checks applied at the point
 * where the socket is actually opened.
 *
 * Validating a hostname and then handing the URL to fetch() leaves a DNS
 * rebinding window: the name can resolve to a public address during the check
 * and a private one when the connection is made. Passing our own `lookup` to
 * the agent closes that, because the same validated result is what the socket
 * connects to.
 */

import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import { isBlockedAddress, validateTargetUrl } from './ssrf.js';

export interface SafeRequestOptions {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  allowlist: Set<string>;
}

export interface SafeResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
  finalUrl: string;
}

export class ProxyError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

/**
 * A dns.lookup drop-in that refuses to hand back a blocked address. Node calls
 * this immediately before connect(), so the address it returns is the address
 * used.
 */
const guardedLookup: typeof dns.lookup = ((
  hostname: string,
  options: unknown,
  callback: (err: NodeJS.ErrnoException | null, address?: any, family?: number) => void,
) => {
  const cb = typeof options === 'function' ? (options as typeof callback) : callback;
  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return cb(err);
    // Fail closed: if *any* resolved address is blocked we refuse the whole
    // name rather than cherry-picking a public one, since a round-robin record
    // could hand out the private address on a later attempt.
    for (const entry of addresses) {
      if (isBlockedAddress(entry.address, entry.family)) {
        return cb(
          Object.assign(
            new Error(
              `Refusing to connect to ${hostname}: resolves to blocked address ${entry.address}`,
            ),
            { code: 'EBLOCKEDADDR' },
          ),
        );
      }
    }
    const first = addresses[0];
    if (!first) return cb(Object.assign(new Error('No addresses'), { code: 'ENOTFOUND' }));
    cb(null, first.address, first.family);
  });
}) as typeof dns.lookup;

function once(url: URL, opts: SafeRequestOptions): Promise<SafeResponse> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(
      url,
      {
        method: opts.method,
        headers: opts.headers,
        lookup: guardedLookup,
        timeout: opts.timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let received = 0;
        let truncated = false;

        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > opts.maxBytes) {
            truncated = true;
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });

        const finish = () => {
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            headers[k] = Array.isArray(v) ? v.join(', ') : String(v ?? '');
          }
          resolve({
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? '',
            headers,
            body: Buffer.concat(chunks).toString('utf8'),
            truncated,
            finalUrl: url.toString(),
          });
        };

        res.on('end', finish);
        res.on('close', () => {
          if (truncated) finish();
        });
        res.on('error', (err) => reject(new ProxyError(err.message, 'RESPONSE_ERROR')));
      },
    );

    req.on('timeout', () => {
      req.destroy(new ProxyError(`Request timed out after ${opts.timeoutMs}ms`, 'TIMEOUT'));
    });
    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err instanceof ProxyError) return reject(err);
      const code = err.code ?? 'NETWORK_ERROR';
      reject(new ProxyError(err.message, code === 'EBLOCKEDADDR' ? 'BLOCKED_ADDRESS' : code));
    });

    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

/**
 * Perform the request, re-validating every redirect hop. A permitted host that
 * 302s to http://169.254.169.254 is the classic bypass, so each Location is put
 * back through the same allowlist and address checks as the original URL.
 */
export async function safeRequest(opts: SafeRequestOptions): Promise<SafeResponse> {
  let current = opts.url;
  let body = opts.body;
  let method = opts.method;

  for (let hop = 0; hop <= opts.maxRedirects; hop++) {
    const res = await once(current, { ...opts, url: current, body, method });

    const isRedirect = res.status >= 300 && res.status < 400 && res.headers.location;
    if (!isRedirect) return res;

    if (hop === opts.maxRedirects) {
      throw new ProxyError(`Exceeded ${opts.maxRedirects} redirects`, 'TOO_MANY_REDIRECTS');
    }

    let next: URL;
    try {
      next = new URL(res.headers.location as string, current);
    } catch {
      throw new ProxyError('Redirect target could not be parsed', 'INVALID_REDIRECT');
    }

    const verdict = validateTargetUrl(next.toString(), opts.allowlist);
    if (!verdict.allowed) {
      throw new ProxyError(
        `Refusing to follow redirect to ${next.host}: ${verdict.detail}`,
        'BLOCKED_REDIRECT',
      );
    }

    // 303, and 301/302 on POST, become GET without a body per RFC 9110.
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
      method = 'GET';
      body = undefined;
    }
    current = next;
  }

  throw new ProxyError('Redirect loop', 'TOO_MANY_REDIRECTS');
}
