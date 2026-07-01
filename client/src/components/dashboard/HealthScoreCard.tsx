import { motion } from 'framer-motion';
import { TrendingUp, CheckCircle, AlertTriangle, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface HealthScoreCardProps {
  score: number | null;
  hasData?: boolean;
  factors: {
    hydration: number;
    foodScanQuality: number;
    supplementQuality: number;
    dailyActivity: number;
    consistency: number;
  };
  strengths: string[];
  improvements: string[];
  loading?: boolean;
}

const factorLabels: Record<string, string> = {
  hydration: 'Hydration',
  foodScanQuality: 'Food Quality',
  supplementQuality: 'Supplements',
  dailyActivity: 'Daily Activity',
  consistency: 'Consistency',
};

const factorMaxes: Record<string, number> = {
  hydration: 25,
  foodScanQuality: 30,
  supplementQuality: 20,
  dailyActivity: 15,
  consistency: 10,
};

export default function HealthScoreCard({
  score,
  hasData = true,
  factors,
  strengths,
  improvements,
  loading,
}: HealthScoreCardProps) {
  const getScoreColor = (s: number) => {
    if (s >= 80) return '#10B981';
    if (s >= 50) return '#F59E0B';
    return '#EF4444';
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="flex justify-center mb-4">
            <Skeleton className="h-32 w-32 rounded-full" />
          </div>
          <Skeleton className="h-4 w-24 mx-auto mb-4" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!hasData || score === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Health Score
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center py-6">
          <div className="h-20 w-20 rounded-full bg-surface flex items-center justify-center mb-4">
            <Activity className="h-8 w-8 text-text-muted/40" />
          </div>
          <p className="text-sm text-text-muted text-center mb-1">Not enough data yet</p>
          <p className="text-xs text-text-muted/70 text-center">Complete activities to generate your first score</p>
        </CardContent>
      </Card>
    );
  }

  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const scoreColor = getScoreColor(score);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Health Score
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex justify-center mb-4">
          <div className="relative">
            <svg width="130" height="130" viewBox="0 0 120 120" className="transform -rotate-90">
              <circle cx="60" cy="60" r="54" fill="none" stroke="#1F2937" strokeWidth="8" />
              <motion.circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke={scoreColor}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: 'spring' }}
                className="text-3xl font-bold"
                style={{ color: scoreColor }}
              >
                {score}
              </motion.span>
              <span className="text-xs text-text-muted">/ 100</span>
            </div>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          {Object.entries(factors).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-text-muted w-28 truncate">
                {factorLabels[key] || key}
              </span>
              <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(value / factorMaxes[key]) * 100}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: getScoreColor((value / factorMaxes[key]) * 100) }}
                />
              </div>
              <span className="text-xs text-text-muted w-8 text-right">{value}/{factorMaxes[key]}</span>
            </div>
          ))}
        </div>

        {strengths.length > 0 && (
          <div className="mb-3">
            {strengths.map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                className="flex items-center gap-2 mb-1.5"
              >
                <CheckCircle className="h-3.5 w-3.5 text-secondary flex-shrink-0" />
                <span className="text-xs text-text-primary">{s}</span>
              </motion.div>
            ))}
          </div>
        )}

        {improvements.length > 0 && (
          <div>
            {improvements.map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 + i * 0.1 }}
                className="flex items-center gap-2 mb-1.5"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-warning flex-shrink-0" />
                <span className="text-xs text-text-primary">{s}</span>
              </motion.div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
