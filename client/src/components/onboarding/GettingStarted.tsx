import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { scansExtended, pantry, chat } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionBoundary } from '@/components/shared/SectionBoundary';
import {
  ONBOARDING_TASKS,
  completedCount,
  dismissChecklist,
  isAllComplete,
  isChecklistDismissed,
  isTaskComplete,
  type OnboardingProgress,
} from '@/lib/onboarding';
import { rise, stagger, transition, durations } from '@/lib/motion';

/** Each endpoint returns an envelope, but older responses are a bare array. */
function countOf(body: unknown, key: string): number {
  if (Array.isArray(body)) return body.length;
  if (body && typeof body === 'object') {
    const inner = (body as Record<string, unknown>)[key];
    if (Array.isArray(inner)) return inner.length;
  }
  return 0;
}

function ChecklistSkeleton() {
  return (
    <div className="rounded-md border border-ink/[0.07] bg-surface shadow-card p-5">
      <Skeleton className="h-5 w-40 rounded" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded" />
        ))}
      </div>
    </div>
  );
}

/**
 * The four things that turn a new account into a working one, ticked off
 * against what actually exists on the server.
 *
 * Nothing here is remembered locally except a decision to hide it. Completion
 * is derived from real rows every time it renders — a checklist that ticks
 * "scan your first food" because someone once opened the scanner is worse
 * than no checklist at all, because it teaches people the product does not
 * know what it is talking about.
 *
 * Mount it on the Dashboard, signed in only. It renders nothing once all four
 * are done, so it needs no removal.
 */
export function GettingStarted() {
  const { isAuthenticated } = useAuthStore();
  const { profiles, activeProfile } = useProfileStore();
  const [dismissed, setDismissed] = useState(() => isChecklistDismissed());

  const profileId = activeProfile?._id;

  const progressQuery = useQuery<OnboardingProgress>({
    queryKey: ['onboardingProgress', profileId],
    queryFn: async () => {
      const [scans, pantryItems, conversations] = await Promise.all([
        scansExtended
          .getHistoryFiltered(profileId as string, { limit: 1 })
          .then((r) => countOf(r.data, 'scans')),
        pantry.getAll(profileId as string).then((r) => countOf(r.data, 'items')),
        chat.getSessions(profileId as string).then((r) => countOf(r.data, 'sessions')),
      ]);
      return { scans, pantryItems, conversations, hasProfile: true };
    },
    enabled: isAuthenticated && Boolean(profileId),
    // A first-run checklist is read once at the top of a session; refetching it
    // every time the tab regains focus is three requests for a card that will
    // be gone in a week.
    staleTime: 60_000,
  });

  if (!isAuthenticated || dismissed) return null;

  // No profile yet means ProfileGuard is about to send them to the wizard.
  // A checklist behind that redirect is noise.
  if (!profileId || profiles.length === 0) return null;

  const hide = () => {
    dismissChecklist();
    setDismissed(true);
  };

  return (
    <motion.section
      variants={rise}
      initial="hidden"
      animate="visible"
      transition={transition(durations.enter)}
      aria-labelledby="getting-started-heading"
    >
      <SectionBoundary
        query={progressQuery}
        skeleton={<ChecklistSkeleton />}
        // Once every task is done the card has said everything it has to say.
        // "Empty" here means "nothing left to ask of you".
        isEmpty={isAllComplete}
        empty={null}
      >
        {(progress) => {
          const done = completedCount(progress);

          return (
            <div className="rounded-md border border-ink/[0.07] bg-surface shadow-card overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-4">
                <div className="min-w-0">
                  <h2 id="getting-started-heading" className="text-heading text-ink">
                    Getting started
                  </h2>
                  <p className="mt-1 text-body text-ink-muted">
                    Four small things, and VitalAI knows enough to be useful.
                  </p>
                </div>
                <p className="font-mono text-figure tabular-nums text-ink-muted whitespace-nowrap">
                  {done} of {ONBOARDING_TASKS.length} done
                </p>
              </div>

              <motion.ul
                variants={stagger()}
                initial="hidden"
                animate="visible"
                className="border-t border-line"
              >
                {ONBOARDING_TASKS.map((task) => {
                  const complete = isTaskComplete(task.id, progress);
                  const Icon = task.icon;

                  return (
                    <motion.li
                      key={task.id}
                      variants={rise}
                      transition={transition(durations.enter)}
                      className="border-b border-line last:border-b-0"
                    >
                      {complete ? (
                        <div className="flex items-center gap-3 px-5 py-3.5 min-h-[56px]">
                          <span
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft"
                            aria-hidden="true"
                          >
                            <Check className="h-4 w-4 text-primary-ink" />
                          </span>
                          <p className="min-w-0 text-body text-ink-muted break-words">
                            {task.title}
                            <span className="sr-only"> — done</span>
                          </p>
                        </div>
                      ) : (
                        <Link
                          to={task.to}
                          className="flex items-center gap-3 px-5 py-3.5 min-h-[56px] hover:bg-sunk/40 transition-colors duration-micro ease-entrance focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                        >
                          <span
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-sunk"
                            aria-hidden="true"
                          >
                            <Icon className="h-4 w-4 text-ink-muted" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-body font-semibold text-ink break-words">
                              {task.title}
                            </span>
                            <span className="block text-caption text-ink-muted break-words">
                              {task.description}
                            </span>
                          </span>
                          <ArrowRight
                            className="h-4 w-4 flex-shrink-0 text-ink-faint"
                            aria-hidden="true"
                          />
                        </Link>
                      )}
                    </motion.li>
                  );
                })}
              </motion.ul>

              <div className="flex justify-end px-5 py-2">
                <button
                  type="button"
                  onClick={hide}
                  className="min-h-[44px] px-2 text-label text-ink-muted underline underline-offset-4 hover:text-ink rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  Hide this
                </button>
              </div>
            </div>
          );
        }}
      </SectionBoundary>
    </motion.section>
  );
}

export default GettingStarted;
