import { cn } from '@/lib/utils';

interface SeverityBadgeProps {
  severity: 'severe' | 'moderate' | 'low' | 'none';
}

const config = {
  severe: 'bg-danger/20 text-danger',
  moderate: 'bg-warning/20 text-warning',
  low: 'bg-primary/20 text-primary',
  none: 'bg-primary/20 text-primary',
};

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', config[severity])}>
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  );
}
