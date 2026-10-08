import { createHash } from 'node:crypto';
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { aiRateLimiter } from '../middleware/rateLimiter.js';
import { getRagContext } from '../services/retrieval.js';
import { generateText } from '../services/llm.js';
import { parseJsonResponse } from '../utils/parseJsonResponse.js';
import Profile from '../models/Profile.js';
import ScanHistory from '../models/ScanHistory.js';
import PantryItem from '../models/PantryItem.js';
import DailyLog from '../models/DailyLog.js';
import { calculateHealthScore } from '../utils/healthScore.js';
import { calculateProfileCompletion } from '../utils/profileCompletion.js';
import { objectId, validate } from '../middleware/validate.js';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError, badRequest, notFound } from '../utils/AppError.js';
import { currentStreak, shiftDay, todayKey } from '../utils/streak.js';
import { cachedJson } from '../services/responseCache.js';
import { clampUntrusted } from '../services/promptSafety.js';

const moreRecipesSchema = z.object({
  excludeNames: z.array(z.string().trim().max(160)).max(50).default([]),
});

const expandRecipeSchema = z.object({
  profileId: objectId,
  recipeName: z.string().trim().min(1).max(160),
  recipeDescription: z.string().trim().max(1000).default(''),
});

/** Daily generations are cached for a calendar day's worth of seconds. */
const DAY_SECONDS = 24 * 60 * 60;

const router = Router();

router.use(authenticate);

router.get('/recipes/:profileId', validate({ params: z.object({ profileId: objectId }) }), asyncHandler(async (req: Request, res: Response) => {
  const profile = await Profile.findOne({
    _id: req.params.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
  }

  const today = todayKey();

  const profileContext = `
      Diet Type: ${profile.dietType || 'Not specified'}
      Allergies: ${profile.allergies?.join(', ') || 'None'}
      Conditions: ${profile.conditions?.join(', ') || 'None'}
      Fitness Goal: ${profile.fitnessGoal || 'Not specified'}
      Activity Level: ${profile.activityLevel || 'Not specified'}
    `;

  const systemPrompt = `Generate 5 quick, casual dinner recipe ideas for this person. Think everyday home cooking — not gourmet. Practical meals that are easy to make.

CRITICAL DIETARY RULES — you MUST follow these strictly:
- If diet is "vegetarian": NO meat, NO seafood, NO eggs. Only plant-based dishes.
- If diet is "vegan": NO animal products at all — no meat, seafood, eggs, dairy, honey, ghee.
- If diet is "eggetarian": eggs ARE allowed, but NO meat or seafood.
- If diet is "non-veg": all foods are allowed.
- If diet is "jain": NO root vegetables (onion, garlic, potato, carrot, etc.), NO meat, NO eggs.
- NEVER suggest any dish containing the user's listed allergens.

Respond with ONLY the JSON object, no preamble, no explanation, no markdown fencing.

Return a JSON response with this exact structure:
{
  "recipes": [
    {
      "name": "recipe name (e.g., Moong dal khichdi)",
      "description": "1-2 sentence description (e.g., With ghee and roasted vegetables. Easy on digestion.)",
      "emoji": "food emoji (e.g., 🍲)",
      "prepTime": "e.g., 25 min"
    }
  ]
}

Return exactly 5 recipes. Keep descriptions casual and helpful. Use emojis that represent each dish.`;

  // Profile fields are text the user typed, so they are quoted as data rather
  // than pasted into the instruction. Every AI call in the app does this the
  // same way; the ones here were the last that did not.
  const userMessage =
    'Suggest 5 quick dinner ideas for the profile in <health_profile>, following its diet, allergies and conditions exactly.';

  // Identical for a profile for the whole day, so it is generated once and
  // served from the shared store after that — the single biggest saving
  // available on the AI bill.
  const { value: recipes, cached } = await cachedJson(
    `dashboard:dinner:${profile._id}:${today}`,
    DAY_SECONDS,
    async () => {
      const modelResponse = await generateText({
        userId: req.jwtUser!.id,
        operation: 'dashboard.dinner_ideas',
        maxOutputTokens: 1536,
        systemPrompt,
        userMessage,
        untrusted: [{ label: 'health_profile', content: clampUntrusted(profileContext, 4000) }],
      });

      const parsed = parseJsonResponse<{ recipes: unknown[] }>(modelResponse, { recipes: [] });
      const suggestions = (parsed.recipes || []).slice(0, 5);

      // There used to be a hardcoded list here for when the answer could not be
      // parsed. It had to go: the substitutes included egg fried rice and
      // paneer tikka, which would be served to a vegan or a Jain profile — a
      // set of dietary rules the prompt above states explicitly. A visible
      // failure is better than a confidently wrong suggestion.
      if (suggestions.length === 0) {
        throw new AppError({
          status: 502,
          code: 'MODEL_OUTPUT_INVALID',
          message: "Tonight's ideas came back in a form we could not read.",
          action: 'Try again in a moment — nothing else on this page is affected.',
        });
      }

      return suggestions;
    },
  );

  res.json({ recipes, cached });
}));

router.post('/recipes/:profileId/more', validate({ params: z.object({ profileId: objectId }), body: moreRecipesSchema }), asyncHandler(async (req: Request, res: Response) => {
  const profile = await Profile.findOne({
    _id: req.params.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
  }

  const { excludeNames } = req.body as z.infer<typeof moreRecipesSchema>;

  const profileContext = `
      Diet Type: ${profile.dietType || 'Not specified'}
      Allergies: ${profile.allergies?.join(', ') || 'None'}
      Conditions: ${profile.conditions?.join(', ') || 'None'}
      Fitness Goal: ${profile.fitnessGoal || 'Not specified'}
    `;

  const systemPrompt = `Generate 5 MORE quick, casual dinner recipe ideas. Think everyday home cooking — not gourmet.

CRITICAL DIETARY RULES — you MUST follow these strictly:
- If diet is "vegetarian": NO meat, NO seafood, NO eggs.
- If diet is "vegan": NO animal products at all.
- If diet is "eggetarian": eggs ARE allowed, but NO meat or seafood.
- If diet is "non-veg": all foods are allowed.
- If diet is "jain": NO root vegetables, NO meat, NO eggs.
- NEVER suggest any dish containing the user's listed allergens.
- Do NOT repeat these recipes: ${excludeNames.join(', ')}

Respond with ONLY the JSON object, no preamble, no explanation, no markdown fencing.

Return JSON: { "recipes": [{ "name": "...", "description": "...", "emoji": "...", "prepTime": "..." }] }
Return exactly 5 recipes.`;

  const userMessage = 'Suggest 5 more dinner ideas for the profile in <health_profile>.';

  const modelResponse = await generateText({
    userId: req.jwtUser!.id,
    operation: 'dashboard.more_recipes',
    untrusted: [{ label: 'health_profile', content: clampUntrusted(profileContext, 4000) }],
      maxOutputTokens: 1536,

      systemPrompt,

      userMessage,

    });

  const parsed = parseJsonResponse<{ recipes: unknown[] }>(modelResponse, { recipes: [] });
  const recipes = (parsed.recipes || []).slice(0, 5);

  res.json({ recipes });
}));

router.post('/recipes/expand', aiRateLimiter, validate({ body: expandRecipeSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { profileId, recipeName, recipeDescription } = req.body as z.infer<typeof expandRecipeSchema>;

  if (!profileId || !recipeName) {
    throw badRequest('This request was missing the profile or the recipe name.', 'Go back to the recipe and open it again.');
  }

  const profile = await Profile.findOne({
    _id: profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
  }

  const profileContext = `
    Name: ${profile.name}
    Diet Type: ${profile.dietType || 'Not specified'}
    Allergies: ${profile.allergies?.join(', ') || 'None'}
    Conditions: ${profile.conditions?.join(', ') || 'None'}
    Fitness Goal: ${profile.fitnessGoal || 'Not specified'}
    Activity Level: ${profile.activityLevel || 'Not specified'}
  `;

  const { context: ragContext, ragSources, grounded } = await getRagContext(
    `recipes healthy cooking ${recipeName} ${profile.dietType || ''} ${profile.allergies?.join(' ') || ''}`
  );

  const systemPrompt = `You are a health-conscious recipe assistant. Expand this dinner idea into a full, detailed recipe tailored to the user's dietary preferences and health profile.

CRITICAL DIETARY RULES:
- If diet is "vegetarian": NO meat, NO seafood, NO eggs.
- If diet is "vegan": NO animal products at all.
- If diet is "eggetarian": eggs ARE allowed, but NO meat or seafood.
- If diet is "jain": NO root vegetables (onion, garlic, potato, carrot, etc.), NO meat, NO eggs.
- NEVER suggest any dish containing the user's listed allergens.

Respond with ONLY the JSON object, no preamble, no explanation, no markdown fencing.

Return a JSON response with this exact structure:
{
"name": "recipe name",
"description": "brief description (1-2 sentences)",
"ingredients": ["ingredient with quantity"],
"instructions": ["step 1", "step 2", ...],
"health_benefits": "how this recipe aligns with health goals",
"preparation_time": "estimated time",
"serves": "number of servings",
"dietary_tags": ["tag1", "tag2"],
"nutrition": {
  "calories": "number",
  "protein": "number",
  "carbs": "number",
  "fat": "number"
}
}`;

  const userMessage =
    'Expand the dinner idea in <dinner_idea> into a full recipe for the profile in <health_profile>, with ingredients, instructions and nutrition.';

  const modelResponse = await generateText({
    userId: req.jwtUser!.id,
    operation: 'dashboard.recipe_expand',
    maxOutputTokens: 1536,
    untrusted: [
      { label: 'health_profile', content: clampUntrusted(profileContext, 4000) },
      {
        label: 'dinner_idea',
        content: clampUntrusted(`${recipeName}\n${recipeDescription || ''}`, 1000),
      },
    ],
    systemPrompt,
    userMessage,
    context: ragContext,
  });

  const parsed = parseJsonResponse<{
    name: string;
    description: string;
    ingredients: string[];
    instructions: string[];
    health_benefits: string;
    preparation_time: string;
    serves: string;
    dietary_tags: string[];
    nutrition: { calories: string; protein: string; carbs: string; fat: string };
  }>(modelResponse, {
    name: recipeName,
    description: recipeDescription || '',
    ingredients: [],
    instructions: [],
    health_benefits: '',
    preparation_time: '',
    serves: '',
    dietary_tags: [],
    nutrition: { calories: '', protein: '', carbs: '', fat: '' },
  });

  res.json({ recipe: parsed, ragSources: ragSources.length > 0 ? ragSources : null, grounded });
}));

router.get('/:profileId', validate({ params: z.object({ profileId: objectId }) }), asyncHandler(async (req: Request, res: Response) => {
  const profile = await Profile.findOne({
    _id: req.params.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
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

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const scansThisWeek = await ScanHistory.countDocuments({
    profileId: profile._id,
    createdAt: { $gte: sevenDaysAgo },
  });

  const today = todayKey();
  const recentLogs = await DailyLog.find({
    profileId: profile._id,
  })
    .sort({ date: -1 })
    .limit(30);

  const waterStreak = currentStreak(
    recentLogs.filter((log) => log.waterCount >= (log.waterGoal || 8)).map((log) => log.date),
    today,
  );

  const todayLog = await DailyLog.findOne({ profileId: profile._id, date: today });

  const recentScans = await ScanHistory.find({
    profileId: profile._id,
    createdAt: { $gte: sevenDaysAgo },
  }).sort({ createdAt: -1 });

  const streakLogs = await DailyLog.find({
    profileId: profile._id,
    streakDay: true,
  })
    .sort({ date: -1 })
    .lean();

  const streak = currentStreak(streakLogs.map((log) => log.date), today);

  const healthScoreResult = calculateHealthScore({
    profile,
    todayLog,
    recentScans,
    streak,
    weeklyScans: scansThisWeek,
  });

  const profileCompleteness = calculateProfileCompletion(profile);

  const recentScansForActivity = await ScanHistory.find({ profileId: profile._id })
    .sort({ createdAt: -1 })
    .limit(5);

  const recentLogsForActivity = await DailyLog.find({ profileId: profile._id })
    .sort({ date: -1 })
    .limit(5);

  const activities: { type: string; title: string; date: string; verdict?: string }[] = [];

  for (const scan of recentScansForActivity) {
    activities.push({
      type: 'scan',
      title: `${scan.type.charAt(0).toUpperCase() + scan.type.slice(1)} scan`,
      date: scan.createdAt.toISOString(),
      verdict: scan.aiVerdict?.verdict || scan.aiVerdict?.general_advice || undefined,
    });
  }

  for (const log of recentLogsForActivity) {
    if (log.waterCount > 0) {
      activities.push({
        type: 'water',
        title: `Drank ${log.waterCount} glasses of water`,
        date: log.date,
      });
    }
    if (log.challenge?.completed) {
      activities.push({
        type: 'challenge',
        title: `Completed: ${log.challenge.text}`,
        date: log.date,
      });
    }
  }

  activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const recentActivity = activities.slice(0, 10);

  const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  res.json({
    greeting: `${getGreeting()}, ${profile.name}!`,
    scanCount,
    scansThisWeek,
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
    waterStreak,
    healthScore: healthScoreResult,
    profileCompleteness,
    recentActivity,
  });
}));

router.get('/tip/:profileId', validate({ params: z.object({ profileId: objectId }) }), asyncHandler(async (req: Request, res: Response) => {
  const profile = await Profile.findOne({
    _id: req.params.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
  }

  const today = todayKey();

  const profileContext = `
      Diet Type: ${profile.dietType || 'Not specified'}
      Conditions: ${profile.conditions?.join(', ') || 'None'}
      Fitness Goal: ${profile.fitnessGoal || 'Not specified'}
      Activity Level: ${profile.activityLevel || 'Not specified'}
    `;

  const { context: ragContext } = await getRagContext(
    `daily health tip wellness ${profile.fitnessGoal || ''} ${profile.dietType || ''}`
  );

  const systemPrompt = `Generate a single, personalized daily health tip for the user based on their profile. Make it actionable and specific.

Respond with ONLY the JSON object, no preamble, no explanation, no markdown fencing.

Return a JSON response with this exact structure:
{
  "tip": "the health tip",
  "category": "nutrition|fitness|wellness|medical",
  "importance": "high|medium|low"
}`;

  const userMessage = 'Give one health tip for the profile in <health_profile>.';

  const { value: tip, cached } = await cachedJson(
    `dashboard:tip:${profile._id}:${today}`,
    DAY_SECONDS,
    async () => {
      const modelResponse = await generateText({
        userId: req.jwtUser!.id,
        operation: 'dashboard.daily_tip',
        maxOutputTokens: 1536,
        systemPrompt,
        userMessage,
        untrusted: [{ label: 'health_profile', content: clampUntrusted(profileContext, 4000) }],
        context: ragContext,
      });

      const parsed = parseJsonResponse<{ tip: string }>(modelResponse, { tip: '' });
      const generated = (parsed.tip || '').trim();

      // The old fallback was the raw model response, which meant an unparsed
      // answer — a stray JSON fragment, or a refusal — was shown to the user as
      // today's health tip.
      if (!generated) {
        throw new AppError({
          status: 502,
          code: 'MODEL_OUTPUT_INVALID',
          message: "Today's tip came back in a form we could not read.",
          action: 'Try again in a moment — nothing else on this page is affected.',
        });
      }

      return generated;
    },
  );

  res.json({ tip, cached });
}));

/**
 * The window is a closed set rather than a free number: it is the bound on how
 * much a single request can read, so it is not something the caller gets to
 * choose arbitrarily. The screen offered 30 and 90 days and the server only
 * ever answered with 30 — the choice never reached the request at all.
 */
const timelineQuerySchema = z.object({
  days: z.enum(['7', '30', '90']).default('30'),
});

router.get(
  '/timeline/:profileId',
  validate({ params: z.object({ profileId: objectId }), query: timelineQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const profile = await Profile.findOne({
      _id: req.params.profileId,
      userId: req.jwtUser!.id,
    });
    if (!profile) {
      throw notFound('That profile');
    }

    const { days: windowDays } = req.query as unknown as z.infer<typeof timelineQuerySchema>;
    const since = shiftDay(todayKey(), -(Number(windowDays) - 1));
    const logs = await DailyLog.find({
      profileId: profile._id,
      date: { $gte: since },
    }).sort({ date: 1 });

    const days = logs.map((log) => {
      const plateTrueCount = [
        log.plateGroups.veg,
        log.plateGroups.fruit,
        log.plateGroups.protein,
        log.plateGroups.grains,
        log.plateGroups.dairy,
      ].filter(Boolean).length;
      const plateScore = Math.round((plateTrueCount / 5) * 100);

      return {
        date: log.date,
        waterCount: log.waterCount,
        waterGoal: log.waterGoal || 8,
        plateScore,
        challengeCompleted: log.challenge?.completed || false,
        streakDay: log.streakDay,
      };
    });

    res.json({ days });
  }),
);

router.get('/coach/:profileId', validate({ params: z.object({ profileId: objectId }) }), asyncHandler(async (req: Request, res: Response) => {
  const profile = await Profile.findOne({
    _id: req.params.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
  }

  const today = todayKey();
  const todayLog = await DailyLog.findOne({ profileId: profile._id, date: today });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const last7DaysLogs = await DailyLog.find({
    profileId: profile._id,
    date: { $gte: sevenDaysAgo.toISOString().split('T')[0] },
  }).sort({ date: -1 });

  const recentScans = await ScanHistory.find({ profileId: profile._id })
    .sort({ createdAt: -1 })
    .limit(10);

  const streakLogs = await DailyLog.find({
    profileId: profile._id,
    streakDay: true,
  })
    .sort({ date: -1 })
    .lean();

  const streak = currentStreak(streakLogs.map((log) => log.date), today);

  const healthScoreResult = calculateHealthScore({
    profile,
    todayLog,
    recentScans,
    streak,
    weeklyScans: recentScans.length,
  });

  const profileContext = `
      Name: ${profile.name}
      Age: ${profile.age || 'Not specified'}
      Diet Type: ${profile.dietType || 'Not specified'}
      Allergies: ${profile.allergies?.join(', ') || 'None'}
      Conditions: ${profile.conditions?.join(', ') || 'None'}
      Medications: ${profile.medications?.map((m) => `${m.name} ${m.dosage}`).join(', ') || 'None'}
      Fitness Goal: ${profile.fitnessGoal || 'Not specified'}
      Activity Level: ${profile.activityLevel || 'Not specified'}
    `;

  const todayContext = todayLog
    ? `Today: Water ${todayLog.waterCount}/${todayLog.waterGoal || 8}, Plate groups: veg=${todayLog.plateGroups.veg}, fruit=${todayLog.plateGroups.fruit}, protein=${todayLog.plateGroups.protein}, grains=${todayLog.plateGroups.grains}, dairy=${todayLog.plateGroups.dairy}, Challenge: ${todayLog.challenge?.completed ? 'completed' : 'not completed'}`
    : 'No log for today yet';

  const weekContext = last7DaysLogs.map((l) =>
    `Date: ${l.date}, Water: ${l.waterCount}/${l.waterGoal || 8}, Streak: ${l.streakDay ? 'yes' : 'no'}`
  ).join('\n');

  const scansContext = recentScans.map((s) =>
    `Type: ${s.type}, Verdict: ${s.aiVerdict?.verdict || s.aiVerdict?.general_advice || 'N/A'}`
  ).join('\n');

  const systemPrompt = `You are VitalAI, a personalized AI health coach. Based on the user's health data, provide a concise, motivating coaching message. Be specific and actionable.

Respond with ONLY the JSON object, no preamble, no explanation, no markdown fencing.

Return a JSON response with this exact structure:
{
  "message": "your coaching message (2-4 sentences, personalized and actionable)",
  "category": "hydration|nutrition|activity|general",
  "priority": "high|medium|low"
}`;

  const userMessage = [
    'Write one coaching message for the profile in <health_profile>, using the logs in <today_log> and <recent_week> and the scans in <recent_scans>.',
    `Their current streak is ${streak} days and their health score is ${healthScoreResult.score}/100.`,
  ].join(' ');

  // Keyed on the day and on a digest of everything the message is drawn from,
  // so logging a glass of water or finishing a scan invalidates it. The old
  // cache was keyed on the profile alone for four hours, which meant the coach
  // congratulated you on a streak you had since broken.
  const inputDigest = createHash('sha256')
    .update([profileContext, todayContext, weekContext, scansContext, String(streak)].join('|'))
    .digest('hex')
    .slice(0, 16);

  const { value: result, cached } = await cachedJson(
    `dashboard:coach:${profile._id}:${today}:${inputDigest}`,
    4 * 60 * 60,
    async () => {
      const modelResponse = await generateText({
        userId: req.jwtUser!.id,
        operation: 'dashboard.coach',
        maxOutputTokens: 1536,
        systemPrompt,
        userMessage,
        untrusted: [
          { label: 'health_profile', content: clampUntrusted(profileContext, 4000) },
          { label: 'today_log', content: clampUntrusted(todayContext, 1000) },
          { label: 'recent_week', content: clampUntrusted(weekContext || 'No data', 2000) },
          { label: 'recent_scans', content: clampUntrusted(scansContext || 'No scans', 2000) },
        ],
      });

      const parsed = parseJsonResponse<{ message: string; category: string; priority: string }>(
        modelResponse,
        { message: '', category: 'general', priority: 'medium' },
      );

      const message = (parsed.message || '').trim();

      // Falling back to the raw response put unparsed model output — or a
      // refusal — on the dashboard as coaching.
      if (!message) {
        throw new AppError({
          status: 502,
          code: 'MODEL_OUTPUT_INVALID',
          message: 'The coaching note came back in a form we could not read.',
          action: 'Try again in a moment — nothing else on this page is affected.',
        });
      }

      return {
        message,
        category: parsed.category || 'general',
        priority: parsed.priority || 'medium',
      };
    },
  );

  res.json({ ...result, cached });
}));

export default router;
