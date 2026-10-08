import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import Profile from '../models/Profile.js';
import DailyLog from '../models/DailyLog.js';
import ScanHistory from '../models/ScanHistory.js';
import { calculateHealthScore } from '../utils/healthScore.js';
import { objectId, validate } from '../middleware/validate.js';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { notFound } from '../utils/AppError.js';
import { currentStreak, todayKey } from '../utils/streak.js';

const router = Router();

router.use(authenticate);

router.get('/:profileId', validate({ params: z.object({ profileId: objectId }) }), asyncHandler(async (req: Request, res: Response) => {
  const profile = await Profile.findOne({
    _id: req.params.profileId,
    userId: req.jwtUser!.id,
  });
  if (!profile) {
    throw notFound('That profile');
  }

  const today = todayKey();
  const todayLog = await DailyLog.findOne({ profileId: profile._id, date: today });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentScans = await ScanHistory.find({
    profileId: profile._id,
    createdAt: { $gte: sevenDaysAgo },
  }).sort({ createdAt: -1 });

  const streakRes = await DailyLog.find({
    profileId: profile._id,
    streakDay: true,
  })
    .sort({ date: -1 })
    .lean();

  const streak = currentStreak(streakRes.map((log) => log.date), today);

  const weeklyScans = recentScans.length;

  const result = calculateHealthScore({
    profile,
    todayLog,
    recentScans,
    streak,
    weeklyScans,
  });

  res.json(result);
}));

export default router;
