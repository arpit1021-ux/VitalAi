import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { store } from '../services/store.js';
import { badRequest, conflict } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

/**
 * Makes a retried mutation safe to replay.
 *
 * A scan on a flaky mobile connection is the case this exists for: the request
 * succeeds, the response never arrives, the client retries, and without this
 * the user is billed twice and gets two rows in their history for one photo.
 *
 * The client sends an Idempotency-Key. The first request with that key runs
 * normally and its response is recorded; a repeat returns the recorded
 * response without touching the model.
 */

const KEY_TTL_SECONDS = 24 * 60 * 60;
const IN_FLIGHT_TTL_SECONDS = 120;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RecordedResponse {
  status: number;
  body: unknown;
  /** Hash of the request that created it, so the same key cannot be reused for different work. */
  fingerprint: string;
}

function fingerprintOf(req: Request): string {
  // Multipart bodies are not in req.body at this point, so the file is
  // fingerprinted by its bytes where present.
  const parts = [req.method, req.originalUrl, JSON.stringify(req.body ?? {})];
  if (req.file?.buffer) parts.push(createHash('sha256').update(req.file.buffer).digest('hex'));

  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 32);
}

function keyFor(userId: string, idempotencyKey: string): string {
  return `idem:v1:${userId}:${idempotencyKey}`;
}

/**
 * Optional by design.
 *
 * A client that does not send a key gets today's behaviour rather than an
 * error, so this can be adopted per screen instead of as a breaking change.
 */
export async function idempotency(req: Request, res: Response, next: NextFunction): Promise<void> {
  const provided = req.get('Idempotency-Key');
  const userId = req.jwtUser?.id;

  if (!provided || !userId) {
    next();
    return;
  }

  if (!UUID_PATTERN.test(provided)) {
    next(
      badRequest(
        'The request could not be identified for safe retry.',
        'This is a problem with the app rather than anything you did. Try the action again.',
      ),
    );
    return;
  }

  const key = keyFor(userId, provided);
  const fingerprint = fingerprintOf(req);

  try {
    const existing = await store.get(key);

    if (existing) {
      const record = JSON.parse(existing) as RecordedResponse | { inFlight: true };

      if ('inFlight' in record) {
        // The first request has not finished. Returning its eventual response
        // would mean holding this connection open for an unknown time, so the
        // client is told to wait instead.
        next(
          conflict(
            'That request is still being processed.',
            'Wait a few seconds and check again — it has not been lost, and repeating it will not duplicate anything.',
          ),
        );
        return;
      }

      if (record.fingerprint !== fingerprint) {
        next(
          conflict(
            'That retry key has already been used for a different request.',
            'Start the action again rather than retrying this one.',
          ),
        );
        return;
      }

      logger.info('Replayed idempotent response', { operation: req.originalUrl });
      res.status(record.status).json(record.body);
      return;
    }

    await store.set(key, JSON.stringify({ inFlight: true }), IN_FLIGHT_TTL_SECONDS);
  } catch (error) {
    // The store being unavailable must not block the request. The cost is
    // losing replay protection for this call, which is better than refusing
    // work the user asked for.
    logger.error('Idempotency store unavailable; proceeding without replay protection', error);
    next();
    return;
  }

  // Capture the response so a later replay can return it verbatim.
  const originalJson = res.json.bind(res);

  res.json = (body: unknown) => {
    const status = res.statusCode;

    // Only successful responses are recorded. Replaying a failure would make a
    // transient error permanent for the lifetime of the key.
    const persist =
      status >= 200 && status < 300
        ? store.set(key, JSON.stringify({ status, body, fingerprint }), KEY_TTL_SECONDS)
        : store.delete(key);

    void persist.catch((error) => {
      logger.error('Failed to record idempotent response', error, { status });
    });

    return originalJson(body);
  };

  next();
}
