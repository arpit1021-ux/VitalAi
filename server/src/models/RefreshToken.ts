import mongoose, { Schema, type Document, type Model } from 'mongoose';

/**
 * One issued refresh token.
 *
 * Tokens live in their own collection rather than an array on the user so the
 * set cannot grow unbounded on a hot document, and so MongoDB's TTL monitor can
 * prune expired rows without application code.
 *
 * Rotated tokens are kept, marked revoked, until they expire. That retention is
 * what makes reuse detectable: presenting a token that exists but is already
 * revoked means the token was captured after rotation, and the whole family is
 * then destroyed.
 */
export interface IRefreshToken extends Document {
  userId: mongoose.Types.ObjectId;
  /** SHA-256 of the JWT. The token itself is never stored. */
  tokenHash: string;
  /** Constant across one rotation chain, so a compromised chain can be revoked whole. */
  familyId: string;
  expiresAt: Date;
  revokedAt?: Date;
  /** Hash of the token that superseded this one, for audit. */
  replacedByHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    familyId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    replacedByHash: { type: String },
  },
  { timestamps: true },
);

// MongoDB removes each row once expiresAt passes, so revoked and expired
// tokens do not accumulate.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RefreshToken: Model<IRefreshToken> = mongoose.model<IRefreshToken>(
  'RefreshToken',
  refreshTokenSchema,
);

export default RefreshToken;
