import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Draws the error treatment. The message itself belongs to `Field`. */
  invalid?: boolean;
}

/**
 * A two-pixel edge at 15% ink. The edge of a control is meaningful non-text
 * contrast under WCAG 1.4.11, and a hairline around an input on a warm ground
 * is decoration pretending to be a boundary — you cannot see where to type.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || props['aria-invalid']}
      className={cn(
        'w-full h-12 rounded bg-surface px-3.5 text-body text-ink',
        'border-2 transition-[border-color,background-color] duration-micro ease-entrance',
        'placeholder:text-ink-faint',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:bg-sunk disabled:text-ink-faint disabled:cursor-not-allowed',
        'read-only:bg-sunk read-only:text-ink-muted',
        invalid ? 'border-danger bg-danger-soft/50' : 'border-ink/15 hover:border-ink/30',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
