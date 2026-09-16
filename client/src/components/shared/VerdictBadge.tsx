import { ShieldCheck, ShieldAlert, ShieldX, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Verdict = 'safe' | 'caution' | 'avoid';

interface VerdictConfig {
  icon: LucideIcon;
  /** The short form, for a chip in a list where space is the constraint. */
  label: string;
  /** The long form, for the one place a verdict is the subject of the screen. */
  headline: string;
  /** Tinted ground for the headline block. */
  panel: string;
  /** Text and icon colour on that ground. */
  ink: string;
  /** The chip: ground and text in one. */
  chip: string;
}

/**
 * The three verdicts and the only three hues in the system, paired.
 *
 * Exported because the scanner sets the verdict as display type rather than as
 * a chip, and the two must not drift: a result that reads "Best avoided" in the
 * headline and "Caution" in the history row is two different findings.
 */
export const VERDICT: Record<Verdict, VerdictConfig> = {
  safe: {
    icon: ShieldCheck,
    label: 'Looks good',
    headline: 'Looks good for you',
    panel: 'bg-primary-soft',
    ink: 'text-primary-ink',
    chip: 'bg-primary-soft text-primary-ink',
  },
  caution: {
    icon: ShieldAlert,
    label: 'Closer look',
    headline: 'Worth a closer look',
    panel: 'bg-caution-soft',
    ink: 'text-caution-ink',
    chip: 'bg-caution-soft text-caution-ink',
  },
  avoid: {
    icon: ShieldX,
    label: 'Best avoided',
    headline: 'Best avoided',
    panel: 'bg-danger-soft',
    ink: 'text-danger-ink',
    chip: 'bg-danger-soft text-danger-ink',
  },
};

interface VerdictBadgeProps {
  verdict: Verdict;
  className?: string;
}

/**
 * The compact verdict, for a row in a list.
 *
 * The full-weight verdict is not a component: where a verdict is the point of
 * the screen it is set as display type, and a badge that tried to be both
 * would be too loud in the list or too quiet as the headline.
 */
export function VerdictBadge({ verdict, className }: VerdictBadgeProps) {
  const { icon: Icon, label, chip } = VERDICT[verdict];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-label whitespace-nowrap',
        chip,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      <span className="sr-only">Verdict: </span>
      {label}
    </span>
  );
}
