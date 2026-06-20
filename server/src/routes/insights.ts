import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { queryClaude } from '../services/claude.js';
import { parseClaudeJson } from '../utils/parseClaudeJson.js';
import FamilyInsight from '../models/FamilyInsight.js';
import Profile from '../models/Profile.js';
import ScanHistory from '../models/ScanHistory.js';

const router = Router();

router.use(authenticate);

router.get('/family/:userId', async (req: Request, res: Response) => {
  try {
    if ((req as any).jwtUser!.id !== req.params.userId) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }

    let insight = await FamilyInsight.findOne({ userId: req.params.userId }).sort({
      generatedAt: -1,
    });

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    if (!insight || insight.generatedAt < twentyFourHoursAgo) {
      // Regenerate
      const profiles = await Profile.find({ userId: req.params.userId });
      if (profiles.length === 0) {
        res.json({ insight: null });
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

      const claudeResponse = await queryClaude({
        systemPrompt,
        userMessage,
      });

      const parsed = parseClaudeJson<{ family_summary: string }>(
        claudeResponse,
        { family_summary: claudeResponse }
      );

      insight = await FamilyInsight.create({
        userId: req.params.userId,
        insights: parsed,
        generatedAt: new Date(),
      });
    }

    res.json({ insight });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch family insights' });
  }
});

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const profiles = await Profile.find({ userId: (req as any).jwtUser!.id });
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

    const claudeResponse = await queryClaude({
      systemPrompt,
      userMessage,
    });

    const parsed = parseClaudeJson<{ family_summary: string }>(
      claudeResponse,
      { family_summary: claudeResponse }
    );

    const insight = await FamilyInsight.create({
      userId: (req as any).jwtUser!.id,
      insights: parsed,
      generatedAt: new Date(),
    });

    res.json({ insight });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

export default router;
