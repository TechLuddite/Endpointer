import { describe, expect, it } from 'vitest';
import { looksLikeCurl, parseCurl, tokenizeShell } from './curlParser';

describe('tokenizeShell', () => {
  it('keeps quoted strings together', () => {
    expect(tokenizeShell(`curl -H 'Accept: application/json' https://x.dev`)).toEqual([
      'curl',
      '-H',
      'Accept: application/json',
      'https://x.dev',
    ]);
  });

  it('follows backslash line continuations', () => {
    expect(tokenizeShell('curl \\\n  -X POST \\\n  https://x.dev')).toEqual([
      'curl',
      '-X',
      'POST',
      'https://x.dev',
    ]);
  });

  it('unescapes inside double quotes but not single quotes', () => {
    expect(tokenizeShell(`curl -d "a\\"b"`)[2]).toBe('a"b');
    expect(tokenizeShell(`curl -d 'a\\"b'`)[2]).toBe('a\\"b');
  });

  it('preserves an empty quoted argument', () => {
    expect(tokenizeShell(`curl -d ''`)).toEqual(['curl', '-d', '']);
  });
});

describe('parseCurl', () => {
  it('parses a plain GET', () => {
    const { config } = parseCurl('curl https://api.example.com/users');
    expect(config?.method).toBe('GET');
    expect(config?.url).toBe('https://api.example.com/users');
  });

  it('moves the query string into params, not the URL', () => {
    const { config } = parseCurl('curl "https://api.example.com/users?page=2&limit=10"');
    expect(config?.url).toBe('https://api.example.com/users');
    expect(config?.params.map((p) => [p.key, p.value])).toEqual([
      ['page', '2'],
      ['limit', '10'],
    ]);
  });

  it('parses a devtools-style copy-as-cURL', () => {
    const { config } = parseCurl(`curl 'https://api.example.com/v1/items' \\
  -H 'accept: application/json' \\
  -H 'content-type: application/json' \\
  --data-raw '{"name":"test"}' \\
  --compressed`);
    expect(config?.method).toBe('POST'); // inferred from the body
    expect(config?.bodyType).toBe('json');
    expect(config?.body).toBe('{"name":"test"}');
    expect(config?.headers.map((h) => h.key)).toEqual(['accept', 'content-type']);
  });

  it('lifts a bearer token out of the Authorization header', () => {
    const { config } = parseCurl(`curl https://x.dev -H "Authorization: Bearer abc123"`);
    expect(config?.authType).toBe('Bearer Token');
    expect(config?.authConfig.bearerToken).toBe('abc123');
    expect(config?.headers.some((h) => h.key.toLowerCase() === 'authorization')).toBe(false);
  });

  it('decodes a basic auth header', () => {
    const encoded = btoa('user:pass');
    const { config } = parseCurl(`curl https://x.dev -H "Authorization: Basic ${encoded}"`);
    expect(config?.authType).toBe('Basic Auth');
    expect(config?.authConfig.basicUsername).toBe('user');
    expect(config?.authConfig.basicPassword).toBe('pass');
  });

  it('handles -u for basic auth', () => {
    const { config } = parseCurl('curl -u admin:s3cret https://x.dev');
    expect(config?.authConfig.basicUsername).toBe('admin');
    expect(config?.authConfig.basicPassword).toBe('s3cret');
  });

  it('respects an explicit -X even with a body', () => {
    expect(parseCurl(`curl -X PUT https://x.dev -d '{}'`).config?.method).toBe('PUT');
  });

  it('concatenates repeated -d flags the way curl does', () => {
    expect(parseCurl('curl https://x.dev -d a=1 -d b=2').config?.body).toBe('a=1&b=2');
  });

  it('adds a scheme to a bare host', () => {
    expect(parseCurl('curl example.com/api').config?.url).toBe('https://example.com/api');
  });

  it('warns instead of silently ignoring --insecure', () => {
    const { warnings } = parseCurl('curl -k https://x.dev');
    expect(warnings.join(' ')).toMatch(/insecure/i);
  });

  it('reports a command with no URL rather than producing a broken request', () => {
    const { config, warnings } = parseCurl('curl -X POST');
    expect(config).toBeNull();
    expect(warnings.join(' ')).toMatch(/no url/i);
  });

  it('rejects text that is not a curl command', () => {
    expect(parseCurl('wget https://x.dev').config).toBeNull();
    expect(parseCurl('').config).toBeNull();
  });

  it('keeps a body containing shell metacharacters intact', () => {
    const { config } = parseCurl(`curl https://x.dev -d '{"q":"$(id) \`x\`"}'`);
    expect(config?.body).toBe('{"q":"$(id) `x`"}');
  });
});

describe('looksLikeCurl', () => {
  it.each([
    ['curl https://x.dev', true],
    ['  curl -X POST https://x.dev', true],
    ['https://x.dev', false],
    ['{"a":1}', false],
  ])('%s -> %s', (text, expected) => {
    expect(looksLikeCurl(text)).toBe(expected);
  });
});
