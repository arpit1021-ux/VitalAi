import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { Layout } from '@/components/layout/Layout';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import ProfileSelectionPage from '@/pages/ProfileSelectionPage';
import ProfileSetupPage from '@/pages/ProfileSetupPage';
import EditProfilePage from '@/pages/EditProfilePage';
import Dashboard from '@/pages/Dashboard';
import FoodScanner from '@/pages/FoodScanner';
import MedicineChecker from '@/pages/MedicineChecker';
import SupplementChecker from '@/pages/SupplementChecker';
import VitalBot from '@/pages/VitalBot';
import SmartPantry from '@/pages/SmartPantry';
import FamilyInsights from '@/pages/FamilyInsights';
import ScanHistory from '@/pages/ScanHistory';
import HealthTimeline from '@/pages/HealthTimeline';
import RecipesPage from '@/pages/RecipesPage';
import CommunityPage from '@/pages/CommunityPage';

const PUBLIC_ROUTES = ['/login', '/register', '/profile-setup', '/select-profile'];

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
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
  const { profiles, hasSelectedProfile, isLoading: profilesLoading } = useProfileStore();
  const location = useLocation();

  if (isLoading || profilesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
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

  if (profiles.length === 0 && location.pathname !== '/profile-setup') {
    return <Navigate to="/profile-setup" replace />;
  }

  if (profiles.length > 0 && !hasSelectedProfile && location.pathname !== '/select-profile') {
    return <Navigate to="/select-profile" replace />;
  }

  return <>{children}</>;
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
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </ProfileGuard>
  );
}

export default function App() {
  return <AppRoutes />;
}
