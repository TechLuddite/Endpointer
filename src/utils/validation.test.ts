import { describe, expect, it } from 'vitest';
import {
  parseCollections,
  parseEnvironments,
  parseHistory,
  parseKeyValuePairs,
  parseRequestConfig,
} from './validation';

describe('parseCollections — the brick bug', () => {
  it('never yields a collection without a requests array', () => {
    // This exact shape used to reach render, where col.requests.length threw.
    // The bad value was already persisted, so it threw again on every reload.
    const hostile = [
      { id: 'a', name: 'No requests key' },
      { id: 'b', name: 'Wrong type', requests: 'not-an-array' },
      { id: 'c', name: 'Null requests', requests: null },
      { id: 'd', name: 'Requests of junk', requests: [null, 42, 'x'] },
    ];
    for (const collection of parseCollections(hostile)) {
      expect(Array.isArray(collection.requests)).toBe(true);
    }
    expect(parseCollections(hostile)).toHaveLength(4);
  });

  it('rejects entries that are not objects', () => {
    expect(parseCollections([null, 1, 'x', [], true])).toEqual([]);
  });

  it('rejects a collection with no name rather than rendering a blank card', () => {
    expect(parseCollections([{ id: 'a', requests: [] }])).toEqual([]);
  });

  it('returns an empty array for non-array input', () => {
    expect(parseCollections(null)).toEqual([]);
    expect(parseCollections('{}')).toEqual([]);
    expect(parseCollections({ collections: [] })).toEqual([]);
  });

  it('caps the number of collections', () => {
    const huge = Array.from({ length: 5000 }, (_, i) => ({ name: `c${i}`, requests: [] }));
    expect(parseCollections(huge).length).toBeLessThanOrEqual(200);
  });
});

describe('parseRequestConfig', () => {
  it('fills every field a component reads', () => {
    const config = parseRequestConfig({ url: 'https://x.dev' });
    expect(config).not.toBeNull();
    expect(config?.method).toBe('GET');
    expect(config?.params).toEqual([]);
    expect(config?.headers).toEqual([]);
    expect(config?.authConfig).toBeTruthy();
    expect(config?.bodyType).toBe('none');
    expect(config?.body).toBe('');
  });

  it('falls back to GET on an unknown method rather than sending it', () => {
    expect(parseRequestConfig({ url: 'https://x.dev', method: 'TRACE' })?.method).toBe('GET');
    expect(parseRequestConfig({ url: 'https://x.dev', method: 42 })?.method).toBe('GET');
  });

  it('migrates a legacy URL that embedded its query string', () => {
    const config = parseRequestConfig({ url: 'https://x.dev/s?a=1&b=2' });
    expect(config?.url).toBe('https://x.dev/s');
    expect(config?.params.map((p) => [p.key, p.value])).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
  });

  it('does not double up when a legacy URL and the params table overlap', () => {
    const config = parseRequestConfig({
      url: 'https://x.dev/s?a=1',
      params: [{ id: '1', key: 'a', value: '1', enabled: true }],
    });
    expect(config?.params.filter((p) => p.key === 'a')).toHaveLength(1);
  });

  it('returns null for non-objects', () => {
    expect(parseRequestConfig(null)).toBeNull();
    expect(parseRequestConfig('https://x.dev')).toBeNull();
    expect(parseRequestConfig([])).toBeNull();
  });

  it('truncates absurdly long strings', () => {
    const config = parseRequestConfig({ url: 'https://x.dev', body: 'x'.repeat(1_000_000) });
    expect((config?.body ?? '').length).toBeLessThanOrEqual(200_000);
  });
});

describe('parseKeyValuePairs', () => {
  it('drops non-object entries and defaults enabled to true', () => {
    const pairs = parseKeyValuePairs([{ key: 'a', value: '1' }, null, 5, { key: 'b' }]);
    expect(pairs).toHaveLength(2);
    expect(pairs[0]?.enabled).toBe(true);
    expect(pairs[1]?.value).toBe('');
  });

  it('gives every row an id, since React keys depend on it', () => {
    for (const pair of parseKeyValuePairs([{ key: 'a' }, { key: 'b' }])) {
      expect(pair.id).toBeTruthy();
    }
  });

  it('coerces numeric values to strings', () => {
    expect(parseKeyValuePairs([{ key: 'limit', value: 10 }])[0]?.value).toBe('10');
  });
});

describe('parseHistory', () => {
  it('drops entries whose config cannot be repaired', () => {
    expect(parseHistory([{ id: '1' }, { id: '2', config: null }])).toEqual([]);
  });

  it('keeps a valid entry and names it from the URL when unnamed', () => {
    const history = parseHistory([{ id: '1', config: { url: 'https://x.dev/a' } }]);
    expect(history).toHaveLength(1);
    expect(history[0]?.name).toBe('https://x.dev/a');
  });
});

describe('parseEnvironments', () => {
  it('keeps the secret flag and defaults it to false', () => {
    const envs = parseEnvironments([
      {
        name: 'prod',
        variables: [
          { key: 'token', value: 'abc', secret: true },
          { key: 'baseUrl', value: 'https://x.dev' },
        ],
      },
    ]);
    expect(envs[0]?.variables[0]?.secret).toBe(true);
    expect(envs[0]?.variables[1]?.secret).toBe(false);
  });

  it('rejects an unnamed environment', () => {
    expect(parseEnvironments([{ variables: [] }])).toEqual([]);
  });
});
