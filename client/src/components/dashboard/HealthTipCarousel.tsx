import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface HealthTipCarouselProps {
  tips: string[];
  onClose?: () => void;
}

export default function HealthTipCarousel({ tips, onClose }: HealthTipCarouselProps) {
  const [current, setCurrent] = useState(0);

  if (!tips || tips.length === 0) {
    return (
      <Card className="bg-secondary/10 border-secondary/30">
        <CardContent className="p-6">
          <Skeleton className="h-4 w-2/3 mb-3" />
          <Skeleton className="h-3 w-full mb-2" />
          <Skeleton className="h-3 w-4/5" />
        </CardContent>
      </Card>
    );
  }

  const handleNext = () => {
    if (current < tips.length - 1) {
      setCurrent(current + 1);
    } else {
      onClose?.();
    }
  };

  return (
    <Card className="bg-secondary/10 border-secondary/30 overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-secondary/20 flex items-center justify-center flex-shrink-0">
            <TrendingUp className="h-5 w-5 text-secondary" />
          </div>
          <div className="flex-1 min-h-[60px]">
            <p className="text-sm font-medium text-secondary mb-1">Daily Tip</p>
            <AnimatePresence mode="wait">
              <motion.p
                key={current}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="text-sm text-text-primary"
              >
                {tips[current]}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="flex gap-1.5">
            {tips.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === current ? 'w-6 bg-secondary' : 'w-1.5 bg-text-muted/30'
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Skip
            </Button>
            <Button size="sm" onClick={handleNext}>
              {current < tips.length - 1 ? 'Got it →' : 'Done'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
