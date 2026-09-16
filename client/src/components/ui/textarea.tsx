import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || props['aria-invalid']}
      className={cn(
        'w-full min-h-[6rem] rounded bg-surface px-3.5 py-3 text-body text-ink resize-y',
        'border-2 transition-[border-color,background-color] duration-micro ease-entrance',
        'placeholder:text-ink-faint',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:bg-sunk disabled:text-ink-faint disabled:cursor-not-allowed',
        invalid ? 'border-danger bg-danger-soft/50' : 'border-ink/15 hover:border-ink/30',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
