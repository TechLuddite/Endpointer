/**
 * Validation for everything crossing an untrusted boundary: localStorage,
 * imported files, and share links.
 *
 * Import used to accept any JSON array and persist it unchecked. Importing an
 * array whose objects lacked `requests` made `col.requests.length` throw during
 * render — and because the bad data was already in localStorage, it threw again
 * on every reload. The app was bricked until the user manually cleared site
 * data. The same path existed for a corrupted storage key.
 *
 * Everything here coerces rather than rejects where it safely can, so a
 * slightly-off Postman export still imports, but nothing structurally
 * dangerous reaches React.
 */

import type {
  Assertion,
  AssertionOperator,
  AssertionSource,
  AuthType,
  BodyType,
  CollectionItem,
  Environment,
  EnvironmentVariable,
  HttpMethod,
  KeyValuePair,
  RequestConfig,
  RequestHistoryItem,
} from '../types';

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
const AUTH_TYPES: AuthType[] = ['No Auth', 'API Key', 'Bearer Token', 'OAuth', 'Basic Auth'];
const BODY_TYPES: BodyType[] = ['none', 'json', 'form-data', 'raw'];
const ASSERTION_SOURCES: AssertionSource[] = ['status', 'duration', 'header', 'body', 'jsonPath'];
const ASSERTION_OPERATORS: AssertionOperator[] = [
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'lessThan',
  'greaterThan',
  'exists',
  'notExists',
  'isArray',
  'isNotEmpty',
  'matches',
];

/** Bounds that keep a hostile or corrupt file from exhausting memory. */
const LIMITS = {
  stringLength: 200_000,
  pairs: 500,
  requestsPerCollection: 1000,
  collections: 200,
  historyItems: 200,
  variables: 500,
};

let idCounter = 0;
function generateId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.slice(0, LIMITS.stringLength);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === 'string' && (allowed as string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function parseKeyValuePairs(value: unknown, prefix = 'kv'): KeyValuePair[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, LIMITS.pairs)
    .filter(isRecord)
    .map((entry) => ({
      id: asString(entry.id) || generateId(prefix),
      key: asString(entry.key),
      value: asString(entry.value),
      enabled: asBoolean(entry.enabled, true),
      ...(typeof entry.description === 'string'
        ? { description: asString(entry.description) }
        : {}),
    }));
}

export function parseAssertions(value: unknown): Assertion[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, LIMITS.pairs)
    .filter(isRecord)
    .map((entry) => ({
      id: asString(entry.id) || generateId('assert'),
      source: oneOf(entry.source, ASSERTION_SOURCES, 'status'),
      target: typeof entry.target === 'string' ? asString(entry.target) : undefined,
      operator: oneOf(entry.operator, ASSERTION_OPERATORS, 'equals'),
      expected: typeof entry.expected === 'string' ? asString(entry.expected) : undefined,
      enabled: asBoolean(entry.enabled, true),
    }));
}

/**
 * Coerce arbitrary input into a RequestConfig that every component can render
 * without a defensive check at each use site.
 *
 * Legacy configs stored a query string inside `url`; it is split out here so
 * the single-source-of-truth invariant holds for old data too.
 */
export function parseRequestConfig(value: unknown): RequestConfig | null {
  if (!isRecord(value)) return null;

  const rawUrl = asString(value.url);
  let url = rawUrl;
  let params = parseKeyValuePairs(value.params, 'param');

  const queryIndex = rawUrl.indexOf('?');
  if (queryIndex >= 0) {
    url = rawUrl.slice(0, queryIndex);
    const existingKeys = new Set(params.map((p) => p.key));
    for (const pair of rawUrl.slice(queryIndex + 1).split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const key = decodeSafe(eq < 0 ? pair : pair.slice(0, eq));
      if (existingKeys.has(key)) continue; // the table already has it
      params.push({
        id: generateId('param'),
        key,
        value: decodeSafe(eq < 0 ? '' : pair.slice(eq + 1)),
        enabled: true,
      });
      existingKeys.add(key);
    }
  }

  params = params.slice(0, LIMITS.pairs);
  const authConfigRaw = isRecord(value.authConfig) ? value.authConfig : {};

  return {
    ...(typeof value.id === 'string' ? { id: asString(value.id) } : {}),
    ...(typeof value.name === 'string' ? { name: asString(value.name) } : {}),
    method: oneOf(value.method, HTTP_METHODS, 'GET'),
    url,
    params,
    headers: parseKeyValuePairs(value.headers, 'header'),
    authType: oneOf(value.authType, AUTH_TYPES, 'No Auth'),
    authConfig: {
      apiKeyName: asString(authConfigRaw.apiKeyName),
      apiKeyValue: asString(authConfigRaw.apiKeyValue),
      apiKeyIn: authConfigRaw.apiKeyIn === 'header' ? 'header' : 'query',
      bearerToken: asString(authConfigRaw.bearerToken),
      basicUsername: asString(authConfigRaw.basicUsername),
      basicPassword: asString(authConfigRaw.basicPassword),
    },
    bodyType: oneOf(value.bodyType, BODY_TYPES, 'none'),
    body: asString(value.body),
    useProxy: asBoolean(value.useProxy, false),
    ...(Array.isArray(value.assertions) ? { assertions: parseAssertions(value.assertions) } : {}),
  };
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

export function parseCollection(value: unknown): CollectionItem | null {
  if (!isRecord(value)) return null;
  const name = asString(value.name).trim();
  if (!name) return null;

  const requests = Array.isArray(value.requests)
    ? value.requests
        .slice(0, LIMITS.requestsPerCollection)
        .map(parseRequestConfig)
        .filter((r): r is RequestConfig => r !== null)
    : [];

  return {
    id: asString(value.id) || generateId('col'),
    name,
    ...(typeof value.description === 'string' ? { description: asString(value.description) } : {}),
    // Always an array, which is the invariant CollectionsManager relies on.
    requests,
    createdAt: asNumber(value.createdAt, Date.now()),
  };
}

export function parseCollections(value: unknown): CollectionItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, LIMITS.collections)
    .map(parseCollection)
    .filter((c): c is CollectionItem => c !== null);
}

export function parseHistoryItem(value: unknown): RequestHistoryItem | null {
  if (!isRecord(value)) return null;
  const config = parseRequestConfig(value.config);
  if (!config) return null;
  return {
    id: asString(value.id) || generateId('hist'),
    name: asString(value.name) || config.url || 'Untitled request',
    timestamp: asNumber(value.timestamp, Date.now()),
    config,
    // The response is display-only; keep it if it is an object, drop it if not.
    ...(isRecord(value.response) ? { response: value.response as never } : {}),
  };
}

export function parseHistory(value: unknown): RequestHistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, LIMITS.historyItems)
    .map(parseHistoryItem)
    .filter((h): h is RequestHistoryItem => h !== null);
}

export function parseEnvironmentVariables(value: unknown): EnvironmentVariable[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, LIMITS.variables)
    .filter(isRecord)
    .map((entry) => ({
      id: asString(entry.id) || generateId('var'),
      key: asString(entry.key),
      value: asString(entry.value),
      secret: asBoolean(entry.secret, false),
      enabled: asBoolean(entry.enabled, true),
    }));
}

export function parseEnvironment(value: unknown): Environment | null {
  if (!isRecord(value)) return null;
  const name = asString(value.name).trim();
  if (!name) return null;
  return {
    id: asString(value.id) || generateId('env'),
    name,
    variables: parseEnvironmentVariables(value.variables),
  };
}

export function parseEnvironments(value: unknown): Environment[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, LIMITS.collections)
    .map(parseEnvironment)
    .filter((e): e is Environment => e !== null);
}

export function parseFavorites(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string').slice(0, 1000);
}
