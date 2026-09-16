import { createContext, useContext } from 'react';

export interface ToastApi {
  /** Confirms something that already happened. Auto-dismisses. */
  notify: (title: string, detail?: string) => void;
  /**
   * Reports a failure the user does not have to act on — an optimistic update
   * that was rolled back, a background sync that did not land. Anything the
   * user *must* act on belongs inline, next to the control, not here.
   */
  reportFailure: (error: unknown, context: string) => void;
}

/**
 * Lives apart from the provider component so that editing the provider's
 * markup does not invalidate every consumer of this hook on hot reload.
 */
export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast was called outside ToastProvider.');
  return api;
}
