import { describe, expect, it } from 'vitest';
import { buildShareUrl, decodeRequest, encodeRequest, hasUnshareableSecrets } from './shareLink';
import type { RequestConfig } from '../types';

const config: RequestConfig = {
  name: 'List items',
  method: 'POST',
  url: 'https://api.example.com/v1/items',
  params: [
    { id: '1', key: 'limit', value: '10', enabled: true },
    { id: '2', key: 'debug', value: 'true', enabled: false },
  ],
  headers: [{ id: '1', key: 'Accept', value: 'application/json', enabled: true }],
  authType: 'Bearer Token',
  authConfig: { bearerToken: 'super-secret-token' },
  bodyType: 'json',
  body: '{"name":"test"}',
  useProxy: false,
};

describe('share links', () => {
  it('round-trips the request shape', () => {
    const decoded = decodeRequest(encodeRequest(config));
    expect(decoded?.method).toBe('POST');
    expect(decoded?.url).toBe('https://api.example.com/v1/items');
    expect(decoded?.name).toBe('List items');
    expect(decoded?.body).toBe('{"name":"test"}');
    expect(decoded?.bodyType).toBe('json');
  });

  it('preserves the enabled flag on parameters', () => {
    const decoded = decodeRequest(encodeRequest(config));
    expect(decoded?.params.find((p) => p.key === 'limit')?.enabled).toBe(true);
    expect(decoded?.params.find((p) => p.key === 'debug')?.enabled).toBe(false);
  });

  it('carries the auth mode but never the credential', () => {
    const encoded = encodeRequest(config);
    expect(encoded).not.toContain('super-secret-token');
    // Also check the decoded payload, not just the encoded blob.
    const decoded = decodeRequest(encoded);
    expect(decoded?.authType).toBe('Bearer Token');
    expect(decoded?.authConfig.bearerToken).toBe('');
  });

  it('strips credential-bearing headers', () => {
    const encoded = encodeRequest({
      ...config,
      headers: [
        { id: '1', key: 'Authorization', value: 'Bearer leak', enabled: true },
        { id: '2', key: 'X-API-Key', value: 'leak2', enabled: true },
        { id: '3', key: 'Cookie', value: 'session=leak3', enabled: true },
        { id: '4', key: 'Accept', value: 'application/json', enabled: true },
      ],
    });
    expect(encoded).not.toContain('leak');
    const decoded = decodeRequest(encoded);
    expect(decoded?.headers.map((h) => h.key)).toEqual(['Accept']);
  });

  it('survives unicode in the body', () => {
    const decoded = decodeRequest(
      encodeRequest({ ...config, body: '{"emoji":"🚀","cjk":"日本語"}' }),
    );
    expect(decoded?.body).toBe('{"emoji":"🚀","cjk":"日本語"}');
  });

  it('returns null for a corrupted payload rather than throwing', () => {
    expect(decodeRequest('not-valid-base64!!!')).toBeNull();
    expect(decodeRequest('')).toBeNull();
    expect(decodeRequest(btoa('{"v":999}'))).toBeNull();
  });

  it('validates a hostile payload instead of trusting it', () => {
    const hostile = btoa(JSON.stringify({ v: 1, m: 'EVIL', u: 'https://x.dev', p: 'not-an-array' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const decoded = decodeRequest(hostile);
    expect(decoded?.method).toBe('GET'); // unknown method coerced
    expect(Array.isArray(decoded?.params)).toBe(true);
  });

  it('builds a hash-routed URL', () => {
    expect(buildShareUrl(config, 'https://endpointer.dev/')).toMatch(
      /^https:\/\/endpointer\.dev\/#\/playground\?r=/,
    );
  });
});

describe('hasUnshareableSecrets', () => {
  it('flags a request whose credentials will not survive the link', () => {
    expect(hasUnshareableSecrets(config)).toBe(true);
  });

  it('is false for a request with no credentials', () => {
    expect(
      hasUnshareableSecrets({ ...config, authType: 'No Auth', authConfig: {}, headers: [] }),
    ).toBe(false);
  });

  it('flags a credential hidden in a header', () => {
    expect(
      hasUnshareableSecrets({
        ...config,
        authType: 'No Auth',
        authConfig: {},
        headers: [{ id: '1', key: 'X-API-Key', value: 'abc', enabled: true }],
      }),
    ).toBe(true);
  });
});
