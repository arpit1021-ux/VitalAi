import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { generateText } from '../services/llm.js';
import { parseJsonResponse } from '../utils/parseJsonResponse.js';
import FamilyInsight from '../models/FamilyInsight.js';
import Profile from '../models/Profile.js';
import ScanHistory from '../models/ScanHistory.js';
import { objectId, validate } from '../middleware/validate.js';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { forbidden } from '../utils/AppError.js';

const router = Router();

router.use(authenticate);

router.get(
  '/family/:userId',
  validate({ params: z.object({ userId: objectId }) }),
  asyncHandler(async (req: Request, res: Response) => {
    if (req.jwtUser!.id !== req.params.userId) {
      throw forbidden();
    }

    const insight = await FamilyInsight.findOne({ userId: req.params.userId }).sort({
      generatedAt: -1,
    });

    // Reading insights must never trigger a model call: a GET that costs money
    // can be driven by a refresh loop, a link prefetcher or a retry. When the
    // cached copy is missing or stale the client is told so, and asks for a
    // refresh explicitly via POST /generate.
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stale = !insight || insight.generatedAt < twentyFourHoursAgo;

    res.json({
      insight: insight ?? null,
      stale,
      generatedAt: insight?.generatedAt ?? null,
    });
  }),
);

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const profiles = await Profile.find({ userId: req.jwtUser!.id });
    if (profiles.length === 0) {
      res.status(400).json({ error: 'No profiles found' });
      return;
    }

    const profileIds = profiles.map((p) => p._id);
    const recentScans = await ScanHistory.find({
      profileId: { $in: profileIds },
    })
      .sort({ createdAt: -1 })
      .limit(20);

    const profilesData = profiles.map((p) => ({
      name: p.name,
      age: p.age,
      dietType: p.dietType,
      conditions: p.conditions,
      medications: p.medications?.map((m) => m.name),
      fitnessGoal: p.fitnessGoal,
    }));

    const scansSummary = recentScans.map((s) => ({
      type: s.type,
      verdict: s.aiVerdict,
      date: s.createdAt,
    }));

    const systemPrompt = `You are generating family health insights. Analyze the family's health data and provide personalized insights and recommendations.

Respond with ONLY the JSON object, no preamble, no explanation, no markdown fencing.

Return a JSON response with this exact structure:
{
  "family_summary": "overall family health summary",
  "member_insights": [{"name": "member name", "insights": "specific insights", "recommendations": "recommendations"}],
  "dietary_patterns": "observations about family dietary patterns",
  "health_tips": ["list of actionable health tips"],
  "alerts": ["any health alerts or things to watch"],
  "grocery_suggestions": ["suggested grocery items for better nutrition"]
}`;

    const userMessage = `Family Profiles:\n${JSON.stringify(profilesData, null, 2)}\n\nRecent Health Scans:\n${JSON.stringify(scansSummary, null, 2)}\n\nPlease generate comprehensive family health insights.`;

    const modelResponse = await generateText({

      userId: req.jwtUser!.id,

      operation: 'family_insights.refresh',

        maxOutputTokens: 2048,
      systemPrompt,
      userMessage,
    });

    const parsed = parseJsonResponse<{ family_summary: string }>(
      modelResponse,
      { family_summary: modelResponse }
    );

    const insight = await FamilyInsight.create({
      userId: req.jwtUser!.id,
      insights: parsed,
      generatedAt: new Date(),
    });

    res.json({ insight });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

export default router;
