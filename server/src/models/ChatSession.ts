import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  ragUsed?: boolean;
  ragSourceCount?: number;
}

export interface IChatSession extends Document {
  profileId: mongoose.Types.ObjectId;
  title: string;
  messages: IChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const chatSessionSchema = new Schema<IChatSession>(
  {
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

const ChatSession: Model<IChatSession> = mongoose.model<IChatSession>(
  'ChatSession',
  chatSessionSchema
);
export default ChatSession;
