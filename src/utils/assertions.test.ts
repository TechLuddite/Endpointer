import { describe, expect, it } from 'vitest';
import {
  evaluateAssertion,
  evaluateAssertions,
  queryJsonPath,
  suggestAssertions,
} from './assertions';
import type { ApiResponseData, Assertion } from '../types';

const response: ApiResponseData = {
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: { 'content-type': 'application/json; charset=utf-8', 'x-request-id': 'abc' },
  data: {
    count: 2,
    results: [
      { id: 1, name: 'ada' },
      { id: 2, name: 'grace' },
    ],
    meta: { nested: { deep: 'value' } },
  },
  contentType: 'application/json; charset=utf-8',
  duration: 120,
  sizeBytes: 200,
  timestamp: Date.now(),
};

const assertion = (partial: Partial<Assertion>): Assertion => ({
  id: 'a',
  source: 'status',
  operator: 'equals',
  enabled: true,
  ...partial,
});

describe('queryJsonPath', () => {
  it('reads a top-level field', () => {
    expect(queryJsonPath(response.data, '$.count')).toEqual([2]);
  });

  it('indexes into an array', () => {
    expect(queryJsonPath(response.data, '$.results[0].name')).toEqual(['ada']);
  });

  it('collects every element with a wildcard', () => {
    expect(queryJsonPath(response.data, '$.results[*].name')).toEqual(['ada', 'grace']);
  });

  it('walks nested objects', () => {
    expect(queryJsonPath(response.data, '$.meta.nested.deep')).toEqual(['value']);
  });

  it('returns the root for $', () => {
    expect(queryJsonPath(response.data, '$')).toEqual([response.data]);
  });

  it('returns nothing for a missing path instead of throwing', () => {
    expect(queryJsonPath(response.data, '$.nope.deeper')).toEqual([]);
  });

  it('accepts a path without the leading $', () => {
    expect(queryJsonPath(response.data, 'count')).toEqual([2]);
  });
});

describe('evaluateAssertion', () => {
  it('compares status numerically despite the expected value being a string', () => {
    expect(evaluateAssertion(assertion({ expected: '200' }), response).passed).toBe(true);
    expect(evaluateAssertion(assertion({ expected: '404' }), response).passed).toBe(false);
  });

  it('checks a header case-insensitively', () => {
    expect(
      evaluateAssertion(
        assertion({
          source: 'header',
          target: 'Content-Type',
          operator: 'contains',
          expected: 'json',
        }),
        response,
      ).passed,
    ).toBe(true);
  });

  it('checks duration with lessThan', () => {
    expect(
      evaluateAssertion(
        assertion({ source: 'duration', operator: 'lessThan', expected: '500' }),
        response,
      ).passed,
    ).toBe(true);
  });

  it('checks array-ness and emptiness via JSONPath', () => {
    expect(
      evaluateAssertion(
        assertion({ source: 'jsonPath', target: '$.results', operator: 'isArray' }),
        response,
      ).passed,
    ).toBe(true);
    expect(
      evaluateAssertion(
        assertion({ source: 'jsonPath', target: '$.results', operator: 'isNotEmpty' }),
        response,
      ).passed,
    ).toBe(true);
  });

  it('reports a missing field as not existing', () => {
    expect(
      evaluateAssertion(
        assertion({ source: 'jsonPath', target: '$.nope', operator: 'notExists' }),
        response,
      ).passed,
    ).toBe(true);
  });

  it('supports regex matching', () => {
    expect(
      evaluateAssertion(
        assertion({
          source: 'header',
          target: 'x-request-id',
          operator: 'matches',
          expected: '^[a-z]+$',
        }),
        response,
      ).passed,
    ).toBe(true);
  });

  it('fails closed on an invalid regex instead of throwing', () => {
    expect(() =>
      evaluateAssertion(
        assertion({ source: 'body', operator: 'matches', expected: '([' }),
        response,
      ),
    ).not.toThrow();
    expect(
      evaluateAssertion(
        assertion({ source: 'body', operator: 'matches', expected: '([' }),
        response,
      ).passed,
    ).toBe(false);
  });

  it('includes the actual value in a failure message', () => {
    const result = evaluateAssertion(assertion({ expected: '404' }), response);
    expect(result.message).toContain('200');
  });
});

describe('evaluateAssertions', () => {
  it('skips disabled assertions', () => {
    expect(
      evaluateAssertions(
        [assertion({ expected: '200' }), assertion({ id: 'b', expected: '500', enabled: false })],
        response,
      ),
    ).toHaveLength(1);
  });

  it('handles an undefined assertion list', () => {
    expect(evaluateAssertions(undefined, response)).toEqual([]);
  });
});

describe('suggestAssertions', () => {
  it('derives suggestions from the actual response, and they all pass against it', () => {
    const suggested = suggestAssertions(response);
    expect(suggested.length).toBeGreaterThan(2);
    for (const result of evaluateAssertions(suggested, response)) {
      expect(result.passed).toBe(true);
    }
  });

  it('gives the latency ceiling headroom so it is not flaky', () => {
    const durationAssertion = suggestAssertions(response).find((a) => a.source === 'duration');
    expect(Number(durationAssertion?.expected)).toBeGreaterThan(response.duration * 2);
  });

  it('suggests array checks for a top-level array payload', () => {
    const arrayResponse = { ...response, data: [{ id: 1 }] };
    const operators = suggestAssertions(arrayResponse).map((a) => a.operator);
    expect(operators).toContain('isArray');
  });

  it('does not crash on a null payload', () => {
    expect(() => suggestAssertions({ ...response, data: null })).not.toThrow();
  });
});
