import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { describeError } from '@/lib/errors';
import { ToastContext, type ToastApi } from '@/lib/toast';

type ToastTone = 'neutral' | 'failure';

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
}

const DISMISS_AFTER_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { ...toast, id }]);
      timers.current.set(id, window.setTimeout(() => dismiss(id), DISMISS_AFTER_MS));
    },
    [dismiss],
  );

  // Timers outlive the component if the tree unmounts mid-countdown.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      notify: (title, detail) => push({ tone: 'neutral', title, detail }),
      reportFailure: (error, context) => {
        const described = describeError(error);
        push({ tone: 'failure', title: context, detail: described.title });
      },
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        // Polite rather than assertive: these never carry anything urgent
        // enough to interrupt what a screen reader is already saying.
        role="status"
        aria-live="polite"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[min(92vw,26rem)] pointer-events-none"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-start gap-3 rounded-md border border-line bg-surface px-4 py-3 shadow-overlay"
          >
            {toast.tone === 'failure' ? (
              <AlertTriangle className="h-4 w-4 text-caution flex-shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink">{toast.title}</p>
              {toast.detail && <p className="text-xs text-ink-muted mt-0.5">{toast.detail}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="text-ink-muted hover:text-ink flex-shrink-0"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
