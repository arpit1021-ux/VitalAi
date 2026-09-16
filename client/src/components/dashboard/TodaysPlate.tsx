import { useState, useRef, useEffect, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, AlertTriangle, Salad, Apple, Drumstick, Wheat, Milk } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, fieldAria } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { useClickOutside } from '@/hooks/useClickOutside';
import { transition, durations } from '@/lib/motion';

interface TodaysPlateProps {
  groups: { veg: boolean; fruit: boolean; protein: boolean; grains: boolean; dairy: boolean };
  entries?: { veg?: string; fruit?: string; protein?: string; grains?: string; dairy?: string };
  allergies?: string[];
  onToggle: (group: string, entry?: string) => void;
  loading?: boolean;
}

interface FoodGroup {
  key: string;
  label: string;
  Icon: LucideIcon;
  example: string;
  commonAllergens: string[];
}

const foodGroups: FoodGroup[] = [
  { key: 'veg', label: 'Vegetables', Icon: Salad, example: 'spinach, bhindi', commonAllergens: [] },
  { key: 'fruit', label: 'Fruit', Icon: Apple, example: 'banana, papaya', commonAllergens: [] },
  {
    key: 'protein',
    label: 'Protein',
    Icon: Drumstick,
    example: 'dal, chicken',
    commonAllergens: ['nuts', 'peanuts', 'shellfish', 'eggs', 'soy'],
  },
  { key: 'grains', label: 'Grains', Icon: Wheat, example: 'roti, rice', commonAllergens: ['gluten', 'wheat'] },
  { key: 'dairy', label: 'Dairy', Icon: Milk, example: 'curd, milk', commonAllergens: ['dairy', 'milk', 'lactose'] },
];

const HINT = 'Optional. It helps us spot anything that keeps disagreeing with you.';

function EntryPopover({
  group,
  entry,
  allergies,
  onSave,
  onClose,
}: {
  group: FoodGroup;
  entry?: string;
  allergies?: string[];
  onSave: (entry: string) => void;
  onClose: () => void;
}) {
  const fieldId = useId();
  const [text, setText] = useState(entry || '');
  const [warning, setWarning] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, onClose);

  useEffect(() => {
    if (text.trim() && allergies?.length) {
      const lower = text.toLowerCase();
      const matched = allergies.find((a) => lower.includes(a.toLowerCase()));
      if (matched) {
        setWarning(`Worth a closer look — this may contain ${matched}.`);
      } else {
        const commonMatch = group.commonAllergens.find((a) => lower.includes(a));
        if (commonMatch && allergies.some((a) => a.toLowerCase() === commonMatch)) {
          setWarning(`Worth a closer look — this may contain ${commonMatch}.`);
        } else {
          setWarning('');
        }
      }
    } else {
      setWarning('');
    }
  }, [text, allergies, group.commonAllergens]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={transition(durations.micro)}
      className="absolute left-0 right-0 top-full z-20 mt-2 rounded-xl border border-line bg-surface p-4 shadow-overlay"
    >
      <Field htmlFor={fieldId} label={`What ${group.label.toLowerCase()} did you have?`} hint={HINT}>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={group.example}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSave(text);
            if (e.key === 'Escape') onClose();
          }}
          autoFocus
          {...fieldAria(fieldId, { hint: HINT })}
        />
      </Field>

      <AnimatePresence>
        {warning && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition(durations.micro)}
            role="alert"
            className="mt-2 flex items-start gap-2 rounded-md bg-caution-soft px-3 py-2.5 text-caption text-caution-ink"
          >
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
            {warning}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="mt-4 flex gap-2">
        <Button size="md" className="flex-1" onClick={() => onSave(text)}>
          Save it
        </Button>
        <Button size="md" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </motion.div>
  );
}

export default function TodaysPlate({ groups, entries, allergies, onToggle, loading }: TodaysPlateProps) {
  const [activePopover, setActivePopover] = useState<string | null>(null);

  if (loading) {
    return (
      <section className="rounded-xl bg-surface shadow-card p-6">
        <Skeleton className="h-5 w-32 rounded" />
        <div className="mt-5 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </div>
      </section>
    );
  }

  const completedCount = Object.values(groups).filter(Boolean).length;

  const handleGroupClick = (groupKey: string) => {
    if (groups[groupKey as keyof typeof groups]) {
      onToggle(groupKey);
      setActivePopover(null);
    } else {
      setActivePopover(groupKey);
    }
  };

  const handleSave = (groupKey: string, entry: string) => {
    onToggle(groupKey, entry.trim() || undefined);
    setActivePopover(null);
  };

  return (
    <section className="rounded-xl bg-surface shadow-card p-6" aria-labelledby="plate-heading">
      <div className="flex items-baseline gap-3">
        <h3 id="plate-heading" className="font-display text-title text-ink">
          Your plate
        </h3>
        <p className="ml-auto flex-shrink-0 rounded-full bg-sunk px-3 py-1 text-label text-ink-muted">
          <span className="tabular">{completedCount}</span> of <span className="tabular">5</span>
        </p>
      </div>

      <p className="mt-2 text-body text-ink-muted">
        {completedCount === 5
          ? 'All five today. That is a balanced day.'
          : 'Tap a group once you have eaten it.'}
      </p>

      {/* Each group is a tile with its own edge rather than a row in a ruled
          list: a hairline divider gives a thumb nothing to aim at and nothing
          that looks pressable. */}
      <ul className="mt-5 space-y-2">
        {foodGroups.map((group) => {
          const filled = groups[group.key as keyof typeof groups];
          const entry = entries?.[group.key as keyof typeof entries];
          return (
            <li key={group.key} className="relative">
              <button
                type="button"
                onClick={() => handleGroupClick(group.key)}
                aria-pressed={filled}
                aria-expanded={activePopover === group.key}
                className={`w-full flex items-center gap-3.5 min-h-[56px] px-3.5 py-2.5 rounded-md border-2 text-left transition-colors duration-micro ease-entrance active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  filled
                    ? 'border-primary bg-primary-soft'
                    : 'border-ink/15 bg-surface hover:border-ink/30 hover:bg-sunk/40'
                }`}
              >
                <span
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
                    filled ? 'bg-primary text-ink-inverse' : 'bg-sunk text-ink-muted'
                  }`}
                  aria-hidden="true"
                >
                  <group.Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className={`block text-body font-semibold ${filled ? 'text-primary-ink' : 'text-ink'}`}>
                    {group.label}
                  </span>
                  <span className={`block text-caption truncate ${filled ? 'text-primary-ink/80' : 'text-ink-faint'}`}>
                    {filled ? entry || 'Counted today' : group.example}
                  </span>
                </span>
                <span
                  className={`ml-auto flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                    filled ? 'border-primary bg-primary' : 'border-ink/20 bg-transparent'
                  }`}
                  aria-hidden="true"
                >
                  {filled && <Check className="h-4 w-4 text-ink-inverse" strokeWidth={3} />}
                </span>
              </button>

              <AnimatePresence>
                {activePopover === group.key && (
                  <EntryPopover
                    group={group}
                    entry={entry}
                    allergies={allergies}
                    onSave={(text) => handleSave(group.key, text)}
                    onClose={() => setActivePopover(null)}
                  />
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
