import { useState, useCallback, useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, fieldAria } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { transition, durations } from '@/lib/motion';
import { useClickOutside } from '@/hooks/useClickOutside';

interface WaterTrackerProps {
  count: number;
  goal: number;
  onAdd: () => void;
  onRemove: () => void;
  onSetGoal: (goal: number) => void;
  loading?: boolean;
  goalReached?: boolean;
}

/** Beyond this many marks the segments are thinner than the gaps between them. */
const MAX_SEGMENTS = 16;

export default function WaterTracker({
  count,
  goal,
  onAdd,
  onRemove,
  onSetGoal,
  loading,
  goalReached,
}: WaterTrackerProps) {
  const goalFieldId = useId();
  const goalRef = useRef<HTMLDivElement>(null);
  const [showGoalInput, setShowGoalInput] = useState(false);
  const [goalInput, setGoalInput] = useState(String(goal));
  const [goalError, setGoalError] = useState('');

  const safeGoal = goal > 0 ? goal : 8;
  const remaining = Math.max(safeGoal - count, 0);
  const isComplete = count >= safeGoal;

  const closeGoal = useCallback(() => setShowGoalInput(false), []);
  useClickOutside(goalRef, closeGoal);

  const handleSetGoal = useCallback(() => {
    const num = parseInt(goalInput, 10);
    if (isNaN(num) || num < 1 || num > 30) {
      setGoalError('Pick a number between 1 and 30.');
      return;
    }
    setGoalError('');
    onSetGoal(num);
    setShowGoalInput(false);
  }, [goalInput, onSetGoal]);

  if (loading) {
    return (
      <section className="rounded-xl bg-surface shadow-card p-6">
        <Skeleton className="h-5 w-24 rounded" />
        <Skeleton className="h-11 w-32 rounded mt-4" />
        <Skeleton className="h-3 w-full rounded mt-5" />
        <Skeleton className="h-12 w-full rounded mt-6" />
      </section>
    );
  }

  const segmented = safeGoal <= MAX_SEGMENTS;

  return (
    <section
      className={`relative rounded-xl p-6 shadow-card transition-colors duration-enter ease-entrance ${
        isComplete ? 'bg-primary-soft border-2 border-primary/30' : 'bg-surface'
      }`}
      aria-labelledby="water-heading"
    >
      <div className="flex items-baseline gap-3">
        <h3 id="water-heading" className="font-display text-title text-ink">
          Water
        </h3>
        <div className="ml-auto relative" ref={goalRef}>
          <button
            type="button"
            onClick={() => {
              setGoalInput(String(safeGoal));
              setGoalError('');
              setShowGoalInput((open) => !open);
            }}
            className="inline-flex items-center gap-1.5 min-h-[44px] -my-2 px-3 rounded-full border-2 border-ink/15 bg-surface text-label text-ink-muted hover:border-ink/30 hover:text-ink transition-colors duration-micro ease-entrance focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-expanded={showGoalInput}
            aria-label="Change your daily water goal"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Goal
          </button>

          <AnimatePresence>
            {showGoalInput && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={transition(durations.micro)}
                className="absolute right-0 top-full z-20 mt-2 w-[min(17rem,calc(100vw-4rem))] rounded-xl border border-line bg-surface p-4 shadow-overlay"
              >
                <Field
                  htmlFor={goalFieldId}
                  label="Glasses a day"
                  hint="Anywhere from 1 to 30."
                  error={goalError || undefined}
                >
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={30}
                      value={goalInput}
                      invalid={!!goalError}
                      onChange={(e) => setGoalInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSetGoal();
                        if (e.key === 'Escape') setShowGoalInput(false);
                      }}
                      className="w-20 text-center tabular"
                      {...fieldAria(goalFieldId, {
                        hint: 'Anywhere from 1 to 30.',
                        error: goalError || undefined,
                      })}
                    />
                    <Button size="md" onClick={handleSetGoal} className="flex-1">
                      Save
                    </Button>
                  </div>
                </Field>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={`font-mono text-stat tabular ${isComplete ? 'text-primary-ink' : 'text-ink'}`}>{count}</span>
        <span className="text-body-lg text-ink-muted">
          of <span className="tabular">{safeGoal}</span> glasses
        </span>
      </p>

      {/* One mark per glass while that stays legible; a plain meter once the
          goal is high enough that the marks would be thinner than their gaps. */}
      <div
        className="mt-5 flex gap-1.5"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeGoal}
        aria-valuenow={Math.min(count, safeGoal)}
        aria-valuetext={`${count} of ${safeGoal} glasses`}
        aria-labelledby="water-heading"
      >
        {segmented ? (
          Array.from({ length: safeGoal }).map((_, i) => (
            <span
              key={i}
              className={`h-3 flex-1 rounded transition-colors duration-enter ease-entrance ${
                i < count ? 'bg-primary' : 'bg-sunk'
              }`}
            />
          ))
        ) : (
          <span className="h-3 flex-1 rounded bg-sunk overflow-hidden">
            <motion.span
              className="block h-full bg-primary rounded"
              initial={false}
              animate={{ width: `${Math.min((count / safeGoal) * 100, 100)}%` }}
              transition={transition(durations.enter)}
            />
          </span>
        )}
      </div>

      <p
        className={`mt-4 text-body ${isComplete ? 'text-primary-ink font-semibold' : 'text-ink-muted'}`}
        role="status"
        aria-live="polite"
      >
        {isComplete
          ? goalReached
            ? "That's today's mark. Well done."
            : "That's today's mark."
          : count === 0
            ? 'Nothing yet today.'
            : remaining === 1
              ? 'One more to go.'
              : `${remaining} more to go.`}
      </p>

      <div className="mt-6 flex items-center gap-2">
        <Button
          variant="secondary"
          size="icon"
          onClick={onRemove}
          disabled={count <= 0}
          aria-label="Take a glass back off"
          className="flex-shrink-0"
        >
          <Minus className="h-5 w-5" aria-hidden="true" />
        </Button>
        <Button size="lg" onClick={onAdd} className="flex-1 min-w-0">
          <Plus className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <span className="truncate">Had a glass</span>
        </Button>
      </div>

    </section>
  );
}
