import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import DailyLog from '../models/DailyLog.js';
import Profile from '../models/Profile.js';
import { objectId, validate } from '../middleware/validate.js';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, notFound } from '../utils/AppError.js';

const PLATE_GROUPS = ['veg', 'fruit', 'protein', 'grains', 'dairy'] as const;

const waterCountSchema = z.object({ count: z.coerce.number().int().min(0).max(30) });
const waterGoalSchema = z.object({ goal: z.coerce.number().int().min(1).max(30) });
const challengeSchema = z.object({ completed: z.boolean() });
const plateSchema = z.object({
  group: z.enum(PLATE_GROUPS),
  value: z.boolean(),
  entry: z.string().trim().max(200).optional(),
});

const router = Router();

router.use(authenticate);

const getToday = (): string => new Date().toISOString().split('T')[0];

const CHALLENGES = [
  'Drink a glass of water before every meal today.',
  'Take a 15-minute walk after lunch.',
  'Eat at least 3 servings of vegetables today.',
  'Try a new healthy recipe.',
  'Stretch for 10 minutes before bed.',
  'Replace one sugary drink with water.',
  'Do 20 push-ups or squats.',
  'Write down 3 things you are grateful for.',
  'Eat a piece of fruit as a snack.',
  'Go to bed 30 minutes earlier tonight.',
];

async function getOrCreateTodayLog(profileId: string): Promise<any> {
  const today = getToday();
  let log = await DailyLog.findOne({ profileId, date: today });
  if (!log) {
    log = await DailyLog.create({
      profileId,
      date: today,
      waterCount: 0,
      plateGroups: { veg: false, fruit: false, protein: false, grains: false, dairy: false },
      challenge: {
        text: CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)],
        completed: false,
      },
      streakDay: false,
    });
  }
  return log;
}

router.get('/:profileId/today', validate({ params: z.object({ profileId: objectId }) }), asyncHandler(async (req: Request, res: Response) => {
  const profile = await Profile.findOne({
    _id: req.params.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
  }

  const log = await getOrCreateTodayLog(req.params.profileId);
  res.json(log);
}));

router.put('/:profileId/water', validate({ params: z.object({ profileId: objectId }), body: waterCountSchema }), asyncHandler(async (req: Request, res: Response) => {
  const profile = await Profile.findOne({
    _id: req.params.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
  }

  const { count } = req.body as z.infer<typeof waterCountSchema>;
  if (typeof count !== 'number' || count < 0 || count > 8) {
    throw badRequest('A glass count has to be between 0 and 8.', 'Pick a number in that range.');
  }

  const log = await getOrCreateTodayLog(req.params.profileId);
  log.waterCount = count;
  await log.save();

  res.json(log);
}));

router.post('/:profileId/water/add', validate({ params: z.object({ profileId: objectId }) }), asyncHandler(async (req: Request, res: Response) => {
  const profile = await Profile.findOne({
    _id: req.params.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
  }

  const log = await getOrCreateTodayLog(req.params.profileId);
  const goal = log.waterGoal || 8;
  if (log.waterCount < goal) {
    log.waterCount += 1;
    await log.save();
  }

  res.json(log);
}));

router.post('/:profileId/water/remove', validate({ params: z.object({ profileId: objectId }) }), asyncHandler(async (req: Request, res: Response) => {
  const profile = await Profile.findOne({
    _id: req.params.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
  }

  const log = await getOrCreateTodayLog(req.params.profileId);
  if (log.waterCount > 0) {
    log.waterCount -= 1;
    await log.save();
  }

  res.json(log);
}));

router.put('/:profileId/water/goal', validate({ params: z.object({ profileId: objectId }), body: waterGoalSchema }), asyncHandler(async (req: Request, res: Response) => {
  const profile = await Profile.findOne({
    _id: req.params.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
  }

  const { goal } = req.body as z.infer<typeof waterGoalSchema>;
  if (typeof goal !== 'number' || goal < 1 || goal > 20) {
    throw badRequest('A daily water goal has to be between 1 and 20 glasses.', 'Pick a number in that range.');
  }

  const log = await getOrCreateTodayLog(req.params.profileId);
  log.waterGoal = goal;
  await log.save();

  res.json(log);
}));

router.put('/:profileId/plate', validate({ params: z.object({ profileId: objectId }), body: plateSchema }), asyncHandler(async (req: Request, res: Response) => {
  const profile = await Profile.findOne({
    _id: req.params.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
  }

  const { group, value, entry } = req.body as z.infer<typeof plateSchema>;
  const validGroups = ['veg', 'fruit', 'protein', 'grains', 'dairy'];
  if (!validGroups.includes(group)) {
    throw badRequest('That is not one of the food groups.', 'Choose vegetables, fruit, protein, grains or dairy.');
  }

  const log = await getOrCreateTodayLog(req.params.profileId);
  log.plateGroups[group as keyof typeof log.plateGroups] = value;

  if (!log.plateEntries) {
    log.plateEntries = {} as any;
  }
  if (value && entry) {
    (log.plateEntries as any)[group] = entry;
  } else if (!value) {
    (log.plateEntries as any)[group] = undefined;
  }

  await log.save();

  res.json(log);
}));

router.put('/:profileId/challenge', validate({ params: z.object({ profileId: objectId }), body: challengeSchema }), asyncHandler(async (req: Request, res: Response) => {
  const profile = await Profile.findOne({
    _id: req.params.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
  }

  const { completed } = req.body as z.infer<typeof challengeSchema>;
  if (typeof completed !== 'boolean') {
    throw badRequest('The challenge can only be marked done or not done.', 'Try tapping the control again.');
  }

  const today = getToday();
  const log = await DailyLog.findOne({ profileId: req.params.profileId, date: today });
  if (!log) {
    throw notFound("Today's log", 'Open the dashboard once to start today, then try again.');
  }

  log.challenge = log.challenge
    ? { ...log.challenge, completed }
    : { text: CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)], completed };
  await log.save();

  res.json(log);
}));

router.get('/:profileId/streak', validate({ params: z.object({ profileId: objectId }) }), asyncHandler(async (req: Request, res: Response) => {
  const profile = await Profile.findOne({
    _id: req.params.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
  }

  const activeLogs = await DailyLog.find({
    profileId: req.params.profileId,
    streakDay: true,
  })
    .sort({ date: -1 })
    .lean();

  if (activeLogs.length === 0) {
    res.json({ currentStreak: 0, longestStreak: 0 });
    return;
  }

  const dates = activeLogs.map((l) => l.date);

  let currentStreak = 0;
  const today = getToday();
  const checkDate = new Date(today + 'T00:00:00Z');

  for (let i = 0; i < dates.length; i++) {
    const expected = checkDate.toISOString().split('T')[0];
    if (dates[i] === expected) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  let longestStreak = 0;
  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + 'T00:00:00Z');
    const curr = new Date(dates[i] + 'T00:00:00Z');
    const diffDays = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays === 1) {
      streak++;
    } else {
      longestStreak = Math.max(longestStreak, streak);
      streak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, streak);

  res.json({ currentStreak, longestStreak });
}));

router.post('/:profileId/activity', validate({ params: z.object({ profileId: objectId }) }), asyncHandler(async (req: Request, res: Response) => {
  const profile = await Profile.findOne({
    _id: req.params.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
  }

  const log = await getOrCreateTodayLog(req.params.profileId);
  log.streakDay = true;
  await log.save();

  res.json(log);
}));

router.get('/:profileId/tips', validate({ params: z.object({ profileId: objectId }) }), asyncHandler(async (req: Request, res: Response) => {
  const profile = await Profile.findOne({
    _id: req.params.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
  }

  const tips: string[] = [];
  const conditions = profile.conditions || [];
  const diet = profile.dietType || '';
  const goal = profile.fitnessGoal || '';

  if (conditions.length > 0) {
    tips.push(`Since you have ${conditions.join(' and ')}, consult your doctor before making major diet changes.`);
  }
  tips.push(`Stay hydrated! Aim for at least 8 glasses of water today to support your ${goal || 'general'} fitness goals.`);
  tips.push(`Fill half your plate with vegetables and fruits for better nutrition${diet ? `, especially on your ${diet} diet` : ''}.`);
  tips.push(`Try to get 7-9 hours of sleep tonight — quality rest is essential for recovery and energy.`);
  tips.push(`Take a 10-minute walk after meals to aid digestion and boost your daily activity.`);
  tips.push(`Include a source of lean protein in each meal to support muscle maintenance and satiety.`);
  tips.push(`Mindful eating matters — chew slowly and savor your meals to improve digestion and satisfaction.`);

  const selected = tips.sort(() => 0.5 - Math.random()).slice(0, 5);

  res.json({ tips: selected });
}));

export default router;
