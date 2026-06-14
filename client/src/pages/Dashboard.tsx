import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ScanLine, Bot, Activity, Pill, Package, TrendingUp, Lock, UserPlus } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { dashboard as dashboardApi, dailylog } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CardSkeleton } from '@/components/shared/SkeletonLoader';
import HealthTipCarousel from '@/components/dashboard/HealthTipCarousel';
import StreakTracker from '@/components/dashboard/StreakTracker';
import WaterTracker from '@/components/dashboard/WaterTracker';
import TodaysPlate from '@/components/dashboard/TodaysPlate';
import TodaysChallenge from '@/components/dashboard/TodaysChallenge';
import SignInModal from '@/components/shared/SignInModal';

const guestStats = { scanCount: 12, medicineScans: 3, expiringItems: 2 };
const guestActivity = [
  { type: 'Food Scan - Organic Granola', createdAt: '2026-06-13', verdict: 'safe' },
  { type: 'Medicine Check - Ibuprofen', createdAt: '2026-06-12', verdict: 'caution' },
  { type: 'Food Scan - Protein Bar', createdAt: '2026-06-11', verdict: 'safe' },
];
const guestTips = [
  'Eat a rainbow of fruits and vegetables daily for optimal nutrition.',
  'Stay hydrated — aim for 8 glasses of water a day.',
  'Read nutrition labels to make informed food choices.',
];

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();
  const { activeProfile } = useProfileStore();
  const [greeting, setGreeting] = useState('');
  const [showSignInModal, setShowSignInModal] = useState(false);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }, []);

  const { data: dashData, isLoading } = useQuery({
    queryKey: ['dashboard', activeProfile?._id],
    queryFn: () => dashboardApi.getData(activeProfile!._id).then((r) => r.data),
    enabled: !!activeProfile,
  });

  const { data: tipData } = useQuery({
    queryKey: ['tip', activeProfile?._id],
    queryFn: () => dashboardApi.getTip(activeProfile!._id).then((r) => r.data),
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

  const { data: tipsData } = useQuery({
    queryKey: ['tips', activeProfile?._id],
    queryFn: () => dailylog.getTips(activeProfile!._id).then((r) => r.data),
    enabled: !!activeProfile,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const waterMutation = useMutation({
    mutationFn: (count: number) => dailylog.updateWater(activeProfile!._id, count),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dailylog', activeProfile?._id] }),
  });

  const plateMutation = useMutation({
    mutationFn: ({ group, value }: { group: string; value: boolean }) =>
      dailylog.updatePlate(activeProfile!._id, group, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dailylog', activeProfile?._id] }),
  });

  const challengeMutation = useMutation({
    mutationFn: (completed: boolean) => dailylog.updateChallenge(activeProfile!._id, completed),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dailylog', activeProfile?._id] }),
  });

  const isGuest = !isAuthenticated;

  const waterCount = isGuest ? 3 : (dailyData?.water ?? 0);
  const plateGroups = isGuest
    ? { veg: false, fruit: false, protein: false, grains: false, dairy: false }
    : (dailyData?.plate ?? { veg: false, fruit: false, protein: false, grains: false, dairy: false });
  const challengeCompleted = isGuest ? false : (dailyData?.challengeCompleted ?? false);
  const challengeText = isGuest
    ? 'Add a serving of vegetables to your next meal'
    : (dailyData?.challengeText ?? 'Add a serving of vegetables to your next meal');
  const currentStreak = isGuest ? 0 : (streakData?.currentStreak ?? 0);
  const longestStreak = isGuest ? 0 : (streakData?.longestStreak ?? 0);
  const tips = isGuest ? guestTips : (tipsData?.tips ?? guestTips);
  const stats = isGuest ? guestStats : (dashData ?? guestStats);
  const activity = isGuest ? guestActivity : (dashData?.lastScans ?? guestActivity);

  const handleWaterToggle = (index: number) => {
    if (isGuest) {
      setShowSignInModal(true);
      return;
    }
    const newCount = index < waterCount ? index : index + 1;
    waterMutation.mutate(newCount);
  };

  const handlePlateToggle = (group: string) => {
    if (isGuest) {
      setShowSignInModal(true);
      return;
    }
    const currentValue = plateGroups[group as keyof typeof plateGroups];
    plateMutation.mutate({ group, value: !currentValue });
  };

  const handleChallengeComplete = () => {
    if (isGuest) {
      setShowSignInModal(true);
      return;
    }
    if (!challengeCompleted) {
      challengeMutation.mutate(true);
    }
  };

  const displayName = isGuest ? 'Explorer' : (activeProfile?.name || 'there');

  return (
    <div className="space-y-6 max-w-5xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-background via-surface/50 to-background rounded-2xl p-6"
      >
        <h1 className="text-3xl font-bold text-text-primary">
          {greeting}, {displayName} 👋
        </h1>
        {isGuest && (
          <p className="text-sm text-text-muted mt-1">Preview what VitalAI can do for you</p>
        )}

        {activeProfile && (
          <div className="flex flex-wrap gap-2 mt-3">
            {currentStreak > 0 && (
              <Badge variant="secondary" className="gap-1">
                <TrendingUp className="h-3 w-3" /> {currentStreak} day streak
              </Badge>
            )}
            {activeProfile.age && (
              <Badge variant="outline">Age {activeProfile.age}</Badge>
            )}
            {activeProfile.allergies?.map((a: string) => (
              <Badge key={a} variant="destructive" className="text-xs">{a}</Badge>
            ))}
          </div>
        )}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <HealthTipCarousel
          tips={tips}
          onClose={() => {}}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 md:grid-cols-4 gap-4"
      >
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-muted">Scans This Week</p>
                  <p className="text-3xl font-bold text-primary mt-1">{stats.scanCount || 0}</p>
                </div>
                <ScanLine className="h-8 w-8 text-primary/30" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-muted">Medicines Checked</p>
                  <p className="text-3xl font-bold text-secondary mt-1">{stats.medicineScans || 0}</p>
                </div>
                <Pill className="h-8 w-8 text-secondary/30" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-muted">Pantry Expiring</p>
                  <p className="text-3xl font-bold text-warning mt-1">{stats.expiringItems || 0}</p>
                </div>
                <Package className="h-8 w-8 text-warning/30" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <StreakTracker
          currentStreak={currentStreak}
          longestStreak={longestStreak}
          loading={streakLoading}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <WaterTracker
          count={waterCount}
          onToggle={handleWaterToggle}
          loading={dailyLoading && !isGuest}
        />
        <TodaysPlate
          groups={plateGroups}
          onToggle={handlePlateToggle}
          loading={dailyLoading && !isGuest}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <TodaysChallenge
          text={challengeText}
          completed={challengeCompleted}
          onComplete={handleChallengeComplete}
          loading={dailyLoading && !isGuest}
        />
      </motion.div>

      {activity?.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {activity.slice(0, 5).map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-3">
                      <Activity className="h-4 w-4 text-text-muted" />
                      <div>
                        <p className="text-sm text-text-primary">{item.type || 'Scan'}</p>
                        <p className="text-xs text-text-muted">{new Date(item.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <Badge variant={item.verdict === 'safe' ? 'default' : item.verdict === 'caution' ? 'warning' : 'destructive'}>
                      {item.verdict || 'N/A'}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {isGuest && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="space-y-4"
        >
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-6 text-center">
              <Lock className="h-8 w-8 text-primary mx-auto mb-3" />
              <p className="text-sm text-text-primary mb-1">
                Sign in to unlock scans, chat history, and personalized insights
              </p>
              <Button size="sm" className="mt-3" onClick={() => setShowSignInModal(true)}>
                Sign In — it's free
              </Button>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Button size="lg" onClick={() => navigate('/register')} className="h-14">
              <UserPlus className="h-5 w-5 mr-2" /> Get Started — it's free
            </Button>
            <Button size="lg" variant="secondary" onClick={() => navigate('/login')} className="h-14">
              I already have an account
            </Button>
          </div>
        </motion.div>
      )}

      {isAuthenticated && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <Button size="lg" onClick={() => navigate('/scanner')} className="h-14">
            <ScanLine className="h-5 w-5 mr-2" /> Scan Something
          </Button>
          <Button size="lg" variant="secondary" onClick={() => navigate('/chat')} className="h-14">
            <Bot className="h-5 w-5 mr-2" /> Ask VitalBot
          </Button>
        </motion.div>
      )}

      <SignInModal
        open={showSignInModal}
        onOpenChange={setShowSignInModal}
        message="Sign in to access this feature"
      />
    </div>
  );
}
