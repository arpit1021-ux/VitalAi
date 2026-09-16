import { motion } from 'framer-motion';
import { Lightbulb } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { rise, stagger, transition, durations } from '@/lib/motion';

interface HealthInsightsProps {
  insights: string[];
  loading?: boolean;
}

export default function HealthInsights({ insights, loading }: HealthInsightsProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-4/6" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 flex-shrink-0 text-primary" aria-hidden="true" />
          What we've noticed
        </CardTitle>
        <p className="text-caption text-ink-muted">Put together once a week</p>
      </CardHeader>
      <CardContent>
        {insights.length === 0 ? (
          <p className="py-4 text-body text-ink-muted">
            Nothing to say yet. Keep tracking and patterns turn up soon enough.
          </p>
        ) : (
          <motion.ul
            variants={stagger()}
            initial="hidden"
            animate="visible"
            className="divide-y divide-line border-y border-line"
          >
            {insights.map((insight, i) => (
              <motion.li
                key={i}
                variants={rise}
                transition={transition(durations.enter)}
                className="max-w-reading py-3 text-body-lg text-ink break-words"
              >
                {insight}
              </motion.li>
            ))}
          </motion.ul>
        )}
      </CardContent>
    </Card>
  );
}
