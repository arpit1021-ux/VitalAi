import { motion } from 'framer-motion';
import { Lightbulb } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

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
          <Lightbulb className="h-5 w-5 text-warning" />
          Health Insights
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-text-muted mb-3">Generated weekly</p>
        <div className="space-y-3">
          {insights.map((insight, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-start gap-3"
            >
              <Lightbulb className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
              <p className="text-sm text-text-primary leading-relaxed">{insight}</p>
            </motion.div>
          ))}
          {insights.length === 0 && (
            <p className="text-sm text-text-muted text-center py-4">
              No insights yet. Keep tracking your health data!
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
