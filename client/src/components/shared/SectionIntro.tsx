import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { rise, transition } from '@/lib/motion';

interface SectionIntroProps {
  /** Stable key for the "seen" memory. Changing it re-introduces the section. */
  id: string;
  title: string;
  /** Two or three sentences, in the product's voice. Not a feature list. */
  body: string;
  /** What this section will do for them, in their words rather than the UI's. */
  points?: string[];
  actionLabel: string;
  onStart: () => void;
}

function seenKey(id: string) {
  return `vitalai:intro:${id}`;
}

export function hasSeenIntro(id: string): boolean {
  try {
    return localStorage.getItem(seenKey(id)) === '1';
  } catch {
    // Storage refused: treat as seen rather than showing the intro every visit.
    return true;
  }
}

/**
 * A section's first-visit welcome.
 *
 * Shown once, remembered per person, and always skippable — it sits in front
 * of the section, so anything that makes it hard to get past makes the product
 * harder to use, not warmer.
 */
export function SectionIntro({ id, title, body, points, actionLabel, onStart }: SectionIntroProps) {
  const [leaving, setLeaving] = useState(false);

  const dismiss = () => {
    setLeaving(true);
    try {
      localStorage.setItem(seenKey(id), '1');
    } catch {
      // Not remembering is a small annoyance; blocking the section is not.
    }
    onStart();
  };

  return (
    <motion.section
      initial="hidden"
      animate={leaving ? 'hidden' : 'visible'}
      variants={rise}
      transition={transition()}
      className="max-w-reading py-12 sm:py-20"
      aria-labelledby={`intro-${id}`}
    >
      <h1 id={`intro-${id}`} className="font-display text-display text-ink text-balance">
        {title}
      </h1>

      <p className="mt-4 text-body-lg text-ink-muted">{body}</p>

      {points && points.length > 0 && (
        <ul className="mt-8 space-y-0 border-t border-line">
          {points.map((point) => (
            <li key={point} className="border-b border-line py-3 text-body text-ink">
              {point}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button size="lg" onClick={dismiss}>
          {actionLabel}
        </Button>
        <button
          type="button"
          onClick={dismiss}
          className="text-label text-ink-muted underline underline-offset-4 hover:text-ink"
        >
          Skip this
        </button>
      </div>
    </motion.section>
  );
}
