import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IScanHistory extends Document {
  profileId: mongoose.Types.ObjectId;
  type: 'food' | 'supplement' | 'medicine';
  imageUrl?: string;
  extractedText?: string;
  aiVerdict?: Record<string, any>;
  sourcesUsed: string[];
  createdAt: Date;
  updatedAt: Date;
}

const scanHistorySchema = new Schema<IScanHistory>(
  {
    profileId: {
      type: Schema.Types.ObjectId,
      ref: 'Profile',
      required: true,
    },
    type: {
      type: String,
      enum: ['food', 'supplement', 'medicine'],
      required: true,
    },
    imageUrl: {
      type: String,
    },
    extractedText: {
      type: String,
    },
    aiVerdict: {
      type: Schema.Types.Mixed,
    },
    sourcesUsed: [
      {
        type: String,
      },
    ],
  },
  { timestamps: true }
);

const ScanHistory: Model<IScanHistory> = mongoose.model<IScanHistory>(
  'ScanHistory',
  scanHistorySchema
);
export default ScanHistory;
