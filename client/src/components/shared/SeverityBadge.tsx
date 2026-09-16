import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SeverityBadgeProps {
  severity: 'severe' | 'moderate' | 'low' | 'none';
  className?: string;
}

/**
 * How serious a finding is.
 *
 * The wording stays plain — this is the one place in the product where warmth
 * in the phrasing would change the meaning of the finding. Only the three
 * semantic hues appear, and they carry the same meanings they carry on a
 * verdict: severe is danger, moderate is caution, nothing found is primary.
 */
const config: Record<SeverityBadgeProps['severity'], { variant: BadgeProps['variant']; label: string }> = {
  severe: { variant: 'danger', label: 'Severe' },
  moderate: { variant: 'caution', label: 'Moderate' },
  low: { variant: 'neutral', label: 'Low' },
  none: { variant: 'primary', label: 'None found' },
};

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const { variant, label } = config[severity];

  return (
    <Badge variant={variant} className={cn('whitespace-nowrap', className)}>
      <span className="sr-only">Severity: </span>
      {label}
    </Badge>
  );
}
