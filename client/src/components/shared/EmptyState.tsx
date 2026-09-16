import { FC, SVGProps } from 'react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon: FC<SVGProps<SVGSVGElement> & { size?: number | string }>;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-14 w-14 rounded-md bg-sunk flex items-center justify-center mb-5">
        <Icon className="h-6 w-6 text-ink-faint" aria-hidden="true" />
      </div>
      <h3 className="font-display text-title text-ink mb-2 text-balance">{title}</h3>
      <p className="text-body text-ink-muted max-w-reading mb-6">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  );
}
