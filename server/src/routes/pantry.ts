import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { getRagContext } from '../services/retrieval.js';
import { generateText } from '../services/llm.js';
import { parseJsonResponse } from '../utils/parseJsonResponse.js';
import PantryItem from '../models/PantryItem.js';
import Profile from '../models/Profile.js';
import { logger } from '../utils/logger.js';
import { objectId, validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);

const createItemSchema = z
  .object({
    profileId: objectId,
    name: z.string().trim().min(1, 'Give the item a name.').max(120),
    quantity: z.number().positive().max(100_000).optional(),
    unit: z.string().trim().max(24).optional(),
    category: z.enum(['grains', 'dairy', 'produce', 'protein', 'spices', 'other']).optional(),
    expiryDate: z.coerce.date().optional(),
  })
  .strict();

// The set of updatable fields is closed, and profileId is not among them:
// moving an item between profiles would bypass the ownership check performed
// when it was created.
const updateItemSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    quantity: z.number().positive().max(100_000).optional(),
    unit: z.string().trim().max(24).optional(),
    category: z.enum(['grains', 'dairy', 'produce', 'protein', 'spices', 'other']).optional(),
    expiryDate: z.coerce.date().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update.');

const recipeRequestSchema = z
  .object({
    profileId: objectId,
    scope: z.enum(['me', 'family']).default('me'),
    selectedItemIds: z.array(objectId).max(100).optional(),
  })
  .strict();

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = createItemSchema.parse(req.body);

    const profile = await Profile.findOne({ _id: data.profileId, userId: req.jwtUser!.id });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const item = await PantryItem.create(data);

    res.status(201).json({ item });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    res.status(500).json({ error: 'Failed to create pantry item' });
  }
});

router.get('/:profileId', validate({ params: z.object({ profileId: objectId }) }), async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.profileId,
      userId: req.jwtUser!.id,
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

router.put(
  '/:id',
  validate({ params: z.object({ id: objectId }), body: updateItemSchema }),
  async (req: Request, res: Response) => {
  try {
    const item = await PantryItem.findById(req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const profile = await Profile.findOne({
      _id: item.profileId,
      userId: req.jwtUser!.id,
    });
    if (!profile) {
      res.status(403).json({ error: 'Not authorized to update this item' });
      return;
    }

    const updatedItem = await PantryItem.findByIdAndUpdate(req.params.id, { $set: req.body }, {
      new: true,
      runValidators: true,
    });
    res.json({ item: updatedItem });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update item' });
  }
});

router.delete('/:id', validate({ params: z.object({ id: objectId }) }), async (req: Request, res: Response) => {
  try {
    const item = await PantryItem.findById(req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const profile = await Profile.findOne({
      _id: item.profileId,
      userId: req.jwtUser!.id,
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

router.post('/recipes', validate({ body: recipeRequestSchema }), async (req: Request, res: Response) => {
  try {
    const { profileId, scope, selectedItemIds } = req.body as z.infer<typeof recipeRequestSchema>;

    const profile = await Profile.findOne({ _id: profileId, userId: req.jwtUser!.id });
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
      const allProfiles = await Profile.find({ userId: req.jwtUser!.id });
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

    const { context: ragContext, ragSources } = await getRagContext(
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

    const modelResponse = await generateText({

      userId: req.jwtUser!.id,

      operation: 'pantry.recipes',

        maxOutputTokens: 2048,
      systemPrompt,
      userMessage,
      context: ragContext,
    });

    const parsed = parseJsonResponse<{ recipes: any[] }>(modelResponse, { recipes: [] });

    res.json({ recipes: parsed.recipes || [], ragSources: ragSources.length > 0 ? ragSources : null });
  } catch (error: any) {
    logger.error('Pantry recipe generation failed', error);
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
