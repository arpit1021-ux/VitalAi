import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  email: string;
  passwordHash?: string;
  googleId?: string;
  /** Incremented to invalidate every outstanding token for this user. */
  authVersion: number;
  /**
   * What the user agreed to, and when. Health data is only processed once this
   * is recorded; the version lets a later policy change require fresh consent.
   */
  consent?: {
    version: string;
    healthDataAcceptedAt: Date;
  };
  /** SHA-256 of the active password-reset token. Single use. */
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: Date;
  profiles: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      select: false,
    },
    googleId: {
      // Sparse so the many local-only accounts with no googleId do not all
      // collide on null. Declaring it here creates the index; a separate
      // schema.index() call for the same field is a duplicate.
      type: String,
      index: true,
      sparse: true,
      unique: true,
    },
    consent: {
      version: { type: String },
      healthDataAcceptedAt: { type: Date },
    },
    passwordResetTokenHash: {
      type: String,
      select: false,
    },
    passwordResetExpiresAt: {
      type: Date,
      select: false,
    },
    authVersion: {
      type: Number,
      default: 0,
      required: true,
    },
    profiles: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Profile',
      },
    ],
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash') || !this.passwordHash) return next();
  const salt = await bcrypt.genSalt(12);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.passwordHash) return false;
  return bcrypt.compare(candidate, this.passwordHash);
};

const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);
export default User;
