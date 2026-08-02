/**
 * Response viewer.
 *
 * Replaces a `<pre>{JSON.stringify(data, null, 2)}</pre>`, which had no
 * collapsing, no highlighting, no working filter (the "Filter JSON response
 * fields" input was rendered but never read), and no cap — a few-megabyte
 * payload froze the tab.
 *
 * Nodes render lazily: a collapsed branch renders nothing but its summary, so
 * cost tracks what is actually expanded rather than the size of the payload.
 */

import { memo, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { queryJsonPath } from '../utils/assertions';

interface JsonViewerProps {
  data: unknown;
  /** JSONPath-ish filter. Empty shows everything. */
  filter?: string;
  /** Depth that starts expanded. */
  defaultExpandDepth?: number;
}

/** Children rendered per node before a "show more" control appears. */
const CHUNK = 100;

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

const VALUE_CLASS: Record<string, string> = {
  string: 'text-emerald-300',
  number: 'text-amber-300',
  boolean: 'text-purple-300',
  null: 'text-slate-500',
  undefined: 'text-slate-500',
};

function Primitive({ value }: { value: unknown }) {
  const kind = typeOf(value);
  const text =
    kind === 'string'
      ? `"${value as string}"`
      : kind === 'null'
        ? 'null'
        : String(value as string | number | boolean);

  if (kind === 'string') {
    const raw = value as string;
    // Make URLs in a payload clickable; following a link out of a response is
    // half of what exploring an API involves.
    if (/^https?:\/\/\S+$/.test(raw)) {
      return (
        <a
          href={raw}
          target="_blank"
          rel="noreferrer noopener"
          className="text-emerald-300 underline decoration-emerald-500/40 hover:text-emerald-200"
        >
          &quot;{raw}&quot;
        </a>
      );
    }
  }

  return <span className={VALUE_CLASS[kind] ?? 'text-slate-300'}>{text}</span>;
}

interface NodeProps {
  name: string | null;
  value: unknown;
  depth: number;
  defaultExpandDepth: number;
  path: string;
}

const Node = memo(function Node({ name, value, depth, defaultExpandDepth, path }: NodeProps) {
  const kind = typeOf(value);
  const isBranch = kind === 'object' || kind === 'array';
  const [expanded, setExpanded] = useState(depth < defaultExpandDepth);
  const [visible, setVisible] = useState(CHUNK);

  const entries = useMemo<Array<[string, unknown]>>(() => {
    if (!isBranch) return [];
    return Array.isArray(value)
      ? value.map((item, index) => [String(index), item])
      : Object.entries(value as Record<string, unknown>);
  }, [value, isBranch]);

  const label =
    name === null ? null : (
      <span className="text-cyan-400">
        {Array.isArray(value) || name.match(/^\d+$/) ? name : `"${name}"`}
      </span>
    );

  if (!isBranch) {
    return (
      <div className="flex gap-2 py-px pl-[18px]" style={{ marginLeft: depth * 12 }}>
        {label}
        {label && <span className="text-slate-600">:</span>}
        <Primitive value={value} />
      </div>
    );
  }

  const summary = Array.isArray(value)
    ? `[] ${entries.length} item${entries.length === 1 ? '' : 's'}`
    : `{} ${entries.length} key${entries.length === 1 ? '' : 's'}`;

  return (
    <div style={{ marginLeft: depth * 12 }}>
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name ?? 'root'}`}
        className="flex w-full items-center gap-1 rounded py-px text-left hover:bg-slate-900/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-slate-500" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-slate-500" aria-hidden="true" />
        )}
        {label}
        {label && <span className="text-slate-600">:</span>}
        <span className="text-[11px] text-slate-500">{summary}</span>
      </button>

      {expanded && (
        <div>
          {entries.slice(0, visible).map(([key, child]) => (
            <Node
              key={`${path}.${key}`}
              name={key}
              value={child}
              depth={depth + 1}
              defaultExpandDepth={defaultExpandDepth}
              path={`${path}.${key}`}
            />
          ))}
          {entries.length > visible && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + CHUNK)}
              style={{ marginLeft: (depth + 1) * 12 }}
              className="my-1 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-cyan-300 hover:bg-slate-800"
            >
              Show {Math.min(CHUNK, entries.length - visible)} more of {entries.length}
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export function JsonViewer({ data, filter = '', defaultExpandDepth = 2 }: JsonViewerProps) {
  const { value, error, matchCount } = useMemo(() => {
    const query = filter.trim();
    if (!query)
      return { value: data, error: null as string | null, matchCount: null as number | null };

    try {
      const matches = queryJsonPath(data, query);
      if (matches.length === 0) return { value: null, error: 'No matches.', matchCount: 0 };
      return {
        value: matches.length === 1 ? matches[0] : matches,
        error: null,
        matchCount: matches.length,
      };
    } catch {
      return { value: data, error: 'That filter could not be parsed.', matchCount: null };
    }
  }, [data, filter]);

  if (error) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-amber-300">
        {error}
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-relaxed">
      {matchCount !== null && (
        <div className="mb-2 border-b border-slate-800 pb-1 text-[11px] text-slate-500">
          {matchCount} match{matchCount === 1 ? '' : 'es'} for{' '}
          <code className="text-cyan-400">{filter}</code>
        </div>
      )}
      <Node name={null} value={value} depth={0} defaultExpandDepth={defaultExpandDepth} path="$" />
    </div>
  );
}

/**
 * Render a response as its content type suggests: an image, an HTML document,
 * or an SVG. The `'preview'` tab was typed into the component's state union but
 * never implemented.
 */
export function ResponsePreview({
  data,
  contentType,
  url,
}: {
  data: unknown;
  contentType: string;
  url: string;
}) {
  const type = contentType.split(';')[0]?.trim() ?? '';

  if (type.startsWith('image/')) {
    return (
      <div className="flex justify-center rounded-xl border border-slate-800 bg-slate-950 p-4">
        <img src={url} alt="Response payload" className="max-h-80 max-w-full rounded-lg" />
      </div>
    );
  }

  if (
    type === 'image/svg+xml' ||
    (typeof data === 'string' && data.trimStart().startsWith('<svg'))
  ) {
    return (
      <iframe
        title="SVG response preview"
        // Sandboxed with no allow-scripts: response bodies are untrusted.
        sandbox=""
        srcDoc={String(data)}
        className="h-80 w-full rounded-xl border border-slate-800 bg-white"
      />
    );
  }

  if (type.includes('html') && typeof data === 'string') {
    return (
      <iframe
        title="HTML response preview"
        sandbox=""
        srcDoc={data}
        className="h-80 w-full rounded-xl border border-slate-800 bg-white"
      />
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-6 text-center text-xs text-slate-500">
      No preview available for{' '}
      <code className="text-slate-400">{type || 'unknown content type'}</code>.
    </div>
  );
}
