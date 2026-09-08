import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPantryItem extends Document {
  profileId: mongoose.Types.ObjectId;
  name: string;
  quantity?: number;
  unit?: string;
  category?: string;
  expiryDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const pantryItemSchema = new Schema<IPantryItem>(
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
    quantity: {
      type: Number,
    },
    unit: {
      type: String,
    },
    category: {
      type: String,
      enum: ['grains', 'dairy', 'produce', 'protein', 'spices', 'other'],
      default: 'other',
    },
    expiryDate: {
      type: Date,
    },
  },
  { timestamps: true }
);

pantryItemSchema.index({ profileId: 1, name: 1 });

const PantryItem: Model<IPantryItem> = mongoose.model<IPantryItem>(
  'PantryItem',
  pantryItemSchema
);
export default PantryItem;
