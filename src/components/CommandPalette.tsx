import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

/** Subsequence match, so "opmt" finds "Open Monitor Tab". */
function fuzzyScore(text: string, query: string): number {
  if (!query) return 1;
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  if (haystack.includes(needle)) return 100 - haystack.indexOf(needle);

  let index = 0;
  let score = 0;
  for (const char of needle) {
    const found = haystack.indexOf(char, index);
    if (found < 0) return 0;
    score += found === index ? 2 : 1;
    index = found + 1;
  }
  return score;
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    return commands
      .map((command) => ({
        command,
        score: fuzzyScore(`${command.group} ${command.label} ${command.hint ?? ''}`, query),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((entry) => entry.command);
  }, [commands, query]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelected(0);
      // The dialog mounts on the same tick, so defer focus a frame.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.children[selected]?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!isOpen) return null;

  const run = (index: number) => {
    const command = matches[index];
    if (!command) return;
    onClose();
    command.run();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/80 p-4 pt-[15vh] backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <label className="sr-only" htmlFor="palette-input">
            Search commands
          </label>
          <input
            id="palette-input"
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
              } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                setSelected((current) => Math.min(current + 1, matches.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setSelected((current) => Math.max(current - 1, 0));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                run(selected);
              }
            }}
            placeholder="Search commands and APIs…"
            aria-activedescendant={
              matches[selected] ? `command-${matches[selected].id}` : undefined
            }
            aria-controls="command-list"
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <kbd className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
            esc
          </kbd>
        </div>

        <ul
          id="command-list"
          ref={listRef}
          role="listbox"
          aria-label="Commands"
          className="max-h-80 overflow-y-auto p-2"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-slate-500">No matching commands.</li>
          ) : (
            matches.map((command, index) => (
              <li
                key={command.id}
                id={`command-${command.id}`}
                role="option"
                aria-selected={index === selected}
              >
                <button
                  type="button"
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => run(index)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    index === selected ? 'bg-slate-800 text-slate-100' : 'text-slate-300'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 rounded bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-500">
                      {command.group}
                    </span>
                    <span className="truncate">{command.label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {command.hint && (
                      <span className="font-mono text-[11px] text-slate-500">{command.hint}</span>
                    )}
                    {index === selected && (
                      <CornerDownLeft className="h-3 w-3 text-slate-500" aria-hidden="true" />
                    )}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
