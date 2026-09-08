import type { NextFunction, Request, Response } from 'express';
import { assertWithinBudget, getBudgetStatus } from '../services/usage.js';
import { unauthorized } from '../utils/AppError.js';

/**
 * Refuses a request that would exceed the caller's daily token allowance, or
 * that arrives after the service-wide spend ceiling has been reached.
 *
 * Mounted on every route that can reach a model. A per-route request counter
 * is trivially sidestepped by using a different route; a shared token budget
 * checked here is not.
 */
export async function enforceAiBudget(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.jwtUser?.id;

  if (!userId) {
    next(unauthorized());
    return;
  }

  try {
    await assertWithinBudget(userId);

    // Surfaced so the client can warn before the user hits the wall rather
    // than only after.
    const status = await getBudgetStatus(userId);
    res.setHeader('X-AI-Budget-Input-Remaining', String(Math.max(0, status.inputLimit - status.inputUsed)));
    res.setHeader('X-AI-Budget-Output-Remaining', String(Math.max(0, status.outputLimit - status.outputUsed)));
    res.setHeader('X-AI-Budget-Reset-Seconds', String(status.resetsInSeconds));

    next();
  } catch (error) {
    next(error);
  }
}
