import { motion } from 'framer-motion';
import { Check, AlertTriangle, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { transition, durations } from '@/lib/motion';
import { cn } from '@/lib/utils';

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
  hydration: 'Water',
  foodScanQuality: 'What you ate',
  supplementQuality: 'Supplements',
  dailyActivity: 'Moving about',
  consistency: 'Keeping it up',
};

const factorMaxes: Record<string, number> = {
  hydration: 25,
  foodScanQuality: 30,
  supplementQuality: 20,
  dailyActivity: 15,
  consistency: 10,
};

/**
 * The score reads as a finding about someone's health, so it takes the verdict
 * hues — and only two of them. A quiet week is something to look at, not
 * something to avoid, so `danger` never appears here.
 */
function scoreTone(score: number) {
  return score >= 70
    ? { meter: 'bg-primary', ink: 'text-primary-ink', note: "You're in good shape" }
    : { meter: 'bg-caution', ink: 'text-caution-ink', note: 'A few things worth a look' };
}

export default function HealthScoreCard({
  score,
  hasData = true,
  factors,
  strengths,
  improvements,
  loading,
}: HealthScoreCardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="mb-3 h-12 w-24" />
          <Skeleton className="mb-5 h-2 w-full" />
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
          <CardTitle>Where you're at</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center py-6">
          <span
            aria-hidden="true"
            className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sunk"
          >
            <Activity className="h-7 w-7 text-ink-faint" />
          </span>
          <p className="text-body text-ink">Not enough to go on yet</p>
          <p className="mt-1 max-w-reading text-center text-caption text-ink-muted">
            Track a few days of water and meals and a score will show up here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const tone = scoreTone(score);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where you're at</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="flex items-baseline gap-2">
            {/* The number is the point of this card, so it is set as a stat and
                in a tabular face — it changes in place every day. */}
            <span className={cn('font-mono text-stat tabular-nums', tone.ink)}>{score}</span>
            <span className="text-body text-ink-muted">out of 100</span>
          </div>
          <p className="mt-1 text-body text-ink-muted">{tone.note}</p>
          <div
            className="mt-3 h-2 w-full overflow-hidden rounded-full bg-sunk"
            role="progressbar"
            aria-label="Your health score"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={score}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${score}%` }}
              transition={transition(durations.page)}
              className={cn('h-full rounded-full', tone.meter)}
            />
          </div>
        </div>

        <ul className="space-y-2">
          {Object.entries(factors).map(([key, value]) => {
            const max = factorMaxes[key] ?? 100;
            const pct = Math.round((value / max) * 100);
            return (
              <li key={key} className="flex items-center gap-3">
                <span className="w-24 flex-shrink-0 truncate text-caption text-ink-muted sm:w-28">
                  {factorLabels[key] || key}
                </span>
                <div
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunk"
                  role="progressbar"
                  aria-label={factorLabels[key] || key}
                  aria-valuemin={0}
                  aria-valuemax={max}
                  aria-valuenow={value}
                >
                  {/* Ink, not a hue: five coloured bars beside a scored number
                      would read as five more verdicts. */}
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={transition(durations.page)}
                    className="h-full rounded-full bg-ink/45"
                  />
                </div>
                <span className="w-12 flex-shrink-0 text-right font-mono text-caption tabular-nums text-ink-muted">
                  {value}/{max}
                </span>
              </li>
            );
          })}
        </ul>

        {strengths.length > 0 && (
          <ul className="space-y-1.5 border-t border-line pt-4">
            {strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" aria-hidden="true" />
                <span className="text-body text-ink break-words">{s}</span>
              </li>
            ))}
          </ul>
        )}

        {improvements.length > 0 && (
          <ul className="space-y-1.5 border-t border-line pt-4">
            {improvements.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-caution" aria-hidden="true" />
                <span className="text-body text-ink break-words">{s}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
