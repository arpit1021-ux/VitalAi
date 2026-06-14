import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  ScanLine,
  Pill,
  FlaskConical,
  Bot,
  Package,
  Users,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Lock,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { Button } from '@/components/ui/button';
import SignInModal from '@/components/shared/SignInModal';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: ScanLine, label: 'Food Scanner', path: '/scanner' },
  { icon: Pill, label: 'Medicine Checker', path: '/medicine' },
  { icon: FlaskConical, label: 'Supplements', path: '/supplements' },
  { icon: Bot, label: 'VitalBot', path: '/chat' },
  { icon: Package, label: 'Smart Pantry', path: '/pantry' },
  { icon: Users, label: 'Family Insights', path: '/insights' },
];

export function Navbar() {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { profiles, activeProfile, setActiveProfile } = useProfileStore();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className="h-16 border-b border-border bg-surface/80 backdrop-blur-xl flex items-center justify-between px-4 lg:px-6 sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <span className="text-xl font-bold text-primary">VitalAI</span>
      </div>

      <div className="flex items-center gap-4">
        {isAuthenticated && activeProfile && (
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-surface transition-colors"
            >
              <span className="text-lg">{activeProfile.avatar || '👤'}</span>
              <span className="text-sm font-medium hidden sm:block">{activeProfile.name}</span>
              <ChevronDown className="h-4 w-4 text-text-muted" />
            </button>

            <AnimatePresence>
              {showProfileMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute right-0 top-full mt-2 w-64 bg-surface border border-border rounded-xl shadow-lg p-2 z-50"
                >
                  {profiles.map((profile) => (
                    <button
                      key={profile._id}
                      onClick={() => {
                        setActiveProfile(profile);
                        setShowProfileMenu(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        activeProfile._id === profile._id
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-surface text-text-primary'
                      }`}
                    >
                      <span className="text-lg">{profile.avatar || '👤'}</span>
                      <span className="text-sm">{profile.name}</span>
                    </button>
                  ))}
                  <Link
                    to="/profile-setup"
                    onClick={() => setShowProfileMenu(false)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface text-text-muted text-sm"
                  >
                    + Add Profile
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {isAuthenticated ? (
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-surface transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-secondary/20 flex items-center justify-center text-sm font-medium text-secondary">
                {user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
            </button>

            <AnimatePresence>
              {showUserMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute right-0 top-full mt-2 w-48 bg-surface border border-border rounded-xl shadow-lg p-2 z-50"
                >
                  <div className="px-3 py-2 text-xs text-text-muted border-b border-border mb-1">
                    {user?.email}
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-danger/10 text-danger text-sm"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <Button size="sm" onClick={() => navigate('/login')}>
            Sign In
          </Button>
        )}
      </div>
    </nav>
  );
}

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [lockedFeature, setLockedFeature] = useState('');

  const handleNavClick = (item: typeof navItems[0], e: React.MouseEvent) => {
    if (!isAuthenticated && item.path !== '/') {
      e.preventDefault();
      setLockedFeature(item.label);
      setShowSignInModal(true);
      return;
    }
    setMobileOpen(false);
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-surface/80 backdrop-blur-xl border-r border-border w-64">
      <div className="p-6">
        <span className="text-2xl font-bold text-primary">VitalAI</span>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const isLocked = !isAuthenticated && item.path !== '/';
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={(e) => handleNavClick(item, e)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-muted hover:bg-surface hover:text-text-primary'
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
              {isLocked && <Lock className="h-3.5 w-3.5 ml-auto text-text-muted/50" />}
            </Link>
          );
        })}
      </nav>
      <SignInModal
        open={showSignInModal}
        onOpenChange={setShowSignInModal}
        message={`Sign in to access ${lockedFeature}`}
      />
    </div>
  );

  const BottomNav = () => (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface/90 backdrop-blur-xl border-t border-border z-40 lg:hidden">
      <div className="flex items-center justify-around py-2">
        {navItems.slice(0, 5).map((item) => {
          const isActive = location.pathname === item.path;
          const isLocked = !isAuthenticated && item.path !== '/';
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={(e) => handleNavClick(item, e)}
              className={`flex flex-col items-center gap-1 px-2 py-1 rounded-lg ${
                isActive ? 'text-primary' : 'text-text-muted'
              }`}
            >
              <div className="relative">
                <item.icon className="h-5 w-5" />
                {isLocked && <Lock className="h-3 w-3 absolute -top-1 -right-1.5 text-text-muted/50" />}
              </div>
              <span className="text-[10px]">{item.label.split(' ')[0]}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );

  return (
    <>
      <div className="hidden lg:block fixed left-0 top-0 bottom-0 z-30">
        <SidebarContent />
      </div>
      <BottomNav />
    </>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Navbar />
      <main className="lg:ml-64 p-4 lg:p-6 pb-20 lg:pb-6">
        {children}
      </main>
    </div>
  );
}
