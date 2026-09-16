import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ScanLine, HeartPulse, MessageCircleQuestion } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/shared/ErrorState';
import { markWelcomeSeen } from '@/lib/onboarding';
import { rise, stagger, transition, durations } from '@/lib/motion';

/**
 * The first thing a new account sees, straight after registering and before
 * the profile wizard.
 *
 * It exists because the product used to drop someone into a three-step health
 * form with no idea what the form was for. Three beats, in order, each one a
 * thing the product actually does — then one way forward. It is the second
 * splash moment after `AppSplash`, so it is full-bleed canvas: the same dark
 * that opens the app, not a card floating on sand.
 */
const BEATS = [
  {
    icon: ScanLine,
    title: "See what's in your food",
    body: 'Point your camera at a label. We read the ingredients and say what they are, in words you would use yourself.',
  },
  {
    icon: HeartPulse,
    title: 'Check it against your own body',
    body: 'Your allergies, conditions and medicines are the yardstick. The same biscuit is fine for one person and not for another, and we say which.',
  },
  {
    icon: MessageCircleQuestion,
    title: 'Ask anything, any time',
    body: 'VitalBot has your profile in front of it, so you never have to explain yourself twice.',
  },
] as const;

export default function WelcomePage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const {
    profiles,
    hasLoaded,
    isLoading: profilesLoading,
    loadError,
    fetchProfiles,
  } = useProfileStore();

  useEffect(() => {
    markWelcomeSeen();
  }, []);

  if (authLoading || profilesLoading || (isAuthenticated && !hasLoaded && !loadError)) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center" role="status">
        <div className="h-8 w-8 border-2 border-primary-bright border-t-transparent rounded-full animate-spin" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Not knowing whether a profile exists is not the same as knowing there is
  // none. Guessing here is what sends someone who already has a profile
  // through an introduction they have seen, so say so and offer a retry.
  if (loadError) {
    return (
      <div className="min-h-screen bg-ground flex items-center justify-center p-4">
        <ErrorState
          error={loadError}
          onRetry={() => void fetchProfiles()}
          retrying={profilesLoading}
          variant="page"
        />
      </div>
    );
  }

  // Someone who already set VitalAI up does not get introduced to it again.
  if (profiles.length > 0) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-canvas text-canvas-ink">
      {/* Warmth behind the opening, the same bloom as the splash. Decorative
          only, so it is hidden from assistive technology. */}
      <span
        aria-hidden="true"
        className="pointer-events-none fixed -top-40 -right-32 h-[32rem] w-[32rem] rounded-full bg-accent/20 blur-3xl"
      />

      <motion.main
        variants={stagger(0.06)}
        initial="hidden"
        animate="visible"
        className="relative mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-4 py-14 sm:px-6 sm:py-20"
        aria-labelledby="welcome-heading"
      >
        <motion.p
          variants={rise}
          transition={transition(durations.enter)}
          className="text-label text-canvas-muted"
        >
          Welcome to VitalAI
        </motion.p>

        <motion.h1
          variants={rise}
          transition={transition(durations.enter)}
          id="welcome-heading"
          className="mt-3 font-display text-display sm:text-display-lg text-canvas-ink text-balance"
        >
          Here&apos;s what we do together
        </motion.h1>

        <motion.p
          variants={rise}
          transition={transition(durations.enter)}
          className="mt-4 max-w-reading text-body-lg text-canvas-muted"
        >
          Three things, and then you&apos;re in. It takes about a minute to set up, and you can
          change any of it later.
        </motion.p>

        <ol className="mt-10 space-y-0 border-t border-canvas-line">
          {BEATS.map((beat, index) => {
            const Icon = beat.icon;
            return (
              <motion.li
                key={beat.title}
                variants={rise}
                transition={transition(durations.enter)}
                className="flex gap-4 border-b border-canvas-line py-5"
              >
                <span
                  className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-canvas-soft"
                  aria-hidden="true"
                >
                  <Icon className="h-5 w-5 text-primary-bright" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-heading text-canvas-ink">
                    <span className="font-mono text-figure text-canvas-muted tabular-nums mr-2">
                      {index + 1}
                    </span>
                    {beat.title}
                  </h2>
                  <p className="mt-1.5 text-body text-canvas-muted break-words">{beat.body}</p>
                </div>
              </motion.li>
            );
          })}
        </ol>

        <motion.div
          variants={rise}
          transition={transition(durations.enter)}
          className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center"
        >
          <Button
            size="lg"
            variant="onDark"
            className="w-full sm:w-auto"
            onClick={() => navigate('/profile-setup')}
          >
            Set up my profile
          </Button>
          {/* Always skippable. Anything that makes an introduction hard to get
              past makes the product harder to use, not warmer. */}
          <button
            type="button"
            onClick={() => navigate('/profile-setup')}
            className="min-h-[44px] self-start px-1 text-label text-canvas-muted underline underline-offset-4 hover:text-canvas-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-bright rounded"
          >
            Skip the introduction
          </button>
        </motion.div>

        <motion.p
          variants={rise}
          transition={transition(durations.enter)}
          className="mt-8 text-caption text-canvas-muted max-w-reading"
        >
          VitalAI gives guidance, not a diagnosis. Talk to your doctor about anything that
          matters.
        </motion.p>
      </motion.main>
    </div>
  );
}
