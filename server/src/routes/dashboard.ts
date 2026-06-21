import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { aiRateLimiter } from '../middleware/rateLimiter.js';
import { searchKnowledgeBase } from '../services/rag.js';
import { queryClaude } from '../services/claude.js';
import { parseClaudeJson } from '../utils/parseClaudeJson.js';
import Profile from '../models/Profile.js';
import ScanHistory from '../models/ScanHistory.js';
import PantryItem from '../models/PantryItem.js';
import DailyLog from '../models/DailyLog.js';
import { calculateHealthScore } from '../utils/healthScore.js';
import { calculateProfileCompletion } from '../utils/profileCompletion.js';

async function getRagContextSafely(query: string, timeoutMs = 8000): Promise<{ context: string; sources: string[]; ragSources: { source: string; topic?: string }[] }> {
  const startTime = Date.now();
  try {
    const ragPromise = searchKnowledgeBase(query);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`RAG timeout after ${Date.now() - startTime}ms`)), timeoutMs)
    );
    const ragResults = await Promise.race([ragPromise, timeoutPromise]);
    console.log(`[RAG] Succeeded in ${Date.now() - startTime}ms`);
    const ragSources = ragResults.map((r) => ({ source: r.metadata.source, topic: r.metadata.topic }));
    return {
      context: ragResults.map((r) => `[Source: ${r.metadata.source}] ${r.text}`).join('\n\n'),
      sources: ragResults.map((r) => r.metadata.source),
      ragSources,
    };
  } catch (error) {
    console.warn(`[RAG] Failed after ${Date.now() - startTime}ms:`, error);
    return { context: '', sources: [], ragSources: [] };
  }
}

const router = Router();

router.use(authenticate);

const recipeCache = new Map<string, { recipes: any[]; timestamp: number }>();

router.get('/recipes/:profileId', async (req: Request, res: Response) => {
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
    const cached = recipeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
      res.json({ recipes: cached.recipes, cached: true });
      return;
    }

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

    const userMessage = `Health Profile:\n${profileContext}\n\nPlease suggest 5 quick dinner ideas tailored to this person's dietary needs and preferences.`;

    const claudeResponse = await queryClaude({
      systemPrompt,
      userMessage,
    });

    let recipes;
    const parsed = parseClaudeJson<{ recipes: any[] }>(claudeResponse, { recipes: [] });
    recipes = (parsed.recipes || []).slice(0, 5);

    if (recipes.length === 0) {
      recipes = [
        { name: 'Moong dal khichdi', description: 'With ghee and roasted vegetables. Easy on digestion.', emoji: '🍲', prepTime: '25 min' },
        { name: 'Vegetable stir-fry', description: 'Quick stir-fried veggies with soy sauce and sesame. Serve with rice.', emoji: '🥦', prepTime: '15 min' },
        { name: 'Egg fried rice', description: 'Leftover rice tossed with eggs, peas, and soy sauce. Quick comfort food.', emoji: '🍳', prepTime: '10 min' },
        { name: 'Paneer tikka', description: 'Marinated paneer grilled with bell peppers and onions. Smoky flavor.', emoji: '🧀', prepTime: '20 min' },
        { name: 'Dal tadka', description: 'Yellow lentils tempered with cumin, garlic, and ghee. Classic comfort.', emoji: '🫘', prepTime: '30 min' },
      ];
    }

    recipeCache.set(cacheKey, { recipes, timestamp: Date.now() });

    res.json({ recipes, cached: false });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate recipes' });
  }
});

router.post('/recipes/:profileId/more', async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const { excludeNames = [] } = req.body;

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

    const userMessage = `Health Profile:\n${profileContext}\n\nPlease suggest 5 more dinner ideas.`;

    const claudeResponse = await queryClaude({ systemPrompt, userMessage });

    let recipes;
    const parsed = parseClaudeJson<{ recipes: any[] }>(claudeResponse, { recipes: [] });
    recipes = (parsed.recipes || []).slice(0, 5);

    res.json({ recipes });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate more recipes' });
  }
});

router.post('/recipes/expand', aiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { profileId, recipeName, recipeDescription } = req.body;

    if (!profileId || !recipeName) {
      res.status(400).json({ error: 'profileId and recipeName are required' });
      return;
    }

    const profile = await Profile.findOne({
      _id: profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const profileContext = `
      Name: ${profile.name}
      Diet Type: ${profile.dietType || 'Not specified'}
      Allergies: ${profile.allergies?.join(', ') || 'None'}
      Conditions: ${profile.conditions?.join(', ') || 'None'}
      Fitness Goal: ${profile.fitnessGoal || 'Not specified'}
      Activity Level: ${profile.activityLevel || 'Not specified'}
    `;

    const { context: ragContext, ragSources } = await getRagContextSafely(
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

    const userMessage = `Health Profile:\n${profileContext}\n\nDinner Idea:\nName: ${recipeName}\nDescription: ${recipeDescription || 'No description provided'}\n\nPlease expand this into a full, detailed recipe with ingredients, instructions, and nutritional information.`;

    const claudeResponse = await queryClaude({
      systemPrompt,
      userMessage,
      context: ragContext,
    });

    const parsed = parseClaudeJson<{
      name: string;
      description: string;
      ingredients: string[];
      instructions: string[];
      health_benefits: string;
      preparation_time: string;
      serves: string;
      dietary_tags: string[];
      nutrition: { calories: string; protein: string; carbs: string; fat: string };
    }>(claudeResponse, {
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

    res.json({ recipe: parsed, ragSources: ragSources.length > 0 ? ragSources : null });
  } catch (error) {
    console.error('Recipe expand error:', error);
    res.status(500).json({ error: 'Failed to expand recipe. Please retry.' });
  }
});

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

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const scansThisWeek = await ScanHistory.countDocuments({
      profileId: profile._id,
      createdAt: { $gte: sevenDaysAgo },
    });

    const today = new Date().toISOString().split('T')[0];
    const recentLogs = await DailyLog.find({
      profileId: profile._id,
    })
      .sort({ date: -1 })
      .limit(30);

    let waterStreak = 0;
    const checkDate = new Date(today + 'T00:00:00Z');
    for (const log of recentLogs) {
      const expected = checkDate.toISOString().split('T')[0];
      if (log.date === expected && log.waterCount >= (log.waterGoal || 8)) {
        waterStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (log.date === expected) {
        break;
      } else {
        break;
      }
    }

    const todayLog = await DailyLog.findOne({ profileId: profile._id, date: today });

    const recentScans = await ScanHistory.find({
      profileId: profile._id,
      createdAt: { $gte: sevenDaysAgo },
    }).sort({ createdAt: -1 });

    let streak = 0;
    const streakLogs = await DailyLog.find({
      profileId: profile._id,
      streakDay: true,
    })
      .sort({ date: -1 })
      .lean();

    if (streakLogs.length > 0) {
      const dates = streakLogs.map((l) => l.date);
      const streakCheckDate = new Date(today + 'T00:00:00Z');
      for (const dateStr of dates) {
        const expected = streakCheckDate.toISOString().split('T')[0];
        if (dateStr === expected) {
          streak++;
          streakCheckDate.setDate(streakCheckDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

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

    const { context: ragContext } = await getRagContextSafely(
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

    const userMessage = `Health Profile:\n${profileContext}\n\nPlease provide a personalized daily health tip.`;

    const claudeResponse = await queryClaude({
      systemPrompt,
      userMessage,
      context: ragContext,
    });

    const parsed = parseClaudeJson<{ tip: string }>(claudeResponse, { tip: claudeResponse });
    const tip = parsed.tip || claudeResponse;

    tipCache.set(cacheKey, { tip, date: today });

    res.json({ tip, cached: false });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch daily tip' });
  }
});

router.get('/timeline/:profileId', async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const logs = await DailyLog.find({
      profileId: profile._id,
      date: { $gte: thirtyDaysAgo.toISOString().split('T')[0] },
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
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch health timeline' });
  }
});

const coachCache = new Map<string, { data: any; timestamp: number }>();

router.get('/coach/:profileId', async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const cacheKey = `${profile._id}`;
    const cached = coachCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 4 * 60 * 60 * 1000) {
      res.json({ ...cached.data, cached: true });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const todayLog = await DailyLog.findOne({ profileId: profile._id, date: today });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const last7DaysLogs = await DailyLog.find({
      profileId: profile._id,
      date: { $gte: sevenDaysAgo.toISOString().split('T')[0] },
    }).sort({ date: -1 });

    const recentScans = await ScanHistory.find({ profileId: profile._id })
      .sort({ createdAt: -1 })
      .limit(10);

    let streak = 0;
    const streakLogs = await DailyLog.find({
      profileId: profile._id,
      streakDay: true,
    })
      .sort({ date: -1 })
      .lean();

    if (streakLogs.length > 0) {
      const dates = streakLogs.map((l) => l.date);
      const checkDate = new Date(today + 'T00:00:00Z');
      for (const dateStr of dates) {
        const expected = checkDate.toISOString().split('T')[0];
        if (dateStr === expected) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

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

    const userMessage = `Health Profile:\n${profileContext}\n\nToday's Log:\n${todayContext}\n\nLast 7 Days:\n${weekContext || 'No data'}\n\nRecent Scans:\n${scansContext || 'No scans'}\n\nCurrent Streak: ${streak} days\nHealth Score: ${healthScoreResult.score}/100\n\nPlease provide a personalized coaching message.`;

    const claudeResponse = await queryClaude({
      systemPrompt,
      userMessage,
    });

    const parsed = parseClaudeJson<{ message: string; category: string; priority: string }>(
      claudeResponse,
      { message: claudeResponse, category: 'general', priority: 'medium' }
    );
    const result = {
      message: parsed.message || claudeResponse,
      category: parsed.category || 'general',
      priority: parsed.priority || 'medium',
    };

    coachCache.set(cacheKey, { data: result, timestamp: Date.now() });

    res.json({ ...result, cached: false });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate coaching message' });
  }
});

export default router;
