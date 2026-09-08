import mongoose, { Schema, Document, Model } from 'mongoose';
import { decryptString, encryptString } from '../services/encryption.js';

export interface IProfile extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  age?: number;
  gender?: 'male' | 'female' | 'other';
  avatar?: string;
  dietType?: 'vegetarian' | 'vegan' | 'eggetarian' | 'non-veg' | 'jain' | 'keto' | 'diabetic-friendly';
  allergies: string[];
  conditions: string[];
  medications: { name: string; dosage: string }[];
  fitnessGoal?: 'weight-loss' | 'muscle-gain' | 'maintenance' | 'endurance';
  activityLevel?: 'sedentary' | 'lightly-active' | 'active' | 'very-active';
  createdAt: Date;
  updatedAt: Date;
}

const profileSchema = new Schema<IProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    age: {
      type: Number,
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
    },
    avatar: {
      type: String,
    },
    dietType: {
      type: String,
      enum: ['vegetarian', 'vegan', 'eggetarian', 'non-veg', 'jain', 'keto', 'diabetic-friendly'],
    },
    allergies: [
      {
        type: String,
      },
    ],
    conditions: [
      {
        type: String,
      },
    ],
    medications: [
      {
        name: { type: String },
        dosage: { type: String },
      },
    ],
    fitnessGoal: {
      type: String,
      enum: ['weight-loss', 'muscle-gain', 'maintenance', 'endurance'],
    },
    activityLevel: {
      type: String,
      enum: ['sedentary', 'lightly-active', 'active', 'very-active'],
    },
  },
  { timestamps: true }
);

// Every ownership check filters on userId; without this it is a collection scan.
profileSchema.index({ userId: 1, createdAt: 1 });

/**
 * Health fields are encrypted at rest.
 *
 * These are the values that make a VitalAI profile sensitive: what someone is
 * allergic to, what they have been diagnosed with, what they take for it. They
 * are encrypted on the way into the database and decrypted on the way out, so
 * application code reads and writes plain strings and nothing else has to know.
 *
 * None of these fields is ever queried or sorted on, which is what makes
 * transparent encryption viable here.
 */
const ENCRYPTED_ARRAY_PATHS = ['allergies', 'conditions'] as const;

function transformProfile(
  doc: Record<string, unknown>,
  transform: (value: string) => string,
): void {
  for (const path of ENCRYPTED_ARRAY_PATHS) {
    const values = doc[path];
    if (Array.isArray(values)) {
      doc[path] = values.map((entry) => (typeof entry === 'string' ? transform(entry) : entry));
    }
  }

  const medications = doc.medications;
  if (Array.isArray(medications)) {
    for (const medication of medications as { name?: string; dosage?: string }[]) {
      if (typeof medication?.name === 'string') medication.name = transform(medication.name);
      if (typeof medication?.dosage === 'string') medication.dosage = transform(medication.dosage);
    }
  }
}

profileSchema.pre('save', function encryptHealthFields(next) {
  transformProfile(this as unknown as Record<string, unknown>, encryptString);
  next();
});

// Runs when a document is hydrated from the database, before any application
// code sees it.
profileSchema.post('init', function decryptHealthFields(this: IProfile) {
  transformProfile(this as unknown as Record<string, unknown>, decryptString);
});

const Profile: Model<IProfile> = mongoose.model<IProfile>('Profile', profileSchema);
export default Profile;
