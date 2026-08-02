export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export type AuthType = 'No Auth' | 'API Key' | 'Bearer Token' | 'OAuth' | 'Basic Auth';

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
  cors: 'yes' | 'no' | 'unknown';
  baseUrl: string;
  sampleEndpoint: string;
  defaultMethod?: HttpMethod;
  defaultParams?: { key: string; value: string; description?: string }[];
  defaultHeaders?: { key: string; value: string }[];
  defaultBody?: string;
  documentationUrl: string;
  tags: string[];
}

export interface RequestConfig {
  id?: string;
  name?: string;
  method: HttpMethod;
  url: string;
  params: KeyValuePair[];
  headers: KeyValuePair[];
  authType: AuthType;
  authConfig: {
    apiKeyName?: string;
    apiKeyValue?: string;
    apiKeyIn?: 'header' | 'query';
    bearerToken?: string;
    basicUsername?: string;
    basicPassword?: string;
  };
  bodyType: 'none' | 'json' | 'form-data' | 'raw';
  body: string;
  useProxy: boolean;
}

export interface ApiResponseData {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
  contentType: string;
  duration: number; // ms
  sizeBytes: number;
  timestamp: number;
  error?: string;
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
}
