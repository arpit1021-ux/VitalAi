import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { dailylog, healthScore as healthScoreApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionBoundary } from '@/components/shared/SectionBoundary';
import { useToast } from '@/lib/toast';
import { rise, transition, durations } from '@/lib/motion';
import DinnerIdeasCarousel from '@/components/dashboard/DinnerIdeasCarousel';
import WaterTracker from '@/components/dashboard/WaterTracker';
import TodaysPlate from '@/components/dashboard/TodaysPlate';
import TodaysChallenge from '@/components/dashboard/TodaysChallenge';
import SignInModal from '@/components/shared/SignInModal';
import { GettingStarted } from '@/components/onboarding/GettingStarted';
import HealthScoreCard from '@/components/dashboard/HealthScoreCard';

type PlateGroups = { veg: boolean; fruit: boolean; protein: boolean; grains: boolean; dairy: boolean };

interface DailyLog {
  waterCount: number;
  waterGoal: number;
  plateGroups: PlateGroups;
  plateEntries?: Partial<Record<keyof PlateGroups, string>>;
  challenge?: { text?: string; completed?: boolean };
}

interface HealthScore {
  score: number | null;
  hasData?: boolean;
  factors: {
    hydration: number;
    foodScanQuality: number;
    supplementQuality: number;
    dailyActivity: number;
    consistency: number;
  };
  strengths: string[];
  improvements: string[];
}

interface Streak {
  currentStreak: number;
  longestStreak: number;
}

const EMPTY_PLATE: PlateGroups = { veg: false, fruit: false, protein: false, grains: false, dairy: false };

/**
 * What a signed-out visitor sees. The trackers are rendered rather than hidden
 * so the dashboard shows what the product does; every control routes to sign-in.
 */
const GUEST_DAILY: DailyLog = {
  waterCount: 0,
  waterGoal: 8,
  plateGroups: EMPTY_PLATE,
  challenge: { text: 'Add a handful of vegetables to your next meal.', completed: false },
};

const GUEST_STREAK: Streak = { currentStreak: 0, longestStreak: 0 };

function FiguresSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg bg-surface shadow-card p-5">
          <Skeleton className="h-11 w-20 rounded" />
          <Skeleton className="h-3 w-24 rounded mt-3" />
        </div>
      ))}
    </div>
  );
}

function TodaySkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6">
      <div className="lg:col-span-3 space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
      <div className="lg:col-span-2">
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </div>
  );
}

function useGreeting() {
  const [greeting, setGreeting] = useState('Hello');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }, []);

  return greeting;
}

/**
 * Builds a mutation that applies its change to the cached daily log
 * immediately and puts the previous value back if the server disagrees.
 *
 * Every one of these was `onError: () => {}` — a failed water tap left the
 * count on screen unchanged with no explanation, which reads as an
 * unresponsive button rather than as a failure.
 */
function useDailyLogMutation<TArgs>(options: {
  dailyKey: readonly unknown[];
  request: (args: TArgs) => Promise<unknown>;
  apply: (current: DailyLog, args: TArgs) => DailyLog;
  failureContext: string;
}) {
  const { dailyKey, request, apply, failureContext } = options;
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation<unknown, unknown, TArgs, { previous?: DailyLog }>({
    mutationFn: request,
    onMutate: async (args) => {
      // A refetch landing mid-flight would overwrite the optimistic value.
      await queryClient.cancelQueries({ queryKey: dailyKey });
      const previous = queryClient.getQueryData<DailyLog>(dailyKey);
      if (previous) queryClient.setQueryData<DailyLog>(dailyKey, apply(previous, args));
      return { previous };
    },
    onError: (error, _args, context) => {
      if (context?.previous) queryClient.setQueryData<DailyLog>(dailyKey, context.previous);
      toast.reportFailure(error, failureContext);
    },
    // Reconciles with the server whether the write succeeded or was rolled
    // back, so the screen never sits on a value only the client believes.
    onSettled: () => queryClient.invalidateQueries({ queryKey: dailyKey }),
  });
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { activeProfile } = useProfileStore();
  const [showSignInModal, setShowSignInModal] = useState(false);

  const greeting = useGreeting();
  const isGuest = !isAuthenticated;
  const profileId = activeProfile?._id ?? '';
  const dailyKey = useMemo(() => ['dailylog', activeProfile?._id], [activeProfile?._id]);

  const dailyQuery = useQuery<DailyLog>({
    queryKey: dailyKey,
    queryFn: () => dailylog.getToday(profileId).then((r) => r.data as DailyLog),
    enabled: !!activeProfile,
    staleTime: 24 * 60 * 60 * 1000,
  });

  /**
   * Computed server-side from logged data — no model call, so it costs nothing
   * to show and is safe to render on every dashboard load.
   */
  const healthScoreQuery = useQuery<HealthScore>({
    queryKey: ['healthScore', activeProfile?._id],
    queryFn: () => healthScoreApi.get(profileId).then((r) => r.data as HealthScore),
    enabled: !!activeProfile,
    staleTime: 60 * 60 * 1000,
  });

  const streakQuery = useQuery<Streak>({
    queryKey: ['streak', activeProfile?._id],
    queryFn: () => dailylog.getStreak(profileId).then((r) => r.data as Streak),
    enabled: !!activeProfile,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const waterAdd = useDailyLogMutation<void>({
    dailyKey,
    request: () => dailylog.addWater(profileId),
    apply: (current) => ({ ...current, waterCount: current.waterCount + 1 }),
    failureContext: "That glass wasn't saved.",
  });

  const waterRemove = useDailyLogMutation<void>({
    dailyKey,
    request: () => dailylog.removeWater(profileId),
    apply: (current) => ({ ...current, waterCount: Math.max(0, current.waterCount - 1) }),
    failureContext: "That glass wasn't removed.",
  });

  const waterGoal = useDailyLogMutation<number>({
    dailyKey,
    request: (goal) => dailylog.setWaterGoal(profileId, goal),
    apply: (current, goal) => ({ ...current, waterGoal: goal }),
    failureContext: "Your water goal wasn't changed.",
  });

  const plate = useDailyLogMutation<{ group: keyof PlateGroups; value: boolean; entry?: string }>({
    dailyKey,
    request: ({ group, value, entry }) => dailylog.updatePlate(profileId, group, value, entry),
    apply: (current, { group, value, entry }) => ({
      ...current,
      plateGroups: { ...current.plateGroups, [group]: value },
      plateEntries: entry ? { ...current.plateEntries, [group]: entry } : current.plateEntries,
    }),
    failureContext: "That food group wasn't saved.",
  });

  const challenge = useDailyLogMutation<boolean>({
    dailyKey,
    request: (completed) => dailylog.updateChallenge(profileId, completed),
    apply: (current, completed) => ({ ...current, challenge: { ...current.challenge, completed } }),
    failureContext: "Today's one small thing wasn't marked done.",
  });

  const requireAccount = (): boolean => {
    if (isGuest) {
      setShowSignInModal(true);
      return true;
    }
    return false;
  };

  const displayName = isGuest ? 'there' : activeProfile?.name || 'there';

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  /**
   * The three trackers, arranged as a wide column of things you did and a
   * narrower rail for the count you top up through the day — not three equal
   * rectangles in a row.
   */
  const renderToday = (log: DailyLog) => {
    const groups = log.plateGroups ?? EMPTY_PLATE;
    return (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6 items-start">
        <div className="lg:col-span-3 space-y-4">
          <TodaysChallenge
            text={log.challenge?.text ?? GUEST_DAILY.challenge!.text!}
            completed={log.challenge?.completed ?? false}
            onComplete={() => {
              if (requireAccount()) return;
              if (!log.challenge?.completed) challenge.mutate(true);
            }}
          />
          <TodaysPlate
            groups={groups}
            entries={log.plateEntries}
            allergies={activeProfile?.allergies}
            onToggle={(group, entry) => {
              if (requireAccount()) return;
              const key = group as keyof PlateGroups;
              plate.mutate({ group: key, value: !groups[key], entry });
            }}
          />
        </div>

        <div className="lg:col-span-2">
          <WaterTracker
            count={log.waterCount ?? 0}
            goal={log.waterGoal ?? 8}
            goalReached={(log.waterCount ?? 0) >= (log.waterGoal ?? 8)}
            onAdd={() => {
              if (requireAccount()) return;
              waterAdd.mutate();
            }}
            onRemove={() => {
              if (requireAccount()) return;
              waterRemove.mutate();
            }}
            onSetGoal={(goal) => {
              if (requireAccount()) return;
              waterGoal.mutate(goal);
            }}
          />
        </div>
      </div>
    );
  };

  /**
   * The figures used to be sixteen-pixel numerals on the bare ground, which
   * read as footnotes rather than as the thing you came back to see. They are
   * cards now, at `text-stat`, with the running streak carrying the accent —
   * brand energy on a streak, never on a verdict.
   *
   * `flex-col-reverse` keeps the term before its description in the markup,
   * where a screen reader needs it, and the figure above its label on screen,
   * where the eye wants it.
   */
  const renderFigures = (streak: Streak) => (
    <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      <div className="flex flex-col-reverse gap-1 rounded-lg border border-accent/25 bg-accent-soft p-5 shadow-card">
        <dt className="text-label text-accent-ink">
          {streak.currentStreak === 1 ? 'Day in a row' : 'Days in a row'}
        </dt>
        <dd className="font-mono text-stat text-accent-ink tabular break-words">{streak.currentStreak}</dd>
      </div>
      <div className="flex flex-col-reverse gap-1 rounded-lg bg-surface p-5 shadow-card">
        <dt className="text-label text-ink-muted">Your best run</dt>
        <dd className="font-mono text-stat text-ink tabular break-words">{streak.longestStreak}</dd>
      </div>
      <div className="flex flex-col-reverse gap-1 rounded-lg bg-surface p-5 shadow-card">
        <dt className="text-label text-ink-muted">Foods you avoid</dt>
        <dd className="font-mono text-stat text-ink tabular break-words">
          {activeProfile?.allergies?.length ?? 0}
        </dd>
      </div>
    </dl>
  );

  return (
    <div className="space-y-8 lg:space-y-10">
      {/* The opening is a block of canvas rather than bare page. A light screen
          with nothing dark on it has no structure to push against, and the
          greeting was previously indistinguishable from the sections under it.
          Tonight's idea sits on the panel as a white card, so the first thing
          anyone sees — signed in or not — is an object, not a document. */}
      <motion.section
        variants={rise}
        initial="hidden"
        animate="visible"
        transition={transition(durations.enter)}
        className="relative overflow-hidden rounded-xl bg-canvas shadow-lift px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12"
      >
        {/* Warmth behind the greeting. Decorative only, so it is hidden from
            assistive technology and never carries meaning. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full bg-accent/25 blur-3xl"
        />

        <div className="relative grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-10 items-start">
          <div className="lg:col-span-3 min-w-0">
            <p className="text-label text-canvas-muted">{dateStr}</p>
            <h1 className="font-display text-display sm:text-display-lg text-canvas-ink mt-2 text-balance break-words">
              {greeting}, {displayName}
            </h1>
            <p className="text-body-lg text-canvas-muted mt-4 max-w-reading">
              {isGuest
                ? "See what's in your food, and what it's doing for you."
                : "Here's how today is going so far."}
            </p>

            {isGuest ? (
              <div className="flex flex-col sm:flex-row flex-wrap gap-3 mt-7">
                <Button size="lg" variant="onDark" onClick={() => navigate('/register')}>
                  Make an account
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  onClick={() => navigate('/login')}
                  className="border-2 border-canvas-line text-canvas-ink hover:bg-canvas-soft hover:text-canvas-ink"
                >
                  Sign in
                </Button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row flex-wrap gap-3 mt-7">
                <Button size="lg" variant="onDark" onClick={() => navigate('/scanner')}>
                  Scan a food
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  onClick={() => navigate('/chat')}
                  className="border-2 border-canvas-line text-canvas-ink hover:bg-canvas-soft hover:text-canvas-ink"
                >
                  Ask VitalBot
                </Button>
              </div>
            )}

            {isAuthenticated && activeProfile && (
              <p className="mt-6 inline-flex max-w-full items-center rounded-full bg-canvas-soft border border-canvas-line px-3.5 py-1.5 text-caption text-canvas-muted break-words">
                {activeProfile.dietType
                  ? `${activeProfile.dietType.charAt(0).toUpperCase() + activeProfile.dietType.slice(1)} diet`
                  : 'No diet set yet'}
                {activeProfile.fitnessGoal ? ` · ${activeProfile.fitnessGoal.replace('-', ' ')}` : ''}
              </p>
            )}
          </div>

          <div className="lg:col-span-2 min-w-0">
            <DinnerIdeasCarousel profileId={profileId} />
          </div>
        </div>
      </motion.section>

      {!isGuest && <GettingStarted />}

      {!isGuest && (
        <motion.section initial="hidden" animate="visible" variants={rise} transition={transition(durations.enter)}>
          <SectionBoundary
            query={healthScoreQuery}
            skeleton={<HealthScoreCard score={null} factors={{ hydration: 0, foodScanQuality: 0, supplementQuality: 0, dailyActivity: 0, consistency: 0 }} strengths={[]} improvements={[]} loading />}
            // A score built from stale logs is misleading in a way a streak is
            // not, so this one does not degrade quietly.
          >
            {(score) => (
              <HealthScoreCard
                score={score.score}
                hasData={score.hasData}
                factors={score.factors}
                strengths={score.strengths ?? []}
                improvements={score.improvements ?? []}
              />
            )}
          </SectionBoundary>
        </motion.section>
      )}

      {isGuest && (
        <motion.div
          variants={rise}
          initial="hidden"
          animate="visible"
          transition={transition(durations.enter)}
          className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-accent/25 bg-accent-soft px-5 py-5 shadow-card"
        >
          <p className="text-body-lg text-ink max-w-reading">
            Sign in and we&apos;ll keep your pantry, your scans and the recipes that suit you.
          </p>
          <Button size="md" variant="accent" onClick={() => setShowSignInModal(true)}>
            Sign in
          </Button>
        </motion.div>
      )}

      <motion.section
        variants={rise}
        initial="hidden"
        animate="visible"
        transition={transition(durations.enter)}
        aria-labelledby="streak-heading"
      >
        <h2 id="streak-heading" className="text-heading text-ink mb-4">
          How you&apos;ve been keeping it up
        </h2>
        {isGuest ? (
          renderFigures(GUEST_STREAK)
        ) : (
          <SectionBoundary
            query={streakQuery}
            skeleton={<FiguresSkeleton />}
            // A streak that fails to refresh is worth showing stale: the number
            // is a nudge, not a health fact, and an error block here would be
            // louder than the information it replaces.
            degradeToStale
          >
            {(streak) => renderFigures(streak)}
          </SectionBoundary>
        )}
      </motion.section>

      <motion.section
        variants={rise}
        initial="hidden"
        animate="visible"
        transition={transition(durations.enter)}
        aria-labelledby="today-heading"
      >
        <h2 id="today-heading" className="font-display text-title text-ink mb-4">
          Today
        </h2>
        {isGuest ? (
          renderToday(GUEST_DAILY)
        ) : (
          <SectionBoundary query={dailyQuery} skeleton={<TodaySkeleton />} degradeToStale>
            {(log) => renderToday(log)}
          </SectionBoundary>
        )}
      </motion.section>

      <SignInModal
        open={showSignInModal}
        onOpenChange={setShowSignInModal}
        message="Sign in to pick this up where you left it."
      />
    </div>
  );
}
