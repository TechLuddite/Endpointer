/**
 * Assertions over a response.
 *
 * This is what turns a saved collection from a bookmark list into a test suite:
 * attach checks to a request, run the collection, get a pass/fail report.
 */

import type { ApiResponseData, Assertion, AssertionOperator, AssertionResult } from '../types';

/**
 * Minimal JSONPath: `$.a.b[0].c`, `a.b`, and `[*]` for "any element".
 * Returns every match, so `$.items[*].id` yields all ids.
 */
export function queryJsonPath(data: unknown, path: string): unknown[] {
  const normalized = path.trim().replace(/^\$\.?/, '');
  if (!normalized) return [data];

  const segments = normalized
    .replace(/\[(\d+|\*)\]/g, '.$1')
    .split('.')
    .filter(Boolean);

  let current: unknown[] = [data];
  for (const segment of segments) {
    const next: unknown[] = [];
    for (const value of current) {
      if (value === null || value === undefined) continue;
      if (segment === '*') {
        if (Array.isArray(value)) next.push(...value);
        else if (typeof value === 'object') next.push(...Object.values(value));
        continue;
      }
      if (Array.isArray(value)) {
        const index = Number(segment);
        if (Number.isInteger(index)) {
          const item = value.at(index);
          if (item !== undefined) next.push(item);
        }
        continue;
      }
      if (typeof value === 'object') {
        const item = (value as Record<string, unknown>)[segment];
        if (item !== undefined) next.push(item);
      }
    }
    current = next;
  }
  return current;
}

function describe(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function actualFor(assertion: Assertion, response: ApiResponseData): unknown {
  switch (assertion.source) {
    case 'status':
      return response.status;
    case 'duration':
      return response.duration;
    case 'header': {
      const wanted = (assertion.target ?? '').toLowerCase();
      const found = Object.entries(response.headers).find(([k]) => k.toLowerCase() === wanted);
      return found?.[1];
    }
    case 'body':
      return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    case 'jsonPath': {
      const matches = queryJsonPath(response.data, assertion.target ?? '$');
      return matches.length === 1 ? matches[0] : matches.length === 0 ? undefined : matches;
    }
  }
}

function compare(operator: AssertionOperator, actual: unknown, expected: string): boolean {
  const actualText = typeof actual === 'string' ? actual : describe(actual);

  switch (operator) {
    case 'equals':
      // Compare numerically when both sides look numeric, so "200" matches 200.
      if (typeof actual === 'number' && expected.trim() !== '' && !Number.isNaN(Number(expected))) {
        return actual === Number(expected);
      }
      return actualText === expected;
    case 'notEquals':
      return !compare('equals', actual, expected);
    case 'contains':
      return actualText.includes(expected);
    case 'notContains':
      return !actualText.includes(expected);
    case 'lessThan':
      return Number(actual) < Number(expected);
    case 'greaterThan':
      return Number(actual) > Number(expected);
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'notExists':
      return actual === undefined || actual === null;
    case 'isArray':
      return Array.isArray(actual);
    case 'isNotEmpty':
      if (Array.isArray(actual)) return actual.length > 0;
      if (actual && typeof actual === 'object') return Object.keys(actual).length > 0;
      return actualText.trim().length > 0;
    case 'matches':
      try {
        return new RegExp(expected).test(actualText);
      } catch {
        return false;
      }
  }
}

const OPERATOR_LABELS: Record<AssertionOperator, string> = {
  equals: 'equals',
  notEquals: 'does not equal',
  contains: 'contains',
  notContains: 'does not contain',
  lessThan: 'is less than',
  greaterThan: 'is greater than',
  exists: 'exists',
  notExists: 'does not exist',
  isArray: 'is an array',
  isNotEmpty: 'is not empty',
  matches: 'matches',
};

export function describeAssertion(assertion: Assertion): string {
  const subject =
    assertion.source === 'jsonPath' || assertion.source === 'header'
      ? `${assertion.source === 'header' ? 'header' : 'body'} ${assertion.target ?? ''}`.trim()
      : assertion.source;
  const operator = OPERATOR_LABELS[assertion.operator];
  const needsValue = !['exists', 'notExists', 'isArray', 'isNotEmpty'].includes(assertion.operator);
  return `${subject} ${operator}${needsValue ? ` ${assertion.expected ?? ''}` : ''}`.trim();
}

export function evaluateAssertion(
  assertion: Assertion,
  response: ApiResponseData,
): AssertionResult {
  const actual = actualFor(assertion, response);
  const passed = compare(assertion.operator, actual, assertion.expected ?? '');
  return {
    assertion,
    passed,
    actual: describe(actual).slice(0, 200),
    message: passed
      ? describeAssertion(assertion)
      : `${describeAssertion(assertion)} — got ${describe(actual).slice(0, 120)}`,
  };
}

export function evaluateAssertions(
  assertions: Assertion[] | undefined,
  response: ApiResponseData,
): AssertionResult[] {
  return (assertions ?? []).filter((a) => a.enabled).map((a) => evaluateAssertion(a, response));
}

let assertionCounter = 0;
function newId(): string {
  assertionCounter += 1;
  return `assert-${Date.now().toString(36)}-${assertionCounter}`;
}

/**
 * Propose assertions from an actual response.
 *
 * Derived structurally, not guessed: the status, a latency ceiling with
 * headroom, the content type, and existence/shape checks for the top-level
 * fields that are actually present.
 */
export function suggestAssertions(response: ApiResponseData): Assertion[] {
  const suggestions: Assertion[] = [
    {
      id: newId(),
      source: 'status',
      operator: 'equals',
      expected: String(response.status),
      enabled: true,
    },
    {
      id: newId(),
      source: 'duration',
      operator: 'lessThan',
      // Round up to a round number with 3x headroom so the check is not flaky.
      expected: String(Math.max(1000, Math.ceil((response.duration * 3) / 500) * 500)),
      enabled: true,
    },
  ];

  const contentType = response.contentType.split(';')[0]?.trim();
  if (contentType) {
    suggestions.push({
      id: newId(),
      source: 'header',
      target: 'content-type',
      operator: 'contains',
      expected: contentType,
      enabled: true,
    });
  }

  const data = response.data;
  if (Array.isArray(data)) {
    suggestions.push(
      { id: newId(), source: 'jsonPath', target: '$', operator: 'isArray', enabled: true },
      { id: newId(), source: 'jsonPath', target: '$', operator: 'isNotEmpty', enabled: true },
    );
  } else if (data && typeof data === 'object') {
    for (const [key, value] of Object.entries(data).slice(0, 5)) {
      suggestions.push({
        id: newId(),
        source: 'jsonPath',
        target: `$.${key}`,
        operator: Array.isArray(value) ? 'isArray' : 'exists',
        enabled: true,
      });
    }
  }

  return suggestions;
}
