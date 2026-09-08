import { Router, Request, Response } from 'express';
import { z } from 'zod';
import Profile from '../models/Profile.js';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { objectId, validate } from '../middleware/validate.js';
import { forbidden, notFound } from '../utils/AppError.js';
import { env } from '../config/env.js';

const router = Router();

router.use(authenticate);

const profileFields = {
  name: z.string().min(1),
  age: z.number().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  avatar: z.string().optional(),
  dietType: z.enum(['vegetarian', 'vegan', 'eggetarian', 'non-veg', 'jain', 'keto', 'diabetic-friendly']).optional(),
  allergies: z.array(z.string()).optional(),
  conditions: z.array(z.string()).optional(),
  medications: z.array(z.object({ name: z.string(), dosage: z.string() })).optional(),
  fitnessGoal: z.enum(['weight-loss', 'muscle-gain', 'maintenance', 'endurance']).optional(),
  activityLevel: z.enum(['sedentary', 'lightly-active', 'active', 'very-active']).optional(),
} as const;

const createProfileSchema = z.object(profileFields).strict();

// Every field optional, but the set of permitted fields is closed.
const updateProfileSchema = z
  .object({ ...profileFields, name: profileFields.name.optional() })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update.');

const profileParams = z.object({ id: objectId });

router.get('/', async (req: Request, res: Response) => {
  try {
    const profiles = await Profile.find({ userId: req.jwtUser!.id });
    res.json({ profiles });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profiles' });
  }
});

router.post(
  '/',
  validate({ body: createProfileSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const data = req.body as z.infer<typeof createProfileSchema>;

    // A profile is where health data enters the system, so this is the point
    // at which consent has to exist. Checking it here rather than at sign-up
    // means a policy change can require it again without locking anyone out of
    // data they have already stored.
    const account = await User.findById(req.jwtUser!.id, { consent: 1 });
    if (account?.consent?.version !== env.CONSENT_VERSION) {
      throw forbidden(
        'Your consent to health data processing is needed before creating a profile.',
        'Review and accept the current privacy terms, then try again.',
      );
    }

    const profile = await Profile.create({ ...data, userId: req.jwtUser!.id });

    await User.findByIdAndUpdate(req.jwtUser!.id, { $push: { profiles: profile._id } });

    res.status(201).json({ profile });
  }),
);

router.get('/:id', validate({ params: profileParams }), async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.id,
      userId: req.jwtUser!.id,
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

router.put(
  '/:id',
  validate({ params: profileParams, body: updateProfileSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    // Loaded and saved rather than updated in place, for two reasons: an
    // update query bypasses the pre('save') hook that encrypts the health
    // fields, and assigning only allowlisted keys keeps a caller from reaching
    // fields the schema never meant to expose — the shape the Mongoose
    // prototype-pollution advisory describes.
    const profile = await Profile.findOne({ _id: req.params.id, userId: req.jwtUser!.id });
    if (!profile) throw notFound('That profile');

    const updates = req.body as Partial<Record<keyof typeof profileFields, unknown>>;
    for (const [field, value] of Object.entries(updates)) {
      profile.set(field, value);
    }

    await profile.save();

    res.json({ profile });
  }),
);

router.delete('/:id', validate({ params: profileParams }), async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.id,
      userId: req.jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const profileCount = await Profile.countDocuments({ userId: req.jwtUser!.id });
    if (profileCount <= 1) {
      res.status(400).json({ error: 'Cannot delete your only profile. Create another profile first.' });
      return;
    }

    await Profile.findOneAndDelete({
      _id: req.params.id,
      userId: req.jwtUser!.id,
    });

    await User.findByIdAndUpdate(req.jwtUser!.id, {
      $pull: { profiles: profile._id },
    });

    res.json({ message: 'Profile deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete profile' });
  }
});

export default router;
