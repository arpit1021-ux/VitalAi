import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { step, transition, durations } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface HealthTipCarouselProps {
  tips: string[];
  onClose?: () => void;
}

/** The tips move in the direction you are going, using the house step motion. */
const slide = step(1);

export default function HealthTipCarousel({ tips, onClose }: HealthTipCarouselProps) {
  const [current, setCurrent] = useState(0);

  if (!tips || tips.length === 0) {
    return (
      <div className="rounded-md bg-primary-soft p-5">
        <Skeleton className="mb-3 h-4 w-2/3" />
        <Skeleton className="mb-2 h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
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
    // A tinted panel rather than another white card: the dashboard already has
    // a column of those, and this one is the product talking, not an object.
    <section aria-labelledby="daily-tip" className="rounded-md bg-primary-soft p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-surface"
        >
          <Lightbulb className="h-5 w-5 text-primary" />
        </span>
        <div className="min-h-[3.75rem] flex-1">
          <h3 id="daily-tip" className="text-label text-primary-ink">
            Something for today
          </h3>
          <div aria-live="polite">
            <AnimatePresence mode="wait">
              <motion.p
                key={current}
                variants={slide}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={transition(durations.enter)}
                className="mt-1 max-w-reading text-body-lg text-ink break-words"
              >
                {tips[current]}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex gap-1.5"
          role="progressbar"
          aria-label="Tips"
          aria-valuemin={1}
          aria-valuemax={tips.length}
          aria-valuenow={current + 1}
          aria-valuetext={`Tip ${current + 1} of ${tips.length}`}
        >
          {tips.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all duration-micro ease-entrance',
                i === current ? 'w-6 bg-primary' : 'w-1.5 bg-ink/20',
              )}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Not now
          </Button>
          <Button size="sm" onClick={handleNext}>
            {current < tips.length - 1 ? 'Next one' : 'Done'}
          </Button>
        </div>
      </div>
    </section>
  );
}
