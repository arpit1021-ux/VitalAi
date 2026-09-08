import type { Request, Response } from 'express';
import { getRequestId } from './requestContext.js';

/** Terminal handler for API paths that matched no route. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: `No API endpoint matches ${req.method} ${req.path}.`,
    code: 'ROUTE_NOT_FOUND',
    action: 'Check the address, or return to the app and try the action again.',
    requestId: getRequestId(),
  });
}
