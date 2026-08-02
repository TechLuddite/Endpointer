import { describe, expect, it } from 'vitest';
import {
  applyVariables,
  findUnresolvedInConfig,
  interpolate,
  resolveEnvironment,
  stripSecrets,
} from './variables';
import type { Environment, RequestConfig } from '../types';

const environment: Environment = {
  id: 'env-1',
  name: 'prod',
  variables: [
    { id: '1', key: 'baseUrl', value: 'https://api.example.com', secret: false, enabled: true },
    { id: '2', key: 'token', value: 'tok_live_abc123', secret: true, enabled: true },
    { id: '3', key: 'disabled', value: 'nope', secret: false, enabled: false },
    { id: '4', key: 'scheme', value: 'https', secret: false, enabled: true },
    {
      id: '5',
      key: 'nested',
      value: '{{scheme}}://nested.example.com',
      secret: false,
      enabled: true,
    },
  ],
};

const vars = resolveEnvironment(environment);

const config: RequestConfig = {
  method: 'GET',
  url: '{{baseUrl}}/items',
  params: [{ id: '1', key: 'q', value: '{{missing}}', enabled: true }],
  headers: [{ id: '1', key: 'X-Trace', value: 'v-{{scheme}}', enabled: true }],
  authType: 'Bearer Token',
  authConfig: { bearerToken: '{{token}}' },
  bodyType: 'json',
  body: '{"url":"{{baseUrl}}"}',
  useProxy: false,
};

describe('interpolate', () => {
  it('substitutes a defined variable', () => {
    expect(interpolate('{{baseUrl}}/x', vars)).toBe('https://api.example.com/x');
  });

  it('leaves an undefined variable visible rather than blanking it', () => {
    expect(interpolate('{{nope}}/x', vars)).toBe('{{nope}}/x');
  });

  it('ignores disabled variables', () => {
    expect(interpolate('{{disabled}}', vars)).toBe('{{disabled}}');
  });

  it('resolves a variable that references another', () => {
    expect(interpolate('{{nested}}', vars)).toBe('https://nested.example.com');
  });

  it('tolerates whitespace inside the braces', () => {
    expect(interpolate('{{ baseUrl }}/x', vars)).toBe('https://api.example.com/x');
  });

  it('terminates on a self-referential definition', () => {
    const looping = resolveEnvironment({
      id: 'e',
      name: 'loop',
      variables: [{ id: '1', key: 'a', value: '{{a}}', secret: false, enabled: true }],
    });
    expect(() => interpolate('{{a}}', looping)).not.toThrow();
  });

  it('returns the input untouched when there is nothing to substitute', () => {
    expect(interpolate('https://plain.example.com', vars)).toBe('https://plain.example.com');
  });
});

describe('applyVariables', () => {
  it('substitutes across url, params, headers, body and auth', () => {
    const applied = applyVariables(config, vars);
    expect(applied.url).toBe('https://api.example.com/items');
    expect(applied.headers[0]?.value).toBe('v-https');
    expect(applied.body).toBe('{"url":"https://api.example.com"}');
    expect(applied.authConfig.bearerToken).toBe('tok_live_abc123');
  });
});

describe('findUnresolvedInConfig', () => {
  it('reports placeholders with no definition so the user is warned before sending', () => {
    expect(findUnresolvedInConfig(config, vars)).toEqual(['missing']);
  });
});

describe('stripSecrets', () => {
  it('replaces a literal secret value with its placeholder on export', () => {
    const resolved = applyVariables(config, vars);
    const stripped = stripSecrets(resolved, vars);
    expect(JSON.stringify(stripped)).not.toContain('tok_live_abc123');
  });

  it('drops auth values that match no declared secret', () => {
    const stripped = stripSecrets(
      {
        ...config,
        authType: 'Bearer Token',
        authConfig: { bearerToken: 'a-token-nobody-declared' },
      },
      vars,
    );
    expect(JSON.stringify(stripped)).not.toContain('a-token-nobody-declared');
    expect(stripped.authConfig.bearerToken).toBe('{{token}}');
  });

  it('leaves non-secret variable values alone', () => {
    const resolved = applyVariables(config, vars);
    const stripped = stripSecrets(resolved, vars);
    expect(stripped.url).toBe('https://api.example.com/items');
  });

  it('ignores very short secrets that would match everywhere', () => {
    const shortSecret = resolveEnvironment({
      id: 'e',
      name: 'x',
      variables: [{ id: '1', key: 's', value: 'ab', secret: true, enabled: true }],
    });
    const stripped = stripSecrets({ ...config, url: 'https://about.example.com' }, shortSecret);
    expect(stripped.url).toBe('https://about.example.com');
  });
});
