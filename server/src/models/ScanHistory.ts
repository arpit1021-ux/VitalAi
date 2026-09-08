import mongoose, { Schema, Document, Model } from 'mongoose';
import { env } from '../config/env.js';

export interface IScanHistory extends Document {
  userId: mongoose.Types.ObjectId;
  profileId: mongoose.Types.ObjectId;
  type: 'food' | 'supplement' | 'medicine';
  imageUrl?: string;
  extractedText?: string;
  aiVerdict?: Record<string, any>;
  sourcesUsed: string[];
  ragUsed: boolean;
  ragSourceCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const scanHistorySchema = new Schema<IScanHistory>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
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
    ragUsed: {
      type: Boolean,
      default: false,
    },
    ragSourceCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Serves the history list and its pagination in one index.
// Scan history are kept for DATA_RETENTION_DAYS and then removed by MongoDB's
// TTL monitor. Keeping health-adjacent records indefinitely is a liability,
// not a feature; the window is configurable and applied by re-running migrations.
scanHistorySchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: env.DATA_RETENTION_DAYS * 24 * 60 * 60, name: 'retention_ttl' },
);

scanHistorySchema.index({ userId: 1, profileId: 1, createdAt: -1 });

// Replaces the unindexed $regex scan used by history search.
scanHistorySchema.index(
  { extractedText: 'text', 'aiVerdict.summary': 'text' },
  { name: 'scan_search', weights: { extractedText: 2, 'aiVerdict.summary': 1 } },
);

const ScanHistory: Model<IScanHistory> = mongoose.model<IScanHistory>(
  'ScanHistory',
  scanHistorySchema
);
export default ScanHistory;
