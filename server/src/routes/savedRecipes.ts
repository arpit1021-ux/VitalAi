import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import SavedRecipe from '../models/SavedRecipe.js';
import Profile from '../models/Profile.js';

const router = Router();

router.use(authenticate);

const createRecipeSchema = z.object({
  profileId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  emoji: z.string().optional(),
  prepTime: z.string().optional(),
  serves: z.string().optional(),
  dietaryTags: z.array(z.string()).optional(),
  ingredients: z.array(z.string()).optional(),
  instructions: z.array(z.string()).optional(),
  healthBenefits: z.string().optional(),
  nutrition: z.object({
    calories: z.number().optional(),
    protein: z.number().optional(),
    carbs: z.number().optional(),
    fat: z.number().optional(),
  }).optional(),
  source: z.enum(['dinner-ideas', 'pantry', 'manual']).optional(),
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

    const { diet, search, sort } = req.query;
    const query: any = { profileId: req.params.profileId };

    if (diet && diet !== 'all') {
      query.dietaryTags = { $in: [diet as string] };
    }
    if (search) {
      query.name = { $regex: search as string, $options: 'i' };
    }

    let sortOption: any = { createdAt: -1 };
    if (sort === 'oldest') sortOption = { createdAt: 1 };
    if (sort === 'name') sortOption = { name: 1 };

    const recipes = await SavedRecipe.find(query).sort(sortOption);
    res.json({ recipes });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch recipes' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = createRecipeSchema.parse(req.body);

    const profile = await Profile.findOne({
      _id: data.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const existing = await SavedRecipe.findOne({
      profileId: data.profileId,
      name: data.name,
    });
    if (existing) {
      res.status(400).json({ error: 'Recipe already saved' });
      return;
    }

    const recipe = await SavedRecipe.create(data);
    res.status(201).json({ recipe });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    res.status(500).json({ error: 'Failed to save recipe' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const recipe = await SavedRecipe.findById(req.params.id);
    if (!recipe) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }

    const profile = await Profile.findOne({
      _id: recipe.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    await SavedRecipe.findByIdAndDelete(req.params.id);
    res.json({ message: 'Recipe removed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete recipe' });
  }
});

export default router;
