export interface HealthScoreResult {
  score: number | null;
  hasData: boolean;
  factors: {
    hydration: number;
    foodScanQuality: number;
    supplementQuality: number;
    dailyActivity: number;
    consistency: number;
  };
  strengths: string[];
  improvements: string[];
}

export function calculateHealthScore(data: {
  /** Accepted for call-site symmetry with the other scorers; not read here. */
  profile?: unknown;
  todayLog: any;
  recentScans: any[];
  streak: number;
  weeklyScans: number;
}): HealthScoreResult {
  const { todayLog, recentScans, streak, weeklyScans } = data;

  const hasAnyData = (todayLog && todayLog.waterCount > 0) || recentScans.length > 0 || streak > 0;

  if (!hasAnyData) {
    return {
      score: null,
      hasData: false,
      factors: { hydration: 0, foodScanQuality: 0, supplementQuality: 0, dailyActivity: 0, consistency: 0 },
      strengths: [],
      improvements: [],
    };
  }

  const waterCount = todayLog?.waterCount || 0;
  const waterGoal = todayLog?.waterGoal || 8;
  const hydration = Math.min(Math.round((waterCount / waterGoal) * 25), 25);

  const foodScans = recentScans.filter((s) => s.type === 'food');
  const foodScanQuality = foodScans.length > 0
    ? Math.round((foodScans.filter((s) => s.aiVerdict?.verdict === 'safe').length / foodScans.length) * 30)
    : 0;

  const supplementScans = recentScans.filter((s) => s.type === 'supplement');
  const supplementQuality = supplementScans.length > 0
    ? Math.round(
        (supplementScans.reduce((sum, s) => sum + (s.aiVerdict?.goal_alignment_score || 0), 0) /
          supplementScans.length /
          10) *
          20
      )
    : 0;

  const dailyActivity = Math.min(Math.round(streak * 3), 15);
  const consistency = Math.round(Math.min(weeklyScans / 5, 1) * 10);

  const score = hydration + foodScanQuality + supplementQuality + dailyActivity + consistency;

  const factors = { hydration, foodScanQuality, supplementQuality, dailyActivity, consistency };

  const strengths: string[] = [];
  const improvements: string[] = [];

  if (hydration >= 20) {
    strengths.push('Great hydration today!');
  } else if (hydration < 10) {
    improvements.push('Drink more water — aim to reach your daily goal.');
  }

  if (foodScanQuality > 0 && foodScanQuality >= 24) {
    strengths.push('Your food choices look great!');
  } else if (foodScanQuality > 0 && foodScanQuality < 15) {
    improvements.push('Try to scan more food items and choose safer options.');
  }

  if (supplementQuality > 0 && supplementQuality >= 16) {
    strengths.push('Your supplements align well with your goals.');
  } else if (supplementQuality > 0 && supplementQuality < 10) {
    improvements.push('Review your supplements for better goal alignment.');
  }

  if (dailyActivity >= 12) {
    strengths.push('Excellent activity streak!');
  } else if (dailyActivity < 6) {
    improvements.push('Build a consistent daily activity routine.');
  }

  if (consistency >= 8) {
    strengths.push('You\'re very consistent with your health tracking.');
  } else if (consistency < 4) {
    improvements.push('Scan more items this week for better insights.');
  }

  if (strengths.length === 0 && improvements.length === 0) {
    improvements.push('Keep tracking to build your health profile.');
  }

  return { score, hasData: true, factors, strengths, improvements };
}
