import { motion } from 'framer-motion';
import { Droplets, Apple, Activity, Lightbulb } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface HealthCoachProps {
  message: string;
  category: string;
  priority: string;
  loading?: boolean;
}

const categoryConfig: Record<string, { icon: typeof Droplets; color: string }> = {
  hydration: { icon: Droplets, color: '#3B82F6' },
  nutrition: { icon: Apple, color: '#10B981' },
  activity: { icon: Activity, color: '#6366F1' },
  general: { icon: Lightbulb, color: '#F59E0B' },
};

export default function HealthCoach({ message, category, priority, loading }: HealthCoachProps) {
  if (loading) {
    return (
      <Card className="border-indigo-500/20">
        <CardContent className="p-6">
          <Skeleton className="h-4 w-32 mb-3" />
          <Skeleton className="h-3 w-full mb-2" />
          <Skeleton className="h-3 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  const config = categoryConfig[category] || categoryConfig.general;
  const Icon = config.icon;

  return (
    <Card className="relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-10"
        style={{
          background: `linear-gradient(135deg, #6366F1, #10B981)`,
        }}
      />
      <CardContent className="p-6 relative z-10">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${config.color}20` }}
          >
            <Icon className="h-5 w-5" style={{ color: config.color }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-text-primary">AI Health Coach</p>
            <Badge variant="secondary" className="text-xs mt-0.5">
              {category}
            </Badge>
          </div>
          {priority === 'high' && (
            <Badge variant="destructive" className="text-xs">Priority</Badge>
          )}
        </div>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-text-primary leading-relaxed"
        >
          {message}
        </motion.p>
      </CardContent>
    </Card>
  );
}
