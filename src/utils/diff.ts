/**
 * Structural diff between two response payloads.
 *
 * History already stores every response. Comparing two runs of the same
 * endpoint is nearly free from that, and it is the question people actually
 * have when an API starts behaving differently: *what changed?* Answering it by
 * eyeballing two pretty-printed blobs is exactly the work a tool should do.
 */

export type ChangeKind = 'added' | 'removed' | 'changed' | 'type-changed';

export interface Change {
  /** JSONPath-style location, e.g. `$.results[0].name`. */
  path: string;
  kind: ChangeKind;
  before?: unknown;
  after?: unknown;
}

export interface DiffResult {
  changes: Change[];
  identical: boolean;
  /** True when the walk was cut short; the change list is then incomplete. */
  truncated: boolean;
}

const MAX_DEPTH = 12;
const MAX_CHANGES = 500;

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function joinPath(base: string, key: string, isIndex: boolean): string {
  return isIndex ? `${base}[${key}]` : `${base}.${key}`;
}

/**
 * Compare two payloads. Object key order is irrelevant; array position is not,
 * because a reordered array genuinely is a different response.
 */
export function diffPayloads(before: unknown, after: unknown): DiffResult {
  const changes: Change[] = [];
  let truncated = false;

  const walk = (a: unknown, b: unknown, path: string, depth: number): void => {
    if (changes.length >= MAX_CHANGES) {
      truncated = true;
      return;
    }
    if (depth > MAX_DEPTH) {
      truncated = true;
      return;
    }

    const typeA = typeOf(a);
    const typeB = typeOf(b);

    if (typeA !== typeB) {
      changes.push({ path, kind: 'type-changed', before: a, after: b });
      return;
    }

    if (typeA === 'array') {
      const arrayA = a as unknown[];
      const arrayB = b as unknown[];
      const max = Math.max(arrayA.length, arrayB.length);
      for (let i = 0; i < max; i++) {
        const childPath = joinPath(path, String(i), true);
        if (i >= arrayA.length) changes.push({ path: childPath, kind: 'added', after: arrayB[i] });
        else if (i >= arrayB.length)
          changes.push({ path: childPath, kind: 'removed', before: arrayA[i] });
        else walk(arrayA[i], arrayB[i], childPath, depth + 1);
      }
      return;
    }

    if (typeA === 'object') {
      const objectA = a as Record<string, unknown>;
      const objectB = b as Record<string, unknown>;
      for (const key of new Set([...Object.keys(objectA), ...Object.keys(objectB)])) {
        const childPath = joinPath(path, key, false);
        const inA = key in objectA;
        const inB = key in objectB;
        if (!inA) changes.push({ path: childPath, kind: 'added', after: objectB[key] });
        else if (!inB) changes.push({ path: childPath, kind: 'removed', before: objectA[key] });
        else walk(objectA[key], objectB[key], childPath, depth + 1);
      }
      return;
    }

    if (a !== b) changes.push({ path, kind: 'changed', before: a, after: b });
  };

  walk(before, after, '$', 0);
  return { changes, identical: changes.length === 0 && !truncated, truncated };
}

/** Short human-readable rendering of a value for a diff row. */
export function formatValue(value: unknown): string {
  if (value === undefined) return '—';
  if (typeof value === 'string') return `"${value.length > 60 ? `${value.slice(0, 60)}…` : value}"`;
  try {
    const text = JSON.stringify(value);
    return text.length > 60 ? `${text.slice(0, 60)}…` : text;
  } catch {
    return String(value);
  }
}

export function summarizeDiff(result: DiffResult): string {
  if (result.identical) return 'Identical';
  const counts = result.changes.reduce<Record<string, number>>((acc, change) => {
    acc[change.kind] = (acc[change.kind] ?? 0) + 1;
    return acc;
  }, {});
  const parts = [
    counts.added ? `${counts.added} added` : null,
    counts.removed ? `${counts.removed} removed` : null,
    (counts.changed ?? 0) + (counts['type-changed'] ?? 0)
      ? `${(counts.changed ?? 0) + (counts['type-changed'] ?? 0)} changed`
      : null,
  ].filter(Boolean);
  return `${parts.join(', ')}${result.truncated ? ' (truncated)' : ''}`;
}
