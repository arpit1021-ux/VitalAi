/**
 * An error whose message is safe to show a user.
 *
 * Anything thrown that is not an AppError is treated as an internal failure:
 * the raw error is logged with the correlation ID and the client receives a
 * generic message plus that ID. This is the single place that decides what
 * crosses the boundary.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly action?: string;
  readonly details?: Record<string, string>;
  readonly expose = true;

  constructor(params: {
    status: number;
    code: string;
    /** What happened, in plain language. Shown to the user verbatim. */
    message: string;
    /** What the user can do next. Shown alongside the message. */
    action?: string;
    /** Field-level messages for form errors, keyed by field name. */
    details?: Record<string, string>;
    /** Underlying error, logged but never sent to the client. */
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = 'AppError';
    this.status = params.status;
    this.code = params.code;
    this.action = params.action;
    this.details = params.details;
    Error.captureStackTrace?.(this, AppError);
  }
}

export const badRequest = (message: string, action?: string, details?: Record<string, string>) =>
  new AppError({ status: 400, code: 'BAD_REQUEST', message, action, details });

export const unauthorized = (
  message = 'Your session has ended.',
  action = 'Sign in again to continue.',
) => new AppError({ status: 401, code: 'UNAUTHENTICATED', message, action });

export const forbidden = (
  message = "You don't have access to this.",
  action = 'Check that you are signed in to the right account.',
) => new AppError({ status: 403, code: 'FORBIDDEN', message, action });

export const notFound = (what: string, action = 'It may have been deleted. Try refreshing the page.') =>
  new AppError({ status: 404, code: 'NOT_FOUND', message: `${what} could not be found.`, action });

export const conflict = (message: string, action?: string) =>
  new AppError({ status: 409, code: 'CONFLICT', message, action });

export const tooManyRequests = (message: string, action: string) =>
  new AppError({ status: 429, code: 'RATE_LIMITED', message, action });

export const serviceUnavailable = (message: string, action: string, cause?: unknown) =>
  new AppError({ status: 503, code: 'SERVICE_UNAVAILABLE', message, action, cause });
