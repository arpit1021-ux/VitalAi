import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * A chip is one of the few things in this system that is genuinely round: it
 * is a token, not a container. The variants are semantic — `caution` and
 * `danger` mean a verdict, never "this looked better in orange".
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-medium',
  {
    variants: {
      variant: {
        neutral: 'bg-sunk text-ink-muted',
        primary: 'bg-primary-soft text-primary-ink',
        caution: 'bg-caution-soft text-caution-ink',
        danger: 'bg-danger-soft text-danger-ink',
        outline: 'border border-line-strong text-ink-muted',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
