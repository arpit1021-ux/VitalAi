import * as React from 'react';
import { cn } from '@/lib/utils';

interface FieldProps {
  /** Must match the control's `id`; this is what makes the label clickable. */
  htmlFor: string;
  label: string;
  /** Guidance shown before anything goes wrong — why the field exists, or its format. */
  hint?: string;
  error?: string;
  /** Marks the field visually and for assistive tech. Absent means optional. */
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Label, control, hint and error as one unit.
 *
 * Wiring `aria-describedby` and `aria-invalid` by hand at every input is how
 * inputs end up with a red border and nothing announced. This does it once.
 * Pass the ids it derives to the control: `${htmlFor}-hint`, `${htmlFor}-error`.
 */
export function Field({ htmlFor, label, hint, error, required, children, className }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-label text-ink">
        {label}
        {required && (
          <span className="text-danger ml-0.5" aria-hidden="true">
            *
          </span>
        )}
        {!required && <span className="text-ink-faint font-normal ml-1.5">optional</span>}
      </label>

      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-caption text-ink-muted">
          {hint}
        </p>
      )}

      {children}

      {/* Announced on appearance: someone using a screen reader gets no
          equivalent of noticing a border turn red. */}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** The ids a Field expects its control to reference. */
export function fieldAria(id: string, { hint, error }: { hint?: string; error?: string }) {
  const described = [hint && !error ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': described || undefined,
  } as const;
}
