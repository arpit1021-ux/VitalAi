import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { describeError, isCancellation } from '@/lib/errors';
import { ErrorState } from '@/components/shared/ErrorState';
import { DelayedLoad } from '@/components/shared/DelayedLoad';

/**
 * The shape SectionBoundary needs from a query. Declared structurally rather
 * than imported from TanStack so a section backed by something else — a store,
 * a hand-rolled fetch — can use the same boundary.
 */
export interface SectionQuery<T> {
  data: T | undefined;
  isPending: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => unknown;
}

/**
 * How long the section is expected to take, which decides what the loading
 * state looks like.
 *
 * - `instant` (<1 s): nothing. A flash of skeleton is worse than the wait.
 * - `inline` (1-5 s): a skeleton shaped like the finished content.
 * - `explained` (5-10 s): a spinner that names the operation, because silence
 *   for that long reads as a hang.
 */
export type LoadingBand = 'instant' | 'inline' | 'explained';

interface SectionBoundaryProps<T> {
  query: SectionQuery<T>;
  children: (data: T) => ReactNode;
  band?: LoadingBand;
  /** Required for the `inline` band; ignored otherwise. */
  skeleton?: ReactNode;
  /** Required for the `explained` band: names what is happening, e.g. "Putting together tonight's ideas…". */
  loadingLabel?: string;
  /** Decides the empty state. Without it, loaded data is always treated as content. */
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  /**
   * When a refetch fails but a previous value is in hand, keep showing it with
   * a quiet note rather than replacing content the user was reading with an
   * error. Never set this on a scan verdict or an interaction result — stale
   * health information presented as current is the one degradation that is
   * worse than an outage.
   */
  degradeToStale?: boolean;
}

/**
 * Renders exactly one of loading, error, empty, or success for one section,
 * and keeps that failure inside the section.
 *
 * A page composed of these degrades card by card: if dinner ideas fail
 * because the model is rate-limited, the other eight cards render normally
 * and that one card offers a retry.
 */
export function SectionBoundary<T>({
  query,
  children,
  band = 'inline',
  skeleton,
  loadingLabel,
  isEmpty,
  empty,
  degradeToStale = false,
}: SectionBoundaryProps<T>) {
  // An aborted request is the app doing what it was told — a superseded search,
  // a screen the user navigated away from. It is not a failure to report.
  const failure = query.error && !isCancellation(query.error) ? query.error : null;
  const hasData = query.data !== undefined;

  if (failure && !(degradeToStale && hasData)) {
    return (
      <ErrorState
        error={describeError(failure)}
        onRetry={() => query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  if (query.isPending) {
    if (band === 'instant') return null;

    if (band === 'explained') {
      return (
        <DelayedLoad>
          <div className="flex items-center gap-3 p-5" role="status" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
            <p className="text-sm text-text-muted">{loadingLabel ?? 'Working on it…'}</p>
          </div>
        </DelayedLoad>
      );
    }

    return (
      <DelayedLoad delayMs={200}>
        <div role="status" aria-live="polite" aria-busy="true">
          {skeleton}
          <span className="sr-only">Loading</span>
        </div>
      </DelayedLoad>
    );
  }

  // A disabled query (no active profile yet) is pending-but-idle in TanStack v5
  // terms and reaches here with nothing to render.
  if (!hasData) return null;

  const data = query.data as T;

  if (isEmpty?.(data)) return <>{empty ?? null}</>;

  return (
    <>
      {failure && degradeToStale && (
        <p className="text-xs text-text-muted mb-2" role="status">
          Showing the last version we loaded — refreshing failed.{' '}
          <button
            type="button"
            onClick={() => query.refetch()}
            className="underline underline-offset-2 hover:text-text-primary"
          >
            Try again
          </button>
        </p>
      )}
      {children(data)}
    </>
  );
}
