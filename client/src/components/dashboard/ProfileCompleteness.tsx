import { motion } from 'framer-motion';
import { UserCheck, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

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
          <Skeleton className="h-3 w-full mb-2" />
          <Skeleton className="h-2 w-3/4 mb-4" />
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
          <UserCheck className="h-5 w-5 text-primary" />
          Profile Completeness
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3">
          <div className="flex justify-between mb-1.5">
            <span className="text-sm text-text-primary">{percentage}% complete</span>
          </div>
          <div className="h-2 bg-border rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full rounded-full bg-primary"
            />
          </div>
        </div>

        {missing.length > 0 && (
          <div className="mb-4">
            {missing.slice(0, 5).map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex items-center gap-2 py-1"
              >
                <Plus className="h-3 w-3 text-text-muted" />
                <span className="text-xs text-text-muted">{item}</span>
              </motion.div>
            ))}
            {missing.length > 5 && (
              <p className="text-xs text-text-muted mt-1">+{missing.length - 5} more</p>
            )}
          </div>
        )}

        {percentage < 100 && (
          <Button
            size="sm"
            className="w-full"
            onClick={onComplete || (() => navigate('/profile-setup'))}
          >
            Complete Profile
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
