import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface StreakTrackerProps {
  currentStreak: number;
  longestStreak: number;
  loading?: boolean;
}

export default function StreakTracker({ currentStreak, longestStreak, loading }: StreakTrackerProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-8 w-24 mb-2" />
          <Skeleton className="h-3 w-20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          <motion.div
            animate={currentStreak > 0 ? { scale: [1, 1.15, 1] } : {}}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
          >
            <Flame
              className={`h-8 w-8 ${currentStreak > 0 ? 'text-secondary' : 'text-text-muted/40'}`}
            />
          </motion.div>
          <div>
            <p className="text-2xl font-bold text-text-primary">
              {currentStreak > 0 ? (
                <>{currentStreak} <span className="text-sm font-normal text-text-muted">day streak</span></>
              ) : (
                <span className="text-sm font-normal text-text-muted">Start your streak today!</span>
              )}
            </p>
            {longestStreak > 0 && (
              <p className="text-xs text-text-muted">Best: {longestStreak} days</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
