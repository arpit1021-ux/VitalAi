/**
 * Request augmentation for the verified JWT subject.
 *
 * Populated by `authenticate` / `optionalAuth` only after signature
 * verification, so any handler reading `req.jwtUser` is reading a trusted
 * value, never client-supplied input.
 */
declare global {
  namespace Express {
    interface JwtUser {
      id: string;
      email: string;
    }

    interface Request {
      jwtUser?: JwtUser;
    }
  }
}

export {};
