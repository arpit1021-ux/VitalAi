import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  ScanLine,
  ChefHat,
  Bot,
  Package,
  Users,
  LogOut,
  Lock,
  Settings,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { useClickOutside } from '@/hooks/useClickOutside';
import { Button } from '@/components/ui/button';
import SignInModal from '@/components/shared/SignInModal';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: ScanLine, label: 'Scan & Verdict', path: '/scanner' },
  { icon: ChefHat, label: 'Recipes & List', path: '/recipes' },
  { icon: Package, label: 'Inventory', path: '/pantry' },
  { icon: Users, label: 'Community', path: '/community' },
  { icon: Bot, label: 'VitalBot', path: '/chat' },
];

const dropdownVariants = {
  hidden: { opacity: 0, y: -8, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.96 },
};

export function Navbar() {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { profiles, activeProfile, setActiveProfile } = useProfileStore();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const closeProfileMenu = useCallback(() => setShowProfileMenu(false), []);

  useClickOutside(profileMenuRef, closeProfileMenu);

  useEffect(() => {
    if (!showProfileMenu) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowProfileMenu(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showProfileMenu]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className="h-16 border-b border-border bg-surface/80 backdrop-blur-xl flex items-center justify-between px-4 lg:px-6 sticky top-0 z-40">
      <Link
        to="/"
        className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-xl -ml-2 pl-2"
        aria-label="VitalAI Home"
      >
        <span className="text-xl font-bold text-primary">VitalAI</span>
      </Link>

      <div className="flex items-center gap-4">
        {isAuthenticated && activeProfile && (
          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => setShowProfileMenu((prev) => !prev)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              aria-haspopup="true"
              aria-expanded={showProfileMenu}
              aria-label="Open profile menu"
            >
              <span className="text-lg" aria-hidden="true">{activeProfile.avatar || '👤'}</span>
              <span className="text-sm font-medium hidden sm:block">{activeProfile.name}</span>
              <motion.span
                animate={{ rotate: showProfileMenu ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="text-text-muted"
                aria-hidden="true"
              >
                ▾
              </motion.span>
            </button>

            <AnimatePresence>
              {showProfileMenu && (
                <motion.div
                  variants={dropdownVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute right-0 top-full mt-2 w-full min-w-[240px] sm:w-72 bg-surface border border-border rounded-xl shadow-xl p-2 z-50"
                  role="menu"
                >
                  {profiles.map((profile) => {
                    const isActive = activeProfile._id === profile._id;
                    return (
                      <button
                        key={profile._id}
                        onClick={() => {
                          setActiveProfile(profile);
                          setShowProfileMenu(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                          isActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-text-primary hover:bg-surface'
                        }`}
                        role="menuitem"
                        aria-current={isActive ? 'true' : undefined}
                      >
                        <span className="text-lg flex-shrink-0" aria-hidden="true">{profile.avatar || '👤'}</span>
                        <div className="flex flex-col items-start min-w-0">
                          <span className="text-sm font-medium truncate">{profile.name}</span>
                          {profile.age && (
                            <span className="text-xs text-text-muted">Age {profile.age}</span>
                          )}
                        </div>
                        {isActive && (
                          <span className="ml-auto text-primary text-xs font-medium" aria-label="Active profile">Active</span>
                        )}
                      </button>
                    );
                  })}

                  <div className="border-t border-border my-1" role="separator" />

                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      navigate('/select-profile');
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-text-muted hover:bg-surface hover:text-text-primary text-sm transition-colors"
                    role="menuitem"
                  >
                    <Settings className="h-4 w-4" aria-hidden="true" />
                    Switch Profile
                  </button>

                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      navigate('/profile-setup');
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-text-muted hover:bg-surface hover:text-text-primary text-sm transition-colors"
                    role="menuitem"
                  >
                    <Settings className="h-4 w-4" aria-hidden="true" />
                    Manage Profiles
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {isAuthenticated ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleLogout}
              className="text-text-muted hover:text-danger"
              aria-label="Logout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => navigate('/login')} className="rounded-full px-5" aria-label="Sign in">
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
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [lockedFeature, setLockedFeature] = useState('');

  const handleNavClick = (item: typeof navItems[0], e: React.MouseEvent) => {
    if (!isAuthenticated && item.path !== '/') {
      e.preventDefault();
      setLockedFeature(item.label);
      setShowSignInModal(true);
      return;
    }
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-surface/80 backdrop-blur-xl border-r border-border w-64">
      <div className="p-6">
        <Link to="/" className="block" aria-label="VitalAI Home">
          <span className="text-2xl font-bold text-primary">VitalAI</span>
          <p className="text-xs text-text-muted mt-1">Your AI health companion</p>
        </Link>
      </div>
      <nav className="flex-1 px-3 space-y-1" role="navigation" aria-label="Main navigation">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const isLocked = !isAuthenticated && item.path !== '/';
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={(e) => handleNavClick(item, e)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-muted hover:bg-surface hover:text-text-primary'
              }`}
              aria-current={isActive ? 'page' : undefined}
              tabIndex={0}
            >
              <item.icon className="h-5 w-5" aria-hidden="true" />
              {item.label}
              {isLocked && <Lock className="h-3.5 w-3.5 ml-auto text-text-muted/50" aria-hidden="true" />}
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
    <nav className="fixed bottom-0 left-0 right-0 bg-surface/90 backdrop-blur-xl border-t border-border z-40 lg:hidden" role="navigation" aria-label="Mobile navigation">
      <div className="flex items-center justify-around py-2">
        {navItems.slice(0, 5).map((item) => {
          const isActive = location.pathname === item.path;
          const isLocked = !isAuthenticated && item.path !== '/';
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={(e) => handleNavClick(item, e)}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg min-w-[48px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                isActive ? 'text-primary' : 'text-text-muted'
              }`}
              aria-current={isActive ? 'page' : undefined}
              tabIndex={0}
            >
              <div className="relative">
                <item.icon className="h-5 w-5" aria-hidden="true" />
                {isLocked && <Lock className="h-3 w-3 absolute -top-1 -right-1.5 text-text-muted/50" aria-hidden="true" />}
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
