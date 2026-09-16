import { useState } from 'react';
import { motion } from 'framer-motion';
import { Users, User, RefreshCw, AlertTriangle, Loader2, ShoppingBasket } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { insights } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DisclaimerBanner } from '@/components/shared/DisclaimerBanner';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { SectionBoundary } from '@/components/shared/SectionBoundary';
import { describeError, isCancellation } from '@/lib/errors';
import { rise, stagger, transition, durations } from '@/lib/motion';

interface MemberInsight {
  name?: string;
  insights?: string;
  recommendations?: string;
}

interface FamilyInsightData {
  family_summary?: string;
  member_insights?: MemberInsight[];
  dietary_patterns?: string;
  health_tips?: string[];
  alerts?: string[];
  grocery_suggestions?: string[];
}

interface FamilyInsightsResponse {
  insight?: { insights?: FamilyInsightData };
}

const GENERATING_LABEL = 'Looking for patterns across your family profiles…';

/** A section that opens a new subject: ruled, not boxed. */
function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      variants={rise}
      transition={transition(durations.enter)}
      aria-labelledby={id}
      className="border-t border-line pt-6"
    >
      <h2 id={id} className="text-heading text-ink">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </motion.section>
  );
}

export default function FamilyInsights() {
  const { user } = useAuthStore();
  const [generateError, setGenerateError] = useState<unknown>(null);

  const insightsQuery = useQuery<FamilyInsightsResponse>({
    queryKey: ['familyInsights', user?.id],
    queryFn: () => insights.getFamily(user!.id).then((r) => r.data as FamilyInsightsResponse),
    enabled: !!user,
  });

  const { refetch } = insightsQuery;

  const generateMutation = useMutation({
    mutationFn: () => insights.generate(),
    onMutate: () => setGenerateError(null),
    onSuccess: () => {
      setGenerateError(null);
      refetch();
    },
    // Generating insights is something the user pressed a button for, so the
    // failure is shown next to that button rather than reported in passing.
    onError: (error) => {
      if (isCancellation(error)) return;
      setGenerateError(error);
    },
  });

  const generating = generateMutation.isPending;

  const hasContent = (data: FamilyInsightsResponse) => {
    const insight = data.insight?.insights;
    return Boolean(insight?.family_summary || (insight?.member_insights?.length ?? 0) > 0);
  };

  return (
    <div className="space-y-8">
      <motion.header
        variants={rise}
        initial="hidden"
        animate="visible"
        transition={transition(durations.enter)}
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <h1 className="font-display text-display sm:text-display-lg text-ink text-balance">How everyone's doing</h1>
          <p className="mt-3 max-w-reading text-body-lg text-ink-muted">
            What we're seeing across the profiles you keep here — where they overlap, and where somebody needs
            something different.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => generateMutation.mutate()}
          loading={generating}
          loadingLabel="Having a look…"
          className="flex-shrink-0 self-start sm:self-auto"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Have another look
        </Button>
      </motion.header>

      {generating && (
        <p className="flex items-center gap-2 text-body text-ink-muted" role="status" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin text-ink" aria-hidden="true" />
          {GENERATING_LABEL}
        </p>
      )}

      {generateError !== null && (
        <ErrorState
          error={describeError(generateError)}
          onRetry={() => generateMutation.mutate()}
          retrying={generating}
        />
      )}

      <SectionBoundary
        query={insightsQuery}
        band="explained"
        loadingLabel={GENERATING_LABEL}
        isEmpty={(data) => !hasContent(data)}
        empty={
          <EmptyState
            icon={Users}
            title="Nothing to compare yet"
            description="Set up a profile for each person at home, then ask us to have a look — patterns only show up once there's more than one."
            actionLabel="Have a look for me"
            onAction={() => generateMutation.mutate()}
          />
        }
      >
        {(data) => {
          const insightData = data.insight?.insights ?? {};
          return (
            <motion.div variants={stagger()} initial="hidden" animate="visible" className="space-y-8">
              {insightData.family_summary && (
                <motion.section
                  variants={rise}
                  transition={transition(durations.enter)}
                  aria-labelledby="family-summary"
                  className="rounded-xl bg-canvas px-5 py-7 shadow-lift sm:px-8 sm:py-9"
                >
                  <h2 id="family-summary" className="font-display text-title text-canvas-ink text-balance">
                    The short version
                  </h2>
                  <p className="mt-3 max-w-reading text-body-lg text-canvas-ink break-words">
                    {insightData.family_summary}
                  </p>
                </motion.section>
              )}

              {(insightData.member_insights?.length ?? 0) > 0 && (
                <motion.section
                  variants={rise}
                  transition={transition(durations.enter)}
                  aria-labelledby="family-members"
                >
                  <h2 id="family-members" className="text-heading text-ink">
                    Person by person
                  </h2>
                  {/* Its own scroller, so a row of profiles never pushes the
                      page sideways on a phone. */}
                  <ul className="-mx-4 mt-3 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
                    {insightData.member_insights!.map((member, i) => (
                      <li key={i} className="w-[16rem] flex-shrink-0 snap-start sm:w-[19rem]">
                        <Card className="h-full">
                          <CardContent className="p-5 pt-5">
                            <div className="mb-3 flex items-center gap-3">
                              <span
                                aria-hidden="true"
                                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-sunk"
                              >
                                <User className="h-5 w-5 text-ink-muted" />
                              </span>
                              <p className="text-heading text-ink break-words">{member.name}</p>
                            </div>
                            {member.insights && (
                              <p className="text-body text-ink break-words">{member.insights}</p>
                            )}
                            {member.recommendations && (
                              <p className="mt-3 rounded bg-primary-soft p-3 text-body text-primary-ink break-words">
                                {member.recommendations}
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      </li>
                    ))}
                  </ul>
                </motion.section>
              )}

              {(insightData.alerts?.length ?? 0) > 0 && (
                <motion.section
                  variants={rise}
                  transition={transition(durations.enter)}
                  aria-labelledby="family-alerts"
                  className="rounded-md bg-danger-soft p-5"
                >
                  <h2 id="family-alerts" className="flex items-center gap-2 text-heading text-danger-ink">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    Worth acting on
                  </h2>
                  <ul className="mt-3 space-y-2">
                    {insightData.alerts!.map((alert, i) => (
                      <li key={i} className="max-w-reading text-body-lg text-ink break-words">
                        {alert}
                      </li>
                    ))}
                  </ul>
                </motion.section>
              )}

              {insightData.dietary_patterns && (
                <Section id="family-patterns" title="How you're all eating">
                  <p className="max-w-reading text-body-lg text-ink break-words">{insightData.dietary_patterns}</p>
                </Section>
              )}

              {(insightData.health_tips?.length ?? 0) > 0 && (
                <Section id="family-tips" title="Things that would help">
                  <ul className="divide-y divide-line border-y border-line">
                    {insightData.health_tips!.map((tip, i) => (
                      <li key={i} className="max-w-reading py-3 text-body-lg text-ink break-words">
                        {tip}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {(insightData.grocery_suggestions?.length ?? 0) > 0 && (
                <motion.section
                  variants={rise}
                  transition={transition(durations.enter)}
                  aria-labelledby="family-groceries"
                  className="rounded-md bg-sunk p-5"
                >
                  <h2 id="family-groceries" className="flex items-center gap-2 text-heading text-ink">
                    <ShoppingBasket className="h-4 w-4 flex-shrink-0 text-ink-muted" aria-hidden="true" />
                    Worth picking up
                  </h2>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {insightData.grocery_suggestions!.map((item, i) => (
                      <li key={i}>
                        <Badge variant="outline" className="bg-surface">{item}</Badge>
                      </li>
                    ))}
                  </ul>
                </motion.section>
              )}

              <DisclaimerBanner />
            </motion.div>
          );
        }}
      </SectionBoundary>
    </div>
  );
}
