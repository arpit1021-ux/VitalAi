import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { searchKnowledgeBase } from '../services/rag.js';
import { queryClaude } from '../services/claude.js';
import { parseClaudeJson } from '../utils/parseClaudeJson.js';
import PantryItem from '../models/PantryItem.js';
import Profile from '../models/Profile.js';

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

const createItemSchema = z.object({
  profileId: z.string(),
  name: z.string().min(1),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  category: z.enum(['grains', 'dairy', 'produce', 'protein', 'spices', 'other']).optional(),
  expiryDate: z.string().optional(),
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = createItemSchema.parse(req.body);

    const profile = await Profile.findOne({ _id: data.profileId, userId: (req as any).jwtUser!.id });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const item = await PantryItem.create({
      ...data,
      expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
    });

    res.status(201).json({ item });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    res.status(500).json({ error: 'Failed to create pantry item' });
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

    const items = await PantryItem.find({ profileId: req.params.profileId });
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pantry items' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const item = await PantryItem.findById(req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const profile = await Profile.findOne({
      _id: item.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(403).json({ error: 'Not authorized to update this item' });
      return;
    }

    const updatedItem = await PantryItem.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    res.json({ item: updatedItem });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update item' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const item = await PantryItem.findById(req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const profile = await Profile.findOne({
      _id: item.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(403).json({ error: 'Not authorized to delete this item' });
      return;
    }

    await PantryItem.findByIdAndDelete(req.params.id);
    res.json({ message: 'Item deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

router.post('/recipes', async (req: Request, res: Response) => {
  try {
    const { profileId, scope = 'me', selectedItemIds } = req.body;

    const profile = await Profile.findOne({ _id: profileId, userId: (req as any).jwtUser!.id });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const query: any = { profileId };
    if (selectedItemIds && selectedItemIds.length > 0) {
      query._id = { $in: selectedItemIds };
    }
    const items = await PantryItem.find(query);
    const pantryList = items
      .map((i) => `${i.name}${i.quantity ? ` (${i.quantity}${i.unit || ''})` : ''}`)
      .join(', ');

    let profileContext: string;
    let scopeNote: string;

    if (scope === 'family') {
      const allProfiles = await Profile.find({ userId: (req as any).jwtUser!.id });
      const profilesContext = allProfiles.map((p) => `
        - ${p.name}: Diet: ${p.dietType || 'Not specified'}, Allergies: ${p.allergies?.join(', ') || 'None'}, Conditions: ${p.conditions?.join(', ') || 'None'}
      `).join('');

      profileContext = `Family Members:\n${profilesContext}`;
      scopeNote = 'Generate a recipe safe for ALL family members. Use the most restrictive diet. Avoid ALL allergens listed for any family member.';
    } else {
      profileContext = `
        Name: ${profile.name}
        Diet Type: ${profile.dietType || 'Not specified'}
        Allergies: ${profile.allergies?.join(', ') || 'None'}
        Conditions: ${profile.conditions?.join(', ') || 'None'}
        Fitness Goal: ${profile.fitnessGoal || 'Not specified'}
      `;
      scopeNote = `Generate a recipe tailored specifically for ${profile.name}.`;
    }

    const { context: ragContext, ragSources } = await getRagContextSafely(
      `recipes healthy cooking ${profile.dietType || ''} ${items.map(i => i.name).join(' ')}`
    );

    const systemPrompt = `You are a health-conscious recipe assistant. Generate 1 detailed recipe based on the user's pantry items, dietary preferences, and health profile.

${scopeNote}

CRITICAL DIETARY RULES:
- If diet is "vegetarian": NO meat, NO seafood, NO eggs.
- If diet is "vegan": NO animal products at all.
- If diet is "eggetarian": eggs ARE allowed, but NO meat or seafood.
- NEVER suggest any dish containing any family member's listed allergens.

Respond with ONLY the JSON object, no preamble, no explanation, no markdown fencing.

Return a JSON response with this exact structure:
{
  "recipes": [
    {
      "name": "recipe name",
      "description": "brief description (1-2 sentences)",
      "ingredients": ["ingredient with quantity"],
      "instructions": ["step 1", "step 2", ...],
      "health_benefits": "how this recipe aligns with health goals",
      "preparation_time": "estimated time",
      "serves": "number of servings",
      "dietary_tags": ["tag1", "tag2"],
      "missing_ingredients": ["ingredient needed but NOT in pantry"]
    }
  ]
}

IMPORTANT: The "missing_ingredients" field must list ONLY ingredients that are NOT already in the user's pantry. Compare against the provided pantry list carefully. If all ingredients are available, return an empty array.`;

    const userMessage = `${profileContext}\n\nAvailable Pantry Items:\n${pantryList || 'No items in pantry'}\n\nPlease suggest 1 healthy recipe using the available ingredients. List any missing ingredients separately.`;

    const claudeResponse = await queryClaude({
      systemPrompt,
      userMessage,
      context: ragContext,
    });

    const parsed = parseClaudeJson<{ recipes: any[] }>(claudeResponse, { recipes: [] });

    res.json({ recipes: parsed.recipes || [], ragSources: ragSources.length > 0 ? ragSources : null });
  } catch (error: any) {
    console.error('Recipe generation error:', error?.message || error);
    const errMsg = String(error?.message || error || '');
    if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
      res.status(500).json({ error: 'AI service is busy. Please wait a moment and try again.' });
    } else if (errMsg.includes('503') || errMsg.includes('UNAVAILABLE')) {
      res.status(500).json({ error: 'AI service is temporarily unavailable. Please try again shortly.' });
    } else {
      res.status(500).json({ error: 'Recipe generation failed. Please try again.' });
    }
  }
});

export default router;
