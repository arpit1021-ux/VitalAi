import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface IngredientPillProps {
  name: string;
  reason?: string;
  severity?: 'low' | 'moderate' | 'severe';
  flagged?: boolean;
}

/**
 * One ingredient, as a token.
 *
 * Deliberately colourless. On a scan the verdict owns the hue — if every
 * flagged ingredient were also tinted, the one thing a person is meant to read
 * first would be competing with a dozen chips. Severity is carried in words
 * instead, which is also the only form that survives being read aloud.
 */
export function IngredientPill({ name, reason, severity = 'low', flagged = false }: IngredientPillProps) {
  const shell = flagged
    ? 'bg-sunk text-ink border border-line-strong'
    : 'bg-transparent text-ink-muted border border-line';

  const body = (
    <>
      <span className="break-words">{name}</span>
      {flagged && (
        <span className="text-ink-faint">
          <span className="sr-only">, severity </span>
          <span aria-hidden="true">·</span> {severity}
        </span>
      )}
    </>
  );

  const shape = cn(
    'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-label text-left',
    shell,
  );

  // Without a reason there is nothing to reveal, so the chip stays inert rather
  // than offering a control that does nothing when you focus it.
  if (!reason) {
    return <span className={shape}>{body}</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            shape,
            'transition-colors duration-micro ease-entrance hover:bg-sunk',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          )}
        >
          {body}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs text-caption">{reason}</p>
      </TooltipContent>
    </Tooltip>
  );
}
