import { useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useProfileStore } from '@/stores/profileStore';
import { dashboardExtended } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { SectionBoundary } from '@/components/shared/SectionBoundary';
import { rise, transition, durations } from '@/lib/motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface TimelineDay {
  date: string;
  waterCount: number;
  waterGoal: number;
  plateScore: number;
}

interface Timeline {
  days?: TimelineDay[];
}

/**
 * Palette values as literals, which is the one place in this codebase that is
 * allowed.
 *
 * Recharts renders SVG attributes (`fill`, `stroke`) rather than class names,
 * so a Tailwind token cannot reach it — `fill="bg-primary"` silently paints
 * nothing. These are copied from tailwind.config.js and must be changed with
 * it: primary, accent, the hairline and the muted ink, exactly as the system
 * defines them. Nothing here is a verdict, so no caution or danger appears.
 */
const CHART = {
  primary: '#186B44',
  accent: '#B04C18',
  grid: '#D5CBB8',
  axis: '#57503F',
  surface: '#FFFFFF',
  ink: '#191713',
} as const;

function ChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-5 pt-5 sm:p-6">
            <Skeleton className="mb-4 h-4 w-32" />
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: CHART.surface,
  border: `1px solid ${CHART.grid}`,
  borderRadius: '12px',
  color: CHART.ink,
  fontFamily: 'Karla, system-ui, sans-serif',
  fontSize: '0.9375rem',
};

const formatTick = (v: string) =>
  new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function HealthTimeline() {
  const { activeProfile } = useProfileStore();
  const [timeRange, setTimeRange] = useState('30');

  const timelineQuery = useQuery<Timeline>({
    queryKey: ['timeline', activeProfile?._id, timeRange],
    queryFn: () =>
      dashboardExtended.getTimeline(activeProfile!._id).then((r) => r.data as Timeline),
    enabled: !!activeProfile,
  });

  return (
    <div className="space-y-8">
      <motion.header variants={rise} initial="hidden" animate="visible" transition={transition(durations.enter)}>
        <h1 className="font-display text-display sm:text-display-lg text-ink text-balance">How it's been going</h1>
        <p className="mt-3 max-w-reading text-body-lg text-ink-muted">
          Water and plates, day by day. Look for the shape of it rather than any single day.
        </p>
      </motion.header>

      <motion.div
        variants={rise}
        initial="hidden"
        animate="visible"
        transition={transition(durations.enter)}
        className="border-b border-line pb-4"
      >
        <Tabs value={timeRange} onValueChange={setTimeRange}>
          <TabsList className="h-auto bg-sunk p-1">
            <TabsTrigger value="30" className="min-h-[44px] rounded px-4">Last 30 days</TabsTrigger>
            <TabsTrigger value="90" className="min-h-[44px] rounded px-4">Last 90 days</TabsTrigger>
          </TabsList>
        </Tabs>
      </motion.div>

      <SectionBoundary
        query={timelineQuery}
        skeleton={<ChartsSkeleton />}
        isEmpty={(timeline) => (timeline.days?.length ?? 0) === 0}
        empty={
          <EmptyState
            icon={BarChart3}
            title="Nothing to chart yet"
            description="Track a few days of water and meals and the pattern will start showing up here."
          />
        }
      >
        {(timeline) => {
          const days = timeline.days ?? [];
          const hydrationData = days.map((d) => ({ date: d.date, glasses: d.waterCount, goal: d.waterGoal }));
          const activityData = days.map((d) => ({ date: d.date, plateScore: d.plateScore }));

          return (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <motion.div variants={rise} initial="hidden" animate="visible" transition={transition(durations.enter)}>
                <Card>
                  <CardHeader>
                    <CardTitle>Water, day by day</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Its own scroller: a 90-day axis cannot compress to a
                        phone width without the labels collapsing into each other. */}
                    <div className="-mx-1 overflow-x-auto px-1">
                      <div className="min-w-[20rem]">
                        <ResponsiveContainer width="100%" height={250}>
                          <BarChart data={hydrationData}>
                            <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                            <XAxis dataKey="date" stroke={CHART.axis} fontSize={12} tickFormatter={formatTick} />
                            <YAxis stroke={CHART.axis} fontSize={12} allowDecimals={false} />
                            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: CHART.grid, fillOpacity: 0.35 }} />
                            <Bar dataKey="glasses" name="Glasses" fill={CHART.primary} radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                variants={rise}
                initial="hidden"
                animate="visible"
                transition={transition(durations.enter)}
                className="lg:col-span-2"
              >
                <Card>
                  <CardHeader>
                    <CardTitle>How your plates looked</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="-mx-1 overflow-x-auto px-1">
                      <div className="min-w-[20rem]">
                        <ResponsiveContainer width="100%" height={250}>
                          <BarChart data={activityData}>
                            <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                            <XAxis dataKey="date" stroke={CHART.axis} fontSize={12} tickFormatter={formatTick} />
                            <YAxis stroke={CHART.axis} fontSize={12} domain={[0, 5]} allowDecimals={false} />
                            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: CHART.grid, fillOpacity: 0.35 }} />
                            <Bar dataKey="plateScore" name="Plate score" fill={CHART.accent} radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          );
        }}
      </SectionBoundary>
    </div>
  );
}
