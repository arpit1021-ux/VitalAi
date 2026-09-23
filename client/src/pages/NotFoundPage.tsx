import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { rise, transition, durations } from '@/lib/motion';

/**
 * A wrong address, told plainly.
 *
 * Every unknown route used to redirect silently to the dashboard, which hides
 * the mistake: a mistyped or stale link looked like it worked and quietly took
 * you somewhere else. Saying so — and offering the two places someone actually
 * wants — is both more honest and easier to recover from.
 */
export default function NotFoundPage() {
  const location = useLocation();

  return (
    <motion.main
      variants={rise}
      initial="hidden"
      animate="visible"
      transition={transition(durations.enter)}
      className="min-h-screen bg-ground flex items-center justify-center px-5 py-16"
    >
      <div className="w-full max-w-reading text-center">
        <p className="font-mono text-label text-ink-faint">404</p>
        <h1 className="mt-3 font-display text-display text-ink text-balance sm:text-display-lg">
          That page isn&apos;t here
        </h1>
        <p className="mt-4 text-body-lg text-ink-muted">
          The address{' '}
          <span className="font-mono text-ink break-all">{location.pathname}</span> doesn&apos;t
          match anything in VitalAI. It may have been a typo, or a link that has moved.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link to="/">Go to today</Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link to="/scanner">Scan a food</Link>
          </Button>
        </div>
      </div>
    </motion.main>
  );
}
