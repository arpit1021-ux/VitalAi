import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISavedRecipe extends Document {
  profileId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  emoji?: string;
  prepTime?: string;
  serves?: string;
  dietaryTags: string[];
  ingredients: string[];
  instructions: string[];
  healthBenefits?: string;
  nutrition?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
  source: 'dinner-ideas' | 'pantry' | 'manual';
  createdAt: Date;
  updatedAt: Date;
}

const savedRecipeSchema = new Schema<ISavedRecipe>(
  {
    profileId: {
      type: Schema.Types.ObjectId,
      ref: 'Profile',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: { type: String },
    emoji: { type: String },
    prepTime: { type: String },
    serves: { type: String },
    dietaryTags: [{ type: String }],
    ingredients: [{ type: String }],
    instructions: [{ type: String }],
    healthBenefits: { type: String },
    nutrition: {
      calories: { type: Number },
      protein: { type: Number },
      carbs: { type: Number },
      fat: { type: Number },
    },
    source: {
      type: String,
      enum: ['dinner-ideas', 'pantry', 'manual'],
      default: 'manual',
    },
  },
  { timestamps: true }
);

savedRecipeSchema.index({ profileId: 1, name: 1 });

const SavedRecipe: Model<ISavedRecipe> = mongoose.model<ISavedRecipe>(
  'SavedRecipe',
  savedRecipeSchema
);
export default SavedRecipe;
