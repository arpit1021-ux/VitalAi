import { env } from '../config/env.js';
import { getRequestContext } from '../middleware/requestContext.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = LEVEL_ORDER[env.LOG_LEVEL];

/**
 * Keys whose values must never reach a log sink. Matched case-insensitively
 * against the key name, so `authorization`, `refreshToken` and `apiKey` are all
 * covered without listing every variant.
 */
const REDACT_PATTERNS = [
  /pass/i,
  /secret/i,
  /authorization/i,
  /cookie/i,
  /apikey/i,
  /api_key/i,
  /credential/i,
  // Matches accessToken, refreshToken, tokenHash — but not the token *counts*
  // below, which are metrics and must stay readable.
  /(^|[^a-z])token/i,
];

/**
 * Keys that look like they should be redacted but are measurements, not
 * secrets. Without this, `inputTokens` matched the token pattern and the
 * usage numbers logged as "[redacted]".
 */
const METRIC_KEYS = new Set(['inputTokens', 'outputTokens', 'totalTokens', 'tokenVersion']);

/**
 * Health data is not secret, but it has no business in an application log.
 * These fields are dropped from any structured payload before it is written.
 */
const DROP_KEYS = new Set([
  'conditions',
  'medications',
  'allergies',
  'extractedText',
  'content',
  'messages',
  'email',
]);

function shouldRedact(key: string): boolean {
  if (METRIC_KEYS.has(key)) return false;
  return REDACT_PATTERNS.some((pattern) => pattern.test(key));
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return value.length > 2000 ? `${value.slice(0, 2000)}…[truncated]` : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitize(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (DROP_KEYS.has(key)) continue;
      output[key] = shouldRedact(key) ? '[redacted]' : sanitize(entry, depth + 1);
    }
    return output;
  }

  return String(value);
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(typeof (error as unknown as { status?: unknown }).status === 'number'
        ? { status: (error as unknown as { status: number }).status }
        : {}),
    };
  }
  return { message: String(error) };
}

function write(level: Level, message: string, fields?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < MIN_LEVEL) return;

  const context = getRequestContext();

  const line: Record<string, unknown> = {
    time: new Date().toISOString(),
    level,
    message,
    ...(context
      ? { requestId: context.requestId, userId: context.userId, method: context.method, path: context.path }
      : {}),
    ...(fields ? (sanitize(fields) as Record<string, unknown>) : {}),
  };

  const serialized = JSON.stringify(line);
  if (level === 'error' || level === 'warn') {
    process.stderr.write(`${serialized}\n`);
  } else {
    process.stdout.write(`${serialized}\n`);
  }
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => write('debug', message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write('warn', message, fields),
  error: (message: string, error?: unknown, fields?: Record<string, unknown>) =>
    write('error', message, { ...fields, error: error === undefined ? undefined : serializeError(error) }),
};
