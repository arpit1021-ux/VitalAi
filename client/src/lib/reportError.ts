/**
 * Reports a browser-side failure to the API.
 *
 * Deliberately not the axios instance: that instance has an interceptor that
 * refreshes tokens and can itself throw, and reporting must not be able to
 * trigger the thing it is reporting on. `fetch` with `keepalive` also survives
 * the page being closed, which is exactly when a crash report gets sent.
 *
 * Failing to report is never surfaced. It is the one operation in the app whose
 * failure the user genuinely cannot act on.
 */

const REPORT_PATH = '/telemetry/client-error';

/** Per page load, so a render loop cannot turn into a flood of requests. */
const MAX_REPORTS = 5;
let sent = 0;

/** Repeats of one message are pointless; the same crash usually fires twice. */
const seen = new Set<string>();

export type ClientErrorKind = 'render' | 'window' | 'promise';

interface ReportInput {
  error: unknown;
  kind: ClientErrorKind;
  componentStack?: string;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  return 'Unknown client error';
}

export function reportClientError({ error, kind, componentStack }: ReportInput): void {
  const message = messageOf(error).slice(0, 500);
  const fingerprint = `${kind}:${message}`;

  if (sent >= MAX_REPORTS || seen.has(fingerprint)) return;
  sent += 1;
  seen.add(fingerprint);

  const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api';

  const body = JSON.stringify({
    message,
    name: error instanceof Error ? error.name.slice(0, 120) : 'ClientError',
    stack: error instanceof Error ? error.stack?.slice(0, 4000) : undefined,
    componentStack: componentStack?.slice(0, 4000),
    // The path only — a query string on these routes could carry a search term
    // someone typed, and none of that belongs in an error report.
    route: window.location.pathname.slice(0, 300),
    kind,
  });

  void fetch(`${baseURL}${REPORT_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    credentials: 'include',
    keepalive: true,
  }).catch(() => {
    /* Nothing useful to do, and nothing to tell the user. */
  });
}

/**
 * Catches what no boundary can: an error thrown outside React's render cycle,
 * and a rejected promise nobody handled.
 */
export function installGlobalErrorReporting(): void {
  window.addEventListener('error', (event) => {
    reportClientError({ error: event.error ?? event.message, kind: 'window' });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportClientError({ error: event.reason, kind: 'promise' });
  });
}
