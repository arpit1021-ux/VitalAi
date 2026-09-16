import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A button has to look pressable before it looks tasteful.
 *
 * Every variant here carries a fill or a two-pixel border — an outline at
 * hairline weight on a warm ground disappears, and a control nobody can find
 * is a worse failure than a control that is a little loud.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded font-sans font-semibold',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-micro ease-entrance',
    'active:translate-y-px active:shadow-none',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    'disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-ink-inverse shadow-button hover:bg-primary-hover active:bg-primary-press',
        secondary:
          'bg-surface text-ink border-2 border-ink/15 shadow-button hover:border-ink/30 hover:bg-sunk/50',
        accent:
          'bg-accent text-ink-inverse shadow-button hover:bg-accent-hover',
        ghost: 'bg-transparent text-ink-muted hover:bg-sunk hover:text-ink',
        danger: 'bg-danger text-ink-inverse shadow-button hover:bg-danger-hover',
        /** On a dark panel, where a light fill is the only thing that reads. */
        onDark:
          'bg-canvas-ink text-canvas shadow-button hover:bg-white',
        link: 'bg-transparent text-primary underline underline-offset-4 decoration-2 hover:text-primary-hover active:translate-y-0 px-0',
      },
      size: {
        sm: 'h-10 px-3.5 text-label',
        md: 'h-12 px-5 text-body',
        lg: 'h-14 px-7 text-body-lg',
        icon: 'h-12 w-12 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Shows a spinner and blocks further presses. Give `loadingLabel` whenever
   * the wait is longer than a moment: a spinner says something is happening
   * but never what.
   */
  loading?: boolean;
  loadingLabel?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, loadingLabel, children, disabled, ...props },
    ref,
  ) => {
    // A slotted button renders someone else's element; a spinner cannot be
    // injected into it without assuming its shape.
    if (asChild) {
      return (
        <Slot className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {loading && loadingLabel ? loadingLabel : children}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
