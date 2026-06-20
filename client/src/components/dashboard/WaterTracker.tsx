import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Droplets, Minus, Plus, Settings } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

interface WaterTrackerProps {
  count: number;
  goal: number;
  onAdd: () => void;
  onRemove: () => void;
  onSetGoal: (goal: number) => void;
  loading?: boolean;
  goalReached?: boolean;
}

function CelebrationParticle({ index }: { index: number }) {
  const angle = (index / 12) * Math.PI * 2;
  const distance = 60 + Math.random() * 30;
  const colors = ['#3B82F6', '#10B981', '#6366F1', '#F59E0B', '#EF4444'];
  const color = colors[index % colors.length];

  return (
    <motion.div
      initial={{ scale: 0, opacity: 1, x: 0, y: 0 }}
      animate={{
        scale: [0, 1.5, 0],
        opacity: [1, 1, 0],
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
      }}
      transition={{ duration: 1.2, ease: 'easeOut' }}
      className="absolute left-1/2 top-1/2 w-2 h-2 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

export default function WaterTracker({
  count,
  goal,
  onAdd,
  onRemove,
  onSetGoal,
  loading,
  goalReached,
}: WaterTrackerProps) {
  const [showGoalInput, setShowGoalInput] = useState(false);
  const [goalInput, setGoalInput] = useState(String(goal));

  const percentage = goal > 0 ? Math.min((count / goal) * 100, 100) : 0;
  const isComplete = percentage >= 100;
  const ringColor = isComplete ? '#10B981' : '#3B82F6';

  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const handleSetGoal = useCallback(() => {
    const num = parseInt(goalInput, 10);
    if (!isNaN(num) && num > 0 && num <= 30) {
      onSetGoal(num);
      setShowGoalInput(false);
    }
  }, [goalInput, onSetGoal]);

  const glassCount = Math.min(goal, 8);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-4 w-32 mb-4" />
          <div className="flex justify-center mb-4">
            <Skeleton className="h-32 w-32 rounded-full" />
          </div>
          <div className="flex gap-2 justify-center">
            {Array.from({ length: glassCount }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-7 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Droplets className="h-4 w-4 text-[#3B82F6]" />
          <p className="text-sm font-medium text-text-primary">Water Intake</p>
          <span className="text-sm text-text-muted ml-auto">
            {count}/{goal} glasses
          </span>
        </div>

        <div className="relative flex justify-center mb-4">
          <div className="relative">
            <svg width="130" height="130" viewBox="0 0 120 120" className="transform -rotate-90">
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="#1F2937"
                strokeWidth="8"
              />
              <motion.circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke={ringColor}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.span
                key={count}
                initial={{ scale: 1.3 }}
                animate={{ scale: 1 }}
                className="text-2xl font-bold text-text-primary"
              >
                {count}
              </motion.span>
              <span className="text-xs text-text-muted">glasses</span>
            </div>

            <AnimatePresence>
              {goalReached && (
                <div className="absolute inset-0 pointer-events-none">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <CelebrationParticle key={i} index={i} />
                  ))}
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <p className="text-center text-sm text-text-muted mb-4">
          {Math.round(percentage)}% complete
          {isComplete && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="ml-2 text-secondary"
            >
              ✓ Goal reached!
            </motion.span>
          )}
        </p>

        <div className="flex gap-2 justify-center mb-4">
          {Array.from({ length: glassCount }).map((_, i) => (
            <motion.div
              key={i}
              initial={false}
              animate={{ scale: i < count ? 1.1 : 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <Droplets
                className={`h-7 w-7 transition-colors ${
                  i < count ? 'text-[#3B82F6]' : 'text-text-muted/30'
                }`}
                fill={i < count ? '#3B82F6' : 'none'}
              />
            </motion.div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-3">
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="outline"
              size="icon"
              onClick={onRemove}
              disabled={count <= 0}
              aria-label="Remove water glass"
            >
              <Minus className="h-4 w-4" />
            </Button>
          </motion.div>

          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              size="icon"
              onClick={onAdd}
              aria-label="Add water glass"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </motion.div>

          <div className="relative">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setGoalInput(String(goal));
                  setShowGoalInput(!showGoalInput);
                }}
                aria-label="Set water goal"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </motion.div>

            <AnimatePresence>
              {showGoalInput && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-surface border border-border rounded-xl p-3 shadow-xl z-10 w-40"
                >
                  <p className="text-xs text-text-muted mb-2">Set daily goal</p>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      value={goalInput}
                      onChange={(e) => setGoalInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSetGoal()}
                      className="h-8 text-center"
                      aria-label="Water goal number"
                    />
                    <Button size="sm" onClick={handleSetGoal}>
                      Set
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
