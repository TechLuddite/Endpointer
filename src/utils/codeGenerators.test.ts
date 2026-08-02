import { describe, expect, it } from 'vitest';
import {
  buildFullUrl,
  buildHeadersRecord,
  generateCodeSnippet,
  hasRequestBody,
  shellQuote,
} from './codeGenerators';
import type { CodeLanguage, RequestConfig } from '../types';

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

const ALL_LANGUAGES: CodeLanguage[] = [
  'fetch',
  'axios',
  'curl',
  'python',
  'node',
  'go',
  'rust',
  'php',
];

describe('buildFullUrl', () => {
  it('appends enabled params and skips disabled ones', () => {
    expect(
      buildFullUrl({
        ...base,
        params: [
          { id: '1', key: 'limit', value: '10', enabled: true },
          { id: '2', key: 'offset', value: '5', enabled: false },
        ],
      }),
    ).toBe('https://api.example.com/v1/items?limit=10');
  });

  it('adds an API key configured for the query string', () => {
    expect(
      buildFullUrl({
        ...base,
        authType: 'API Key',
        authConfig: { apiKeyName: 'api_key', apiKeyValue: 'abc', apiKeyIn: 'query' },
      }),
    ).toBe('https://api.example.com/v1/items?api_key=abc');
  });

  it('does not put a header-placed API key in the query string', () => {
    expect(
      buildFullUrl({
        ...base,
        authType: 'API Key',
        authConfig: { apiKeyName: 'X-Key', apiKeyValue: 'abc', apiKeyIn: 'header' },
      }),
    ).toBe('https://api.example.com/v1/items');
  });
});

describe('buildHeadersRecord', () => {
  it('derives Authorization from a bearer token', () => {
    expect(
      buildHeadersRecord({ ...base, authType: 'Bearer Token', authConfig: { bearerToken: 'abc' } })
        .Authorization,
    ).toBe('Bearer abc');
  });

  it('base64-encodes basic auth credentials', () => {
    expect(
      buildHeadersRecord({
        ...base,
        authType: 'Basic Auth',
        authConfig: { basicUsername: 'user', basicPassword: 'pass' },
      }).Authorization,
    ).toBe(`Basic ${btoa('user:pass')}`);
  });

  it('encodes non-ASCII credentials instead of throwing', () => {
    // btoa is latin1-only; a naive call throws InvalidCharacterError here.
    expect(() =>
      buildHeadersRecord({
        ...base,
        authType: 'Basic Auth',
        authConfig: { basicUsername: 'zoë', basicPassword: 'pässwörd' },
      }),
    ).not.toThrow();
  });

  it('does not override a Content-Type the user set', () => {
    const headers = buildHeadersRecord({
      ...base,
      method: 'POST',
      bodyType: 'json',
      body: '{}',
      headers: [{ id: '1', key: 'content-type', value: 'application/vnd.api+json', enabled: true }],
    });
    expect(headers['Content-Type']).toBeUndefined();
    expect(headers['content-type']).toBe('application/vnd.api+json');
  });

  it('ignores disabled and blank-key headers', () => {
    expect(
      buildHeadersRecord({
        ...base,
        headers: [
          { id: '1', key: 'X-Off', value: 'v', enabled: false },
          { id: '2', key: '   ', value: 'v', enabled: true },
        ],
      }),
    ).toEqual({});
  });
});

describe('hasRequestBody', () => {
  it('is false for GET even when a body is present', () => {
    expect(hasRequestBody({ ...base, bodyType: 'json', body: '{"a":1}' })).toBe(false);
  });

  it('is false when the body is only whitespace', () => {
    expect(hasRequestBody({ ...base, method: 'POST', bodyType: 'json', body: '   ' })).toBe(false);
  });

  it('is true for POST with a body', () => {
    expect(hasRequestBody({ ...base, method: 'POST', bodyType: 'json', body: '{"a":1}' })).toBe(
      true,
    );
  });
});

describe('shellQuote', () => {
  it('neutralises shell metacharacters', () => {
    // The old generator wrapped bodies in double quotes and escaped only `"`,
    // so `$(...)`, backticks and `$VAR` were interpreted by the shell.
    const dangerous = '{"cmd":"$(rm -rf /)","tick":"`id`","var":"$HOME","bs":"a\\b"}';
    const quoted = shellQuote(dangerous);
    expect(quoted.startsWith("'")).toBe(true);
    expect(quoted.endsWith("'")).toBe(true);
    // Every inner single quote is closed and reopened, so nothing escapes.
    expect(quoted.slice(1, -1).includes("'")).toBe(false);
  });

  it('escapes an embedded single quote correctly', () => {
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  });
});

describe('generateCodeSnippet', () => {
  it('produces a non-trivial snippet for every supported language', () => {
    for (const lang of ALL_LANGUAGES) {
      expect(generateCodeSnippet(base, lang).length).toBeGreaterThan(40);
    }
  });

  it('includes the full URL in every language', () => {
    const config = { ...base, params: [{ id: '1', key: 'q', value: 'test', enabled: true }] };
    for (const lang of ALL_LANGUAGES) {
      expect(generateCodeSnippet(config, lang)).toContain('q=test');
    }
  });

  it('emits a safely quoted cURL command', () => {
    const snippet = generateCodeSnippet(
      { ...base, method: 'POST', bodyType: 'json', body: '{"a":"$(id)"}' },
      'curl',
    );
    expect(snippet).toContain('curl -sS -X POST');
    expect(snippet).toContain(`-d '{"a":"$(id)"}'`);
  });

  it('omits the body for methods that do not carry one', () => {
    const snippet = generateCodeSnippet({ ...base, bodyType: 'json', body: '{"a":1}' }, 'curl');
    expect(snippet).not.toContain('-d ');
  });

  it('does not emit HeaderValue::from_static, which will not compile', () => {
    const snippet = generateCodeSnippet(
      { ...base, headers: [{ id: '1', key: 'Accept', value: 'application/json', enabled: true }] },
      'rust',
    );
    expect(snippet).not.toContain('from_static');
    expect(snippet).toContain('.header("Accept", "application/json")');
  });

  it('picks a Rust raw-string delimiter that cannot collide with the body', () => {
    const snippet = generateCodeSnippet(
      { ...base, method: 'POST', bodyType: 'raw', body: 'contains r"# and "#' },
      'rust',
    );
    expect(snippet).toMatch(/\.body\(r#+"/);
  });

  it('escapes single quotes for PHP', () => {
    const snippet = generateCodeSnippet(
      { ...base, method: 'POST', bodyType: 'raw', body: "it's" },
      'php',
    );
    expect(snippet).toContain("\\'");
  });

  it('imports strings in Go only when there is a body', () => {
    expect(generateCodeSnippet(base, 'go')).not.toContain('"strings"');
    expect(
      generateCodeSnippet({ ...base, method: 'POST', bodyType: 'json', body: '{}' }, 'go'),
    ).toContain('"strings"');
  });
});
