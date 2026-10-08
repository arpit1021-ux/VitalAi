import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { logger } from '../utils/logger.js';
import { captureException } from '../services/observability.js';

/**
 * Where a browser failure gets reported.
 *
 * Error tracking ran server-side only, which left the most user-visible
 * failure of all invisible: a render crash white-screens the app and nothing
 * anywhere records it. Reporting through the API rather than loading a
 * browser SDK keeps the reporting key out of the client entirely and adds
 * nothing to the bundle — the trade is less detail than a real SDK collects,
 * which is an acceptable price for knowing that it happened at all.
 *
 * Unauthenticated on purpose: the crashes worth hearing about include the ones
 * on the sign-in screen.
 */
const router = Router();

const clientErrorSchema = z
  .object({
    message: z.string().trim().min(1).max(500),
    name: z.string().trim().max(120).optional(),
    stack: z.string().max(4000).optional(),
    componentStack: z.string().max(4000).optional(),
    /** The in-app route, not a full URL: a query string could carry anything. */
    route: z.string().max(300).optional(),
    kind: z.enum(['render', 'window', 'promise']).default('render'),
  })
  .strict();

router.post(
  '/client-error',
  validate({ body: clientErrorSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const report = req.body as z.infer<typeof clientErrorSchema>;

    // Reconstructed as an Error so the tracker groups it like any other, with
    // the browser's stack rather than this handler's.
    const reported = new Error(`[client] ${report.message}`);
    reported.name = report.name ?? 'ClientError';
    reported.stack = report.stack ?? reported.stack;

    logger.error('Client-side failure reported', reported, {
      kind: report.kind,
      route: report.route,
      componentStack: report.componentStack,
      userAgent: req.get('user-agent'),
    });

    captureException(reported, { kind: report.kind, route: report.route });

    // Accepted rather than OK: nothing was created, and the client is not
    // waiting on anything.
    res.status(202).json({ received: true });
  }),
);

export default router;
