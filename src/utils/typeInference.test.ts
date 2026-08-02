import { describe, expect, it } from 'vitest';
import { inferPython, inferTypeScript, inferZod } from './typeInference';

describe('inferTypeScript', () => {
  it('maps primitives correctly', () => {
    const out = inferTypeScript({ id: 1, name: 'ada', active: true, missing: null });
    expect(out).toContain('id: number;');
    expect(out).toContain('name: string;');
    expect(out).toContain('active: boolean;');
    expect(out).toContain('missing: null;');
  });

  it('emits a named interface for a nested object', () => {
    const out = inferTypeScript({ user: { id: 1, email: 'a@b.c' } });
    expect(out).toContain('export interface User {');
    expect(out).toContain('user: User;');
  });

  it('singularises array element names', () => {
    const out = inferTypeScript({ results: [{ id: 1 }] });
    expect(out).toContain('export interface Result {');
    expect(out).toContain('results: Result[];');
  });

  it('merges heterogeneous arrays instead of describing only the first element', () => {
    const out = inferTypeScript({ items: [{ a: 1 }, { a: 2, b: 'x' }] });
    expect(out).toContain('a: number;');
    expect(out).toContain('b?: string;'); // present in only one element
  });

  it('handles an empty array without inventing a type', () => {
    expect(inferTypeScript({ items: [] })).toContain('items: unknown[];');
  });

  it('quotes keys that are not valid identifiers', () => {
    expect(inferTypeScript({ 'content-type': 'json' })).toContain('"content-type": string;');
  });

  it('handles a top-level array', () => {
    const out = inferTypeScript([{ id: 1 }]);
    expect(out).toContain('export type ApiResponse =');
  });

  it('terminates on deeply nested input', () => {
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 30; i++) deep = { next: deep };
    expect(() => inferTypeScript(deep)).not.toThrow();
  });

  it('handles a bare primitive payload', () => {
    expect(inferTypeScript('hello')).toBe('export type ApiResponse = string;');
  });
});

describe('inferZod', () => {
  it('produces a schema and an inferred type', () => {
    const out = inferZod({ id: 1, tags: ['a'] });
    expect(out).toContain("import { z } from 'zod';");
    expect(out).toContain('z.number()');
    expect(out).toContain('z.array(z.string())');
    expect(out).toContain('z.infer<typeof');
  });
});

describe('inferPython', () => {
  it('produces dataclasses with mapped types', () => {
    const out = inferPython({ id: 1, name: 'ada', nested: { ok: true } });
    expect(out).toContain('@dataclass');
    expect(out).toContain('id: float');
    expect(out).toContain('name: str');
    expect(out).toContain('class Nested:');
  });
});
