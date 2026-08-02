export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export type AuthType = 'No Auth' | 'API Key' | 'Bearer Token' | 'OAuth' | 'Basic Auth';

export type CorsSupport = 'yes' | 'no' | 'unknown';

export interface KeyValuePair {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
}

export interface ApiCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export interface PublicApiItem {
  id: string;
  name: string;
  category: string;
  description: string;
  auth: AuthType;
  https: boolean;
  /**
   * Whether a browser can call this API directly. Seeded as 'unknown' and
   * overwritten from public/status.json, which the scheduled health check
   * produces. Never hand-assert this — it was previously written as 'yes' for
   * every entry without anyone checking.
   */
  cors: CorsSupport;
  baseUrl: string;
  sampleEndpoint: string;
  defaultMethod?: HttpMethod;
  defaultParams?: { key: string; value: string; description?: string }[];
  defaultHeaders?: { key: string; value: string }[];
  defaultBody?: string;
  documentationUrl: string;
  tags: string[];
}

export type BodyType = 'none' | 'json' | 'form-data' | 'raw';

export interface AuthConfig {
  apiKeyName?: string;
  apiKeyValue?: string;
  apiKeyIn?: 'header' | 'query';
  bearerToken?: string;
  basicUsername?: string;
  basicPassword?: string;
}

export interface RequestConfig {
  id?: string;
  name?: string;
  method: HttpMethod;
  /**
   * The URL *without* a query string. Query parameters live exclusively in
   * `params`, so there is a single source of truth and `buildFullUrl`
   * recombines them. Keeping them in both places is what produced duplicated
   * query parameters on every request sent from the directory.
   */
  url: string;
  params: KeyValuePair[];
  headers: KeyValuePair[];
  authType: AuthType;
  authConfig: AuthConfig;
  bodyType: BodyType;
  body: string;
  useProxy: boolean;
  assertions?: Assertion[];
}

export type ErrorKind =
  'cors' | 'dns' | 'timeout' | 'tls' | 'offline' | 'aborted' | 'network' | 'proxy' | 'unknown';

export interface ApiResponseData {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
  contentType: string;
  /** Wall-clock duration in milliseconds. */
  duration: number;
  sizeBytes: number;
  timestamp: number;
  error?: string;
  /** Classified failure cause, so the UI stops calling every failure "CORS". */
  errorKind?: ErrorKind;
  /** How the request was actually executed, regardless of what was requested. */
  transport?: 'direct' | 'proxy';
  assertionResults?: AssertionResult[];
}

export interface HealthStatusItem {
  id: string;
  url: string;
  status: number;
  ok: boolean;
  latency: number;
  timestamp: number;
  error?: string;
}

export interface RequestHistoryItem {
  id: string;
  name: string;
  timestamp: number;
  config: RequestConfig;
  response?: ApiResponseData;
}

export interface CollectionItem {
  id: string;
  name: string;
  description?: string;
  requests: RequestConfig[];
  createdAt: number;
}

export type CodeLanguage = 'fetch' | 'axios' | 'curl' | 'python' | 'node' | 'go' | 'rust' | 'php';

export interface AiChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
  configUpdateSummary?: string;
  appliedConfig?: Partial<RequestConfig>;
  /**
   * Where the reply came from. 'ai' is a real model response; 'offline' is the
   * local pattern matcher. The UI must label these differently — presenting
   * 'offline' output as AI is what made the original copilot dishonest.
   */
  source?: 'ai' | 'offline' | 'system';
}

/* ------------------------------------------------------------------ *
 * Variables & environments
 * ------------------------------------------------------------------ */

export interface EnvironmentVariable {
  id: string;
  key: string;
  value: string;
  /** Secrets are stored apart from the config and stripped from exports. */
  secret: boolean;
  enabled: boolean;
}

export interface Environment {
  id: string;
  name: string;
  variables: EnvironmentVariable[];
}

/* ------------------------------------------------------------------ *
 * Assertions
 * ------------------------------------------------------------------ */

export type AssertionSource = 'status' | 'duration' | 'header' | 'body' | 'jsonPath';

export type AssertionOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'lessThan'
  | 'greaterThan'
  | 'exists'
  | 'notExists'
  | 'isArray'
  | 'isNotEmpty'
  | 'matches';

export interface Assertion {
  id: string;
  source: AssertionSource;
  /** Header name or JSONPath expression, depending on `source`. */
  target?: string;
  operator: AssertionOperator;
  expected?: string;
  enabled: boolean;
}

export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  actual: string;
  message: string;
}

export interface CollectionRunResult {
  collectionId: string;
  startedAt: number;
  finishedAt: number;
  requests: Array<{
    config: RequestConfig;
    response?: ApiResponseData;
    passed: boolean;
    assertionResults: AssertionResult[];
    error?: string;
  }>;
  passedCount: number;
  failedCount: number;
}

/* ------------------------------------------------------------------ *
 * Scheduled health data (public/status.json)
 * ------------------------------------------------------------------ */

export interface StatusSample {
  /** ISO timestamp of the check. */
  t: string;
  ok: boolean;
  status: number;
  latency: number;
}

export interface StatusEntry {
  id: string;
  url: string;
  ok: boolean;
  status: number;
  latency: number;
  cors: CorsSupport;
  error?: string;
  checkedAt: string;
  consecutiveFailures: number;
  uptimePercent: number;
  p50Latency: number;
  p95Latency: number;
  samples: number;
  history: StatusSample[];
}

export interface StatusFile {
  version: 1;
  generatedAt: string;
  summary: {
    total: number;
    healthy: number;
    failing: number;
    browserUsable: number;
    needsProxy: number;
  };
  entries: StatusEntry[];
}

/* ------------------------------------------------------------------ *
 * Server capability probe
 * ------------------------------------------------------------------ */

export interface Capabilities {
  ai: { available: boolean; model: string | null };
  proxy: { available: boolean; url?: string };
  checkedAt: number;
}
