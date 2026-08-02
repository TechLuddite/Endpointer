import { describe, expect, it } from 'vitest';
import { displayUrl, isSendableUrl, joinUrl, mergeUrlIntoParams, splitUrl } from './requestUrl';
import { buildFullUrl } from './codeGenerators';
import type { KeyValuePair, RequestConfig } from '../types';

const pair = (key: string, value: string, enabled = true): KeyValuePair => ({
  id: key,
  key,
  value,
  enabled,
});

describe('splitUrl', () => {
  it('separates the query string from the base', () => {
    const { base, params } = splitUrl('https://api.example.com/v1/items?limit=10&offset=5');
    expect(base).toBe('https://api.example.com/v1/items');
    expect(params.map((p) => [p.key, p.value])).toEqual([
      ['limit', '10'],
      ['offset', '5'],
    ]);
  });

  it('decodes percent-encoded values', () => {
    const { params } = splitUrl('https://x.dev/s?q=hello%20world&tag=a%2Bb');
    expect(params[0]?.value).toBe('hello world');
    expect(params[1]?.value).toBe('a+b');
  });

  it('survives malformed percent sequences instead of throwing', () => {
    expect(() => splitUrl('https://x.dev/s?q=100%')).not.toThrow();
    expect(splitUrl('https://x.dev/s?q=100%').params[0]?.value).toBe('100%');
  });

  it('keeps the fragment attached to the base', () => {
    const { base, params } = splitUrl('https://x.dev/docs?a=1#section');
    expect(base).toBe('https://x.dev/docs#section');
    expect(params).toHaveLength(1);
  });

  it('handles a valueless parameter', () => {
    expect(splitUrl('https://x.dev/s?debug').params[0]).toMatchObject({
      key: 'debug',
      value: '',
    });
  });

  it('handles partial input mid-typing without throwing', () => {
    expect(() => splitUrl('https://ap')).not.toThrow();
    expect(splitUrl('').base).toBe('');
  });
});

describe('joinUrl', () => {
  it('omits disabled parameters, so unticking a row removes it', () => {
    const url = joinUrl('https://x.dev/s', [pair('a', '1'), pair('b', '2', false)]);
    expect(url).toBe('https://x.dev/s?a=1');
  });

  it('omits parameters with a blank key', () => {
    expect(joinUrl('https://x.dev/s', [pair('', 'orphan')])).toBe('https://x.dev/s');
  });

  it('encodes values', () => {
    expect(joinUrl('https://x.dev/s', [pair('q', 'a b&c')])).toBe('https://x.dev/s?q=a%20b%26c');
  });

  it('leaves {{variable}} placeholders readable', () => {
    expect(joinUrl('https://x.dev/s', [pair('key', '{{apiKey}}')])).toBe(
      'https://x.dev/s?key={{apiKey}}',
    );
  });

  it('inserts the query before the fragment', () => {
    expect(joinUrl('https://x.dev/d#top', [pair('a', '1')])).toBe('https://x.dev/d?a=1#top');
  });
});

describe('round-tripping', () => {
  it('is stable across split and rejoin', () => {
    const original = 'https://api.example.com/v1/items?limit=10&q=hello%20world';
    const { base, params } = splitUrl(original);
    expect(joinUrl(base, params)).toBe(original);
  });

  it('never duplicates a parameter — the regression that shipped', () => {
    // The directory used to set url to the full sample endpoint AND populate
    // params from defaultParams, then buildFullUrl appended params onto a URL
    // that still had its query string.
    const sample =
      'https://api.open-meteo.com/v1/forecast?latitude=37.7749&longitude=-122.4194&current_weather=true';
    const { base, params } = splitUrl(sample);

    const config: RequestConfig = {
      method: 'GET',
      url: base,
      params,
      headers: [],
      authType: 'No Auth',
      authConfig: {},
      bodyType: 'none',
      body: '',
      useProxy: false,
    };

    const sent = buildFullUrl(config);
    const query = new URL(sent).searchParams;
    expect(query.getAll('latitude')).toEqual(['37.7749']);
    expect(query.getAll('longitude')).toEqual(['-122.4194']);
    expect(query.getAll('current_weather')).toEqual(['true']);
    expect(sent).toBe(sample);
  });
});

describe('mergeUrlIntoParams', () => {
  it('preserves the description on a row that came from the directory', () => {
    const existing: KeyValuePair[] = [
      { id: '1', key: 'latitude', value: '37.7', enabled: true, description: 'Latitude (SF)' },
    ];
    const { params } = mergeUrlIntoParams('https://x.dev/f?latitude=51.5', existing);
    expect(params[0]?.description).toBe('Latitude (SF)');
    expect(params[0]?.value).toBe('51.5');
  });

  it('keeps disabled rows, which are absent from the URL text by definition', () => {
    const existing: KeyValuePair[] = [pair('debug', 'true', false)];
    const { params } = mergeUrlIntoParams('https://x.dev/f?a=1', existing);
    expect(params.map((p) => p.key).sort()).toEqual(['a', 'debug']);
    expect(params.find((p) => p.key === 'debug')?.enabled).toBe(false);
  });

  it('drops a parameter the user deleted from the URL text', () => {
    const existing: KeyValuePair[] = [pair('a', '1'), pair('b', '2')];
    const { params } = mergeUrlIntoParams('https://x.dev/f?a=1', existing);
    expect(params.map((p) => p.key)).toEqual(['a']);
  });
});

describe('displayUrl', () => {
  it('shows enabled parameters only', () => {
    expect(displayUrl('https://x.dev/s', [pair('a', '1'), pair('b', '2', false)])).toBe(
      'https://x.dev/s?a=1',
    );
  });
});

describe('isSendableUrl', () => {
  it.each([
    ['https://api.example.com/x', true],
    ['http://localhost:3000/api', true],
    ['{{baseUrl}}/items', true],
    ['', false],
    ['not a url', false],
    ['ftp://example.com', false],
    ['https://', false],
  ])('%s -> %s', (url, expected) => {
    expect(isSendableUrl(url)).toBe(expected);
  });
});
