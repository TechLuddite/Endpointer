/**
 * Credential scrubbing for anything sent to a third-party model.
 *
 * The AI endpoints receive the live playground state so the model can reason
 * about the request being built. That state contains whatever the user typed
 * into the auth tab. Those values must never leave the machine, so they are
 * replaced with a placeholder that still tells the model the field is set.
 */

export const REDACTED = '[redacted]';

const SECRET_KEY_PATTERN =
  /(authorization|api[-_]?key|apikey|access[-_]?token|refresh[-_]?token|bearer|password|passwd|secret|client[-_]?secret|private[-_]?key|session|cookie|x-api-key|auth)/i;

/** Auth config fields that are always secret, regardless of key-name heuristics. */
const SECRET_AUTH_FIELDS = new Set([
  'apiKeyValue',
  'bearerToken',
  'basicPassword',
  'basicUsername',
]);

export function redactAuthConfig(authConfig: unknown): Record<string, unknown> {
  if (!authConfig || typeof authConfig !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(authConfig as Record<string, unknown>)) {
    if (SECRET_AUTH_FIELDS.has(key)) {
      out[key] = value ? REDACTED : '';
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Redact the value of any key/value pair whose key looks like a credential. */
export function redactPairs(pairs: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(pairs)) return [];
  return pairs.map((pair) => {
    if (!pair || typeof pair !== 'object') return {};
    const entry = pair as Record<string, unknown>;
    const key = typeof entry.key === 'string' ? entry.key : '';
    if (key && SECRET_KEY_PATTERN.test(key) && entry.value) {
      return { ...entry, value: REDACTED };
    }
    return { ...entry };
  });
}

/**
 * Walk an arbitrary payload and redact values under credential-shaped keys.
 * Used on response bodies, which routinely echo tokens back.
 *
 * A credential-shaped key holding an object or array is recursed into rather
 * than blanked: a key called `session` is a container, and flattening it to
 * "[redacted]" would hide the response shape the model needs while any actual
 * secret inside is caught by the same rule one level down.
 */
export function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 8) return typeof value === 'object' && value !== null ? '[truncated]' : value;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const isContainer = v !== null && typeof v === 'object';
      out[k] =
        SECRET_KEY_PATTERN.test(k) && v && !isContainer ? REDACTED : redactDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface SanitizedConfig {
  method: unknown;
  url: string;
  params: Array<Record<string, unknown>>;
  headers: Array<Record<string, unknown>>;
  authType: unknown;
  authConfig: Record<string, unknown>;
  bodyType: unknown;
  body: unknown;
}

/** Strip userinfo (https://user:pass@host) out of a URL before logging or sending. */
export function redactUrl(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return '';
  try {
    const url = new URL(raw);
    if (url.username || url.password) {
      url.username = REDACTED;
      url.password = '';
    }
    for (const [key] of url.searchParams) {
      if (SECRET_KEY_PATTERN.test(key)) url.searchParams.set(key, REDACTED);
    }
    return url.toString();
  } catch {
    return raw;
  }
}

/** The only shape of the playground config that is allowed to reach the model. */
export function sanitizeConfigForAi(config: unknown): SanitizedConfig {
  const c = (config && typeof config === 'object' ? config : {}) as Record<string, unknown>;
  return {
    method: c.method ?? 'GET',
    url: redactUrl(c.url),
    params: redactPairs(c.params),
    headers: redactPairs(c.headers),
    authType: c.authType ?? 'No Auth',
    authConfig: redactAuthConfig(c.authConfig),
    bodyType: c.bodyType ?? 'none',
    body: typeof c.body === 'string' ? c.body.slice(0, 4000) : '',
  };
}
