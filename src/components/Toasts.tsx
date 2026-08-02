import { AlertTriangle, Check, X } from 'lucide-react';

export interface Toast {
  id: string;
  message: string;
  tone: 'info' | 'error';
}

/**
 * Replaces `alert()`, which blocked the whole page to say "Request saved to
 * collection!" and could not be styled, stacked or dismissed.
 */
export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border p-3 text-xs shadow-xl backdrop-blur ${
            toast.tone === 'error'
              ? 'border-rose-800 bg-rose-950/95 text-rose-200'
              : 'border-slate-700 bg-slate-900/95 text-slate-200'
          }`}
        >
          {toast.tone === 'error' ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
          ) : (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
          )}
          <p className="flex-1 leading-relaxed">{toast.message}</p>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
            className="rounded p-0.5 text-slate-500 hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
