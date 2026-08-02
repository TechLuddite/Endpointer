/**
 * Encode a request into a URL.
 *
 * This is the feature the app was most obviously missing: four tabs, no
 * routing, and no way to hand someone the request you are looking at. With
 * this, "reproduce my bug" becomes a link.
 *
 * Credentials are never encoded. A share link is something you paste into an
 * issue tracker, so putting a bearer token in it would be a footgun; auth
 * *modes* travel, auth *values* do not.
 */

import type { RequestConfig } from '../types';
import { parseRequestConfig } from './validation';

const SHARE_VERSION = 1;

/** Base64url, so the payload survives a URL hash without re-encoding. */
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded: string): string {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** The subset of a request that is safe to put in a link. */
interface SharePayload {
  v: number;
  n?: string;
  m: string;
  u: string;
  p?: Array<[string, string, number]>;
  h?: Array<[string, string, number]>;
  a?: string;
  bt?: string;
  b?: string;
  x?: RequestConfig['assertions'];
}

export function encodeRequest(config: RequestConfig): string {
  const payload: SharePayload = {
    v: SHARE_VERSION,
    m: config.method,
    u: config.url,
  };

  if (config.name) payload.n = config.name;
  if (config.params.length) {
    payload.p = config.params.map((p) => [p.key, p.value, p.enabled ? 1 : 0]);
  }
  if (config.headers.length) {
    // Drop anything that carries a credential; the mode is enough to rebuild
    // the request, and the recipient supplies their own value.
    payload.h = config.headers
      .filter((h) => !/^(authorization|cookie|x-api-key)$/i.test(h.key))
      .map((h) => [h.key, h.value, h.enabled ? 1 : 0]);
  }
  if (config.authType !== 'No Auth') payload.a = config.authType;
  if (config.bodyType !== 'none') {
    payload.bt = config.bodyType;
    payload.b = config.body;
  }
  if (config.assertions?.length) payload.x = config.assertions;

  return toBase64Url(JSON.stringify(payload));
}

export function decodeRequest(encoded: string): RequestConfig | null {
  try {
    const payload = JSON.parse(fromBase64Url(encoded)) as SharePayload;
    if (payload.v !== SHARE_VERSION) return null;

    // A share link is attacker-controlled input, so every field is checked
    // before use and the whole thing goes through the same validator as
    // imported and stored data. A malformed section degrades to empty rather
    // than discarding the entire link.
    const asRows = (value: unknown, prefix: string) =>
      (Array.isArray(value) ? value : [])
        .filter((row): row is [string, string, number] => Array.isArray(row) && row.length >= 2)
        .map(([key, rowValue, enabled], i) => ({
          id: `${prefix}-${i}`,
          key: String(key ?? ''),
          value: String(rowValue ?? ''),
          enabled: enabled !== 0,
        }));

    return parseRequestConfig({
      name: payload.n,
      method: payload.m,
      url: payload.u,
      params: asRows(payload.p, 'sp'),
      headers: asRows(payload.h, 'sh'),
      authType: payload.a ?? 'No Auth',
      authConfig: {},
      bodyType: payload.bt ?? 'none',
      body: payload.b ?? '',
      useProxy: false,
      assertions: payload.x,
    });
  } catch {
    return null;
  }
}

/** Full shareable URL for the current page. */
export function buildShareUrl(config: RequestConfig, origin?: string): string {
  const base =
    origin ??
    (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '');
  return `${base}#/playground?r=${encodeRequest(config)}`;
}

/** True when the config carries auth values that will not survive the link. */
export function hasUnshareableSecrets(config: RequestConfig): boolean {
  const { bearerToken, apiKeyValue, basicPassword } = config.authConfig;
  const inHeaders = config.headers.some(
    (h) => /^(authorization|cookie|x-api-key)$/i.test(h.key) && h.value.trim(),
  );
  return Boolean(bearerToken || apiKeyValue || basicPassword || inHeaders);
}
