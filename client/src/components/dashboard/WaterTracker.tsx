import { motion } from 'framer-motion';
import { Droplets } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface WaterTrackerProps {
  count: number;
  onToggle: (index: number) => void;
  loading?: boolean;
}

function GlassIcon({ filled, index, onToggle }: { filled: boolean; index: number; onToggle: (i: number) => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={() => onToggle(index)}
      className="relative"
    >
      <Droplets
        className={`h-8 w-8 transition-colors ${
          filled ? 'text-[#3B82F6]' : 'text-text-muted/30'
        }`}
        fill={filled ? '#3B82F6' : 'none'}
      />
    </motion.button>
  );
}

export default function WaterTracker({ count, onToggle, loading }: WaterTrackerProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-4 w-32 mb-4" />
          <div className="flex gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-8 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Droplets className="h-4 w-4 text-[#3B82F6]" />
          <p className="text-sm font-medium text-text-primary">Water Intake</p>
          <span className="text-sm text-text-muted ml-auto">{count}/8 glasses</span>
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <GlassIcon key={i} filled={i < count} index={i} onToggle={onToggle} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
