import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { auth } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, fieldAria } from '@/components/ui/field';
import { ErrorState } from '@/components/shared/ErrorState';
import { describeError, type DescribedError } from '@/lib/errors';
import { rise, stagger, transition, durations } from '@/lib/motion';

/**
 * Google's mark, in Google's own colours.
 *
 * These four hex values are the one place in the app where a raw colour is
 * correct: it is a third-party brand mark, not part of the VitalAI palette,
 * and recolouring it to our greens would misrepresent someone else's logo.
 */
function GoogleMark() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  // Set when a session ended on its own. Without this the person is dropped
  // here mid-task with no idea why they were signed out.
  const endedReason = useAuthStore((state) => state.endedReason);
  const clearEndedReason = useAuthStore((state) => state.clearEndedReason);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<DescribedError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearFieldError = (field: string) =>
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const submit = async () => {
    setFailure(null);
    clearEndedReason();

    // Client-side checks are about what is missing from this form, never about
    // whether an account exists — see the note on the rejection path below.
    const missing: Record<string, string> = {};
    if (!email.trim()) missing.email = 'Enter your email address.';
    if (!password) missing.password = 'Enter your password.';
    if (Object.keys(missing).length > 0) {
      setFieldErrors(missing);
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      const res = await auth.login(email, password);
      setUser(res.data.user);
      navigate('/');
    } catch (err) {
      const described = describeError(err);
      const fields = described.fields ?? {};

      // A rejected sign-in is deliberately one answer for every cause: wrong
      // password, unknown email, anything else. The client adds no branch of
      // its own here and must never gain one — telling the two apart is how an
      // attacker confirms which addresses have accounts. The server's copy is
      // rendered as-is; the client never substitutes a more specific sentence.
      if (Object.keys(fields).length > 0 && described.status !== 401) {
        setFieldErrors(fields);
      } else {
        setFailure(described);
      }
    } finally {
      // Always cleared, so a failure never leaves the button spinning.
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submit();
  };

  return (
    <div className="min-h-screen bg-ground lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* The dark half is what makes this a front door rather than a form on a
          blank page — the same canvas that opens the app. */}
      <aside className="relative overflow-hidden bg-canvas px-4 py-12 text-canvas-ink sm:px-10 sm:py-16 lg:flex lg:flex-col lg:justify-center lg:py-20">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-28 -top-32 h-[26rem] w-[26rem] rounded-full bg-accent/20 blur-3xl"
        />
        <motion.div
          variants={stagger(0.06)}
          initial="hidden"
          animate="visible"
          className="relative mx-auto w-full max-w-md lg:mx-0 lg:ml-auto lg:mr-10"
        >
          <motion.p variants={rise} transition={transition(durations.enter)} className="text-label text-canvas-muted">
            VitalAI
          </motion.p>
          <motion.h1
            variants={rise}
            transition={transition(durations.enter)}
            className="mt-3 text-balance font-display text-display text-canvas-ink sm:text-display-lg"
          >
            Good to see you again
          </motion.h1>
          <motion.p
            variants={rise}
            transition={transition(durations.enter)}
            className="mt-4 max-w-reading text-body-lg text-canvas-muted"
          >
            Sign in and everything&apos;s where you left it — your profiles, your scans, and every
            answer that already knows what you can and can&apos;t eat.
          </motion.p>
          <motion.p
            variants={rise}
            transition={transition(durations.enter)}
            className="mt-8 max-w-reading text-caption text-canvas-muted"
          >
            VitalAI gives guidance, not a diagnosis. Talk to your doctor about anything that
            matters.
          </motion.p>
        </motion.div>
      </aside>

      <main className="flex items-center px-4 py-12 sm:px-6 lg:py-20">
        <motion.div
          variants={rise}
          initial="hidden"
          animate="visible"
          transition={transition(durations.enter)}
          className="mx-auto w-full max-w-md"
        >
          <h2 className="font-display text-title text-ink">Sign in</h2>
          <p className="mt-1.5 text-body text-ink-muted">
            Use the email and password you set up with.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            {endedReason && !failure && (
              <div role="status" className="rounded-md border border-line-strong/40 bg-sunk/70 p-4">
                <p className="text-label text-ink">{endedReason.message}</p>
                {endedReason.action && (
                  <p className="mt-1 text-caption text-ink-muted">{endedReason.action}</p>
                )}
              </div>
            )}

            <Field htmlFor="login-email" label="Email" required error={fieldErrors.email}>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
                  aria-hidden="true"
                />
                <Input
                  {...fieldAria('login-email', { error: fieldErrors.email })}
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearFieldError('email');
                  }}
                  className="pl-11"
                  required
                  autoComplete="email"
                  aria-required="true"
                  invalid={Boolean(fieldErrors.email)}
                  disabled={loading}
                />
              </div>
            </Field>

            <Field htmlFor="login-password" label="Password" required error={fieldErrors.password}>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
                  aria-hidden="true"
                />
                <Input
                  {...fieldAria('login-password', { error: fieldErrors.password })}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearFieldError('password');
                  }}
                  className="pl-11 pr-14"
                  required
                  autoComplete="current-password"
                  aria-required="true"
                  invalid={Boolean(fieldErrors.password)}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded text-ink-muted transition-colors duration-micro hover:bg-sunk hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </Field>

            {/* Form-level failures sit next to the button that caused them,
                and the retry resubmits what is already typed. */}
            {failure && (
              <ErrorState error={failure} onRetry={() => void submit()} retrying={loading} />
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={loading}
              loadingLabel="Signing you in…"
            >
              Sign in
            </Button>

            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-line" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-ground px-3 text-caption text-ink-muted">or</span>
              </div>
            </div>

            <Button asChild variant="secondary" size="lg" className="w-full">
              <a href={auth.googleLogin()}>
                <GoogleMark />
                Continue with Google
              </a>
            </Button>

            <p className="text-center text-body text-ink-muted">
              New here?{' '}
              <Link
                to="/register"
                className="rounded font-semibold text-primary underline underline-offset-4 decoration-2 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Create an account
              </Link>
            </p>
          </form>
        </motion.div>
      </main>
    </div>
  );
}
