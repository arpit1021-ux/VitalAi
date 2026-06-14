import { ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VerdictBadgeProps {
  verdict: 'safe' | 'caution' | 'avoid';
}

const config = {
  safe: { icon: ShieldCheck, label: 'Safe', bg: 'bg-primary/20', text: 'text-primary', border: 'border-primary/30' },
  caution: { icon: ShieldAlert, label: 'Caution', bg: 'bg-warning/20', text: 'text-warning', border: 'border-warning/30' },
  avoid: { icon: ShieldX, label: 'Avoid', bg: 'bg-danger/20', text: 'text-danger', border: 'border-danger/30' },
};

export function VerdictBadge({ verdict }: VerdictBadgeProps) {
  const { icon: Icon, label, bg, text, border } = config[verdict];

  return (
    <div className={cn('inline-flex items-center gap-2 px-4 py-2 rounded-full border', bg, text, border)}>
      <Icon className="h-5 w-5" />
      <span className="font-semibold">{label}</span>
    </div>
  );
}
