/**
 * Importers for the formats people already have.
 *
 * Export used to be a raw dump of Endpointer's own internal shape and import
 * accepted only that same shape — a closed loop that inherited nothing. These
 * read Postman v2.1 collections, OpenAPI 3 documents and HAR captures, so an
 * existing body of work can come across.
 */

import type { CollectionItem, HttpMethod, KeyValuePair, RequestConfig } from '../types';
import { paramId, splitUrl } from './requestUrl';
import { parseCollections } from './validation';

export interface ImportResult {
  collections: CollectionItem[];
  format: 'endpointer' | 'postman' | 'openapi' | 'har' | 'unknown';
  warnings: string[];
}

const METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asMethod(value: unknown): HttpMethod {
  const upper = String(value ?? 'GET').toUpperCase();
  return (METHODS.has(upper) ? upper : 'GET') as HttpMethod;
}

function emptyConfig(overrides: Partial<RequestConfig>): RequestConfig {
  return {
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    authType: 'No Auth',
    authConfig: {},
    bodyType: 'none',
    body: '',
    useProxy: false,
    ...overrides,
  };
}

/* ----------------------------- Postman ----------------------------- */

/** Postman writes `{{var}}` too, so placeholders pass through unchanged. */
function postmanUrl(url: unknown): { url: string; params: KeyValuePair[] } {
  if (typeof url === 'string') {
    const split = splitUrl(url);
    return { url: split.base, params: split.params };
  }
  if (!isRecord(url)) return { url: '', params: [] };

  if (typeof url.raw === 'string') {
    const split = splitUrl(url.raw);
    // Prefer the structured query array when present: it carries the disabled
    // flag, which the raw string cannot express.
    if (Array.isArray(url.query)) {
      const params = url.query.filter(isRecord).map((q, i) => ({
        id: `pm-q-${i}`,
        key: String(q.key ?? ''),
        value: String(q.value ?? ''),
        enabled: q.disabled !== true,
      }));
      if (params.length) return { url: split.base, params };
    }
    return { url: split.base, params: split.params };
  }

  const protocol = typeof url.protocol === 'string' ? `${url.protocol}://` : 'https://';
  const host = Array.isArray(url.host) ? url.host.join('.') : String(url.host ?? '');
  const path = Array.isArray(url.path) ? `/${url.path.join('/')}` : String(url.path ?? '');
  return { url: `${protocol}${host}${path}`, params: [] };
}

function postmanRequest(item: Record<string, unknown>, warnings: string[]): RequestConfig | null {
  const request = isRecord(item.request) ? item.request : null;
  if (!request) return null;

  const { url, params } = postmanUrl(request.url);
  if (!url) return null;

  const headers = Array.isArray(request.header)
    ? request.header.filter(isRecord).map((h, i) => ({
        id: `pm-h-${i}`,
        key: String(h.key ?? ''),
        value: String(h.value ?? ''),
        enabled: h.disabled !== true,
      }))
    : [];

  let body = '';
  let bodyType: RequestConfig['bodyType'] = 'none';
  if (isRecord(request.body)) {
    if (request.body.mode === 'raw' && typeof request.body.raw === 'string') {
      body = request.body.raw;
      const language = isRecord(request.body.options)
        ? ((request.body.options.raw as Record<string, unknown>)?.language ?? '')
        : '';
      bodyType = language === 'json' || body.trimStart().startsWith('{') ? 'json' : 'raw';
    } else if (request.body.mode) {
      warnings.push(
        `"${String(item.name ?? 'request')}" uses an unsupported body mode (${String(request.body.mode)}); it was imported without a body.`,
      );
    }
  }

  const auth = isRecord(request.auth) ? request.auth : null;
  let authType: RequestConfig['authType'] = 'No Auth';
  if (auth?.type === 'bearer') authType = 'Bearer Token';
  else if (auth?.type === 'basic') authType = 'Basic Auth';
  else if (auth?.type === 'apikey') authType = 'API Key';
  else if (auth?.type && auth.type !== 'noauth') {
    warnings.push(`Unsupported auth type "${String(auth.type)}"; set it manually.`);
  }

  return emptyConfig({
    name: typeof item.name === 'string' ? item.name : undefined,
    method: asMethod(request.method),
    url,
    params,
    headers,
    authType,
    // Values are intentionally not imported — see shareLink.ts for the same
    // reasoning. The mode travels, the secret does not.
    authConfig: {},
    bodyType,
    body,
  });
}

function flattenPostmanItems(items: unknown, warnings: string[], depth = 0): RequestConfig[] {
  if (!Array.isArray(items) || depth > 10) return [];
  const out: RequestConfig[] = [];
  for (const raw of items) {
    if (!isRecord(raw)) continue;
    if (Array.isArray(raw.item)) {
      out.push(...flattenPostmanItems(raw.item, warnings, depth + 1));
      continue;
    }
    const config = postmanRequest(raw, warnings);
    if (config) out.push(config);
  }
  return out;
}

function importPostman(doc: Record<string, unknown>): ImportResult {
  const warnings: string[] = [];
  const info = isRecord(doc.info) ? doc.info : {};
  const requests = flattenPostmanItems(doc.item, warnings);

  return {
    format: 'postman',
    warnings,
    collections: [
      {
        id: `pm-${Date.now()}`,
        name: String(info.name ?? 'Imported Postman collection'),
        description: typeof info.description === 'string' ? info.description : undefined,
        createdAt: Date.now(),
        requests,
      },
    ],
  };
}

/* ----------------------------- OpenAPI ----------------------------- */

function openApiServer(doc: Record<string, unknown>): string {
  const servers = Array.isArray(doc.servers) ? doc.servers : [];
  const first = servers.find(isRecord);
  const url = typeof first?.url === 'string' ? first.url : '';
  return url.replace(/\/$/, '');
}

function importOpenApi(doc: Record<string, unknown>): ImportResult {
  const warnings: string[] = [];
  const server = openApiServer(doc);
  if (!server) {
    warnings.push('No servers entry found; paths were imported as relative URLs.');
  }

  const paths = isRecord(doc.paths) ? doc.paths : {};
  const requests: RequestConfig[] = [];

  for (const [path, pathItemRaw] of Object.entries(paths)) {
    if (!isRecord(pathItemRaw)) continue;
    for (const [method, operationRaw] of Object.entries(pathItemRaw)) {
      if (!METHODS.has(method.toUpperCase())) continue;
      if (!isRecord(operationRaw)) continue;

      const parameters = [
        ...(Array.isArray(pathItemRaw.parameters) ? pathItemRaw.parameters : []),
        ...(Array.isArray(operationRaw.parameters) ? operationRaw.parameters : []),
      ].filter(isRecord);

      const params: KeyValuePair[] = [];
      const headers: KeyValuePair[] = [];
      let resolvedPath = path;

      for (const parameter of parameters) {
        const name = String(parameter.name ?? '');
        if (!name) continue;
        const example =
          typeof parameter.example === 'string' || typeof parameter.example === 'number'
            ? String(parameter.example)
            : '';

        if (parameter.in === 'query') {
          params.push({
            id: paramId('oa'),
            key: name,
            value: example,
            enabled: parameter.required === true,
            description:
              typeof parameter.description === 'string' ? parameter.description : undefined,
          });
        } else if (parameter.in === 'header') {
          headers.push({ id: paramId('oa'), key: name, value: example, enabled: true });
        } else if (parameter.in === 'path') {
          // Turn {petId} into a {{petId}} variable so it is substitutable.
          resolvedPath = resolvedPath.replace(`{${name}}`, `{{${name}}}`);
        }
      }

      const hasBody = isRecord(operationRaw.requestBody);

      requests.push(
        emptyConfig({
          name: String(
            operationRaw.summary ?? operationRaw.operationId ?? `${method.toUpperCase()} ${path}`,
          ),
          method: asMethod(method),
          url: `${server}${resolvedPath}`,
          params,
          headers,
          bodyType: hasBody ? 'json' : 'none',
          body: hasBody ? '{\n  \n}' : '',
        }),
      );
    }
  }

  const info = isRecord(doc.info) ? doc.info : {};
  return {
    format: 'openapi',
    warnings,
    collections: [
      {
        id: `oa-${Date.now()}`,
        name: String(info.title ?? 'Imported OpenAPI spec'),
        description: typeof info.description === 'string' ? info.description : undefined,
        createdAt: Date.now(),
        requests,
      },
    ],
  };
}

/* ------------------------------- HAR ------------------------------- */

function importHar(doc: Record<string, unknown>): ImportResult {
  const warnings: string[] = [];
  const log = isRecord(doc.log) ? doc.log : {};
  const entries = Array.isArray(log.entries) ? log.entries : [];

  const requests: RequestConfig[] = [];
  for (const entryRaw of entries) {
    if (!isRecord(entryRaw)) continue;
    const request = isRecord(entryRaw.request) ? entryRaw.request : null;
    if (!request || typeof request.url !== 'string') continue;

    const { base, params: urlParams } = splitUrl(request.url);
    const queryString = Array.isArray(request.queryString) ? request.queryString : [];
    const params = queryString.length
      ? queryString.filter(isRecord).map((q, i) => ({
          id: `har-q-${i}`,
          key: String(q.name ?? ''),
          value: String(q.value ?? ''),
          enabled: true,
        }))
      : urlParams;

    const headers = (Array.isArray(request.headers) ? request.headers : [])
      .filter(isRecord)
      // HTTP/2 pseudo-headers are not settable and would be rejected by fetch.
      .filter((h) => !String(h.name ?? '').startsWith(':'))
      .filter((h) => !/^(cookie|authorization)$/i.test(String(h.name ?? '')))
      .map((h, i) => ({
        id: `har-h-${i}`,
        key: String(h.name ?? ''),
        value: String(h.value ?? ''),
        enabled: true,
      }));

    const postData = isRecord(request.postData) ? request.postData : null;
    const body = typeof postData?.text === 'string' ? postData.text : '';

    requests.push(
      emptyConfig({
        name: `${asMethod(request.method)} ${base}`,
        method: asMethod(request.method),
        url: base,
        params,
        headers,
        bodyType: body ? (body.trimStart().startsWith('{') ? 'json' : 'raw') : 'none',
        body,
      }),
    );
  }

  if (requests.length) {
    warnings.push('Authorization and Cookie headers were not imported from the HAR capture.');
  }

  return {
    format: 'har',
    warnings,
    collections: [
      {
        id: `har-${Date.now()}`,
        name: 'Imported HAR capture',
        createdAt: Date.now(),
        requests,
      },
    ],
  };
}

/* ---------------------------- dispatcher --------------------------- */

/** Detect the format and import. Never throws. */
export function importAnyFormat(text: string): ImportResult {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { collections: [], format: 'unknown', warnings: ['That file is not valid JSON.'] };
  }

  // Endpointer's own export: a bare array of collections.
  if (Array.isArray(doc)) {
    const collections = parseCollections(doc);
    return {
      collections,
      format: 'endpointer',
      warnings: collections.length ? [] : ['No usable collections were found in that file.'],
    };
  }

  if (!isRecord(doc)) {
    return { collections: [], format: 'unknown', warnings: ['Unrecognised file structure.'] };
  }

  if (isRecord(doc.info) && Array.isArray(doc.item)) return importPostman(doc);
  if (typeof doc.openapi === 'string' || typeof doc.swagger === 'string') return importOpenApi(doc);
  if (isRecord(doc.log) && Array.isArray((doc.log as Record<string, unknown>).entries)) {
    return importHar(doc);
  }
  if (Array.isArray(doc.collections)) {
    return { collections: parseCollections(doc.collections), format: 'endpointer', warnings: [] };
  }

  return {
    collections: [],
    format: 'unknown',
    warnings: [
      'Unrecognised format. Endpointer reads its own exports, Postman v2.1 collections, OpenAPI 3 documents and HAR files.',
    ],
  };
}
