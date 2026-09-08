import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { unauthorized } from '../utils/AppError.js';
import { setContextUserId } from './requestContext.js';

export interface AccessTokenPayload {
  id: string;
  email: string;
  /** Bumped on the user document to invalidate every outstanding session. */
  v: number;
}

function verify(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_SECRET, {
    issuer: 'vitalai',
    audience: 'vitalai-app',
  }) as AccessTokenPayload;
}

/**
 * Rejects the request unless a valid, unexpired access token cookie is present.
 * Distinguishes "expired" from "malformed" so the client knows whether a silent
 * refresh is worth attempting.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.accessToken;

  if (!token) {
    next(unauthorized('You need to be signed in to do that.', 'Sign in and try again.'));
    return;
  }

  try {
    const payload = verify(token);
    req.jwtUser = { id: payload.id, email: payload.email };
    setContextUserId(payload.id);
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(
        unauthorized(
          'Your session expired.',
          'Refreshing your session now — if this keeps happening, sign in again.',
        ),
      );
      return;
    }

    next(unauthorized('Your session is no longer valid.', 'Sign in again to continue.'));
  }
}

/** Attaches the subject when a valid token is present, and continues either way. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.accessToken;
  if (!token) {
    next();
    return;
  }

  try {
    const payload = verify(token);
    req.jwtUser = { id: payload.id, email: payload.email };
    setContextUserId(payload.id);
  } catch {
    // An invalid token on an optional route is treated as "signed out".
  }

  next();
}
