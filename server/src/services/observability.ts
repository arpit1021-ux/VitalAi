import { env, isProduction } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { getRequestContext } from '../middleware/requestContext.js';

/**
 * Error reporting.
 *
 * Structured logs answer "what happened on this request" when you already know
 * which request to look at. They do not tell you that a new exception started
 * appearing across many users an hour ago. That is what this is for.
 *
 * Sentry is loaded dynamically so the dependency is only required by
 * deployments that use it. If SENTRY_DSN is set and the package is missing,
 * that is a misconfiguration and it is reported loudly rather than silently
 * running without error tracking.
 */

interface SentryLike {
  init(options: Record<string, unknown>): void;
  captureException(error: unknown, context?: Record<string, unknown>): void;
  flush(timeout: number): Promise<boolean>;
}

let sentry: SentryLike | null = null;
let initialised = false;

/**
 * Fields that must never leave the process.
 *
 * Sentry receives exception data from a health application, so the scrubbing
 * here is deliberately aggressive: request bodies and headers are dropped
 * entirely rather than filtered field by field, because a filter has to be
 * right every time and dropping only has to be right once.
 */
function scrub(event: Record<string, unknown>): Record<string, unknown> {
  const request = event.request as Record<string, unknown> | undefined;

  if (request) {
    delete request.data;
    delete request.cookies;
    delete request.headers;
    delete request.query_string;
  }

  return event;
}

export async function initObservability(): Promise<void> {
  if (initialised) return;
  initialised = true;

  if (!env.SENTRY_DSN) {
    logger.info('Error tracking is not configured', { hint: 'Set SENTRY_DSN to enable it.' });
    return;
  }

  try {
    // Resolved through a variable so TypeScript does not require the package
    // to be installed. It is an optional dependency: deployments without error
    // tracking should not have to carry it, and the failure path below turns a
    // missing package into a clear message rather than a build error.
    const moduleName = '@sentry/node';
    const module = (await import(moduleName)) as unknown as SentryLike;

    module.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      release: env.RELEASE_VERSION,
      tracesSampleRate: 0,
      // Personally identifying data is never attached; events carry the
      // correlation id and the user id, which are enough to find the request.
      sendDefaultPii: false,
      beforeSend: (event: Record<string, unknown>) => scrub(event),
    });

    sentry = module;
    logger.info('Error tracking initialised', { environment: env.NODE_ENV });
  } catch (error) {
    const message =
      'SENTRY_DSN is set but @sentry/node could not be loaded. Run: npm --prefix server install @sentry/node';

    if (isProduction) {
      // Running production without the error tracking it was configured for
      // means the next incident is invisible.
      throw new Error(message, { cause: error });
    }

    logger.error(message, error);
  }
}

/** Reports an exception, annotated with the request that caused it. */
export function captureException(error: unknown, extra?: Record<string, unknown>): void {
  if (!sentry) return;

  const context = getRequestContext();

  try {
    sentry.captureException(error, {
      tags: { requestId: context?.requestId, path: context?.path },
      user: context?.userId ? { id: context.userId } : undefined,
      extra,
    });
  } catch (reportingError) {
    // Reporting must never become the failure.
    logger.error('Failed to report exception', reportingError);
  }
}

/** Gives in-flight events a chance to send before the process exits. */
export async function flushObservability(timeoutMs = 2000): Promise<void> {
  if (!sentry) return;
  try {
    await sentry.flush(timeoutMs);
  } catch {
    // Nothing useful to do at shutdown.
  }
}
