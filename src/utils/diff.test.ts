import { describe, expect, it } from 'vitest';
import { diffPayloads, formatValue, summarizeDiff } from './diff';

describe('diffPayloads', () => {
  it('reports identical payloads', () => {
    const result = diffPayloads({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] });
    expect(result.identical).toBe(true);
    expect(result.changes).toEqual([]);
  });

  it('ignores object key order', () => {
    expect(diffPayloads({ a: 1, b: 2 }, { b: 2, a: 1 }).identical).toBe(true);
  });

  it('detects a changed scalar with its path', () => {
    const { changes } = diffPayloads({ user: { name: 'ada' } }, { user: { name: 'grace' } });
    expect(changes).toEqual([
      { path: '$.user.name', kind: 'changed', before: 'ada', after: 'grace' },
    ]);
  });

  it('detects added and removed keys', () => {
    const { changes } = diffPayloads({ a: 1 }, { b: 2 });
    expect(changes).toContainEqual({ path: '$.a', kind: 'removed', before: 1 });
    expect(changes).toContainEqual({ path: '$.b', kind: 'added', after: 2 });
  });

  it('flags a type change rather than reporting a value change', () => {
    const { changes } = diffPayloads({ id: 1 }, { id: '1' });
    expect(changes[0]?.kind).toBe('type-changed');
  });

  it('treats null and a missing value as distinct', () => {
    expect(diffPayloads({ a: null }, { a: 0 }).changes[0]?.kind).toBe('type-changed');
    expect(diffPayloads({ a: null }, {}).changes[0]?.kind).toBe('removed');
  });

  it('indexes into arrays', () => {
    const { changes } = diffPayloads({ list: [1, 2, 3] }, { list: [1, 9, 3] });
    expect(changes).toEqual([{ path: '$.list[1]', kind: 'changed', before: 2, after: 9 }]);
  });

  it('reports array length changes at the right index', () => {
    const { changes } = diffPayloads([1], [1, 2]);
    expect(changes).toEqual([{ path: '$[1]', kind: 'added', after: 2 }]);
  });

  it('treats a reordered array as changed, because it is a different response', () => {
    expect(diffPayloads([1, 2], [2, 1]).identical).toBe(false);
  });

  it('terminates on deeply nested payloads and says it truncated', () => {
    let deepA: Record<string, unknown> = { leaf: 1 };
    let deepB: Record<string, unknown> = { leaf: 2 };
    for (let i = 0; i < 30; i++) {
      deepA = { next: deepA };
      deepB = { next: deepB };
    }
    const result = diffPayloads(deepA, deepB);
    expect(result.truncated).toBe(true);
    expect(result.identical).toBe(false);
  });

  it('caps the number of reported changes', () => {
    const before = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`k${i}`, i]));
    const after = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`k${i}`, i + 1]));
    const result = diffPayloads(before, after);
    expect(result.changes.length).toBeLessThanOrEqual(500);
    expect(result.truncated).toBe(true);
  });

  it('handles top-level primitives', () => {
    expect(diffPayloads('a', 'b').changes[0]).toEqual({
      path: '$',
      kind: 'changed',
      before: 'a',
      after: 'b',
    });
  });
});

describe('summarizeDiff', () => {
  it('summarises counts by kind', () => {
    const result = diffPayloads({ a: 1, b: 2 }, { a: 9, c: 3 });
    expect(summarizeDiff(result)).toMatch(/added/);
    expect(summarizeDiff(result)).toMatch(/removed/);
    expect(summarizeDiff(result)).toMatch(/changed/);
  });

  it('says identical when nothing differs', () => {
    expect(summarizeDiff(diffPayloads({ a: 1 }, { a: 1 }))).toBe('Identical');
  });
});

describe('formatValue', () => {
  it('quotes strings and truncates long ones', () => {
    expect(formatValue('hi')).toBe('"hi"');
    expect(formatValue('x'.repeat(200))).toMatch(/…"?$/);
  });

  it('renders undefined as an em dash', () => {
    expect(formatValue(undefined)).toBe('—');
  });
});
