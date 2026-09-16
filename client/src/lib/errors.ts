import axios from 'axios';

/**
 * The wire format every server error uses. Mirrors ErrorBody in
 * server/src/middleware/errorHandler.ts. If those two drift, the client falls
 * back to the generic copy below rather than rendering `undefined`.
 */
interface ServerErrorBody {
  error?: string;
  code?: string;
  action?: string;
  fields?: Record<string, string>;
  requestId?: string;
}

/**
 * A failure described in terms a person can act on.
 *
 * `title` says what happened, `action` says what to do next, and `requestId`
 * is the only internal identifier that may reach the screen — it is what
 * support needs to find the server-side log for this exact failure.
 */
export interface DescribedError {
  title: string;
  action: string;
  code: string;
  status?: number;
  requestId?: string;
  /** Per-field messages, keyed by form field name. */
  fields?: Record<string, string>;
  /** False when retrying the identical request cannot plausibly succeed. */
  retryable: boolean;
  /** True when the session ended; the caller routes to sign-in rather than retrying. */
  sessionEnded: boolean;
}

/** A cancelled request is not a failure and must never be shown as one. */
export function isCancellation(error: unknown): boolean {
  return axios.isCancel(error) || (axios.isAxiosError(error) && error.code === 'ERR_CANCELED');
}

function fromStatus(status: number, body: ServerErrorBody): DescribedError {
  const base = {
    code: body.code ?? `HTTP_${status}`,
    status,
    requestId: body.requestId,
    fields: body.fields,
    sessionEnded: status === 401,
  };

  // The server already writes plain-language copy for everything it maps. Use
  // it when it is there; the fallbacks below only cover a response that came
  // from somewhere else — a proxy, a gateway, a CDN error page.
  if (body.error) {
    return {
      ...base,
      title: body.error,
      action: body.action ?? 'Try again in a moment.',
      retryable: status >= 500 || status === 429 || status === 408,
    };
  }

  if (status === 401) {
    return { ...base, title: 'Your session has ended.', action: 'Sign in again to continue.', retryable: false };
  }
  if (status === 403) {
    return { ...base, title: 'You do not have access to that.', action: 'Switch to the profile it belongs to, or go back.', retryable: false };
  }
  if (status === 404) {
    return { ...base, title: 'That is no longer there.', action: 'Go back and open it again from the list.', retryable: false };
  }
  if (status === 429) {
    return { ...base, title: 'You have made a lot of requests in a short time.', action: 'Wait a minute and try again.', retryable: true };
  }
  if (status >= 500) {
    return { ...base, title: 'Something went wrong on our side.', action: 'Try again in a moment. If it keeps happening, contact support and quote the reference below.', retryable: true };
  }
  return { ...base, title: 'That request could not be completed.', action: 'Check what you entered and try again.', retryable: false };
}

/**
 * Turns anything thrown into something renderable.
 *
 * Never returns a stack trace, a provider message, or a database error: the
 * server does not send them, and a client-side failure is described by its
 * category rather than its message.
 */
export function describeError(error: unknown): DescribedError {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      return fromStatus(error.response.status, (error.response.data ?? {}) as ServerErrorBody);
    }

    if (error.code === 'ECONNABORTED') {
      return {
        title: 'That took too long and was stopped.',
        action: 'Try again — if you are on a slow connection, moving somewhere with better signal usually fixes it.',
        code: 'TIMEOUT',
        retryable: true,
        sessionEnded: false,
      };
    }

    // No response at all: the request never reached the server, or the browser
    // is offline. These are different sentences to the person reading them.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return {
        title: 'You are offline.',
        action: 'Reconnect and this will pick up where it left off.',
        code: 'OFFLINE',
        retryable: true,
        sessionEnded: false,
      };
    }

    return {
      title: 'We could not reach VitalAI.',
      action: 'Check your connection and try again.',
      code: 'NETWORK_UNREACHABLE',
      retryable: true,
      sessionEnded: false,
    };
  }

  return {
    title: 'Something went wrong.',
    action: 'Try again. If it keeps happening, reload the page.',
    code: 'UNKNOWN',
    retryable: true,
    sessionEnded: false,
  };
}
