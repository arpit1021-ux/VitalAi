import { cn } from '@/lib/utils';

/**
 * A placeholder shaped like the content that will replace it.
 *
 * `sunk` rather than a border colour: a skeleton is a filled area standing in
 * for text, not an outline. Marked `aria-hidden` because the surrounding
 * boundary already announces the loading state — a screen reader hearing a
 * dozen empty boxes learns nothing.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded bg-sunk', className)} {...props} />;
}

export { Skeleton };
