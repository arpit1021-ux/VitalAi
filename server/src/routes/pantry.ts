import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { searchKnowledgeBase } from '../services/rag.js';
import { queryClaude } from '../services/claude.js';
import PantryItem from '../models/PantryItem.js';
import Profile from '../models/Profile.js';

const router = Router();

router.use(authenticate);

const createItemSchema = z.object({
  profileId: z.string(),
  name: z.string().min(1),
  quantity: z.number().optional(),
  unit: z.string().optional(),
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
    const items = await PantryItem.find({ profileId: req.params.profileId });
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pantry items' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const item = await PantryItem.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }
    res.json({ item });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update item' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const item = await PantryItem.findByIdAndDelete(req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }
    res.json({ message: 'Item deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

router.post('/recipes', async (req: Request, res: Response) => {
  try {
    const { profileId } = req.body;

    const profile = await Profile.findOne({ _id: profileId, userId: (req as any).jwtUser!.id });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const items = await PantryItem.find({ profileId });
    const pantryList = items
      .map((i) => `${i.name}${i.quantity ? ` (${i.quantity}${i.unit || ''})` : ''}`)
      .join(', ');

    const profileContext = `
      Name: ${profile.name}
      Diet Type: ${profile.dietType || 'Not specified'}
      Allergies: ${profile.allergies?.join(', ') || 'None'}
      Conditions: ${profile.conditions?.join(', ') || 'None'}
      Fitness Goal: ${profile.fitnessGoal || 'Not specified'}
    `;

    const ragResults = await searchKnowledgeBase(
      `recipes healthy cooking ${profile.dietType || ''} ${items.map(i => i.name).join(' ')}`
    );

    const contextChunks = ragResults
      .map((r) => `[Source: ${r.metadata.source}] ${r.text}`)
      .join('\n\n');

    const systemPrompt = `You are a health-conscious recipe assistant. Generate 3 personalized recipes based on the user's pantry items, dietary preferences, and health profile.

Return a JSON response with this exact structure:
{
  "recipes": [
    {
      "name": "recipe name",
      "description": "brief description",
      "ingredients": ["ingredient list"],
      "instructions": ["step by step instructions"],
      "health_benefits": "how this recipe aligns with user's health goals",
      "preparation_time": "estimated time"
    }
  ]
}`;

    const userMessage = `Health Profile:\n${profileContext}\n\nAvailable Pantry Items:\n${pantryList}\n\nPlease suggest 3 healthy recipes using the available ingredients.`;

    const claudeResponse = await queryClaude({
      systemPrompt,
      userMessage,
      context: contextChunks,
    });

    let parsed;
    try {
      const jsonMatch = claudeResponse.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { recipes: [] };
    } catch {
      parsed = { recipes: [], raw: claudeResponse };
    }

    res.json({ recipes: parsed.recipes || [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate recipes' });
  }
});

export default router;
