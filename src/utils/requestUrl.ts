/**
 * The URL bar and the query-parameter table, reconciled.
 *
 * These used to be two independent sources of truth. Typing in the URL bar
 * parsed the query string into the params table, but the URL string kept its
 * query string too — and then buildFullUrl appended the whole table back on
 * top. Clicking "Test Endpoint" on Open-Meteo actually sent:
 *
 *   ?latitude=..&longitude=..&current_weather=true
 *    &latitude=..&longitude=..&current_weather=true&hourly=temperature_2m
 *
 * The same split also meant unticking a parameter row did nothing, because the
 * parameter was still sitting in the URL string.
 *
 * The rule now: `RequestConfig.url` never contains a query string. `params` is
 * the only place query parameters live. Everything here maintains that
 * invariant while still letting the user paste and edit a full URL.
 */

import type { KeyValuePair } from '../types';

let counter = 0;
/** Stable-enough unique id for a table row. */
export function paramId(prefix = 'p'): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export interface SplitUrl {
  /** Origin + path + hash, with the query string removed. */
  base: string;
  params: KeyValuePair[];
}

/**
 * Split a possibly-full URL into its base and its query parameters.
 *
 * Works on partial input too, because this runs on every keystroke while the
 * user is still typing and `new URL()` would throw on "https://ap".
 */
export function splitUrl(raw: string): SplitUrl {
  const input = raw.trim();
  if (!input) return { base: '', params: [] };

  const hashIndex = input.indexOf('#');
  const hash = hashIndex >= 0 ? input.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? input.slice(0, hashIndex) : input;

  const queryIndex = withoutHash.indexOf('?');
  if (queryIndex < 0) return { base: withoutHash + hash, params: [] };

  const base = withoutHash.slice(0, queryIndex) + hash;
  const query = withoutHash.slice(queryIndex + 1);

  const params: KeyValuePair[] = [];
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const rawKey = eq < 0 ? pair : pair.slice(0, eq);
    const rawValue = eq < 0 ? '' : pair.slice(eq + 1);
    params.push({
      id: paramId(),
      key: safeDecode(rawKey),
      value: safeDecode(rawValue),
      enabled: true,
    });
  }

  return { base, params };
}

/**
 * Decode a percent-encoded component without throwing on malformed input.
 * `{{token}}` placeholders and stray `%` survive intact.
 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

/**
 * Encode a component but leave `{{variable}}` markers untouched, so an
 * environment placeholder stays readable and substitutable in the URL bar.
 */
function encodeKeepingPlaceholders(value: string): string {
  return value
    .split(/(\{\{[^}]*\}\})/g)
    .map((part) => (part.startsWith('{{') && part.endsWith('}}') ? part : encodeURIComponent(part)))
    .join('');
}

/** Recombine a base URL with the enabled parameters. */
export function joinUrl(base: string, params: KeyValuePair[]): string {
  const active = params.filter((p) => p.enabled && p.key.trim());
  if (active.length === 0) return base;

  const hashIndex = base.indexOf('#');
  const hash = hashIndex >= 0 ? base.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? base.slice(0, hashIndex) : base;

  const query = active
    .map((p) => `${encodeKeepingPlaceholders(p.key)}=${encodeKeepingPlaceholders(p.value)}`)
    .join('&');

  return `${withoutHash}?${query}${hash}`;
}

/**
 * What the URL bar shows: the base plus every *enabled* parameter.
 * Disabled rows are intentionally absent, so unticking one visibly removes it
 * from the request.
 */
export function displayUrl(base: string, params: KeyValuePair[]): string {
  return joinUrl(base, params);
}

/**
 * Merge freshly typed URL text into the existing parameter table.
 *
 * Rewriting the table wholesale on every keystroke would discard the `enabled`
 * flags and the descriptions that came from a directory entry, and would reset
 * the caret in whichever value field the user was editing. Rows are matched by
 * key so those survive.
 */
export function mergeUrlIntoParams(raw: string, existing: KeyValuePair[]): SplitUrl {
  const { base, params: parsed } = splitUrl(raw);

  const disabled = existing.filter((p) => !p.enabled);
  const byKey = new Map(existing.map((p) => [p.key, p]));

  const merged: KeyValuePair[] = parsed.map((p) => {
    const prior = byKey.get(p.key);
    return prior ? { ...prior, value: p.value, enabled: true } : p;
  });

  // Disabled rows are not in the URL text by definition, so carry them over.
  for (const row of disabled) {
    if (!merged.some((p) => p.key === row.key)) merged.push(row);
  }

  return { base, params: merged };
}

/** True when the string looks like an absolute http(s) URL we could send. */
export function isSendableUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  // Allow unresolved variables; they are substituted at send time.
  if (trimmed.includes('{{')) return true;
  try {
    const url = new URL(trimmed);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}
