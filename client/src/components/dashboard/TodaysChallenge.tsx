import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface TodaysChallengeProps {
  text: string;
  completed: boolean;
  onComplete: () => void;
  loading?: boolean;
}

export default function TodaysChallenge({ text, completed, onComplete, loading }: TodaysChallengeProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-4 w-48 mb-3" />
          <Skeleton className="h-3 w-full mb-2" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-indigo-500/20">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-indigo-400" />
          <p className="text-sm font-medium text-indigo-400">Today's Challenge</p>
        </div>

        <AnimatePresence mode="wait">
          {completed ? (
            <motion.div
              key="completed"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center gap-3"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.3, 1] }}
                transition={{ duration: 0.5 }}
              >
                <CheckCircle className="h-10 w-10 text-secondary" />
              </motion.div>
              <div>
                <p className="text-sm font-medium text-secondary">Completed!</p>
                <p className="text-xs text-text-muted">Great job staying on track</p>
              </div>
            </motion.div>
          ) : (
            <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <p className="text-sm text-text-primary mb-4">{text}</p>
              <Button size="sm" onClick={onComplete}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Mark as done
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
