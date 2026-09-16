import { Flame } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface StreakTrackerProps {
  currentStreak: number;
  longestStreak: number;
  loading?: boolean;
}

export default function StreakTracker({ currentStreak, longestStreak, loading }: StreakTrackerProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-5 pt-5">
          <Skeleton className="mb-2 h-10 w-24" />
          <Skeleton className="h-3 w-20" />
        </CardContent>
      </Card>
    );
  }

  const going = currentStreak > 0;

  return (
    <Card>
      <CardContent className="p-5 pt-5">
        <div className="flex items-center gap-4">
          {/* A streak is brand energy rather than a finding, which is the one
              thing `accent` is for. The old version pulsed on a loop forever,
              which no reduced-motion setting could stop. */}
          <span
            aria-hidden="true"
            className={cn(
              'flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full',
              going ? 'bg-accent-soft' : 'bg-sunk',
            )}
          >
            <Flame className={cn('h-6 w-6', going ? 'text-accent' : 'text-ink-faint')} />
          </span>
          <div className="min-w-0">
            {going ? (
              <>
                <p className="flex items-baseline gap-2">
                  <span className="font-mono text-stat tabular-nums text-ink">{currentStreak}</span>
                  <span className="text-body text-ink-muted">
                    {currentStreak === 1 ? 'day running' : 'days running'}
                  </span>
                </p>
                {longestStreak > 0 && (
                  <p className="mt-1 text-caption text-ink-muted">
                    Your best is <span className="font-mono tabular-nums">{longestStreak}</span>
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-heading text-ink">Today's a good day to start</p>
                <p className="mt-1 text-caption text-ink-muted">
                  {longestStreak > 0 ? (
                    <>
                      You've managed <span className="font-mono tabular-nums">{longestStreak}</span> in a row before.
                    </>
                  ) : (
                    'Track anything today and the count begins.'
                  )}
                </p>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
