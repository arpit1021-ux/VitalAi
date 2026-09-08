import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { deleteAccount, exportAccount } from '../services/accountData.js';
import { clearSessionCookies } from '../services/tokens.js';
import User from '../models/User.js';

const router = Router();

router.use(authenticate);

/** What the user has agreed to, and whether it is still current. */
router.get(
  '/consent',
  asyncHandler(async (req: Request, res: Response) => {
    const user = await User.findById(req.jwtUser!.id, { consent: 1 });
    if (!user) throw notFound('Your account');

    res.json({
      currentVersion: env.CONSENT_VERSION,
      accepted: user.consent ?? null,
      // A policy change retires earlier consent rather than assuming it carries
      // over, so the user is asked again before health data is processed.
      upToDate: user.consent?.version === env.CONSENT_VERSION,
    });
  }),
);

router.post(
  '/consent',
  validate({
    body: z.object({
      version: z.string().min(1),
      acceptHealthDataProcessing: z.literal(true, {
        errorMap: () => ({
          message: 'Consent to health data processing is required to use VitalAI.',
        }),
      }),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { version } = req.body as { version: string };

    if (version !== env.CONSENT_VERSION) {
      throw badRequest(
        'The terms have been updated since this page was opened.',
        'Reload the page and read the current version before accepting.',
      );
    }

    const user = await User.findByIdAndUpdate(
      req.jwtUser!.id,
      { $set: { consent: { version, healthDataAcceptedAt: new Date() } } },
      { new: true, projection: { consent: 1 } },
    );

    if (!user) throw notFound('Your account');

    logger.info('Consent recorded', { userId: req.jwtUser!.id, version });

    res.json({ consent: user.consent });
  }),
);

/**
 * Everything held about the account, as a downloadable file.
 *
 * Sent as an attachment with no-store, because the response contains health
 * information in plain text and should not sit in a browser or proxy cache.
 */
router.get(
  '/export',
  asyncHandler(async (req: Request, res: Response) => {
    const payload = await exportAccount(req.jwtUser!.id);
    const filename = `vitalai-export-${new Date().toISOString().slice(0, 10)}.json`;

    logger.info('Account exported', { userId: req.jwtUser!.id });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(JSON.stringify(payload, null, 2));
  }),
);

/**
 * Permanent erasure.
 *
 * Requires the account's email typed back, so this cannot happen by a
 * mis-click or a forged cross-site request. There is no soft-delete and no
 * grace period: the user asked for the data to be gone.
 */
router.delete(
  '/',
  validate({
    body: z.object({
      confirmEmail: z.string().trim().toLowerCase().email(),
      understandPermanent: z.literal(true, {
        errorMap: () => ({ message: 'Confirm that you understand this cannot be undone.' }),
      }),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { confirmEmail } = req.body as { confirmEmail: string };

    const user = await User.findById(req.jwtUser!.id);
    if (!user) throw notFound('Your account');

    if (user.email !== confirmEmail) {
      throw badRequest(
        'That email address does not match this account.',
        'Type the address you sign in with, exactly as it appears.',
        { confirmEmail: 'This does not match the account email.' },
      );
    }

    const summary = await deleteAccount(user._id.toString());
    clearSessionCookies(res);

    res.json({
      message: 'Your account and all of its data have been deleted.',
      action: 'Nothing further is required. You can close this page.',
      removed: summary.deleted,
      imagesRemoved: summary.imagesRemoved,
    });
  }),
);

export default router;
