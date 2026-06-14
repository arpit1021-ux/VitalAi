import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { searchKnowledgeBase } from '../services/rag.js';
import { queryClaude } from '../services/claude.js';
import Profile from '../models/Profile.js';
import ScanHistory from '../models/ScanHistory.js';
import PantryItem from '../models/PantryItem.js';

const router = Router();

router.use(authenticate);

router.get('/:profileId', async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const scanCount = await ScanHistory.countDocuments({
      profileId: profile._id,
    });

    const medicineScans = await ScanHistory.countDocuments({
      profileId: profile._id,
      type: 'medicine',
    });

    const expiringItems = await PantryItem.find({
      profileId: profile._id,
      expiryDate: {
        $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        $gte: new Date(),
      },
    });

    const lastScans = await ScanHistory.find({ profileId: profile._id })
      .sort({ createdAt: -1 })
      .limit(5);

    const getGreeting = (): string => {
      const hour = new Date().getHours();
      if (hour < 12) return 'Good morning';
      if (hour < 17) return 'Good afternoon';
      return 'Good evening';
    };

    res.json({
      greeting: `${getGreeting()}, ${profile.name}!`,
      scanCount,
      medicineScans,
      expiringItems: expiringItems.length,
      expiringItemsList: expiringItems.map((i) => ({
        name: i.name,
        expiryDate: i.expiryDate,
      })),
      lastScans: lastScans.map((s) => ({
        type: s.type,
        verdict: s.aiVerdict,
        createdAt: s.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

const tipCache = new Map<string, { tip: string; date: string }>();

router.get('/tip/:profileId', async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `${profile._id}-${today}`;

    const cached = tipCache.get(cacheKey);
    if (cached) {
      res.json({ tip: cached.tip, cached: true });
      return;
    }

    const profileContext = `
      Diet Type: ${profile.dietType || 'Not specified'}
      Conditions: ${profile.conditions?.join(', ') || 'None'}
      Fitness Goal: ${profile.fitnessGoal || 'Not specified'}
      Activity Level: ${profile.activityLevel || 'Not specified'}
    `;

    const ragResults = await searchKnowledgeBase(
      `daily health tip wellness ${profile.fitnessGoal || ''} ${profile.dietType || ''}`
    );

    const contextChunks = ragResults
      .map((r) => `[Source: ${r.metadata.source}] ${r.text}`)
      .join('\n\n');

    const systemPrompt = `Generate a single, personalized daily health tip for the user based on their profile. Make it actionable and specific.

Return a JSON response with this exact structure:
{
  "tip": "the health tip",
  "category": "nutrition|fitness|wellness|medical",
  "importance": "high|medium|low"
}`;

    const userMessage = `Health Profile:\n${profileContext}\n\nPlease provide a personalized daily health tip.`;

    const claudeResponse = await queryClaude({
      systemPrompt,
      userMessage,
      context: contextChunks,
    });

    let tip;
    try {
      const jsonMatch = claudeResponse.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { tip: claudeResponse };
      tip = parsed.tip || claudeResponse;
    } catch {
      tip = claudeResponse;
    }

    tipCache.set(cacheKey, { tip, date: today });

    res.json({ tip, cached: false });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch daily tip' });
  }
});

export default router;
