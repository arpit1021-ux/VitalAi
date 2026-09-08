import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, UserPlus, Flame, Star, Shield, Heart, Sun, Sunset, Moon } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { dailylog } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionBoundary } from '@/components/shared/SectionBoundary';
import { useToast } from '@/lib/toast';
import DinnerIdeasCarousel from '@/components/dashboard/DinnerIdeasCarousel';
import WaterTracker from '@/components/dashboard/WaterTracker';
import TodaysPlate from '@/components/dashboard/TodaysPlate';
import TodaysChallenge from '@/components/dashboard/TodaysChallenge';
import SignInModal from '@/components/shared/SignInModal';

type PlateGroups = { veg: boolean; fruit: boolean; protein: boolean; grains: boolean; dairy: boolean };

interface DailyLog {
  waterCount: number;
  waterGoal: number;
  plateGroups: PlateGroups;
  plateEntries?: Partial<Record<keyof PlateGroups, string>>;
  challenge?: { text?: string; completed?: boolean };
}

interface Streak {
  currentStreak: number;
  longestStreak: number;
}

const EMPTY_PLATE: PlateGroups = { veg: false, fruit: false, protein: false, grains: false, dairy: false };

/**
 * What a signed-out visitor sees. The cards are rendered rather than hidden so
 * the dashboard shows what the product does; every control routes to sign-in.
 */
const GUEST_DAILY: DailyLog = {
  waterCount: 0,
  waterGoal: 8,
  plateGroups: EMPTY_PLATE,
  challenge: { text: 'Add a serving of vegetables to your next meal', completed: false },
};

const GUEST_STREAK: Streak = { currentStreak: 0, longestStreak: 0 };

function BadgeRowSkeleton() {
  return (
    <div className="flex gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-24 rounded-full" />
      ))}
    </div>
  );
}

function ThreeCardSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-6">
            <Skeleton className="h-4 w-32 mb-3" />
            <Skeleton className="h-3 w-full mb-2" />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function useGreeting() {
  const [greeting, setGreeting] = useState<{ text: string; period: string; Icon: typeof Sun }>({
    text: 'Hello',
    period: 'TODAY',
    Icon: Sun,
  });

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting({ text: 'Good morning', period: 'MORNING', Icon: Sun });
    else if (hour < 18) setGreeting({ text: 'Good afternoon', period: 'AFTERNOON', Icon: Sunset });
    else setGreeting({ text: 'Good evening', period: 'EVENING', Icon: Moon });
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

  const { text: greeting, period, Icon: GreetingIcon } = useGreeting();
  const isGuest = !isAuthenticated;
  const profileId = activeProfile?._id ?? '';
  const dailyKey = useMemo(() => ['dailylog', activeProfile?._id], [activeProfile?._id]);

  const dailyQuery = useQuery<DailyLog>({
    queryKey: dailyKey,
    queryFn: () => dailylog.getToday(profileId).then((r) => r.data as DailyLog),
    enabled: !!activeProfile,
    staleTime: 24 * 60 * 60 * 1000,
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
    failureContext: "Today's challenge wasn't marked complete.",
  });

  const requireAccount = (): boolean => {
    if (isGuest) {
      setShowSignInModal(true);
      return true;
    }
    return false;
  };

  const displayName = isGuest ? 'friend' : (activeProfile?.name || 'friend');

  const dateStr = new Date()
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    .toUpperCase();

  const renderDailyCards = (log: DailyLog) => {
    const groups = log.plateGroups ?? EMPTY_PLATE;
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TodaysChallenge
          text={log.challenge?.text ?? GUEST_DAILY.challenge!.text!}
          completed={log.challenge?.completed ?? false}
          onComplete={() => {
            if (requireAccount()) return;
            if (!log.challenge?.completed) challenge.mutate(true);
          }}
        />
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
    );
  };

  const renderStreakBadges = (streak: Streak) => {
    return (
      <div className="flex flex-wrap gap-3">
        <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 text-sm">
          <Flame className="h-4 w-4" aria-hidden="true" />{' '}
          <span className="tabular-nums">{streak.currentStreak}</span> day streak
        </Badge>
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm">
          <Star className="h-4 w-4" aria-hidden="true" />{' '}
          <span className="tabular-nums">{streak.longestStreak}</span> best
        </Badge>
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm">
          <Shield className="h-4 w-4" aria-hidden="true" />{' '}
          <span className="tabular-nums">{activeProfile?.allergies?.length ?? 0}</span> allergies
        </Badge>
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm">
          <Heart className="h-4 w-4" aria-hidden="true" />{' '}
          {activeProfile?.age ? <>Age <span className="tabular-nums">{activeProfile.age}</span></> : 'add age'}
        </Badge>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
              <GreetingIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {period} · {dateStr}
            </p>
            <h1 className="text-3xl font-bold text-text-primary">
              {greeting}, {displayName}
            </h1>
            <p className="text-sm text-text-muted mt-1">
              {isGuest
                ? 'Your AI health companion — sign in to unlock personalized tracking'
                : "Welcome back. Let's keep up the good work."}
            </p>

            {isGuest && (
              <div className="flex flex-wrap gap-3 mt-4">
                <Button size="lg" onClick={() => navigate('/register')} className="h-12">
                  <UserPlus className="h-5 w-5 mr-2" aria-hidden="true" /> Get started — it's free
                </Button>
                <Button size="lg" variant="secondary" onClick={() => navigate('/login')} className="h-12">
                  I already have an account
                </Button>
              </div>
            )}

            {isAuthenticated && activeProfile && (
              <p className="text-sm text-text-muted mt-3">
                {activeProfile.dietType
                  ? `${activeProfile.dietType.charAt(0).toUpperCase() + activeProfile.dietType.slice(1)} diet`
                  : 'No diet set'}
                {activeProfile.fitnessGoal ? ` · ${activeProfile.fitnessGoal.replace('-', ' ')}` : ''}
              </p>
            )}
          </div>

          <div className="lg:col-span-2">
            <DinnerIdeasCarousel profileId={profileId} />
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        {isGuest ? (
          <>{renderStreakBadges(GUEST_STREAK)}</>
        ) : (
          <SectionBoundary
            query={streakQuery}
            skeleton={<BadgeRowSkeleton />}
            // A streak that fails to refresh is worth showing stale: the number
            // is a nudge, not a health fact, and an error block here would be
            // louder than the information it replaces.
            degradeToStale
          >
            {(streak) => renderStreakBadges(streak)}
          </SectionBoundary>
        )}
      </motion.div>

      {isGuest && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="border-dashed border-2 border-primary/30">
            <CardContent className="p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Lock className="h-5 w-5 text-primary flex-shrink-0" aria-hidden="true" />
                <p className="text-sm text-text-primary">
                  Sign in to track your pantry, get personalized recipes, and more.
                </p>
              </div>
              <Button size="sm" onClick={() => setShowSignInModal(true)} className="flex-shrink-0">
                Sign in
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        {isGuest ? (
          <>{renderDailyCards(GUEST_DAILY)}</>
        ) : (
          <SectionBoundary query={dailyQuery} skeleton={<ThreeCardSkeleton />} degradeToStale>
            {(log) => renderDailyCards(log)}
          </SectionBoundary>
        )}
      </motion.div>

      <SignInModal
        open={showSignInModal}
        onOpenChange={setShowSignInModal}
        message="Sign in to access this feature"
      />
    </div>
  );
}
