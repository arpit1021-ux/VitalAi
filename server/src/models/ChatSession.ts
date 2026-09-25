import mongoose, { Schema, Document, Model } from 'mongoose';
import { env } from '../config/env.js';

export interface IChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  ragUsed?: boolean;
  ragSourceCount?: number;
}

export interface IChatSession extends Document {
  userId: mongoose.Types.ObjectId;
  profileId: mongoose.Types.ObjectId;
  title: string;
  messages: IChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const chatSessionSchema = new Schema<IChatSession>(
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
    title: {
      type: String,
      default: 'New Chat',
    },
    messages: [
      {
        role: {
          type: String,
          enum: ['user', 'assistant'],
        },
        content: {
          type: String,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        ragUsed: {
          type: Boolean,
          default: false,
        },
        ragSourceCount: {
          type: Number,
          default: 0,
        },
      },
    ],
  },
  { timestamps: true }
);

// Chat transcripts are kept for DATA_RETENTION_DAYS and then removed by MongoDB's
// TTL monitor. Keeping health-adjacent records indefinitely is a liability,
// not a feature; the window is configurable and applied by re-running migrations.
chatSessionSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: env.DATA_RETENTION_DAYS * 24 * 60 * 60, name: 'retention_ttl' },
);

// Same correction as ScanHistory: the session list filters on profileId
// alone, so an index led by userId could never be used for it.
chatSessionSchema.index({ profileId: 1, updatedAt: -1, userId: 1 });

const ChatSession: Model<IChatSession> = mongoose.model<IChatSession>(
  'ChatSession',
  chatSessionSchema
);
export default ChatSession;
