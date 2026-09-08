import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, Download, LogOut, Loader2 } from 'lucide-react';
import { account } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface ConsentState {
  currentVersion: string;
  accepted: { version: string; healthDataAcceptedAt: string } | null;
  upToDate: boolean;
}

function describeError(error: unknown): string {
  const response = (error as { response?: { data?: { error?: string; action?: string } } }).response;
  const message = response?.data?.error ?? 'Something went wrong.';
  const action = response?.data?.action;
  return action ? `${message} ${action}` : message;
}

/**
 * Data rights, in one place: see what is held, accept the current terms, sign
 * out everywhere, and delete everything.
 */
export default function AccountSettings() {
  const user = useAuthStore((state) => state.user);
  const logoutEverywhere = useAuthStore((state) => state.logoutEverywhere);

  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportedAt, setExportedAt] = useState<string | null>(null);

  const consent = useQuery<ConsentState>({
    queryKey: ['consent'],
    queryFn: () => account.getConsent().then((response) => response.data),
    staleTime: 5 * 60 * 1000,
  });

  const acceptConsent = useMutation({
    mutationFn: (version: string) => account.acceptConsent(version),
    onSuccess: () => consent.refetch(),
  });

  const exportData = useMutation({
    mutationFn: () => account.downloadExport(),
    onMutate: () => {
      setExportError(null);
    },
    onSuccess: ({ filename, blob }) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoking immediately can cancel the download in some browsers.
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setExportedAt(new Date().toLocaleString());
    },
    onError: (error) => setExportError(describeError(error)),
  });

  const deleteAccount = useMutation({
    mutationFn: () => account.deleteAccount(confirmEmail.trim().toLowerCase()),
    onMutate: () => {
      setDeleteError(null);
    },
    onSuccess: () => {
      // The server has already cleared the session cookies.
      window.location.href = '/login?deleted=1';
    },
    onError: (error) => setDeleteError(describeError(error)),
  });

  const emailMatches =
    Boolean(user?.email) && confirmEmail.trim().toLowerCase() === user?.email.toLowerCase();

  return (
    <main className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Link>

        <h1 className="mt-8 text-3xl font-medium text-text-primary">Account and data</h1>
        <p className="mt-2 text-sm text-text-muted">{user?.email}</p>

        {/* Consent ------------------------------------------------------- */}
        <Card className="mt-10">
          <CardContent className="p-6">
            <h2 className="text-lg font-medium text-text-primary">Privacy terms</h2>

            {consent.isLoading ? (
              <div className="mt-4 space-y-2" aria-hidden="true">
                <div className="h-4 w-3/4 animate-pulse rounded bg-border" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-border" />
              </div>
            ) : consent.isError ? (
              <div className="mt-4">
                <p className="text-sm text-danger">
                  Couldn&apos;t load your consent status. {describeError(consent.error)}
                </p>
                <Button variant="outline" className="mt-3" onClick={() => consent.refetch()}>
                  Try again
                </Button>
              </div>
            ) : consent.data?.upToDate ? (
              <p className="mt-3 flex items-start gap-2 text-sm text-text-muted">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  You accepted version {consent.data.accepted?.version} on{' '}
                  {consent.data.accepted
                    ? new Date(consent.data.accepted.healthDataAcceptedAt).toLocaleDateString()
                    : 'an earlier date'}
                  . <Link to="/privacy" className="underline underline-offset-4">Read the notice</Link>
                </span>
              </p>
            ) : (
              <div className="mt-3">
                <p className="text-sm text-text-muted">
                  The privacy notice has been updated to version {consent.data?.currentVersion}.{' '}
                  <Link to="/privacy" className="underline underline-offset-4">
                    Read what changed
                  </Link>
                  , then accept to continue using health features.
                </p>
                <Button
                  className="mt-4"
                  disabled={acceptConsent.isPending || !consent.data}
                  onClick={() => consent.data && acceptConsent.mutate(consent.data.currentVersion)}
                >
                  {acceptConsent.isPending ? 'Saving…' : 'Accept current terms'}
                </Button>
                {acceptConsent.isError ? (
                  <p className="mt-2 text-sm text-danger">{describeError(acceptConsent.error)}</p>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Export -------------------------------------------------------- */}
        <Card className="mt-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-medium text-text-primary">Download your data</h2>
            <p className="mt-2 text-sm text-text-muted">
              A JSON file containing every profile, scan, conversation and log we hold. Health
              fields are decrypted, so the file is readable — and worth storing somewhere you trust.
            </p>

            <Button
              variant="outline"
              className="mt-4"
              disabled={exportData.isPending}
              onClick={() => exportData.mutate()}
            >
              {exportData.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Preparing your file…
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  Download my data
                </>
              )}
            </Button>

            {exportError ? <p className="mt-3 text-sm text-danger">{exportError}</p> : null}
            {exportedAt && !exportError ? (
              <p className="mt-3 text-sm text-text-muted">Downloaded {exportedAt}.</p>
            ) : null}
          </CardContent>
        </Card>

        {/* Sessions ------------------------------------------------------ */}
        <Card className="mt-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-medium text-text-primary">Sessions</h2>
            <p className="mt-2 text-sm text-text-muted">
              Signs you out on every device, including this one. Use this if you think someone else
              has access to your account.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => void logoutEverywhere()}>
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
              Sign out everywhere
            </Button>
          </CardContent>
        </Card>

        {/* Deletion ------------------------------------------------------ */}
        <Card className="mt-6 border-danger/40">
          <CardContent className="p-6">
            <h2 className="flex items-center gap-2 text-lg font-medium text-text-primary">
              <AlertTriangle className="h-5 w-5 text-danger" aria-hidden="true" />
              Delete your account
            </h2>
            <p className="mt-2 text-sm text-text-muted">
              Removes every profile, scan, conversation, log and stored photo. This happens
              immediately, cannot be undone, and there is no backup we can restore from.
            </p>

            <label htmlFor="confirm-email" className="mt-5 block text-sm text-text-primary">
              Type <span className="font-medium">{user?.email}</span> to confirm
            </label>
            <Input
              id="confirm-email"
              type="email"
              autoComplete="off"
              value={confirmEmail}
              onChange={(event) => {
                setConfirmEmail(event.target.value);
                setDeleteError(null);
              }}
              aria-describedby={deleteError ? 'delete-error' : undefined}
              aria-invalid={Boolean(deleteError)}
              className="mt-2"
            />

            {deleteError ? (
              <p id="delete-error" role="alert" className="mt-2 text-sm text-danger">
                {deleteError}
              </p>
            ) : null}

            <Button
              variant="destructive"
              className="mt-4"
              disabled={!emailMatches || deleteAccount.isPending}
              onClick={() => deleteAccount.mutate()}
            >
              {deleteAccount.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Deleting everything…
                </>
              ) : (
                'Delete my account permanently'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
