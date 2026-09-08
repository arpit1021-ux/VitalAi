import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Forwards rejected promises to the error middleware.
 *
 * Express 4 does not await handlers, so an async handler that throws produces
 * an unhandled rejection and a request that hangs until the client times out.
 * Every async route in this codebase is wrapped so failures reach the error
 * handler and return a real message with a correlation ID.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
