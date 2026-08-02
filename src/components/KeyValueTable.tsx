import { Plus, Trash2 } from 'lucide-react';
import type { KeyValuePair } from '../types';
import { paramId } from '../utils/requestUrl';

interface KeyValueTableProps {
  rows: KeyValuePair[];
  onChange: (rows: KeyValuePair[]) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
  addLabel: string;
  emptyMessage: string;
  idPrefix: string;
  /** Variable names available for `{{}}` substitution, for the hint. */
  knownVariables?: string[];
}

export function KeyValueTable({
  rows,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
  addLabel,
  emptyMessage,
  idPrefix,
  knownVariables = [],
}: KeyValueTableProps) {
  const update = (id: string, patch: Partial<KeyValuePair>) => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const usesUnknownVariable = (value: string) =>
    [...value.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].some(
      (match) => match[1] && !knownVariables.includes(match[1]),
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1 font-mono text-xs text-slate-400">
        <span>
          {rows.filter((r) => r.enabled && r.key.trim()).length} active of {rows.length}
        </span>
        <button
          type="button"
          onClick={() =>
            onChange([...rows, { id: paramId(idPrefix), key: '', value: '', enabled: true }])
          }
          className="flex items-center gap-1 font-semibold text-cyan-400 hover:text-cyan-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{addLabel}</span>
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-slate-800 bg-slate-950 py-8 text-center text-xs text-slate-500">
          {emptyMessage}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-2"
            >
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={(e) => update(row.id, { enabled: e.target.checked })}
                aria-label={`Include ${row.key || 'this row'}`}
                className="cursor-pointer rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-1 focus:ring-cyan-400"
              />
              <input
                type="text"
                placeholder={keyPlaceholder}
                value={row.key}
                onChange={(e) => update(row.id, { key: e.target.value })}
                aria-label={`${keyPlaceholder} for row`}
                className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
              />
              <input
                type="text"
                placeholder={valuePlaceholder}
                value={row.value}
                onChange={(e) => update(row.id, { value: e.target.value })}
                aria-label={`${valuePlaceholder} for ${row.key || 'row'}`}
                title={row.description}
                className={`min-w-0 flex-1 rounded-lg border bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-200 focus:outline-none ${
                  usesUnknownVariable(row.value)
                    ? 'border-amber-600/70 focus:border-amber-400'
                    : 'border-slate-800 focus:border-cyan-500'
                }`}
              />
              <button
                type="button"
                onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
                aria-label={`Remove ${row.key || 'row'}`}
                className="rounded p-1.5 text-slate-500 transition-colors hover:text-rose-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
