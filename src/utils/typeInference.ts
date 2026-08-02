/**
 * Structural type generation from a real response payload.
 *
 * Deliberately deterministic: these are read off the actual JSON, so they are
 * correct for the sample by construction and do not depend on a model. The AI
 * path uses the same payload but can add naming and doc comments.
 */

type Shape =
  | { kind: 'primitive'; name: string }
  | { kind: 'array'; of: Shape }
  | { kind: 'object'; fields: Map<string, { shape: Shape; optional: boolean }> }
  | { kind: 'union'; of: Shape[] };

const MAX_DEPTH = 8;
const MAX_ARRAY_SAMPLE = 25;

function shapeOf(value: unknown, depth = 0): Shape {
  if (depth > MAX_DEPTH) return { kind: 'primitive', name: 'unknown' };
  if (value === null) return { kind: 'primitive', name: 'null' };

  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: 'array', of: { kind: 'primitive', name: 'unknown' } };
    // Merge across a sample of elements so a heterogeneous array produces a
    // union rather than silently describing only the first element.
    const shapes = value.slice(0, MAX_ARRAY_SAMPLE).map((v) => shapeOf(v, depth + 1));
    return { kind: 'array', of: shapes.reduce(mergeShapes) };
  }

  if (typeof value === 'object') {
    const fields = new Map<string, { shape: Shape; optional: boolean }>();
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      fields.set(k, { shape: shapeOf(v, depth + 1), optional: false });
    }
    return { kind: 'object', fields };
  }

  return { kind: 'primitive', name: typeof value };
}

function shapeKey(shape: Shape): string {
  switch (shape.kind) {
    case 'primitive':
      return shape.name;
    case 'array':
      return `[${shapeKey(shape.of)}]`;
    case 'union':
      return shape.of.map(shapeKey).sort().join('|');
    case 'object':
      return `{${[...shape.fields.keys()].sort().join(',')}}`;
  }
}

function mergeShapes(a: Shape, b: Shape): Shape {
  if (shapeKey(a) === shapeKey(b)) {
    if (a.kind === 'object' && b.kind === 'object') {
      const fields = new Map(a.fields);
      for (const [key, value] of b.fields) {
        const existing = fields.get(key);
        fields.set(
          key,
          existing
            ? { shape: mergeShapes(existing.shape, value.shape), optional: existing.optional }
            : value,
        );
      }
      return { kind: 'object', fields };
    }
    return a;
  }

  // null merged with anything becomes optional-ish; represent as a union.
  if (a.kind === 'object' && b.kind === 'object') {
    const fields = new Map<string, { shape: Shape; optional: boolean }>();
    for (const [key, value] of a.fields) {
      fields.set(key, { ...value, optional: !b.fields.has(key) });
    }
    for (const [key, value] of b.fields) {
      const existing = fields.get(key);
      if (existing) {
        fields.set(key, {
          shape: mergeShapes(existing.shape, value.shape),
          optional: existing.optional,
        });
      } else {
        fields.set(key, { ...value, optional: true });
      }
    }
    return { kind: 'object', fields };
  }

  const branches = [...(a.kind === 'union' ? a.of : [a]), ...(b.kind === 'union' ? b.of : [b])];
  const seen = new Map<string, Shape>();
  for (const branch of branches) seen.set(shapeKey(branch), branch);
  const unique = [...seen.values()];
  return unique.length === 1 ? (unique[0] as Shape) : { kind: 'union', of: unique };
}

function toPascalCase(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]+(.)?/g, (_, chr) => (chr ? chr.toUpperCase() : ''));
  const pascal = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return /^[A-Za-z]/.test(pascal) ? pascal : `Field${pascal}`;
}

/** Depluralise a field name so `users: User[]` reads correctly. */
function singularize(name: string): string {
  if (/ies$/i.test(name)) return `${name.slice(0, -3)}y`;
  if (/ses$/i.test(name)) return name.slice(0, -2);
  if (/s$/i.test(name) && !/ss$/i.test(name)) return name.slice(0, -1);
  return name;
}

const VALID_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export interface InferOptions {
  rootName?: string;
  /** 'typescript' emits interfaces; 'zod' emits a schema; 'python' emits a dataclass. */
  dialect?: 'typescript' | 'zod' | 'python';
}

function renderTs(shape: Shape, name: string, out: string[], seen: Set<string>): string {
  switch (shape.kind) {
    case 'primitive':
      return shape.name === 'null' ? 'null' : shape.name === 'object' ? 'unknown' : shape.name;
    case 'union':
      return shape.of.map((s) => renderTs(s, name, out, seen)).join(' | ');
    case 'array':
      return `${renderTs(shape.of, singularize(name), out, seen)}[]`;
    case 'object': {
      let interfaceName = toPascalCase(name);
      let suffix = 2;
      while (seen.has(interfaceName)) interfaceName = `${toPascalCase(name)}${suffix++}`;
      seen.add(interfaceName);

      const lines: string[] = [];
      for (const [key, { shape: fieldShape, optional }] of shape.fields) {
        const rendered = renderTs(fieldShape, key, out, seen);
        const safeKey = VALID_IDENTIFIER.test(key) ? key : JSON.stringify(key);
        lines.push(`  ${safeKey}${optional ? '?' : ''}: ${rendered};`);
      }
      out.push(`export interface ${interfaceName} {\n${lines.join('\n')}\n}`);
      return interfaceName;
    }
  }
}

function renderZod(shape: Shape, name: string, depth = 0): string {
  const pad = '  '.repeat(depth + 1);
  switch (shape.kind) {
    case 'primitive':
      return (
        {
          string: 'z.string()',
          number: 'z.number()',
          boolean: 'z.boolean()',
          null: 'z.null()',
          undefined: 'z.undefined()',
          unknown: 'z.unknown()',
        }[shape.name] ?? 'z.unknown()'
      );
    case 'union':
      return `z.union([${shape.of.map((s) => renderZod(s, name, depth)).join(', ')}])`;
    case 'array':
      return `z.array(${renderZod(shape.of, singularize(name), depth)})`;
    case 'object': {
      const entries = [...shape.fields].map(([key, { shape: fieldShape, optional }]) => {
        const safeKey = VALID_IDENTIFIER.test(key) ? key : JSON.stringify(key);
        return `${pad}  ${safeKey}: ${renderZod(fieldShape, key, depth + 1)}${optional ? '.optional()' : ''},`;
      });
      return `z.object({\n${entries.join('\n')}\n${pad}})`;
    }
  }
}

function renderPython(shape: Shape, name: string, out: string[], seen: Set<string>): string {
  switch (shape.kind) {
    case 'primitive':
      return (
        { string: 'str', number: 'float', boolean: 'bool', null: 'None', undefined: 'Any' }[
          shape.name
        ] ?? 'Any'
      );
    case 'union':
      return shape.of.map((s) => renderPython(s, name, out, seen)).join(' | ');
    case 'array':
      return `list[${renderPython(shape.of, singularize(name), out, seen)}]`;
    case 'object': {
      let className = toPascalCase(name);
      let suffix = 2;
      while (seen.has(className)) className = `${toPascalCase(name)}${suffix++}`;
      seen.add(className);

      const lines = [...shape.fields].map(([key, { shape: fieldShape, optional }]) => {
        const rendered = renderPython(fieldShape, key, out, seen);
        const safeKey = VALID_IDENTIFIER.test(key)
          ? key
          : `# invalid identifier: ${key}\n    _${key}`;
        return `    ${safeKey}: ${optional ? `${rendered} | None = None` : rendered}`;
      });
      out.push(`@dataclass\nclass ${className}:\n${lines.join('\n') || '    pass'}`);
      return className;
    }
  }
}

/** Generate TypeScript interfaces for a payload. */
export function inferTypeScript(value: unknown, rootName = 'ApiResponse'): string {
  const shape = shapeOf(value);
  if (shape.kind !== 'object' && shape.kind !== 'array') {
    return `export type ${toPascalCase(rootName)} = ${renderTs(shape, rootName, [], new Set())};`;
  }
  const out: string[] = [];
  const rendered = renderTs(shape, rootName, out, new Set());
  if (shape.kind === 'array') out.push(`export type ${toPascalCase(rootName)} = ${rendered};`);
  return out.reverse().join('\n\n');
}

/** Generate a Zod schema for a payload. */
export function inferZod(value: unknown, rootName = 'apiResponse'): string {
  const schema = renderZod(shapeOf(value), rootName);
  const constName = rootName.charAt(0).toLowerCase() + toPascalCase(rootName).slice(1);
  return `import { z } from 'zod';\n\nexport const ${constName}Schema = ${schema};\n\nexport type ${toPascalCase(rootName)} = z.infer<typeof ${constName}Schema>;`;
}

/** Generate Python dataclasses for a payload. */
export function inferPython(value: unknown, rootName = 'ApiResponse'): string {
  const out: string[] = [];
  const shape = shapeOf(value);
  const rendered = renderPython(shape, rootName, out, new Set());
  const header = 'from dataclasses import dataclass\nfrom typing import Any\n';
  if (out.length === 0) return `${header}\n${toPascalCase(rootName)} = ${rendered}`;
  return `${header}\n${out.reverse().join('\n\n')}`;
}

export function inferTypes(value: unknown, options: InferOptions = {}): string {
  const { rootName = 'ApiResponse', dialect = 'typescript' } = options;
  if (dialect === 'zod') return inferZod(value, rootName);
  if (dialect === 'python') return inferPython(value, rootName);
  return inferTypeScript(value, rootName);
}
