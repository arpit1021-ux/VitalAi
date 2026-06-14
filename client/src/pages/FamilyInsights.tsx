import { motion } from 'framer-motion';
import { Users, RefreshCw, AlertTriangle, CheckCircle, Lightbulb, Loader2 } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { insights } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CitationsBar } from '@/components/shared/CitationsBar';
import { DisclaimerBanner } from '@/components/shared/DisclaimerBanner';
import { EmptyState } from '@/components/shared/EmptyState';

export default function FamilyInsights() {
  const { user } = useAuthStore();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['familyInsights', user?.id],
    queryFn: () => insights.getFamily(user!.id).then((r) => r.data),
    enabled: !!user,
  });

  const { mutate: generateInsights, isPending: generating } = useMutation({
    mutationFn: () => insights.generate(),
    onSuccess: () => refetch(),
  });

  const profileInsights = data?.profiles || data?.insights || [];
  const familyPattern = data?.familyPattern || data?.familyInsight;

  return (
    <div className="max-w-5xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">Family Insights</h1>
            <p className="text-text-muted">Health patterns and recommendations for your family</p>
          </div>
          <Button
            variant="outline"
            onClick={() => generateInsights()}
            disabled={generating}
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
        </div>
      </motion.div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-48 rounded-2xl bg-surface animate-pulse" />
          ))}
        </div>
      ) : profileInsights.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No family insights yet"
          description="Create multiple health profiles to see family-wide health patterns and recommendations"
          actionLabel="Generate Insights"
          onAction={() => generateInsights()}
        />
      ) : (
        <>
          <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 snap-x">
            {profileInsights.map((insight: any, i: number) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="min-w-[300px] snap-start"
              >
                <Card className="h-full">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-3xl">{insight.avatar || '👤'}</span>
                      <div>
                        <p className="font-semibold text-text-primary">{insight.name}</p>
                        <p className="text-xs text-text-muted">Profile Insights</p>
                      </div>
                    </div>

                    {insight.topConcern && (
                      <div className="mb-3">
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" /> {insight.topConcern}
                        </Badge>
                      </div>
                    )}

                    {insight.positiveHabit && (
                      <div className="mb-3">
                        <Badge variant="default" className="gap-1">
                          <CheckCircle className="h-3 w-3" /> {insight.positiveHabit}
                        </Badge>
                      </div>
                    )}

                    {insight.recommendation && (
                      <p className="text-sm text-text-muted leading-relaxed mt-3">
                        {insight.recommendation}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {familyPattern && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <Card className="border-secondary/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-secondary" /> Family Pattern
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-text-primary leading-relaxed">{familyPattern}</p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          <CitationsBar sources={data?.sources || []} />
          <DisclaimerBanner />
        </>
      )}
    </div>
  );
}
