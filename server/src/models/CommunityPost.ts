import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICommunityPost extends Document {
  userId: mongoose.Types.ObjectId;
  profileId: mongoose.Types.ObjectId;
  type: 'nuskha' | 'recipe' | 'motivation';
  title: string;
  content: string;
  condition?: string;
  dietaryTags?: string[];
  imageUrl?: string;
  likes: mongoose.Types.ObjectId[];
  /** Denormalised length of `likes`; sorting an array field does not rank by popularity. */
  likeCount: number;
  commentCount: number;
  status: 'published' | 'pending_review' | 'rejected';
  moderationNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const communityPostSchema = new Schema<ICommunityPost>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    profileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    type: { type: String, enum: ['nuskha', 'recipe', 'motivation'], required: true },
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    condition: { type: String },
    dietaryTags: [{ type: String }],
    imageUrl: { type: String },
    likes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    likeCount: { type: Number, default: 0, min: 0 },
    commentCount: { type: Number, default: 0 },
    status: { type: String, enum: ['published', 'pending_review', 'rejected'], default: 'published' },
    moderationNote: { type: String },
  },
  { timestamps: true }
);

communityPostSchema.index({ createdAt: -1 });
communityPostSchema.index({ status: 1, createdAt: -1 });
communityPostSchema.index({ status: 1, likeCount: -1, createdAt: -1 });
communityPostSchema.index({ userId: 1, createdAt: -1 });

const CommunityPost: Model<ICommunityPost> = mongoose.model<ICommunityPost>(
  'CommunityPost',
  communityPostSchema
);
export default CommunityPost;
