import { motion } from 'framer-motion';
import { UserCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { transition, durations } from '@/lib/motion';

interface ProfileCompletenessProps {
  percentage: number;
  missing: string[];
  loading?: boolean;
  onComplete?: () => void;
}

export default function ProfileCompleteness({
  percentage,
  missing,
  loading,
  onComplete,
}: ProfileCompletenessProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="mb-2 h-3 w-full" />
          <Skeleton className="mb-4 h-2 w-3/4" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-5 w-5 flex-shrink-0 text-primary" aria-hidden="true" />
          How much we know
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-body text-ink">
            <span className="font-mono tabular-nums">{percentage}%</span> filled in
          </p>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-sunk"
            role="progressbar"
            aria-label="How much of your profile is filled in"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentage}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={transition(durations.page)}
              className="h-full rounded-full bg-primary"
            />
          </div>
        </div>

        {missing.length > 0 && (
          <div>
            <p className="text-label text-ink-muted">Still missing</p>
            <ul className="mt-1 divide-y divide-line border-y border-line">
              {missing.slice(0, 5).map((item, i) => (
                <li key={i} className="py-2 text-body text-ink break-words">
                  {item}
                </li>
              ))}
            </ul>
            {missing.length > 5 && (
              <p className="mt-1.5 text-caption text-ink-muted">
                and <span className="font-mono tabular-nums">{missing.length - 5}</span> more
              </p>
            )}
          </div>
        )}

        {percentage < 100 && (
          <Button className="w-full" onClick={onComplete || (() => navigate('/profile-setup'))}>
            Fill in the rest
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
