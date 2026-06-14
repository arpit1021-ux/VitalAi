import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IFamilyInsight extends Document {
  userId: mongoose.Types.ObjectId;
  insights: Record<string, any>;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const familyInsightSchema = new Schema<IFamilyInsight>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    insights: {
      type: Schema.Types.Mixed,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const FamilyInsight: Model<IFamilyInsight> = mongoose.model<IFamilyInsight>(
  'FamilyInsight',
  familyInsightSchema
);
export default FamilyInsight;
