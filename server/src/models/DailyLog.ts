import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDailyLog extends Document {
  profileId: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD
  waterCount: number;
  waterGoal: number;
  plateGroups: {
    veg: boolean;
    fruit: boolean;
    protein: boolean;
    grains: boolean;
    dairy: boolean;
  };
  plateEntries: {
    veg?: string;
    fruit?: string;
    protein?: string;
    grains?: string;
    dairy?: string;
  };
  challenge: {
    text: string;
    completed: boolean;
  } | null;
  streakDay: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const dailyLogSchema = new Schema<IDailyLog>(
  {
    profileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    date: { type: String, required: true },
    waterCount: { type: Number, default: 0 },
    waterGoal: { type: Number, default: 8 },
    plateGroups: {
      veg: { type: Boolean, default: false },
      fruit: { type: Boolean, default: false },
      protein: { type: Boolean, default: false },
      grains: { type: Boolean, default: false },
      dairy: { type: Boolean, default: false },
    },
    plateEntries: {
      veg: { type: String },
      fruit: { type: String },
      protein: { type: String },
      grains: { type: String },
      dairy: { type: String },
    },
    challenge: {
      text: { type: String },
      completed: { type: Boolean, default: false },
    },
    streakDay: { type: Boolean, default: false },
  },
  { timestamps: true }
);

dailyLogSchema.index({ profileId: 1, date: 1 }, { unique: true });

const DailyLog: Model<IDailyLog> = mongoose.model<IDailyLog>('DailyLog', dailyLogSchema);
export default DailyLog;
