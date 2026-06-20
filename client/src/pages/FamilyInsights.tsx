import { motion } from 'framer-motion';
import { Users, RefreshCw, AlertTriangle, CheckCircle, Lightbulb, Loader2, Package } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { insights } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

  const insightData = data?.insight?.insights;
  const hasData = insightData && (
    insightData.family_summary || insightData.member_insights?.length > 0
  );

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
      ) : !hasData ? (
        <EmptyState
          icon={Users}
          title="No family insights yet"
          description="Create multiple health profiles and generate insights to see family-wide health patterns"
          actionLabel="Generate Insights"
          onAction={() => generateInsights()}
        />
      ) : (
        <>
          {insightData.family_summary && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="border-secondary/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-secondary" /> Family Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-text-primary leading-relaxed">{insightData.family_summary}</p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {insightData.member_insights?.length > 0 && (
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 snap-x">
              {insightData.member_insights.map((member: any, i: number) => (
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
                        <span className="text-3xl">👤</span>
                        <div>
                          <p className="font-semibold text-text-primary">{member.name}</p>
                          <p className="text-xs text-text-muted">Profile Insights</p>
                        </div>
                      </div>
                      {member.insights && (
                        <p className="text-sm text-text-muted leading-relaxed mb-3">{member.insights}</p>
                      )}
                      {member.recommendations && (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle className="h-3 w-3" /> {member.recommendations}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}

          {insightData.dietary_patterns && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardHeader>
                  <CardTitle>Dietary Patterns</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-text-primary leading-relaxed">{insightData.dietary_patterns}</p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {insightData.health_tips?.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-secondary" /> Health Tips
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {insightData.health_tips.map((tip: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-text-primary">
                        <span className="text-secondary mt-1">•</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {insightData.alerts?.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="border-danger/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-danger" /> Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {insightData.alerts.map((alert: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-danger">
                        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        {alert}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {insightData.grocery_suggestions?.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" /> Grocery Suggestions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {insightData.grocery_suggestions.map((item: string, i: number) => (
                      <Badge key={i} variant="secondary">{item}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          <DisclaimerBanner />
        </>
      )}
    </div>
  );
}
