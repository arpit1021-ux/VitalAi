import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import DailyLog from '../models/DailyLog.js';
import Profile from '../models/Profile.js';

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

router.get('/:profileId/today', async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const log = await getOrCreateTodayLog(req.params.profileId);
    res.json(log);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch today\'s log' });
  }
});

router.put('/:profileId/water', async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const { count } = req.body;
    if (typeof count !== 'number' || count < 0 || count > 8) {
      res.status(400).json({ error: 'Count must be a number between 0 and 8' });
      return;
    }

    const log = await getOrCreateTodayLog(req.params.profileId);
    log.waterCount = count;
    await log.save();

    res.json(log);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update water count' });
  }
});

router.post('/:profileId/water/add', async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const log = await getOrCreateTodayLog(req.params.profileId);
    const goal = log.waterGoal || 8;
    if (log.waterCount < goal) {
      log.waterCount += 1;
      await log.save();
    }

    res.json(log);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add water' });
  }
});

router.post('/:profileId/water/remove', async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const log = await getOrCreateTodayLog(req.params.profileId);
    if (log.waterCount > 0) {
      log.waterCount -= 1;
      await log.save();
    }

    res.json(log);
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove water' });
  }
});

router.put('/:profileId/water/goal', async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const { goal } = req.body;
    if (typeof goal !== 'number' || goal < 1 || goal > 20) {
      res.status(400).json({ error: 'Goal must be a number between 1 and 20' });
      return;
    }

    const log = await getOrCreateTodayLog(req.params.profileId);
    log.waterGoal = goal;
    await log.save();

    res.json(log);
  } catch (error) {
    res.status(500).json({ error: 'Failed to set water goal' });
  }
});

router.put('/:profileId/plate', async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const { group, value, entry } = req.body;
    const validGroups = ['veg', 'fruit', 'protein', 'grains', 'dairy'];
    if (!validGroups.includes(group)) {
      res.status(400).json({ error: 'Invalid plate group' });
      return;
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
  } catch (error) {
    res.status(500).json({ error: 'Failed to update plate group' });
  }
});

router.put('/:profileId/challenge', async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const { completed } = req.body;
    if (typeof completed !== 'boolean') {
      res.status(400).json({ error: 'Completed must be a boolean' });
      return;
    }

    const today = getToday();
    const log = await DailyLog.findOne({ profileId: req.params.profileId, date: today });
    if (!log) {
      res.status(404).json({ error: 'No log found for today' });
      return;
    }

    log.challenge = log.challenge
      ? { ...log.challenge, completed }
      : { text: CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)], completed };
    await log.save();

    res.json(log);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update challenge' });
  }
});

router.get('/:profileId/streak', async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
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
    let checkDate = new Date(today + 'T00:00:00Z');

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
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate streak' });
  }
});

router.post('/:profileId/activity', async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const log = await getOrCreateTodayLog(req.params.profileId);
    log.streakDay = true;
    await log.save();

    res.json(log);
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark activity' });
  }
});

router.get('/:profileId/tips', async (req: Request, res: Response) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.profileId,
      userId: (req as any).jwtUser!.id,
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
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
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tips' });
  }
});

export default router;
