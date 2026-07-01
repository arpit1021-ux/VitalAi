import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IHealthInsight extends Document {
  profileId: mongoose.Types.ObjectId;
  insights: string[];
  generatedAt: Date;
  weekOf: string;
}

const healthInsightSchema = new Schema<IHealthInsight>(
  {
    profileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    insights: [{ type: String, required: true }],
    generatedAt: { type: Date, default: Date.now },
    weekOf: { type: String, required: true },
  },
  { timestamps: true }
);

healthInsightSchema.index({ profileId: 1, weekOf: 1 }, { unique: true });

const HealthInsight: Model<IHealthInsight> = mongoose.model<IHealthInsight>(
  'HealthInsight',
  healthInsightSchema
);
export default HealthInsight;
