import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, fieldAria } from '@/components/ui/field';
import { ErrorState } from '@/components/shared/ErrorState';
import { describeError, type DescribedError } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { auth } from '@/lib/api';

interface SignInModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message?: string;
}

/**
 * Google's mark, in Google's own colours — a third-party brand mark, so these
 * hex values are deliberately not tokenised.
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

export default function SignInModal({ open, onOpenChange, message }: SignInModalProps) {
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const { fetchProfiles } = useProfileStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [failure, setFailure] = useState<DescribedError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const clearFieldError = (field: string) =>
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const submit = async () => {
    setFailure(null);

    // What is missing from the form — never whether the address is known.
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
      await fetchProfiles();
      onOpenChange(false);
      navigate('/');
    } catch (err) {
      const described = describeError(err);
      const fields = described.fields ?? {};

      // Same rule as the sign-in page: a rejection is one answer for every
      // cause. The client never adds a branch that would tell a wrong password
      // apart from an address with no account.
      if (Object.keys(fields).length > 0 && described.status !== 401) {
        setFieldErrors(fields);
      } else {
        setFailure(described);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submit();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          {/* A small dark block, so the dialog opens with the product's face on
              it rather than as a bare form in a white box. */}
          <div
            className="mb-1 flex h-12 w-12 items-center justify-center rounded-md bg-canvas"
            aria-hidden="true"
          >
            <span className="font-display text-title leading-none text-primary-bright">V</span>
          </div>
          <DialogTitle className="font-display text-title">Sign in to pick up where you left off</DialogTitle>
          <DialogDescription>
            {message ?? 'Your profiles and your history are waiting behind this.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Field htmlFor="modal-email" label="Email" required error={fieldErrors.email}>
            <Input
              {...fieldAria('modal-email', { error: fieldErrors.email })}
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearFieldError('email');
              }}
              required
              aria-required="true"
              invalid={Boolean(fieldErrors.email)}
              disabled={loading}
            />
          </Field>

          <Field htmlFor="modal-password" label="Password" required error={fieldErrors.password}>
            <Input
              {...fieldAria('modal-password', { error: fieldErrors.password })}
              type="password"
              placeholder="Your password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearFieldError('password');
              }}
              required
              aria-required="true"
              invalid={Boolean(fieldErrors.password)}
              disabled={loading}
            />
          </Field>

          {failure && <ErrorState error={failure} onRetry={() => void submit()} retrying={loading} />}

          <Button type="submit" className="w-full" loading={loading} loadingLabel="Signing you in…">
            Sign in
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-line" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-surface px-3 text-caption text-ink-muted">or</span>
          </div>
        </div>

        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            window.location.href = auth.googleLogin();
          }}
        >
          <GoogleMark />
          Continue with Google
        </Button>

        <p className="text-center text-body text-ink-muted">
          New here?{' '}
          <Link
            to="/register"
            className="rounded font-semibold text-primary underline underline-offset-4 decoration-2 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            onClick={() => onOpenChange(false)}
          >
            Create an account
          </Link>
        </p>
      </DialogContent>
    </Dialog>
  );
}
