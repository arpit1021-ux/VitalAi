import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import Profile from '../models/Profile.js';
import DailyLog from '../models/DailyLog.js';
import ScanHistory from '../models/ScanHistory.js';
import { calculateHealthScore } from '../utils/healthScore.js';

const router = Router();

router.use(authenticate);

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

    const today = new Date().toISOString().split('T')[0];
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

    let streak = 0;
    if (streakRes.length > 0) {
      const dates = streakRes.map((l) => l.date);
      const checkDate = new Date(today + 'T00:00:00Z');
      for (const dateStr of dates) {
        const expected = checkDate.toISOString().split('T')[0];
        if (dateStr === expected) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

    const weeklyScans = recentScans.length;

    const result = calculateHealthScore({
      profile,
      todayLog,
      recentScans,
      streak,
      weeklyScans,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate health score' });
  }
});

export default router;
