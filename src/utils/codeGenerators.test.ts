import { describe, expect, it } from 'vitest';
import { buildFullUrl, buildHeadersRecord, generateCodeSnippet } from './codeGenerators';
import type { RequestConfig } from '../types';

const base: RequestConfig = {
  method: 'GET',
  url: 'https://api.example.com/v1/items',
  params: [],
  headers: [],
  authType: 'No Auth',
  authConfig: {},
  bodyType: 'none',
  body: '',
  useProxy: false,
};

describe('buildFullUrl', () => {
  it('appends enabled params and skips disabled ones', () => {
    const url = buildFullUrl({
      ...base,
      params: [
        { id: '1', key: 'limit', value: '10', enabled: true },
        { id: '2', key: 'offset', value: '5', enabled: false },
      ],
    });
    expect(url).toBe('https://api.example.com/v1/items?limit=10');
  });

  it('returns the raw string for an unparseable URL', () => {
    expect(buildFullUrl({ ...base, url: 'not a url' })).toBe('not a url');
  });
});

describe('buildHeadersRecord', () => {
  it('derives an Authorization header from a bearer token', () => {
    const headers = buildHeadersRecord({
      ...base,
      authType: 'Bearer Token',
      authConfig: { bearerToken: 'abc123' },
    });
    expect(headers.Authorization).toBe('Bearer abc123');
  });

  it('base64-encodes basic auth credentials', () => {
    const headers = buildHeadersRecord({
      ...base,
      authType: 'Basic Auth',
      authConfig: { basicUsername: 'user', basicPassword: 'pass' },
    });
    expect(headers.Authorization).toBe(`Basic ${btoa('user:pass')}`);
  });
});

describe('generateCodeSnippet', () => {
  it('emits a cURL command carrying the method and URL', () => {
    const snippet = generateCodeSnippet(base, 'curl');
    expect(snippet).toContain('curl -X GET');
    expect(snippet).toContain('https://api.example.com/v1/items');
  });

  it('produces a snippet for every supported language', () => {
    const langs = ['fetch', 'axios', 'curl', 'python', 'node', 'go', 'rust', 'php'] as const;
    for (const lang of langs) {
      expect(generateCodeSnippet(base, lang).length).toBeGreaterThan(20);
    }
  });
});
