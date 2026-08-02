import { describe, expect, it } from 'vitest';
import { REDACTED, redactDeep, redactPairs, redactUrl, sanitizeConfigForAi } from './redact';

describe('sanitizeConfigForAi', () => {
  it('never lets a bearer token reach the model', () => {
    const out = sanitizeConfigForAi({
      method: 'GET',
      url: 'https://api.example.com',
      authType: 'Bearer Token',
      authConfig: { bearerToken: 'eyJhbGciOiJIUzI1NiJ9.secret.value' },
    });
    expect(JSON.stringify(out)).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(out.authConfig.bearerToken).toBe(REDACTED);
  });

  it('never lets basic auth credentials reach the model', () => {
    const out = sanitizeConfigForAi({
      authConfig: { basicUsername: 'admin', basicPassword: 'hunter2' },
    });
    expect(JSON.stringify(out)).not.toContain('hunter2');
    expect(JSON.stringify(out)).not.toContain('admin');
  });

  it('never lets an API key value reach the model', () => {
    const out = sanitizeConfigForAi({
      authConfig: { apiKeyName: 'X-API-Key', apiKeyValue: 'sk_live_abc123', apiKeyIn: 'header' },
    });
    expect(JSON.stringify(out)).not.toContain('sk_live_abc123');
    // Non-secret fields survive so the model still understands the shape.
    expect(out.authConfig.apiKeyName).toBe('X-API-Key');
    expect(out.authConfig.apiKeyIn).toBe('header');
  });

  it('preserves an empty credential as empty rather than claiming it is set', () => {
    const out = sanitizeConfigForAi({ authConfig: { bearerToken: '' } });
    expect(out.authConfig.bearerToken).toBe('');
  });

  it('redacts credential-shaped headers and query params', () => {
    const out = sanitizeConfigForAi({
      headers: [
        { key: 'Authorization', value: 'Bearer leak-me', enabled: true },
        { key: 'Accept', value: 'application/json', enabled: true },
      ],
      params: [{ key: 'api_key', value: 'leak-me-too', enabled: true }],
    });
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain('leak-me');
    expect(serialized).toContain('application/json');
  });

  it('caps body size so a huge payload cannot be exfiltrated wholesale', () => {
    const out = sanitizeConfigForAi({ body: 'x'.repeat(50_000) });
    expect(String(out.body).length).toBe(4000);
  });

  it('tolerates junk input', () => {
    expect(() => sanitizeConfigForAi(null)).not.toThrow();
    expect(() => sanitizeConfigForAi('nonsense')).not.toThrow();
    expect(sanitizeConfigForAi(undefined).authConfig).toEqual({});
  });
});

describe('redactUrl', () => {
  it('strips userinfo credentials', () => {
    expect(redactUrl('https://user:pa55@example.com/x')).not.toContain('pa55');
  });

  it('strips credential-shaped query params', () => {
    const out = redactUrl('https://example.com/x?api_key=secret&page=2');
    expect(out).not.toContain('secret');
    expect(out).toContain('page=2');
  });

  it('passes an unparseable string through unchanged', () => {
    expect(redactUrl('{{baseUrl}}/items')).toBe('{{baseUrl}}/items');
  });
});

describe('redactDeep', () => {
  it('redacts nested credentials in a response payload', () => {
    const out = redactDeep({
      user: { name: 'ada', session: { access_token: 'leak', expires: 3600 } },
      items: [{ apiKey: 'leak2' }],
    });
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain('leak');
    expect(serialized).toContain('ada');
    expect(serialized).toContain('3600');
  });

  it('terminates on deeply nested structures', () => {
    let deep: Record<string, unknown> = { value: 1 };
    for (let i = 0; i < 40; i++) deep = { nested: deep };
    expect(() => redactDeep(deep)).not.toThrow();
  });
});

describe('redactPairs', () => {
  it('returns an empty array for non-array input', () => {
    expect(redactPairs(null)).toEqual([]);
    expect(redactPairs('nope')).toEqual([]);
  });
});
