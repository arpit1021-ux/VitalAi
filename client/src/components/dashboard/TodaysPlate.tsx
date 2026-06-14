import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface TodaysPlateProps {
  groups: { veg: boolean; fruit: boolean; protein: boolean; grains: boolean; dairy: boolean };
  onToggle: (group: string) => void;
  loading?: boolean;
}

const foodGroups = [
  { key: 'veg', label: 'Vegetables', emoji: '🥬' },
  { key: 'fruit', label: 'Fruit', emoji: '🍎' },
  { key: 'protein', label: 'Protein', emoji: '🍗' },
  { key: 'grains', label: 'Grains', emoji: '🌾' },
  { key: 'dairy', label: 'Dairy', emoji: '🥛' },
];

export default function TodaysPlate({ groups, onToggle, loading }: TodaysPlateProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-4 w-32 mb-4" />
          <div className="flex gap-2 flex-wrap">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-24 rounded-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const completedCount = Object.values(groups).filter(Boolean).length;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <p className="text-sm font-medium text-text-primary">Today's Plate</p>
          <span className="text-sm text-text-muted ml-auto">{completedCount}/5 food groups</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {foodGroups.map((group) => {
            const filled = groups[group.key as keyof typeof groups];
            return (
              <motion.button
                key={group.key}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onToggle(group.key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-colors border ${
                  filled
                    ? 'bg-secondary/20 border-secondary/50 text-secondary'
                    : 'bg-surface border-border text-text-muted hover:border-text-muted/50'
                }`}
              >
                <span>{group.emoji}</span>
                <span>{group.label}</span>
                {filled && <Check className="h-3.5 w-3.5" />}
              </motion.button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
