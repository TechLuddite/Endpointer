/**
 * Accessible dialog shell.
 *
 * The previous modals were bare divs: no role, no aria-modal, no Escape
 * handler, no focus trap, no restore of focus on close, and a backdrop that
 * could not be clicked to dismiss. Keyboard and screen-reader users could not
 * close them at all.
 */

import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
  accent?: 'indigo' | 'emerald' | 'cyan' | 'purple';
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const ACCENTS = {
  indigo: 'border-indigo-500/30 shadow-indigo-950/40',
  emerald: 'border-emerald-500/30 shadow-emerald-950/30',
  cyan: 'border-cyan-500/30 shadow-cyan-950/30',
  purple: 'border-purple-500/30 shadow-purple-950/30',
} as const;

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  maxWidth = 'max-w-2xl',
  accent = 'indigo',
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      // Focus trap: cycle within the dialog rather than escaping to the page
      // behind it, which is still rendered and still tabbable.
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    document.addEventListener('keydown', handleKeyDown, true);

    // Stop the page behind the dialog from scrolling under it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    (focusable?.[0] ?? dialogRef.current)?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md"
      onMouseDown={(event) => {
        // Only dismiss on a click that starts on the backdrop, so a drag that
        // ends outside the dialog does not close it mid-selection.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? descriptionId : undefined}
        tabIndex={-1}
        className={`flex max-h-[90vh] w-full ${maxWidth} flex-col overflow-hidden rounded-2xl border bg-slate-900 shadow-2xl ${ACCENTS[accent]}`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-950/60 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {icon}
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-base font-bold text-slate-100">
                {title}
              </h2>
              {subtitle && (
                <p id={descriptionId} className="truncate text-xs text-slate-400">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="border-t border-slate-800 bg-slate-950/60 px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
