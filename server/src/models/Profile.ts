import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IProfile extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  age?: number;
  gender?: 'male' | 'female' | 'other';
  avatar?: string;
  dietType?: 'vegetarian' | 'vegan' | 'non-veg' | 'jain' | 'keto' | 'diabetic-friendly';
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
      enum: ['vegetarian', 'vegan', 'non-veg', 'jain', 'keto', 'diabetic-friendly'],
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

const Profile: Model<IProfile> = mongoose.model<IProfile>('Profile', profileSchema);
export default Profile;
