import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface IngredientPillProps {
  name: string;
  reason?: string;
  severity?: 'low' | 'moderate' | 'severe';
  flagged?: boolean;
}

export function IngredientPill({ name, reason, severity = 'low', flagged = false }: IngredientPillProps) {
  const colors = flagged
    ? {
        low: 'border-l-green-500 bg-green-500/10 text-green-400',
        moderate: 'border-l-warning bg-warning/10 text-warning',
        severe: 'border-l-danger bg-danger/10 text-danger',
      }
    : {
        low: 'border-l-primary bg-primary/10 text-primary',
        moderate: 'border-l-primary bg-primary/10 text-primary',
        severe: 'border-l-primary bg-primary/10 text-primary',
      };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn('inline-flex items-center px-3 py-1.5 rounded-full border-l-4 text-sm cursor-default', colors[severity])}>
          {name}
        </div>
      </TooltipTrigger>
      {reason && (
        <TooltipContent>
          <p className="max-w-xs">{reason}</p>
        </TooltipContent>
      )}
    </Tooltip>
  );
}
