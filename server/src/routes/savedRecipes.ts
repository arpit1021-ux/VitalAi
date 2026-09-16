import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import SavedRecipe from '../models/SavedRecipe.js';
import Profile from '../models/Profile.js';
import { objectId, searchTerm, validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { conflict, forbidden, notFound } from '../utils/AppError.js';

const listQuerySchema = z.object({
  diet: z.string().trim().max(40).optional(),
  search: searchTerm.optional(),
  sort: z.enum(['recent', 'oldest', 'name']).default('recent'),
});

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

router.get('/:profileId', validate({ params: z.object({ profileId: objectId }), query: listQuerySchema }), asyncHandler(async (req: Request, res: Response) => {
  const profile = await Profile.findOne({
    _id: req.params.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
  }

  const { diet, search, sort } = req.query as unknown as z.infer<typeof listQuerySchema>;
  const query: any = { profileId: req.params.profileId };

  if (diet && diet !== 'all') {
    query.dietaryTags = { $in: [diet] };
  }
  if (search) {
    // searchTerm has already stripped regex metacharacters, so this cannot
    // be used to inject a pathological pattern.
    query.name = { $regex: search, $options: 'i' };
  }

  let sortOption: any = { createdAt: -1 };
  if (sort === 'oldest') sortOption = { createdAt: 1 };
  if (sort === 'name') sortOption = { name: 1 };

  const recipes = await SavedRecipe.find(query).sort(sortOption);
  res.json({ recipes });
}));

// Validated by the middleware: a ZodError caught here lost the field it
// belonged to, and the same catch swallowed AppError — the "already saved"
// conflict came back as a generic 500.
router.post('/', validate({ body: createRecipeSchema }), asyncHandler(async (req: Request, res: Response) => {
  const data = req.body as z.infer<typeof createRecipeSchema>;

  const profile = await Profile.findOne({
    _id: data.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
  }

  const existing = await SavedRecipe.findOne({
    profileId: data.profileId,
    name: data.name,
  });
  if (existing) {
    throw conflict('That recipe is already saved.', 'Open it from your saved recipes.');
  }

  const recipe = await SavedRecipe.create(data);
  res.status(201).json({ recipe });
}));

router.delete('/:id', validate({ params: z.object({ id: objectId }) }), asyncHandler(async (req: Request, res: Response) => {
  const recipe = await SavedRecipe.findById(req.params.id);
  if (!recipe) {
    throw notFound('That saved recipe');
  }

  const profile = await Profile.findOne({
    _id: recipe.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw forbidden('That was created by someone else.');
  }

  await SavedRecipe.findByIdAndDelete(req.params.id);
  res.json({ message: 'Recipe removed' });
}));

export default router;
