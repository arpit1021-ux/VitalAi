import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { transition, durations } from '@/lib/motion';

interface TodaysChallengeProps {
  text: string;
  completed: boolean;
  onComplete: () => void;
  loading?: boolean;
}

export default function TodaysChallenge({ text, completed, onComplete, loading }: TodaysChallengeProps) {
  if (loading) {
    return (
      <section className="rounded-xl bg-surface shadow-card p-6">
        <Skeleton className="h-5 w-28 rounded" />
        <Skeleton className="h-6 w-full rounded mt-4" />
        <Skeleton className="h-6 w-2/3 rounded mt-2" />
        <Skeleton className="h-12 w-40 rounded mt-6" />
      </section>
    );
  }

  /**
   * The done state earns the colour: plain white while there is still
   * something to do, a filled green card once it is done, so the two are
   * different objects rather than the same card with a different sentence.
   */
  return (
    <section
      className={`rounded-xl p-6 transition-colors duration-enter ease-entrance ${
        completed ? 'bg-primary-soft border-2 border-primary/30 shadow-card' : 'bg-surface shadow-card'
      }`}
      aria-labelledby="nudge-heading"
    >
      <h3 id="nudge-heading" className={`text-label ${completed ? 'text-primary-ink' : 'text-ink-faint'}`}>
        One small thing
      </h3>

      <AnimatePresence mode="wait" initial={false}>
        {completed ? (
          <motion.div
            key="completed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition(durations.enter)}
            className="mt-4 flex items-start gap-4"
          >
            <span
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary shadow-button"
              aria-hidden="true"
            >
              <Check className="h-6 w-6 text-ink-inverse" strokeWidth={2.5} />
            </span>
            <div className="min-w-0">
              <p className="font-display text-title text-primary-ink">Done.</p>
              <p className="text-body text-ink-muted mt-1 break-words max-w-reading">{text}</p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="pending"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition(durations.enter)}
          >
            <p className="mt-2 font-display text-title text-ink max-w-reading break-words">{text}</p>
            <Button size="lg" onClick={onComplete} className="mt-6 w-full sm:w-auto">
              <Check className="h-5 w-5" aria-hidden="true" />
              I did that
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
