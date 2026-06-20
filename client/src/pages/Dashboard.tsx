import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, UserPlus, Flame, Star, Shield, Heart } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { dashboard as dashboardApi, dailylog } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import DinnerIdeasCarousel from '@/components/dashboard/DinnerIdeasCarousel';
import WaterTracker from '@/components/dashboard/WaterTracker';
import TodaysPlate from '@/components/dashboard/TodaysPlate';
import TodaysChallenge from '@/components/dashboard/TodaysChallenge';
import SignInModal from '@/components/shared/SignInModal';

function HeroSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3 space-y-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-64" />
        <div className="flex gap-3 pt-2">
          <Skeleton className="h-11 w-36 rounded-xl" />
          <Skeleton className="h-11 w-44 rounded-xl" />
        </div>
      </div>
      <div className="lg:col-span-2">
        <Skeleton className="h-[300px] w-full rounded-2xl" />
      </div>
    </div>
  );
}

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

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();
  const { activeProfile } = useProfileStore();
  const [greeting, setGreeting] = useState('');
  const [greetingWord, setGreetingWord] = useState('');
  const [greetingIcon, setGreetingIcon] = useState('🌙');
  const [showSignInModal, setShowSignInModal] = useState(false);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      setGreeting('Good morning');
      setGreetingWord('morning');
      setGreetingIcon('☀️');
    } else if (hour < 18) {
      setGreeting('Good afternoon');
      setGreetingWord('afternoon');
      setGreetingIcon('🌤️');
    } else {
      setGreeting('Good evening');
      setGreetingWord('evening');
      setGreetingIcon('🌙');
    }
  }, []);

  const isGuest = !isAuthenticated;

  const { data: dashData, isLoading: dashLoading } = useQuery({
    queryKey: ['dashboard', activeProfile?._id],
    queryFn: () => dashboardApi.getData(activeProfile!._id).then((r) => r.data),
    enabled: !!activeProfile,
  });

  const { data: dailyData, isLoading: dailyLoading } = useQuery({
    queryKey: ['dailylog', activeProfile?._id],
    queryFn: () => dailylog.getToday(activeProfile!._id).then((r) => r.data),
    enabled: !!activeProfile,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const { data: streakData, isLoading: streakLoading } = useQuery({
    queryKey: ['streak', activeProfile?._id],
    queryFn: () => dailylog.getStreak(activeProfile!._id).then((r) => r.data),
    enabled: !!activeProfile,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const waterAddMutation = useMutation({
    mutationFn: () => dailylog.addWater(activeProfile!._id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dailylog', activeProfile?._id] }),
    onError: () => {},
  });

  const waterRemoveMutation = useMutation({
    mutationFn: () => dailylog.removeWater(activeProfile!._id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dailylog', activeProfile?._id] }),
    onError: () => {},
  });

  const waterGoalMutation = useMutation({
    mutationFn: (goal: number) => dailylog.setWaterGoal(activeProfile!._id, goal),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dailylog', activeProfile?._id] }),
    onError: () => {},
  });

  const plateMutation = useMutation({
    mutationFn: ({ group, value, entry }: { group: string; value: boolean; entry?: string }) =>
      dailylog.updatePlate(activeProfile!._id, group, value, entry),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dailylog', activeProfile?._id] }),
    onError: () => {},
  });

  const challengeMutation = useMutation({
    mutationFn: (completed: boolean) => dailylog.updateChallenge(activeProfile!._id, completed),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dailylog', activeProfile?._id] }),
    onError: () => {},
  });

  const waterCount = isGuest ? 0 : (dailyData?.waterCount ?? 0);
  const waterGoal = isGuest ? 8 : (dailyData?.waterGoal ?? 8);
  const goalReached = waterCount >= waterGoal;
  const plateGroups = isGuest
    ? { veg: false, fruit: false, protein: false, grains: false, dairy: false }
    : (dailyData?.plateGroups ?? { veg: false, fruit: false, protein: false, grains: false, dairy: false });
  const challengeCompleted = isGuest ? false : (dailyData?.challenge?.completed ?? false);
  const challengeText = isGuest
    ? 'Add a serving of vegetables to your next meal'
    : (dailyData?.challenge?.text ?? 'Add a serving of vegetables to your next meal');
  const currentStreak = isGuest ? 0 : (streakData?.currentStreak ?? 0);
  const longestStreak = isGuest ? 0 : (streakData?.longestStreak ?? 0);

  const handleWaterAdd = () => {
    if (isGuest) { setShowSignInModal(true); return; }
    waterAddMutation.mutate();
  };

  const handleWaterRemove = () => {
    if (isGuest) { setShowSignInModal(true); return; }
    waterRemoveMutation.mutate();
  };

  const handleSetGoal = (goal: number) => {
    if (isGuest) { setShowSignInModal(true); return; }
    waterGoalMutation.mutate(goal);
  };

  const handlePlateToggle = (group: string, entry?: string) => {
    if (isGuest) { setShowSignInModal(true); return; }
    const currentValue = plateGroups[group as keyof typeof plateGroups];
    plateMutation.mutate({ group, value: !currentValue, entry });
  };

  const handleChallengeComplete = () => {
    if (isGuest) { setShowSignInModal(true); return; }
    if (!challengeCompleted) {
      challengeMutation.mutate(true);
    }
  };

  const displayName = isGuest ? 'friend' : (activeProfile?.name || 'friend');
  const profileId = activeProfile?._id || '';

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).toUpperCase();

  return (
    <div className="space-y-6 max-w-5xl">
      {dashLoading && isGuest ? (
        <HeroSkeleton />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
                {greetingIcon} {greetingWord.toUpperCase()} · {dateStr}
              </p>
              <h1 className="text-3xl font-bold text-text-primary">
                {greeting}, {displayName} 👋
              </h1>
              <p className="text-sm text-text-muted mt-1">
                {isGuest
                  ? 'Your AI health companion — sign in to unlock personalized tracking'
                  : `Welcome back! Let's keep up the good work.`}
              </p>

              {isGuest && (
                <div className="flex flex-wrap gap-3 mt-4">
                  <Button size="lg" onClick={() => navigate('/register')} className="h-12">
                    <UserPlus className="h-5 w-5 mr-2" /> Get Started — it's free
                  </Button>
                  <Button size="lg" variant="secondary" onClick={() => navigate('/login')} className="h-12">
                    I already have an account
                  </Button>
                </div>
              )}

              {isAuthenticated && activeProfile && (
                <div className="mt-3">
                  <p className="text-sm text-text-muted">
                    {activeProfile.dietType ? `${activeProfile.dietType.charAt(0).toUpperCase() + activeProfile.dietType.slice(1)} diet` : 'No diet set'}
                    {activeProfile.fitnessGoal ? ` · ${activeProfile.fitnessGoal.replace('-', ' ')}` : ''}
                  </p>
                </div>
              )}
            </div>

            <div className="lg:col-span-2">
              <DinnerIdeasCarousel
                profileId={profileId}
                loading={isGuest ? false : dashLoading}
              />
            </div>
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {streakLoading && !isGuest ? (
          <BadgeRowSkeleton />
        ) : (
          <div className="flex flex-wrap gap-3">
            <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 text-sm">
              <Flame className="h-4 w-4" /> {currentStreak} day streak
            </Badge>
            <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm">
              <Star className="h-4 w-4" /> {longestStreak} best
            </Badge>
            <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm">
              <Shield className="h-4 w-4" /> {activeProfile?.allergies?.length ?? 0} allergies
            </Badge>
            <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm">
              <Heart className="h-4 w-4" /> {activeProfile?.age ? `Age ${activeProfile.age}` : 'add age'}
            </Badge>
          </div>
        )}
      </motion.div>

      {isGuest && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="border-dashed border-2 border-primary/30">
            <CardContent className="p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Lock className="h-5 w-5 text-primary flex-shrink-0" />
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

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {(dailyLoading && !isGuest) ? (
          <ThreeCardSkeleton />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
              <TodaysChallenge
                text={challengeText}
                completed={challengeCompleted}
                onComplete={handleChallengeComplete}
                loading={false}
              />
            </motion.div>
            <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
              <WaterTracker
                count={waterCount}
                goal={waterGoal}
                onAdd={handleWaterAdd}
                onRemove={handleWaterRemove}
                onSetGoal={handleSetGoal}
                loading={false}
                goalReached={goalReached}
              />
            </motion.div>
            <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
              <TodaysPlate
                groups={plateGroups}
                entries={dailyData?.plateEntries}
                allergies={activeProfile?.allergies}
                onToggle={handlePlateToggle}
                loading={false}
              />
            </motion.div>
          </div>
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
