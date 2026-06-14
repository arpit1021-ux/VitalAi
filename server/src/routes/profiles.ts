import { Router, Request, Response } from 'express';
import { z } from 'zod';
import Profile from '../models/Profile.js';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

const createProfileSchema = z.object({
  name: z.string().min(1),
  age: z.number().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  avatar: z.string().optional(),
  dietType: z.enum(['vegetarian', 'vegan', 'non-veg', 'jain', 'keto', 'diabetic-friendly']).optional(),
  allergies: z.array(z.string()).optional(),
  conditions: z.array(z.string()).optional(),
  medications: z.array(z.object({ name: z.string(), dosage: z.string() })).optional(),
  fitnessGoal: z.enum(['weight-loss', 'muscle-gain', 'maintenance', 'endurance']).optional(),
  activityLevel: z.enum(['sedentary', 'lightly-active', 'active', 'very-active']).optional(),
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const profiles = await Profile.find({ userId: (req as any).jwtUser!.id });
    res.json({ profiles });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profiles' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = createProfileSchema.parse(req.body);
    const profile = await Profile.create({ ...data, userId: (req as any).jwtUser!.id });

    await User.findByIdAndUpdate((req as any).jwtUser!.id, {
      $push: { profiles: profile._id },
    });

    res.status(201).json({ profile });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    res.status(500).json({ error: 'Failed to create profile' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.id,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    res.json({ profile });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOneAndUpdate(
      { _id: req.params.id, userId: (req as any).jwtUser!.id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    res.json({ profile });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOneAndDelete({
      _id: req.params.id,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    await User.findByIdAndUpdate((req as any).jwtUser!.id, {
      $pull: { profiles: profile._id },
    });

    res.json({ message: 'Profile deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete profile' });
  }
});

export default router;
