import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { prefersReducedMotion } from '@/lib/motion';

/**
 * The first thing anyone sees, and the only screen in the product that is
 * allowed to be purely atmosphere.
 *
 * It covers work that is genuinely happening — the session check and the
 * profile fetch — rather than padding a delay to look considered. `ready`
 * comes from the app; this only holds the frame for a minimum beat so the
 * wordmark does not flash past on a fast connection, and gives up after a
 * ceiling so a slow network cannot trap someone behind it.
 */
const MINIMUM_MS = 900;
const CEILING_MS = 4000;

export function AppSplash({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  const [held, setHeld] = useState(() => {
    try {
      return !sessionStorage.getItem('vitalai:greeted');
    } catch {
      return true;
    }
  });
  const [mountedAt] = useState(() => Date.now());

  useEffect(() => {
    if (!held) return;

    const release = () => {
      setHeld(false);
      try {
        // Once per session: a splash on every navigation is an obstacle.
        sessionStorage.setItem('vitalai:greeted', '1');
      } catch {
        // Private browsing refuses storage; showing it again is harmless.
      }
    };

    // Whichever comes first: the work finishing (after a minimum beat, so the
    // wordmark does not flash past), or the ceiling, so a stalled network
    // cannot trap someone behind a screen with no way forward.
    const ceiling = window.setTimeout(release, CEILING_MS);
    const remaining = Math.max(0, MINIMUM_MS - (Date.now() - mountedAt));
    const minimum = ready ? window.setTimeout(release, remaining) : undefined;

    return () => {
      window.clearTimeout(ceiling);
      if (minimum !== undefined) window.clearTimeout(minimum);
    };
  }, [held, ready, mountedAt]);

  const reduced = prefersReducedMotion();

  return (
    <>
      <AnimatePresence>
        {held && (
          <motion.div
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.4, ease: [0.2, 0, 0, 1] }}
            className="fixed inset-0 z-[100] bg-canvas flex flex-col items-center justify-center px-6 overflow-hidden"
            role="status"
            aria-label="Loading VitalAI"
          >
            {/* A slow warm bloom behind the wordmark. It is the only ornament
                in the product, and it exists so the first second reads as
                somebody's kitchen rather than a loading screen. */}
            <motion.div
              aria-hidden="true"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: reduced ? 0 : 1.6, ease: [0.2, 0, 0, 1] }}
              className="pointer-events-none absolute h-[42rem] w-[42rem] rounded-full blur-3xl"
              style={{
                background:
                  'radial-gradient(circle, rgba(176,76,24,0.30) 0%, rgba(24,107,68,0.22) 45%, rgba(22,33,27,0) 70%)',
              }}
            />

            <div className="relative flex flex-col items-center">
              <motion.p
                initial={{ opacity: 0, y: reduced ? 0 : 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduced ? 0 : 0.6, ease: [0.2, 0, 0, 1] }}
                className="font-display text-display-lg sm:text-display-xl text-canvas-ink"
              >
                VitalAI
              </motion.p>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduced ? 0 : 0.6, delay: reduced ? 0 : 0.3 }}
                className="mt-4 text-body-lg text-canvas-muted text-center max-w-sm text-balance"
              >
                Sit down. Let's see what you're eating today.
              </motion.p>

              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: reduced ? 0 : 1.6, ease: 'linear' }}
                className="mt-12 h-0.5 w-48 origin-left rounded-full bg-primary-bright"
                aria-hidden="true"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </>
  );
}
