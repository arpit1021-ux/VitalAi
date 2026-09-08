import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestContext {
  /** Correlation ID surfaced to the client and attached to every log line. */
  requestId: string;
  /** Populated by the authenticate middleware once the token is verified. */
  userId?: string;
  method: string;
  path: string;
  startedAt: number;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function setContextUserId(userId: string): void {
  const store = storage.getStore();
  if (store) store.userId = userId;
}

/**
 * Accepts an inbound `x-request-id` when it looks like a UUID (so a gateway or
 * load balancer can own the ID), otherwise mints one. Anything else is ignored
 * rather than trusted, because the value ends up in logs.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.get('x-request-id');
  const requestId = inbound && UUID_PATTERN.test(inbound) ? inbound.toLowerCase() : randomUUID();

  res.setHeader('x-request-id', requestId);

  storage.run(
    {
      requestId,
      method: req.method,
      path: req.path,
      startedAt: Date.now(),
    },
    () => next(),
  );
}
