import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DescribedError } from '@/lib/errors';

interface ErrorStateProps {
  error: DescribedError;
  /** Omitted when nothing can be retried — the component then shows no button. */
  onRetry?: () => void;
  /** True while a retry is in flight, so the button cannot be pressed twice. */
  retrying?: boolean;
  /** `section` sits inside a card; `page` centres itself in the viewport. */
  variant?: 'section' | 'page';
}

/**
 * The inline error surface. Every data-fetching section renders this rather
 * than its own copy, so a failure looks the same everywhere and always
 * carries the same three things: what happened, what to do, and the reference
 * support needs.
 */
export function ErrorState({ error, onRetry, retrying = false, variant = 'section' }: ErrorStateProps) {
  const Icon = error.code === 'OFFLINE' || error.code === 'NETWORK_UNREACHABLE' ? WifiOff : AlertTriangle;

  return (
    <div
      // Announced when it appears: a sighted user sees the section change, a
      // screen-reader user would otherwise be told nothing at all.
      role="alert"
      aria-live="polite"
      className={
        variant === 'page'
          ? 'flex flex-col items-center justify-center text-center py-20 px-4'
          : 'flex flex-col items-start gap-3 rounded-md border border-line-strong/40 bg-surface p-5'
      }
    >
      <div className={variant === 'page' ? 'flex flex-col items-center gap-3' : 'flex items-start gap-3'}>
        <Icon className="h-5 w-5 text-ink-faint flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className={variant === 'page' ? 'text-center' : ''}>
          <p className="text-sm font-medium text-ink">{error.title}</p>
          <p className="text-body text-ink-muted mt-1 max-w-prose">{error.action}</p>
        </div>
      </div>

      {error.requestId && (
        <p className="text-xs text-ink-muted font-mono tabular-nums">
          Reference: {error.requestId}
        </p>
      )}

      {onRetry && error.retryable && (
        <Button size="sm" variant="secondary" onClick={onRetry} disabled={retrying} className="min-h-[44px] sm:min-h-0">
          <RefreshCw className={`h-4 w-4 mr-2 ${retrying ? 'animate-spin' : ''}`} aria-hidden="true" />
          {retrying ? 'Retrying…' : 'Try again'}
        </Button>
      )}
    </div>
  );
}
