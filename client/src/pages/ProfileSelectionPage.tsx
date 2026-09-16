import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Settings, LogOut, UserPlus } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { Button } from '@/components/ui/button';
import { rise, stagger, transition, durations } from '@/lib/motion';

/**
 * The avatar someone picked, on a recessed chip.
 *
 * This used to be a twenty-entry map of raw hex colours carried over from the
 * old dark theme. The palette now has four hues and each one means something —
 * primary is "safe", caution and danger are verdicts — so a decorative rainbow
 * cannot survive: a teal or violet circle beside a green one reads as a
 * judgement about the person. The chip is a neutral `sunk` well instead, and
 * the avatar character itself does the distinguishing.
 */
function AvatarChip({ avatar, name }: { avatar?: string; name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-16 w-16 items-center justify-center rounded-full bg-sunk text-2xl leading-none text-ink transition-colors duration-micro group-hover:bg-primary-soft sm:h-20 sm:w-20 sm:text-3xl"
    >
      {avatar || name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

export default function ProfileSelectionPage() {
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const { profiles, activeProfile, setActiveProfile } = useProfileStore();

  useEffect(() => {
    if (profiles.length === 1 && activeProfile) {
      navigate('/', { replace: true });
    }
  }, [profiles, activeProfile, navigate]);

  const handleSelectProfile = (profile: typeof profiles[0]) => {
    setActiveProfile(profile);
    navigate('/');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (profiles.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-ground px-4 py-12">
        <motion.div
          variants={rise}
          initial="hidden"
          animate="visible"
          transition={transition(durations.enter)}
          className="w-full max-w-reading text-center"
        >
          {/* Warmth is allowed here — an empty state is one of the few places
              accent belongs, and there is no verdict anywhere near it. */}
          <span
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft"
            aria-hidden="true"
          >
            <UserPlus className="h-7 w-7 text-accent-ink" />
          </span>
          <h1 className="text-balance font-display text-display text-ink">Nobody here yet</h1>
          <p className="mx-auto mt-3 max-w-reading text-body-lg text-ink-muted">
            Make a profile and VitalAI can start answering for you specifically — your allergies,
            your conditions, your medicines.
          </p>
          <Button size="lg" className="mt-8 w-full sm:w-auto" onClick={() => navigate('/profile-setup')}>
            <Plus className="h-5 w-5" aria-hidden="true" />
            Set up the first profile
          </Button>
          <div className="mt-6">
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="min-h-[44px] rounded px-3 text-label text-ink-muted underline underline-offset-4 transition-colors duration-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Sign out
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-ground">
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6">
        <motion.div
          variants={stagger(0.05)}
          initial="hidden"
          animate="visible"
          className="w-full max-w-3xl"
        >
          <motion.h1
            variants={rise}
            transition={transition(durations.enter)}
            className="text-balance text-center font-display text-display text-ink"
          >
            Who&apos;s using VitalAI?
          </motion.h1>
          <motion.p
            variants={rise}
            transition={transition(durations.enter)}
            className="mx-auto mt-3 max-w-reading text-center text-body-lg text-ink-muted"
          >
            Pick a profile and the answers will be about that person.
          </motion.p>

          <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4">
            {profiles.map((profile) => (
              <motion.li key={profile._id} variants={rise} transition={transition(durations.enter)}>
                <button
                  type="button"
                  onClick={() => handleSelectProfile(profile)}
                  className="group flex w-full flex-col items-center gap-3 rounded-md border-2 border-ink/10 bg-surface p-4 text-center shadow-card transition-[border-color,box-shadow,transform] duration-micro ease-entrance hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lift active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  aria-label={`Continue as ${profile.name}`}
                >
                  <AvatarChip avatar={profile.avatar} name={profile.name} />
                  <span className="w-full break-words text-heading text-ink">{profile.name}</span>
                  <span className="w-full break-words text-caption text-ink-muted">
                    {profile.age ? (
                      <>
                        <span className="font-mono text-figure tabular-nums">{profile.age}</span>
                        {' · '}
                      </>
                    ) : null}
                    {profile.dietType || 'No diet set'}
                  </span>
                </button>
              </motion.li>
            ))}

            {profiles.length < 6 && (
              <motion.li variants={rise} transition={transition(durations.enter)}>
                <button
                  type="button"
                  onClick={() => navigate('/profile-setup')}
                  className="group flex h-full w-full flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-line-strong bg-transparent p-4 text-center transition-colors duration-micro hover:border-primary hover:bg-surface/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  aria-label="Add another profile"
                >
                  <span
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-sunk transition-colors duration-micro group-hover:bg-primary-soft sm:h-20 sm:w-20"
                    aria-hidden="true"
                  >
                    <Plus className="h-7 w-7 text-ink-muted transition-colors duration-micro group-hover:text-primary" />
                  </span>
                  <span className="text-heading text-ink-muted transition-colors duration-micro group-hover:text-primary">
                    Add someone
                  </span>
                </button>
              </motion.li>
            )}
          </ul>
        </motion.div>
      </main>

      <div className="flex flex-col justify-center gap-2 border-t border-line px-4 py-4 sm:flex-row sm:gap-4">
        <Button variant="ghost" onClick={() => navigate('/profile-setup')}>
          <Settings className="h-4 w-4" aria-hidden="true" />
          Manage profiles
        </Button>
        <Button variant="ghost" onClick={() => void handleLogout()}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
