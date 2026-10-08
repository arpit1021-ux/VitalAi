import rateLimit, { type ClientRateLimitInfo, type Options, type Store } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { getRequestId } from './requestContext.js';
import { store as sharedStore } from '../services/store.js';
import { logger } from '../utils/logger.js';

/**
 * Backs the limiters with the same store as the token budgets — Redis in
 * production, an in-process map in development.
 *
 * The default store that ships with `express-rate-limit` keeps its counters in
 * process memory, which is the exact thing the rest of this codebase requires
 * Redis to avoid: counters reset on every deploy, and each instance enforces
 * its own copy of the limit, so the effective limit is the configured one
 * multiplied by the instance count.
 */
class SharedRateLimitStore implements Store {
  /** Counters are shared between instances, so the limiter must not cache. */
  readonly localKeys = false;

  private windowSeconds = 60;

  readonly prefix: string;

  /**
   * Each limiter gets its own namespace: the same key under two different
   * window lengths would otherwise share one counter and one expiry.
   */
  constructor(namespace: string) {
    this.prefix = `ratelimit:v1:${namespace}:`;
  }

  init(options: Options): void {
    this.windowSeconds = Math.max(1, Math.ceil(options.windowMs / 1000));
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const namespaced = this.prefix + key;

    try {
      const totalHits = await sharedStore.increment(namespaced, 1, this.windowSeconds);
      const remaining = await sharedStore.ttl(namespaced);

      return {
        totalHits,
        resetTime: new Date(Date.now() + (remaining ?? this.windowSeconds) * 1000),
      };
    } catch (error) {
      // A store outage must not turn every request into a 500. The request is
      // allowed through and the failure is logged: losing rate limiting for the
      // duration of a Redis incident is a smaller problem than losing the API.
      logger.error('Rate limit store unavailable; allowing the request', error, { key });
      return { totalHits: 1, resetTime: new Date(Date.now() + this.windowSeconds * 1000) };
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      await sharedStore.increment(this.prefix + key, -1, this.windowSeconds);
    } catch (error) {
      logger.error('Failed to decrement a rate limit counter', error, { key });
    }
  }

  async resetKey(key: string): Promise<void> {
    try {
      await sharedStore.delete(this.prefix + key);
    } catch (error) {
      logger.error('Failed to reset a rate limit counter', error, { key });
    }
  }
}

/**
 * Keys by authenticated user when available, falling back to IP.
 *
 * AI routes mount `authenticate` before this limiter precisely so the key is
 * the user id: keying paid endpoints by IP alone makes everyone behind one NAT
 * share a single budget.
 */
function keyGenerator(req: Request): string {
  const userId = req.jwtUser?.id;
  if (userId) return `user:${userId}`;
  return `ip:${req.ip ?? 'unknown'}`;
}

function handlerFor(message: string, action: string, code: string) {
  return (_req: Request, res: Response, _next: unknown, options: Options): void => {
    const retryAfterSeconds = Math.ceil(options.windowMs / 1000);
    res.setHeader('Retry-After', String(retryAfterSeconds));
    res.status(429).json({
      error: message,
      code,
      action,
      requestId: getRequestId(),
    });
  };
}

/** Guards the paid Gemini and Pinecone paths. */
export const aiRateLimiter = rateLimit({
  store: new SharedRateLimitStore('ai'),
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  handler: handlerFor(
    "You've reached the hourly limit for AI analysis.",
    'Your limit resets within the hour. Saved scans and history are still available in the meantime.',
    'AI_RATE_LIMITED',
  ),
});

/** Blanket protection against request floods on every endpoint. */
export const generalRateLimiter = rateLimit({
  store: new SharedRateLimitStore('general'),
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  handler: handlerFor(
    'Too many requests from this connection.',
    'Wait a minute and try again.',
    'RATE_LIMITED',
  ),
});

/**
 * Credential endpoints are keyed by IP on purpose: keying by the submitted
 * email would let an attacker rotate addresses to stay under the limit.
 */
export const authRateLimiter = rateLimit({
  store: new SharedRateLimitStore('auth'),
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req: Request) => `auth:${req.ip ?? 'unknown'}`,
  handler: handlerFor(
    'Too many sign-in attempts from this connection.',
    'Wait 15 minutes before trying again, or reset your password if you have forgotten it.',
    'AUTH_RATE_LIMITED',
  ),
});

/**
 * Crash reports from the browser.
 *
 * Tighter than the general limiter because the endpoint writes a log line and
 * an error-tracker event per call: a render loop that reports on every frame
 * would otherwise fill both. The client caps itself as well; this is the half
 * that does not depend on the client behaving.
 */
export const telemetryRateLimiter = rateLimit({
  store: new SharedRateLimitStore('telemetry'),
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => `telemetry:${req.ip ?? 'unknown'}`,
  handler: handlerFor(
    'Too many error reports from this connection.',
    'Nothing more needs to be done — the failure has already been recorded.',
    'RATE_LIMITED',
  ),
});
