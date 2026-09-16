import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { AppSplash } from '@/components/shared/AppSplash';

/**
 * Holds the opening screen until the app actually knows who it is talking to.
 *
 * "Ready" is the session check having resolved, and — for someone signed in —
 * their profiles having come back. Tying the splash to real work is what keeps
 * it from being a decorative delay: on a fast connection it is a beat, on a
 * slow one it covers a wait that would otherwise be an empty screen.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const authResolved = !useAuthStore((s) => s.isLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const profilesLoaded = useProfileStore((s) => s.hasLoaded);
  const profilesError = useProfileStore((s) => s.loadError);

  const ready = authResolved && (!isAuthenticated || profilesLoaded || profilesError !== null);

  return <AppSplash ready={ready}>{children}</AppSplash>;
}
