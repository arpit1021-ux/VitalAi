import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { auth } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ErrorState } from '@/components/shared/ErrorState';
import { describeError, type DescribedError } from '@/lib/errors';

/** A message shown under the input it concerns, never in a banner at the top. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-caption text-danger">
      {message}
    </p>
  );
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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

    // Every one of these is about the contents of this form. None of them
    // consults the server, so none of them can hint at who already has an
    // account.
    const missing: Record<string, string> = {};
    if (!email.trim()) missing.email = 'Enter your email address.';
    if (password.length < 6) missing.password = 'Use at least 6 characters.';
    if (password !== confirmPassword) missing.confirmPassword = 'This does not match the password above.';
    if (Object.keys(missing).length > 0) {
      setFieldErrors(missing);
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      const res = await auth.register(email, password);
      setUser(res.data.user);
      // Straight to the welcome screen rather than the profile wizard: a
      // three-step health form is the second thing a new account sees, not the
      // first. WelcomePage sends anyone who already has a profile on to `/`.
      navigate('/welcome');
    } catch (err) {
      const described = describeError(err);
      const fields = described.fields ?? {};

      // The server decides what a rejected sign-up says. The client renders
      // that copy unchanged and never adds a branch that would distinguish
      // "this address is already registered" from any other rejection — that
      // distinction is what lets an attacker enumerate accounts.
      if (Object.keys(fields).length > 0) {
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
    <div className="min-h-screen flex items-center justify-center p-4 bg-ground">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-primary-soft flex items-center justify-center mb-4">
              <Heart className="h-6 w-6 text-primary-ink" aria-hidden="true" />
            </div>
            <CardTitle className="font-display text-title">Make an account</CardTitle>
            <CardDescription>It takes a minute, and then we can get to know you.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <a
                href={auth.googleLogin()}
                className="flex items-center justify-center gap-2 w-full h-12 rounded border-2 border-ink/15 shadow-button text-body font-semibold text-ink hover:border-ink/30 hover:bg-sunk/50 transition-colors duration-micro ease-entrance focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                aria-label="Continue with Google"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </a>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-line" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-surface px-2 text-caption text-ink-muted">or</span>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="reg-email" className="block text-label text-ink">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" aria-hidden="true" />
                  <Input
                    id="reg-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      clearFieldError('email');
                    }}
                    className="pl-10"
                    required
                    autoComplete="email"
                    aria-required="true"
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? 'reg-email-error' : undefined}
                    disabled={loading}
                  />
                </div>
                <FieldError id="reg-email-error" message={fieldErrors.email} />
              </div>
              <div className="space-y-2">
                <label htmlFor="reg-password" className="block text-label text-ink">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" aria-hidden="true" />
                  <Input
                    id="reg-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      clearFieldError('password');
                    }}
                    className="pl-10 pr-10"
                    required
                    autoComplete="new-password"
                    aria-required="true"
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={fieldErrors.password ? 'reg-password-error' : undefined}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <FieldError id="reg-password-error" message={fieldErrors.password} />
              </div>
              <div className="space-y-2">
                <label htmlFor="reg-confirm" className="block text-label text-ink">Confirm password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" aria-hidden="true" />
                  <Input
                    id="reg-confirm"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      clearFieldError('confirmPassword');
                    }}
                    className="pl-10 pr-10"
                    required
                    autoComplete="new-password"
                    aria-required="true"
                    aria-invalid={Boolean(fieldErrors.confirmPassword)}
                    aria-describedby={fieldErrors.confirmPassword ? 'reg-confirm-error' : undefined}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition-colors"
                    aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <FieldError id="reg-confirm-error" message={fieldErrors.confirmPassword} />
              </div>

              {/* Form-level failures sit next to the button that caused them,
                  and the retry resubmits what is already typed. */}
              {failure && (
                <ErrorState error={failure} onRetry={() => void submit()} retrying={loading} />
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                    Creating your account…
                  </>
                ) : (
                  'Make my account'
                )}
              </Button>
              <p className="text-center text-body text-ink-muted">
                Already have an account?{' '}
                <Link to="/login" className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded">
                  Sign in
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
