import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { Layout } from '@/components/layout/Layout';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import ProfileSetupPage from '@/pages/ProfileSetupPage';
import EditProfilePage from '@/pages/EditProfilePage';
import Dashboard from '@/pages/Dashboard';
import FoodScanner from '@/pages/FoodScanner';
import MedicineChecker from '@/pages/MedicineChecker';
import SupplementChecker from '@/pages/SupplementChecker';
import VitalBot from '@/pages/VitalBot';
import SmartPantry from '@/pages/SmartPantry';
import FamilyInsights from '@/pages/FamilyInsights';

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
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  return <AppRoutes />;
}
