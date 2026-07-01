import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { queryClaude } from '../services/claude.js';
import { parseClaudeJson } from '../utils/parseClaudeJson.js';
import CommunityPost from '../models/CommunityPost.js';
import Profile from '../models/Profile.js';
import User from '../models/User.js';

const router = Router();

router.use(authenticate);

const createPostSchema = z.object({
  profileId: z.string(),
  type: z.enum(['nuskha', 'recipe', 'motivation']),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(2000),
  condition: z.string().optional(),
  dietaryTags: z.array(z.string()).optional(),
});

async function moderatePost(content: string, type: string): Promise<{ approved: boolean; note?: string }> {
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

    const response = await queryClaude({
      systemPrompt,
      userMessage: `Post type: ${type}\nContent: ${content}`,
    });

    return parseClaudeJson<{ approved: boolean; note?: string }>(
      response,
      { approved: true }
    );
  } catch {
    return { approved: true };
  }
}

router.get('/feed', async (req: Request, res: Response) => {
  try {
    const { sort = 'recent', page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const query: any = { status: 'published' };
    const sortOption: any = sort === 'trending'
      ? { likes: -1, createdAt: -1 }
      : { createdAt: -1 };

    const posts = await CommunityPost.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum)
      .populate('profileId', 'name avatar')
      .populate('userId', 'email');

    const total = await CommunityPost.countDocuments(query);

    const enrichedPosts = posts.map((post) => ({
      _id: post._id,
      type: post.type,
      title: post.title,
      content: post.content,
      condition: post.condition,
      dietaryTags: post.dietaryTags,
      imageUrl: post.imageUrl,
      likes: post.likes.length,
      commentCount: post.commentCount,
      isLiked: post.likes.includes((req as any).jwtUser!.id),
      author: {
        name: (post.profileId as any)?.name || 'Anonymous',
        avatar: (post.profileId as any)?.avatar || '👤',
      },
      createdAt: post.createdAt,
    }));

    res.json({ posts: enrichedPosts, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = createPostSchema.parse(req.body);

    const profile = await Profile.findOne({
      _id: data.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const moderation = await moderatePost(data.content, data.type);

    const post = await CommunityPost.create({
      userId: (req as any).jwtUser!.id,
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

router.post('/:id/like', async (req: Request, res: Response) => {
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    const userId = (req as any).jwtUser!.id;
    const index = post.likes.indexOf(userId);
    if (index > -1) {
      post.likes.splice(index, 1);
    } else {
      post.likes.push(userId);
    }
    await post.save();

    res.json({ likes: post.likes.length, isLiked: index === -1 });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    if (post.userId.toString() !== (req as any).jwtUser!.id) {
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
    const posts = await CommunityPost.find({ userId: (req as any).jwtUser!.id })
      .sort({ createdAt: -1 })
      .populate('profileId', 'name avatar');

    const enrichedPosts = posts.map((post) => ({
      _id: post._id,
      type: post.type,
      title: post.title,
      content: post.content,
      status: post.status,
      moderationNote: post.moderationNote,
      likes: post.likes.length,
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
