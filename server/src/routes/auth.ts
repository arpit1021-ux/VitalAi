import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User, { type IUser } from '../models/User.js';
import { env, googleCallbackUrl, googleOAuthEnabled } from '../config/env.js';
import { authenticate } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, notFound, unauthorized } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { sendEmail } from '../services/email.js';
import {
  clearSessionCookies,
  hashToken,
  issueSession,
  revokeAllSessions,
  revokePresentedSession,
  rotateSession,
} from '../services/tokens.js';

const router = Router();

function publicUser(user: IUser) {
  return { id: user._id.toString(), email: user.email, profiles: user.profiles };
}

if (googleOAuthEnabled) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID as string,
        clientSecret: env.GOOGLE_CLIENT_SECRET as string,
        callbackURL: googleCallbackUrl,
        passReqToCallback: false,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) {
            done(new Error('Google account did not provide an email address'));
            return;
          }

          let user = await User.findOne({ googleId: profile.id });

          if (!user) {
            // Link to an existing local account with the same address rather
            // than creating a duplicate user.
            user = await User.findOne({ email });
            if (user) {
              user.googleId = profile.id;
              await user.save();
            } else {
              user = await User.create({ email, googleId: profile.id });
            }
          }

          done(null, user);
        } catch (error) {
          done(error as Error);
        }
      },
    ),
  );
}

const emailField = z
  .string({ required_error: 'Enter your email address.' })
  .trim()
  .toLowerCase()
  .email('That does not look like a valid email address.')
  .max(254);

const passwordField = z
  .string({ required_error: 'Enter your password.' })
  .min(8, 'Passwords must be at least 8 characters.')
  .max(200, 'Passwords must be 200 characters or fewer.')
  .refine((value) => /[a-zA-Z]/.test(value), 'Passwords must contain at least one letter.')
  .refine((value) => /[0-9]/.test(value), 'Passwords must contain at least one number.');

const credentialsSchema = z.object({ email: emailField, password: passwordField });

// Sign-in accepts any non-empty password: the strength rules apply when a
// password is set, and enforcing them here would tell an attacker which stored
// passwords are weak.
const signInSchema = z.object({
  email: emailField,
  password: z.string({ required_error: 'Enter your password.' }).min(1, 'Enter your password.').max(200),
});

router.post(
  '/register',
  authRateLimiter,
  validate({ body: credentialsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body as z.infer<typeof credentialsSchema>;

    const existing = await User.findOne({ email });
    if (existing) {
      throw badRequest(
        'An account already exists for that email address.',
        'Sign in instead, or use a different address.',
        { email: 'This address is already registered.' },
      );
    }

    const user = await User.create({ email, passwordHash: password });
    await issueSession(res, user);

    logger.info('Account created', { userId: user._id.toString() });
    res.status(201).json({ user: publicUser(user) });
  }),
);

router.post(
  '/login',
  authRateLimiter,
  validate({ body: signInSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body as z.infer<typeof signInSchema>;

    const user = await User.findOne({ email }).select('+passwordHash');

    // One response for both "no such account" and "wrong password", so the
    // endpoint cannot be used to discover which addresses are registered.
    const invalid = unauthorized(
      'That email address and password do not match.',
      'Check both and try again, or reset your password.',
    );

    if (!user?.passwordHash) throw invalid;
    if (!(await user.comparePassword(password))) throw invalid;

    await issueSession(res, user);
    logger.info('Sign-in succeeded', { userId: user._id.toString() });
    res.json({ user: publicUser(user) });
  }),
);

/**
 * Exchanges the refresh cookie for a new pair.
 *
 * The client calls this transparently when an access token expires, so a
 * signed-in user is never bounced to the sign-in screen mid-task.
 */
router.post(
  '/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const user = await rotateSession(res, req.cookies?.refreshToken);
    res.json({ user: publicUser(user) });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req: Request, res: Response) => {
    await revokePresentedSession(req.cookies?.refreshToken);
    clearSessionCookies(res);
    res.json({ message: 'Signed out.' });
  }),
);

/** Signs out every device. Used after a password change or a suspected compromise. */
router.post(
  '/logout-all',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    await revokeAllSessions(req.jwtUser!.id);
    clearSessionCookies(res);
    logger.info('All sessions revoked', { userId: req.jwtUser!.id });
    res.json({ message: 'Signed out on every device.' });
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await User.findById(req.jwtUser!.id).populate('profiles');
    if (!user) throw notFound('Your account');
    res.json({ user: publicUser(user) });
  }),
);

const RESET_TOKEN_BYTES = 32;

router.post(
  '/password/forgot',
  authRateLimiter,
  validate({ body: z.object({ email: emailField }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body as { email: string };
    const user = await User.findOne({ email });

    if (user) {
      const token = randomBytes(RESET_TOKEN_BYTES).toString('hex');

      user.passwordResetTokenHash = hashToken(token);
      user.passwordResetExpiresAt = new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
      await user.save();

      const link = `${env.APP_URL}/reset-password?token=${token}`;

      try {
        await sendEmail({
          to: user.email,
          subject: 'Reset your VitalAI password',
          text: [
            'Someone asked to reset the password for this VitalAI account.',
            '',
            `Open this link to choose a new one: ${link}`,
            '',
            `The link works once and expires in ${env.PASSWORD_RESET_TTL_MINUTES} minutes.`,
            'If this was not you, no action is needed — your password has not changed.',
          ].join('\n'),
        });
      } catch (error) {
        // Delivery failure is logged, not returned: telling the caller would
        // reveal that the address is registered.
        logger.error('Password reset email failed to send', error, { userId: user._id.toString() });
      }
    }

    // Identical response either way.
    res.json({
      message: 'If that address has an account, a reset link is on its way.',
      action: 'Check your inbox, including the spam folder. The link expires shortly.',
    });
  }),
);

router.post(
  '/password/reset',
  authRateLimiter,
  validate({
    body: z.object({
      token: z.string({ required_error: 'The reset link is incomplete.' }).length(
        RESET_TOKEN_BYTES * 2,
        'That reset link is not valid.',
      ),
      password: passwordField,
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { token, password } = req.body as { token: string; password: string };

    const user = await User.findOne({
      passwordResetTokenHash: hashToken(token),
      passwordResetExpiresAt: { $gt: new Date() },
    }).select('+passwordResetTokenHash +passwordResetExpiresAt');

    if (!user) {
      throw badRequest(
        'That reset link has expired or has already been used.',
        'Request a new link from the sign-in page.',
      );
    }

    // The pre-save hook hashes this before it is written.
    user.passwordHash = password;
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    await user.save();

    // A password change invalidates every existing session, on the assumption
    // that the reason for the reset may be that someone else had access.
    await revokeAllSessions(user._id.toString());
    clearSessionCookies(res);

    logger.info('Password reset completed', { userId: user._id.toString() });

    res.json({
      message: 'Your password has been changed.',
      action: 'Sign in with your new password. Any other devices have been signed out.',
    });
  }),
);

if (googleOAuthEnabled) {
  router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

  router.get(
    '/google/callback',
    passport.authenticate('google', {
      failureRedirect: `${env.APP_URL}/login?error=google_signin_failed`,
      session: false,
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const user = req.user as IUser;
      await issueSession(res, user);
      logger.info('Google sign-in succeeded', { userId: user._id.toString() });
      res.redirect(env.APP_URL);
    }),
  );
} else {
  router.get('/google', (_req: Request, res: Response) => {
    res.redirect(`${env.APP_URL}/login?error=google_unavailable`);
  });
}

export default router;
