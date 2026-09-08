import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { env, isProduction } from '../config/env.js';
import RefreshToken from '../models/RefreshToken.js';
import User, { type IUser } from '../models/User.js';
import { unauthorized } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

const TOKEN_ISSUER = 'vitalai';
const TOKEN_AUDIENCE = 'vitalai-app';

interface RefreshPayload {
  id: string;
  /** Rotation family, so a compromised chain can be revoked as a unit. */
  fid: string;
  /**
   * Unique per token.
   *
   * Without it, two tokens minted in the same second for the same family are
   * byte-identical — same claims, same iat, same exp — so the rotation writes a
   * hash that already exists and fails on the unique index. The token also has
   * to differ for rotation to mean anything.
   */
  jti: string;
  v: number;
}

const hash = (token: string): string => createHash('sha256').update(token).digest('hex');

function signAccessToken(user: IUser): string {
  return jwt.sign(
    { id: user._id.toString(), email: user.email, v: user.authVersion },
    env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL_SECONDS, issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE },
  );
}

function signRefreshToken(user: IUser, familyId: string): string {
  return jwt.sign(
    { id: user._id.toString(), fid: familyId, jti: randomUUID(), v: user.authVersion },
    env.JWT_REFRESH_SECRET,
    {
      expiresIn: REFRESH_TOKEN_TTL_SECONDS,
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    },
  );
}

/**
 * `secure` follows NODE_ENV so production cookies never travel over plain HTTP.
 * `sameSite: 'lax'` blocks cross-site POST, which stands in for a CSRF token
 * while the SPA and API share a site. A cross-site deployment must move to
 * 'none' and add one.
 */
function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds * 1000,
  };
}

/** Issues a fresh pair and records the refresh token. Starts a new family. */
export async function issueSession(res: Response, user: IUser): Promise<void> {
  const familyId = randomUUID();
  const refreshToken = signRefreshToken(user, familyId);

  await RefreshToken.create({
    userId: user._id,
    tokenHash: hash(refreshToken),
    familyId,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  });

  res.cookie('accessToken', signAccessToken(user), cookieOptions(ACCESS_TOKEN_TTL_SECONDS));
  res.cookie('refreshToken', refreshToken, cookieOptions(REFRESH_TOKEN_TTL_SECONDS));
}

export function clearSessionCookies(res: Response): void {
  const options = { httpOnly: true, secure: isProduction, sameSite: 'lax' as const, path: '/' };
  res.clearCookie('accessToken', options);
  res.clearCookie('refreshToken', options);
}

/** Revokes every token in one rotation chain. */
async function revokeFamily(familyId: string): Promise<void> {
  await RefreshToken.updateMany(
    { familyId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}

/**
 * Invalidates every session for a user everywhere.
 *
 * Bumping authVersion is what makes already-issued access tokens stop
 * verifying at their next refresh; revoking the stored rows stops the refresh
 * itself. Both are needed.
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  await Promise.all([
    User.updateOne({ _id: userId }, { $inc: { authVersion: 1 } }),
    RefreshToken.updateMany({ userId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } }),
  ]);
}

/**
 * Every refresh rejection returns the same message, so the endpoint cannot be
 * used to probe which tokens or accounts exist. The reason is recorded
 * server-side instead, against the request's correlation id.
 */
type RejectionReason =
  | 'no_token_presented'
  | 'signature_invalid_or_expired'
  | 'token_not_recognised'
  | 'user_no_longer_exists'
  | 'auth_version_superseded';

function rejectRefresh(reason: RejectionReason, context?: Record<string, unknown>): never {
  logger.warn('Refresh rejected', { reason, ...context });
  throw unauthorized(
    'Your session has ended.',
    'Sign in again to continue. Your data is unaffected.',
  );
}

/**
 * Exchanges a refresh token for a new pair, rotating it in the process.
 *
 * Presenting a token that exists but has already been rotated means it was
 * captured: the legitimate client would be holding its successor. That is
 * treated as a compromise — the entire family is revoked and every session for
 * the account is invalidated, so an attacker holding a stolen token cannot keep
 * refreshing it.
 */
export async function rotateSession(res: Response, presentedToken: string | undefined): Promise<IUser> {
  if (!presentedToken) rejectRefresh('no_token_presented');

  let payload: RefreshPayload;
  try {
    payload = jwt.verify(presentedToken, env.JWT_REFRESH_SECRET, {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    }) as RefreshPayload;
  } catch (error) {
    rejectRefresh('signature_invalid_or_expired', { detail: (error as Error).message });
  }

  const presentedHash = hash(presentedToken);
  const stored = await RefreshToken.findOne({ tokenHash: presentedHash });

  if (!stored) {
    // Never issued, or already pruned after expiry.
    rejectRefresh('token_not_recognised', { userId: payload.id, familyId: payload.fid });
  }

  if (stored.revokedAt) {
    logger.warn('Refresh token reuse detected; revoking all sessions', {
      userId: stored.userId.toString(),
      familyId: stored.familyId,
    });
    await revokeFamily(stored.familyId);
    await revokeAllSessions(stored.userId.toString());
    clearSessionCookies(res);
    throw unauthorized(
      'Your session was ended for security reasons.',
      'An old sign-in token was used again, so we signed out every device. Sign in again to continue.',
    );
  }

  const user = await User.findById(payload.id);
  if (!user) rejectRefresh('user_no_longer_exists', { userId: payload.id });

  // A password change or a sign-out-everywhere bumps authVersion, which
  // retires every token minted before it.
  if (payload.v !== user.authVersion) {
    await revokeFamily(stored.familyId);
    rejectRefresh('auth_version_superseded', {
      userId: user._id.toString(),
      tokenVersion: payload.v,
      currentVersion: user.authVersion,
    });
  }

  const nextToken = signRefreshToken(user, stored.familyId);
  const nextHash = hash(nextToken);

  stored.revokedAt = new Date();
  stored.replacedByHash = nextHash;
  await stored.save();

  await RefreshToken.create({
    userId: user._id,
    tokenHash: nextHash,
    familyId: stored.familyId,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  });

  res.cookie('accessToken', signAccessToken(user), cookieOptions(ACCESS_TOKEN_TTL_SECONDS));
  res.cookie('refreshToken', nextToken, cookieOptions(REFRESH_TOKEN_TTL_SECONDS));

  logger.info('Session rotated', { userId: user._id.toString(), familyId: stored.familyId });

  return user;
}

/** Revokes the chain the presented token belongs to. Used on sign-out. */
export async function revokePresentedSession(presentedToken: string | undefined): Promise<void> {
  if (!presentedToken) return;

  const stored = await RefreshToken.findOne({ tokenHash: hash(presentedToken) });
  if (stored) await revokeFamily(stored.familyId);
}

export const hashToken = hash;
