import rateLimit, { type Options } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { getRequestId } from './requestContext.js';

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
