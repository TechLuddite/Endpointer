import { useState } from 'react';
import { Eye, EyeOff, Layers, Plus, Trash2 } from 'lucide-react';
import type { Environment, EnvironmentVariable } from '../types';
import { Modal } from './Modal';

interface EnvironmentManagerProps {
  isOpen: boolean;
  onClose: () => void;
  environments: Environment[];
  activeId: string | null;
  onSave: (environments: Environment[]) => void;
  onSelect: (id: string | null) => void;
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${counter++}`;

export function EnvironmentManager({
  isOpen,
  onClose,
  environments,
  activeId,
  onSave,
  onSelect,
}: EnvironmentManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(
    activeId ?? environments[0]?.id ?? null,
  );
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const editing = environments.find((env) => env.id === editingId) ?? null;

  const updateEnvironment = (id: string, patch: Partial<Environment>) => {
    onSave(environments.map((env) => (env.id === id ? { ...env, ...patch } : env)));
  };

  const updateVariable = (envId: string, varId: string, patch: Partial<EnvironmentVariable>) => {
    const env = environments.find((e) => e.id === envId);
    if (!env) return;
    updateEnvironment(envId, {
      variables: env.variables.map((v) => (v.id === varId ? { ...v, ...patch } : v)),
    });
  };

  const createEnvironment = () => {
    const env: Environment = {
      id: nextId('env'),
      name: `Environment ${environments.length + 1}`,
      variables: [
        { id: nextId('var'), key: 'baseUrl', value: '', secret: false, enabled: true },
        { id: nextId('var'), key: 'token', value: '', secret: true, enabled: true },
      ],
    };
    onSave([...environments, env]);
    setEditingId(env.id);
  };

  const toggleReveal = (id: string) => {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Environments & variables"
      subtitle="Use {{name}} anywhere in a request. Secrets are excluded from exports."
      accent="cyan"
      maxWidth="max-w-3xl"
      icon={
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-teal-600">
          <Layers className="h-4 w-4 text-white" aria-hidden="true" />
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr]">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Environments
            </h3>
            <button
              type="button"
              onClick={createEnvironment}
              aria-label="Create environment"
              className="rounded p-1 text-cyan-400 hover:text-cyan-300"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {environments.length === 0 ? (
            <p className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs leading-relaxed text-slate-500">
              None yet. Create one to define <code>{'{{baseUrl}}'}</code> and{' '}
              <code>{'{{token}}'}</code>.
            </p>
          ) : (
            <ul className="space-y-1">
              {environments.map((env) => (
                <li key={env.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingId(env.id)}
                    className={`min-w-0 flex-1 truncate rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition-all ${
                      editingId === env.id
                        ? 'border border-cyan-800 bg-cyan-950 text-cyan-300'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {env.name}
                    {activeId === env.id && (
                      <span className="ml-1.5 text-[10px] text-emerald-400">● active</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSave(environments.filter((e) => e.id !== env.id));
                      if (activeId === env.id) onSelect(null);
                      if (editingId === env.id) setEditingId(null);
                    }}
                    aria-label={`Delete ${env.name}`}
                    className="rounded p-1 text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="env-name">
                Environment name
              </label>
              <input
                id="env-name"
                type="text"
                value={editing.name}
                onChange={(e) => updateEnvironment(editing.id, { name: e.target.value })}
                className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200 focus:border-cyan-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => onSelect(activeId === editing.id ? null : editing.id)}
                className={`whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-semibold ${
                  activeId === editing.id
                    ? 'border-emerald-700 bg-emerald-950 text-emerald-300'
                    : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {activeId === editing.id ? 'Active' : 'Activate'}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Variables
              </h3>
              <button
                type="button"
                onClick={() =>
                  updateEnvironment(editing.id, {
                    variables: [
                      ...editing.variables,
                      { id: nextId('var'), key: '', value: '', secret: false, enabled: true },
                    ],
                  })
                }
                className="flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:text-cyan-300"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add
              </button>
            </div>

            <ul className="space-y-2">
              {editing.variables.map((variable) => (
                <li
                  key={variable.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-2"
                >
                  <input
                    type="checkbox"
                    checked={variable.enabled}
                    onChange={(e) =>
                      updateVariable(editing.id, variable.id, { enabled: e.target.checked })
                    }
                    aria-label={`Enable ${variable.key || 'variable'}`}
                    className="rounded border-slate-700 bg-slate-900 text-cyan-500"
                  />
                  <input
                    type="text"
                    value={variable.key}
                    onChange={(e) =>
                      updateVariable(editing.id, variable.id, { key: e.target.value })
                    }
                    placeholder="name"
                    aria-label="Variable name"
                    className="w-28 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 font-mono text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
                  />
                  <input
                    type={variable.secret && !revealed.has(variable.id) ? 'password' : 'text'}
                    value={variable.value}
                    onChange={(e) =>
                      updateVariable(editing.id, variable.id, { value: e.target.value })
                    }
                    placeholder="value"
                    aria-label={`Value for ${variable.key || 'variable'}`}
                    autoComplete="off"
                    className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 font-mono text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
                  />
                  {variable.secret && (
                    <button
                      type="button"
                      onClick={() => toggleReveal(variable.id)}
                      aria-label={revealed.has(variable.id) ? 'Hide value' : 'Reveal value'}
                      className="rounded p-1 text-slate-500 hover:text-slate-300"
                    >
                      {revealed.has(variable.id) ? (
                        <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </button>
                  )}
                  <label
                    className="flex cursor-pointer items-center gap-1 text-[11px] text-slate-400"
                    title="Secret values are replaced with a placeholder when a collection is exported"
                  >
                    <input
                      type="checkbox"
                      checked={variable.secret}
                      onChange={(e) =>
                        updateVariable(editing.id, variable.id, { secret: e.target.checked })
                      }
                      className="rounded border-slate-700 bg-slate-900 text-amber-500"
                    />
                    secret
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      updateEnvironment(editing.id, {
                        variables: editing.variables.filter((v) => v.id !== variable.id),
                      })
                    }
                    aria-label={`Remove ${variable.key || 'variable'}`}
                    className="rounded p-1 text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>

            <p className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-[11px] leading-relaxed text-slate-500">
              Reference these anywhere in a request as <code>{'{{name}}'}</code> — URL, params,
              headers, body or auth. A variable may reference another. Values marked secret are
              swapped for their placeholder when you export a collection.
            </p>
          </div>
        ) : (
          <p className="flex items-center justify-center rounded-xl border border-slate-800 bg-slate-950 p-8 text-center text-xs text-slate-500">
            Select an environment, or create one.
          </p>
        )}
      </div>
    </Modal>
  );
}
