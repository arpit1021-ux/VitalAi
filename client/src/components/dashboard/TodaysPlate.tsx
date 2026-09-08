import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useClickOutside } from '@/hooks/useClickOutside';

interface TodaysPlateProps {
  groups: { veg: boolean; fruit: boolean; protein: boolean; grains: boolean; dairy: boolean };
  entries?: { veg?: string; fruit?: string; protein?: string; grains?: string; dairy?: string };
  allergies?: string[];
  onToggle: (group: string, entry?: string) => void;
  loading?: boolean;
}

const foodGroups = [
  { key: 'veg', label: 'Vegetables', emoji: '🥬', commonAllergens: [] },
  { key: 'fruit', label: 'Fruit', emoji: '🍎', commonAllergens: [] },
  { key: 'protein', label: 'Protein', emoji: '🍗', commonAllergens: ['nuts', 'peanuts', 'shellfish', 'eggs', 'soy'] },
  { key: 'grains', label: 'Grains', emoji: '🌾', commonAllergens: ['gluten', 'wheat'] },
  { key: 'dairy', label: 'Dairy', emoji: '🥛', commonAllergens: ['dairy', 'milk', 'lactose'] },
];

function CheckPopover({
  group,
  entry,
  allergies,
  onSave,
  onClose,
}: {
  group: typeof foodGroups[0];
  entry?: string;
  allergies?: string[];
  onSave: (entry: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(entry || '');
  const [warning, setWarning] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, onClose);

  useEffect(() => {
    if (text.trim() && allergies?.length) {
      const lower = text.toLowerCase();
      const matched = allergies.find((a) => lower.includes(a.toLowerCase()));
      if (matched) {
        setWarning(`Heads up — this may contain ${matched}.`);
      } else {
        const commonMatch = group.commonAllergens.find((a) => lower.includes(a));
        if (commonMatch && allergies.some((a) => a.toLowerCase() === commonMatch)) {
          setWarning(`Heads up — this may contain ${commonMatch}.`);
        } else {
          setWarning('');
        }
      }
    } else {
      setWarning('');
    }
  }, [text, allergies, group.commonAllergens]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-surface border border-border rounded-xl p-3 shadow-xl z-20 w-64"
    >
      <p className="text-xs text-text-muted mb-2">What did you eat? (optional)</p>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`e.g., ${group.key === 'grains' ? 'roti, rice' : group.key === 'dairy' ? 'curd, milk' : '...'} `}
        className="h-8 text-sm"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onSave(text);
          }
        }}
        autoFocus
      />
      <AnimatePresence>
        {warning && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 mt-2 text-xs text-warning"
          >
            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            {warning}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex gap-2 mt-2">
        <Button size="sm" className="flex-1 h-7" onClick={() => onSave(text)}>
          Save
        </Button>
        <Button size="sm" variant="ghost" className="h-7" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </motion.div>
  );
}

export default function TodaysPlate({ groups, entries, allergies, onToggle, loading }: TodaysPlateProps) {
  const [activePopover, setActivePopover] = useState<string | null>(null);

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

  const handleGroupClick = (groupKey: string) => {
    const isCurrentlyChecked = groups[groupKey as keyof typeof groups];
    if (isCurrentlyChecked) {
      onToggle(groupKey);
      setActivePopover(null);
    } else {
      setActivePopover(groupKey);
    }
  };

  const handleSave = (groupKey: string, entry: string) => {
    onToggle(groupKey, entry || undefined);
    setActivePopover(null);
  };

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
            const entry = entries?.[group.key as keyof typeof entries];
            return (
              <div key={group.key} className="relative">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleGroupClick(group.key)}
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
                <AnimatePresence>
                  {activePopover === group.key && (
                    <CheckPopover
                      group={group}
                      entry={entry}
                      allergies={allergies}
                      onSave={(text) => handleSave(group.key, text)}
                      onClose={() => setActivePopover(null)}
                    />
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
