import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, Download, LogOut } from 'lucide-react';
import { account } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field, fieldAria } from '@/components/ui/field';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { describeError, type DescribedError } from '@/lib/errors';

interface ConsentState {
  currentVersion: string;
  accepted: { version: string; healthDataAcceptedAt: string } | null;
  upToDate: boolean;
}

/**
 * Data rights, in one place: see what is held, accept the current terms, sign
 * out everywhere, and delete everything.
 */
export default function AccountSettings() {
  const user = useAuthStore((state) => state.user);
  const logoutEverywhere = useAuthStore((state) => state.logoutEverywhere);

  const [confirmEmail, setConfirmEmail] = useState('');
  const [confirmFieldError, setConfirmFieldError] = useState<string | undefined>(undefined);
  const [deleteError, setDeleteError] = useState<DescribedError | null>(null);
  const [exportError, setExportError] = useState<DescribedError | null>(null);
  const [exportedAt, setExportedAt] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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

  /**
   * Deleting an account is destructive, immediate and irreversible, so it is
   * one of the few places a modal is warranted: the confirmation has to be the
   * only thing on screen, and it has to carry the action button itself.
   */
  const openDeleteConfirmation = () => {
    if (!emailMatches) {
      // Said under the field rather than by greying out the button, which
      // would leave the reason unstated.
      setConfirmFieldError(
        confirmEmail.trim()
          ? 'That does not match the email on this account.'
          : 'Type your email address to confirm.',
      );
      return;
    }
    setConfirmFieldError(undefined);
    setDeleteError(null);
    setConfirmingDelete(true);
  };

  return (
    <main className="min-h-screen bg-ground px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link
          to="/"
          className="inline-flex min-h-[44px] items-center gap-2 rounded text-label text-ink-muted transition-colors duration-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Link>

        <h1 className="mt-4 text-balance font-display text-display text-ink">Your account and data</h1>
        <p className="mt-3 max-w-reading text-body-lg text-ink-muted">
          Everything we hold about you, and every way to get it back or get rid of it.
        </p>
        <p className="mt-2 break-words font-mono text-figure text-ink-muted">{user?.email}</p>

        {/* Consent ------------------------------------------------------- */}
        <Card className="mt-10">
          <CardContent className="p-5 pt-5">
            <h2 className="text-heading text-ink">Privacy terms</h2>

            {consent.isLoading ? (
              <div className="mt-4 space-y-2" aria-hidden="true">
                <div className="h-4 w-3/4 animate-pulse rounded-sm bg-sunk" />
                <div className="h-4 w-1/2 animate-pulse rounded-sm bg-sunk" />
              </div>
            ) : consent.isError ? (
              <div className="mt-4">
                <ErrorState
                  error={describeError(consent.error)}
                  onRetry={() => void consent.refetch()}
                  retrying={consent.isFetching}
                />
              </div>
            ) : consent.data?.upToDate ? (
              <p className="mt-3 flex items-start gap-2 text-body text-ink-muted">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  You accepted version {consent.data.accepted?.version} on{' '}
                  {consent.data.accepted
                    ? new Date(consent.data.accepted.healthDataAcceptedAt).toLocaleDateString()
                    : 'an earlier date'}
                  .{' '}
                  <Link
                    to="/privacy"
                    className="rounded text-primary underline underline-offset-4 decoration-2 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    Read the notice
                  </Link>
                </span>
              </p>
            ) : (
              <div className="mt-3">
                <p className="max-w-reading text-body text-ink-muted">
                  The privacy notice has been updated to version {consent.data?.currentVersion}.{' '}
                  <Link
                    to="/privacy"
                    className="rounded text-primary underline underline-offset-4 decoration-2 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    Read what changed
                  </Link>
                  , then accept to keep using the health features.
                </p>
                <Button
                  className="mt-4 w-full sm:w-auto"
                  loading={acceptConsent.isPending}
                  loadingLabel="Saving…"
                  disabled={!consent.data}
                  onClick={() => consent.data && acceptConsent.mutate(consent.data.currentVersion)}
                >
                  Accept the current terms
                </Button>
                {acceptConsent.isError && consent.data ? (
                  <div className="mt-3">
                    <ErrorState
                      error={describeError(acceptConsent.error)}
                      onRetry={() => acceptConsent.mutate(consent.data.currentVersion)}
                      retrying={acceptConsent.isPending}
                    />
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Export and sessions -------------------------------------------
            A ruled list rather than two more cards: these are things you do,
            not objects you hold, and a page of stacked cards has texture
            where it needs rhythm. */}
        <section className="mt-10 border-t border-line">
          <div className="border-b border-line py-6">
            <h2 className="text-heading text-ink">Download your data</h2>
            <p className="mt-2 max-w-reading text-body text-ink-muted">
              A JSON file with every profile, scan, conversation and log we hold. Health fields come
              out decrypted, so the file is readable — and worth keeping somewhere you trust.
            </p>

            <Button
              variant="secondary"
              className="mt-4 w-full sm:w-auto"
              loading={exportData.isPending}
              loadingLabel="Putting your file together…"
              onClick={() => exportData.mutate()}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Download my data
            </Button>

            {exportError ? (
              <div className="mt-3">
                <ErrorState
                  error={exportError}
                  onRetry={() => exportData.mutate()}
                  retrying={exportData.isPending}
                />
              </div>
            ) : null}
            {exportedAt && !exportError ? (
              <p className="mt-3 text-caption text-ink-muted" role="status">
                Downloaded {exportedAt}.
              </p>
            ) : null}
          </div>

          <div className="border-b border-line py-6">
            <h2 className="text-heading text-ink">Sessions</h2>
            <p className="mt-2 max-w-reading text-body text-ink-muted">
              Signs you out on every device, this one included. Use it if you think someone else has
              got into your account.
            </p>
            <Button
              variant="secondary"
              className="mt-4 w-full sm:w-auto"
              onClick={() => void logoutEverywhere()}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out everywhere
            </Button>
          </div>
        </section>

        {/* Deletion ------------------------------------------------------ */}
        <section className="mt-10 rounded-md border-2 border-danger/30 bg-danger-soft/40 p-5">
          <h2 className="flex items-start gap-2 text-heading text-ink">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
            Delete your account
          </h2>
          <p className="mt-2 max-w-reading text-body text-ink-muted">
            Removes every profile, scan, conversation, log and stored photo. It happens
            immediately, it can&apos;t be undone, and there&apos;s no backup we can restore from.
          </p>

          <Field
            htmlFor="confirm-email"
            label="Confirm your email address"
            hint={`Type ${user?.email ?? 'the email on this account'} to confirm.`}
            error={confirmFieldError}
            required
            className="mt-5"
          >
            <Input
              {...fieldAria('confirm-email', {
                hint: `Type ${user?.email ?? 'the email on this account'} to confirm.`,
                error: confirmFieldError,
              })}
              type="email"
              autoComplete="off"
              value={confirmEmail}
              onChange={(event) => {
                setConfirmEmail(event.target.value);
                setConfirmFieldError(undefined);
                setDeleteError(null);
              }}
              invalid={Boolean(confirmFieldError)}
            />
          </Field>

          <Button
            variant="danger"
            className="mt-4 w-full sm:w-auto"
            // Deliberately not disabled: pressing it with the wrong email
            // says so under the field, which a greyed-out button cannot.
            onClick={openDeleteConfirmation}
          >
            Delete my account permanently
          </Button>
        </section>
      </div>

      {/* The last stop before an irreversible deletion. */}
      <Dialog
        open={confirmingDelete}
        onOpenChange={(open) => {
          if (deleteAccount.isPending) return;
          if (!open) setConfirmingDelete(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-title">
              Delete your account and everything in it?
            </DialogTitle>
          </DialogHeader>

          <p className="text-body text-ink-muted">
            This permanently deletes the account for{' '}
            <span className="break-words font-mono text-figure text-ink">{user?.email}</span> and
            everything held under it: every health profile, every food, medicine and supplement
            scan, every conversation with VitalBot, every daily log and every stored photo.
          </p>
          <p className="text-body text-ink-muted">
            It happens immediately, it can&apos;t be undone, and there&apos;s no backup we can
            restore from. If you want a copy first, close this and download your data.
          </p>

          {deleteError ? (
            <ErrorState
              error={deleteError}
              onRetry={() => deleteAccount.mutate()}
              retrying={deleteAccount.isPending}
            />
          ) : null}

          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <Button
              variant="secondary"
              className="flex-1"
              disabled={deleteAccount.isPending}
              onClick={() => setConfirmingDelete(false)}
            >
              Keep my account
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={deleteAccount.isPending}
              loadingLabel="Deleting everything…"
              onClick={() => deleteAccount.mutate()}
            >
              Delete everything
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
