import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { generateText } from '../services/llm.js';
import { parseJsonResponse } from '../utils/parseJsonResponse.js';
import Profile from '../models/Profile.js';
import DailyLog from '../models/DailyLog.js';
import ScanHistory from '../models/ScanHistory.js';
import HealthInsight from '../models/HealthInsight.js';
import { objectId, validate } from '../middleware/validate.js';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { notFound } from '../utils/AppError.js';
import { weekStart } from '../utils/streak.js';
import { clampUntrusted } from '../services/promptSafety.js';

const router = Router();

router.use(authenticate);

function getWeekOf(date: Date): string {
  return weekStart(date.toISOString().slice(0, 10));
}

router.get('/:profileId', validate({ params: z.object({ profileId: objectId }) }), asyncHandler(async (req: Request, res: Response) => {
  const profile = await Profile.findOne({
    _id: req.params.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
  }

  const weekOf = getWeekOf(new Date());
  const insight = await HealthInsight.findOne({ profileId: profile._id, weekOf })
    .sort({ generatedAt: -1 });

  res.json({
    insights: insight?.insights || [],
    generatedAt: insight?.generatedAt || null,
    weekOf: insight?.weekOf || weekOf,
  });
}));

router.post('/:profileId/generate', validate({ params: z.object({ profileId: objectId }) }), asyncHandler(async (req: Request, res: Response) => {
  const profile = await Profile.findOne({
    _id: req.params.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
  }

  const weekOf = getWeekOf(new Date());

  const existing = await HealthInsight.findOne({ profileId: profile._id, weekOf });
  if (existing) {
    res.json({
      insights: existing.insights,
      generatedAt: existing.generatedAt,
      weekOf: existing.weekOf,
      cached: true,
    });
    return;
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentLogs = await DailyLog.find({
    profileId: profile._id,
    date: { $gte: sevenDaysAgo.toISOString().split('T')[0] },
  }).sort({ date: -1 });

  const recentScans = await ScanHistory.find({ profileId: profile._id })
    .sort({ createdAt: -1 })
    .limit(20);

  const profileContext = `
      Name: ${profile.name}
      Age: ${profile.age || 'Not specified'}
      Gender: ${profile.gender || 'Not specified'}
      Diet Type: ${profile.dietType || 'Not specified'}
      Allergies: ${profile.allergies?.join(', ') || 'None'}
      Conditions: ${profile.conditions?.join(', ') || 'None'}
      Medications: ${profile.medications?.map((m) => `${m.name} ${m.dosage}`).join(', ') || 'None'}
      Fitness Goal: ${profile.fitnessGoal || 'Not specified'}
      Activity Level: ${profile.activityLevel || 'Not specified'}
    `;

  const logsContext = recentLogs.map((l) =>
    `Date: ${l.date}, Water: ${l.waterCount}, Plate: veg=${l.plateGroups.veg}, fruit=${l.plateGroups.fruit}, protein=${l.plateGroups.protein}, grains=${l.plateGroups.grains}, dairy=${l.plateGroups.dairy}, Challenge: ${l.challenge?.completed ? 'completed' : 'not completed'}`
  ).join('\n');

  const scansContext = recentScans.map((s) =>
    `Type: ${s.type}, Verdict: ${JSON.stringify(s.aiVerdict?.verdict || s.aiVerdict?.general_advice || 'N/A')}`
  ).join('\n');

  const systemPrompt = `You are VitalAI, a personalized health insights engine. Analyze the user's health data from the past week and generate 3-5 specific, actionable health insights. Each insight should be personalized to their profile, patterns in their data, and health goals.

Respond with ONLY the JSON object, no preamble, no explanation, no markdown fencing.

Return a JSON response with this exact structure:
{
  "insights": ["insight 1", "insight 2", "insight 3", ...]
}`;

  const userMessage =
    'Analyse the profile in <health_profile> together with the logs in <recent_week> and the scans in <recent_scans>, and give personalised insights.';

  const modelResponse = await generateText({

    userId: req.jwtUser!.id,

    operation: 'health_insights.generate',
    untrusted: [
      { label: 'health_profile', content: clampUntrusted(profileContext, 4000) },
      { label: 'recent_week', content: clampUntrusted(logsContext || 'No logs available', 3000) },
      { label: 'recent_scans', content: clampUntrusted(scansContext || 'No scans available', 3000) },
    ],

      maxOutputTokens: 1024,
    systemPrompt,
    userMessage,
  });

  const parsed = parseJsonResponse<{ insights: string[] }>(
    modelResponse,
    { insights: [modelResponse] }
  );
  const insights: string[] = Array.isArray(parsed.insights) ? parsed.insights : [modelResponse];

  const stored = await HealthInsight.create({
    profileId: profile._id,
    insights,
    generatedAt: new Date(),
    weekOf,
  });

  res.json({
    insights: stored.insights,
    generatedAt: stored.generatedAt,
    weekOf: stored.weekOf,
    cached: false,
  });
}));

export default router;
