import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { Layout } from '@/components/layout/Layout';
import { ErrorState } from '@/components/shared/ErrorState';
/*
 * Everything but the first paint is split out of the main bundle.
 *
 * The whole app shipped as one 1.19 MB chunk, so somebody opening the sign-in
 * page on a phone downloaded the pantry, the scanner, Tesseract's wrapper and
 * every chart before they could type their password. Login, register and the
 * dashboard stay eager because they ARE the first paint for a signed-out and a
 * signed-in visit; lazy-loading those would only add a spinner to the one
 * screen that has to be instant.
 */
const WelcomePage = lazy(() => import('@/pages/WelcomePage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const ProfileSelectionPage = lazy(() => import('@/pages/ProfileSelectionPage'));
const ProfileSetupPage = lazy(() => import('@/pages/ProfileSetupPage'));
const EditProfilePage = lazy(() => import('@/pages/EditProfilePage'));
const FoodScanner = lazy(() => import('@/pages/FoodScanner'));
const MedicineChecker = lazy(() => import('@/pages/MedicineChecker'));
const SupplementChecker = lazy(() => import('@/pages/SupplementChecker'));
const VitalBot = lazy(() => import('@/pages/VitalBot'));
const SmartPantry = lazy(() => import('@/pages/SmartPantry'));
const RecipeDetail = lazy(() => import('@/pages/RecipeDetail'));
const FamilyInsights = lazy(() => import('@/pages/FamilyInsights'));
const ScanHistory = lazy(() => import('@/pages/ScanHistory'));
const HealthTimeline = lazy(() => import('@/pages/HealthTimeline'));
const RecipesPage = lazy(() => import('@/pages/RecipesPage'));
const CommunityPage = lazy(() => import('@/pages/CommunityPage'));
const AccountSettings = lazy(() => import('@/pages/AccountSettings'));
const PrivacyPolicy = lazy(() => import('@/pages/PrivacyPolicy'));

import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import Dashboard from '@/pages/Dashboard';

/**
 * Routes ProfileGuard lets through untouched.
 *
 * `/welcome` has to be here. The guard sends any signed-in account with no
 * profile straight to `/profile-setup`, so a welcome screen shown *before* the
 * wizard would be redirected away the instant it mounted — the new account
 * would never see it. WelcomePage does the opposite check itself: an account
 * that already has a profile is sent to `/`, so being exempt from the guard
 * cannot strand anyone here.
 */
const PUBLIC_ROUTES = ['/login', '/register', '/welcome', '/profile-setup', '/select-profile', '/privacy'];

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ground">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function ProfileGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const {
    profiles,
    hasSelectedProfile,
    isLoading: profilesLoading,
    hasLoaded: profilesLoaded,
    loadError: profilesError,
    fetchProfiles,
  } = useProfileStore();
  const location = useLocation();

  if (isLoading || profilesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ground">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  if (PUBLIC_ROUTES.includes(location.pathname)) {
    return <>{children}</>;
  }

  // A failed fetch leaves `profiles` empty, which is indistinguishable from an
  // account that has none. Routing on it sent a user whose request merely
  // failed into profile setup, to re-create a profile they already had.
  if (profilesError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ground p-4">
        <ErrorState
          error={profilesError}
          onRetry={() => void fetchProfiles()}
          retrying={profilesLoading}
          variant="page"
        />
      </div>
    );
  }

  // Before the first fetch returns, an empty list means "not asked yet".
  if (!profilesLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ground">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (profiles.length === 0 && location.pathname !== '/profile-setup') {
    return <Navigate to="/profile-setup" replace />;
  }

  if (profiles.length > 0 && !hasSelectedProfile && location.pathname !== '/select-profile') {
    return <Navigate to="/select-profile" replace />;
  }

  return <>{children}</>;
}

/** Shown while a split route's chunk arrives. Matches the guard's own spinner
 *  so a route change never flickers between two different loading treatments. */
function RouteFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" aria-hidden="true" />
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();
  const { checkAuth, isAuthenticated } = useAuthStore();
  const { fetchProfiles } = useProfileStore();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchProfiles();
    }
  }, [isAuthenticated]);

  return (
    <ProfileGuard>
      <Suspense fallback={<RouteFallback />}>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          {/* Readable signed out, so someone can decide before signing up. */}
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route
            path="/settings"
            element={<ProtectedRoute><AccountSettings /></ProtectedRoute>}
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/select-profile" element={<ProfileSelectionPage />} />
          <Route path="/profile-setup" element={<ProfileSetupPage />} />
          <Route path="/profile/edit" element={<ProtectedRoute><EditProfilePage /></ProtectedRoute>} />
          <Route
            path="/"
            element={
              <Layout><Dashboard /></Layout>
            }
          />
          <Route
            path="/scanner"
            element={
              <ProtectedRoute>
                <Layout><FoodScanner /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/medicine"
            element={
              <ProtectedRoute>
                <Layout><MedicineChecker /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/supplements"
            element={
              <ProtectedRoute>
                <Layout><SupplementChecker /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <Layout><VitalBot /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/recipes"
            element={
              <ProtectedRoute>
                <Layout><RecipesPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/recipe-detail"
            element={
              <ProtectedRoute>
                <Layout><RecipeDetail /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/pantry"
            element={
              <ProtectedRoute>
                <Layout><SmartPantry /></Layout>
              </ProtectedRoute>
            }
          />
        <Route
          path="/insights"
          element={
            <ProtectedRoute>
              <Layout><FamilyInsights /></Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/community"
          element={
            <ProtectedRoute>
              <Layout><CommunityPage /></Layout>
            </ProtectedRoute>
          }
        />
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <Layout><ScanHistory /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/timeline"
            element={
              <ProtectedRoute>
                <Layout><HealthTimeline /></Layout>
              </ProtectedRoute>
            }
          />
          {/* Not a redirect: silently sending a wrong address to the dashboard
              hides the mistake and makes a stale link look like it worked. */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AnimatePresence>
      </Suspense>
    </ProfileGuard>
  );
}

export default function App() {
  return <AppRoutes />;
}
