/**
 * Parse a pasted `curl` command into a request.
 *
 * Every API's docs, every browser devtools "Copy as cURL", and every Stack
 * Overflow answer is already in this format. Accepting it is the shortest path
 * from "I have a request that works" to "I have it open in Endpointer".
 */

import type { AuthType, HttpMethod, KeyValuePair, RequestConfig } from '../types';
import { paramId, splitUrl } from './requestUrl';

const HTTP_METHODS = new Set<HttpMethod>([
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'HEAD',
  'OPTIONS',
]);

/**
 * Shell-aware tokeniser: handles single quotes, double quotes with escapes,
 * backslash line continuations, and `$'...'` ANSI-C quoting.
 */
export function tokenizeShell(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let started = false;
  let i = 0;

  const push = () => {
    if (started) tokens.push(current);
    current = '';
    started = false;
  };

  while (i < input.length) {
    const char = input[i];

    if (char === '\\' && input[i + 1] === '\n') {
      i += 2;
      continue;
    }
    if (char === '\n' || char === ' ' || char === '\t' || char === '\r') {
      push();
      i += 1;
      continue;
    }

    if (char === "'") {
      started = true;
      i += 1;
      while (i < input.length && input[i] !== "'") current += input[i++];
      i += 1;
      continue;
    }

    if (char === '"') {
      started = true;
      i += 1;
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < input.length) {
          const next = input[i + 1] as string;
          current += '\\"$`\n'.includes(next) ? next : `\\${next}`;
          i += 2;
          continue;
        }
        current += input[i++];
      }
      i += 1;
      continue;
    }

    if (char === '\\' && i + 1 < input.length) {
      started = true;
      current += input[i + 1];
      i += 2;
      continue;
    }

    started = true;
    current += char;
    i += 1;
  }

  push();
  return tokens;
}

export interface CurlParseResult {
  config: RequestConfig | null;
  warnings: string[];
}

/** Flags that take a value we do not model, and can be skipped wholesale. */
const IGNORED_WITH_VALUE = new Set([
  '--connect-timeout',
  '--max-time',
  '-m',
  '--retry',
  '--cacert',
  '--cert',
  '--key',
  '--resolve',
  '--proxy',
  '-x',
  '--limit-rate',
  '-o',
  '--output',
  '-w',
  '--write-out',
  '-A',
  '--user-agent',
]);

export function parseCurl(raw: string): CurlParseResult {
  const warnings: string[] = [];
  const text = raw.trim();
  if (!text) return { config: null, warnings: ['Nothing to parse.'] };

  const tokens = tokenizeShell(text);
  const start = tokens.findIndex((t) => t === 'curl' || t.endsWith('/curl'));
  if (start < 0) return { config: null, warnings: ['That does not look like a curl command.'] };

  let url = '';
  let method: HttpMethod | null = null;
  const headers: KeyValuePair[] = [];
  let body = '';
  let authType: AuthType = 'No Auth';
  const authConfig: RequestConfig['authConfig'] = {};
  let isForm = false;

  for (let i = start + 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    const takeValue = (): string => tokens[++i] ?? '';

    if (token === '-X' || token === '--request') {
      const value = takeValue().toUpperCase();
      if (HTTP_METHODS.has(value as HttpMethod)) method = value as HttpMethod;
      else warnings.push(`Unsupported method "${value}" — defaulted to GET.`);
      continue;
    }

    if (token === '-H' || token === '--header') {
      const value = takeValue();
      const colon = value.indexOf(':');
      if (colon < 0) continue;
      const key = value.slice(0, colon).trim();
      const headerValue = value.slice(colon + 1).trim();

      if (key.toLowerCase() === 'authorization') {
        if (/^bearer\s+/i.test(headerValue)) {
          authType = 'Bearer Token';
          authConfig.bearerToken = headerValue.replace(/^bearer\s+/i, '');
          continue;
        }
        if (/^basic\s+/i.test(headerValue)) {
          authType = 'Basic Auth';
          try {
            const decoded = atob(headerValue.replace(/^basic\s+/i, ''));
            const sep = decoded.indexOf(':');
            authConfig.basicUsername = sep < 0 ? decoded : decoded.slice(0, sep);
            authConfig.basicPassword = sep < 0 ? '' : decoded.slice(sep + 1);
          } catch {
            warnings.push('Basic auth header could not be decoded; kept as a raw header.');
            headers.push({ id: paramId('h'), key, value: headerValue, enabled: true });
          }
          continue;
        }
      }

      headers.push({ id: paramId('h'), key, value: headerValue, enabled: true });
      continue;
    }

    if (token === '-u' || token === '--user') {
      const value = takeValue();
      const sep = value.indexOf(':');
      authType = 'Basic Auth';
      authConfig.basicUsername = sep < 0 ? value : value.slice(0, sep);
      authConfig.basicPassword = sep < 0 ? '' : value.slice(sep + 1);
      continue;
    }

    if (
      token === '-d' ||
      token === '--data' ||
      token === '--data-raw' ||
      token === '--data-binary' ||
      token === '--data-ascii'
    ) {
      const value = takeValue();
      body = body ? `${body}&${value}` : value;
      continue;
    }

    if (token === '-F' || token === '--form') {
      isForm = true;
      const value = takeValue();
      body = body ? `${body}\n${value}` : value;
      continue;
    }

    if (token === '-G' || token === '--get') {
      method = 'GET';
      continue;
    }
    if (token === '-I' || token === '--head') {
      method = 'HEAD';
      continue;
    }

    if (token === '--url') {
      url = takeValue();
      continue;
    }

    if (IGNORED_WITH_VALUE.has(token)) {
      const value = takeValue();
      if (token === '-A' || token === '--user-agent') {
        headers.push({ id: paramId('h'), key: 'User-Agent', value, enabled: true });
      }
      continue;
    }

    if (token === '-k' || token === '--insecure') {
      warnings.push('--insecure has no effect in a browser; certificate checks always apply.');
      continue;
    }
    if (token === '--compressed' || token === '-s' || token === '--silent' || token === '-L') {
      continue;
    }

    // Anything left that is not a flag is the URL.
    if (!token.startsWith('-') && !url) {
      url = token;
      continue;
    }
    if (token.startsWith('-')) warnings.push(`Ignored unsupported flag: ${token}`);
  }

  if (!url) return { config: null, warnings: [...warnings, 'No URL found in the command.'] };
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  const { base, params } = splitUrl(url);
  const resolvedMethod: HttpMethod = method ?? (body ? 'POST' : 'GET');

  if (isForm) {
    warnings.push('Multipart form fields were imported as a raw body; adjust as needed.');
  }

  const looksJson = body.trimStart().startsWith('{') || body.trimStart().startsWith('[');

  return {
    warnings,
    config: {
      method: resolvedMethod,
      url: base,
      params,
      headers,
      authType,
      authConfig,
      bodyType: body ? (looksJson ? 'json' : 'raw') : 'none',
      body,
      useProxy: false,
    },
  };
}

/** Cheap check for whether pasted text should be offered as a curl import. */
export function looksLikeCurl(text: string): boolean {
  return /^\s*curl\s/.test(text) || /^\s*curl$/.test(text.trim());
}
