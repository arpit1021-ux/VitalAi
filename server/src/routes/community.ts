import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { generateText } from '../services/llm.js';
import { clampUntrusted } from '../services/promptSafety.js';
import { parseJsonResponse } from '../utils/parseJsonResponse.js';
import CommunityPost from '../models/CommunityPost.js';
import Profile from '../models/Profile.js';
import { objectId, validate } from '../middleware/validate.js';

const feedQuerySchema = z.object({
  sort: z.enum(['recent', 'trending']).default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const router = Router();

router.use(authenticate);

const createPostSchema = z.object({
  profileId: z.string(),
  type: z.enum(['nuskha', 'recipe', 'motivation']),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(2000),
  condition: z.string().optional(),
  dietaryTags: z.array(z.string()).optional(),
}).strict();

async function moderatePost(
  content: string,
  type: string,
  userId: string,
): Promise<{ approved: boolean; note?: string }> {
  try {
    const systemPrompt = `You are a content moderator for a health community. Review this post for potentially harmful medical advice.

Rules:
- Posts giving specific medical dosage advice should be flagged
- Posts claiming to cure diseases should be flagged
- Posts with dangerous remedies (e.g. "stop taking your medication") should be rejected
- General wellness tips, home remedies, and recipe sharing are fine
- Language should be accessible to general audience

Respond with ONLY the JSON object, no preamble, no explanation, no markdown fencing.

Return JSON: { "approved": true/false, "note": "reason if flagged" }`;

    const response = await generateText({
      userId,
      operation: 'community.moderate',
      systemPrompt,
      userMessage: 'Decide whether the post in <post_content> should be published.',
      untrusted: [
        { label: 'post_type', content: type },
        { label: 'post_content', content: clampUntrusted(content, 3000) },
      ],
      maxOutputTokens: 256,
    });

    return parseJsonResponse<{ approved: boolean; note?: string }>(
      response,
      { approved: true }
    );
  } catch {
    return { approved: true };
  }
}

router.get('/feed', validate({ query: feedQuerySchema }), async (req: Request, res: Response) => {
  try {
    const viewerId = new mongoose.Types.ObjectId(req.jwtUser!.id);
    const { sort, page, limit } = req.query as unknown as z.infer<typeof feedQuerySchema>;
    const skip = (page - 1) * limit;

    const query: any = { status: 'published' };
    const sortOption: any = sort === 'trending'
      ? { likeCount: -1, createdAt: -1 }
      : { createdAt: -1 };

    const posts = await CommunityPost.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .populate('profileId', 'name avatar');

    const total = await CommunityPost.countDocuments(query);

    const enrichedPosts = posts.map((post) => ({
      _id: post._id,
      type: post.type,
      title: post.title,
      content: post.content,
      condition: post.condition,
      dietaryTags: post.dietaryTags,
      imageUrl: post.imageUrl,
      likes: post.likeCount,
      commentCount: post.commentCount,
      isLiked: post.likes.some((id) => id.equals(viewerId)),
      author: {
        name: (post.profileId as any)?.name || 'Anonymous',
        avatar: (post.profileId as any)?.avatar || '👤',
      },
      createdAt: post.createdAt,
    }));

    res.json({ posts: enrichedPosts, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = createPostSchema.parse(req.body);

    const profile = await Profile.findOne({
      _id: data.profileId,
      userId: req.jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const moderation = await moderatePost(data.content, data.type, req.jwtUser!.id);

    const post = await CommunityPost.create({
      userId: req.jwtUser!.id,
      profileId: data.profileId,
      type: data.type,
      title: data.title,
      content: data.content,
      condition: data.condition,
      dietaryTags: data.dietaryTags,
      status: moderation.approved ? 'published' : 'pending_review',
      moderationNote: moderation.note,
    });

    res.status(201).json({
      post: {
        _id: post._id,
        type: post.type,
        title: post.title,
        content: post.content,
        status: post.status,
        moderationNote: post.moderationNote,
        createdAt: post.createdAt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    res.status(500).json({ error: 'Failed to create post' });
  }
});

router.post('/:id/like', validate({ params: z.object({ id: objectId }) }), async (req: Request, res: Response) => {
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    const userId = new mongoose.Types.ObjectId(req.jwtUser!.id);
    const index = post.likes.findIndex((id) => id.equals(userId));
    const liking = index === -1;

    if (liking) {
      post.likes.push(userId);
    } else {
      post.likes.splice(index, 1);
    }
    post.likeCount = post.likes.length;
    await post.save();

    res.json({ likes: post.likeCount, isLiked: liking });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

router.delete('/:id', validate({ params: z.object({ id: objectId }) }), async (req: Request, res: Response) => {
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    if (post.userId.toString() !== req.jwtUser!.id) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    await CommunityPost.findByIdAndDelete(req.params.id);
    res.json({ message: 'Post deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

router.get('/my-posts', async (req: Request, res: Response) => {
  try {
    const posts = await CommunityPost.find({ userId: req.jwtUser!.id })
      .sort({ createdAt: -1 })
      .populate('profileId', 'name avatar');

    const enrichedPosts = posts.map((post) => ({
      _id: post._id,
      type: post.type,
      title: post.title,
      content: post.content,
      status: post.status,
      moderationNote: post.moderationNote,
      likes: post.likeCount,
      commentCount: post.commentCount,
      author: {
        name: (post.profileId as any)?.name || 'Anonymous',
        avatar: (post.profileId as any)?.avatar || '👤',
      },
      createdAt: post.createdAt,
    }));

    res.json({ posts: enrichedPosts });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

export default router;
