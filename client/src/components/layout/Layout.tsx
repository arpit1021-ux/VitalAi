import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  ScanLine,
  ChefHat,
  Bot,
  Package,
  Users,
  LogOut,
  Lock,
  ChevronDown,
  UserCog,
  Users2,
  ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { useClickOutside } from '@/hooks/useClickOutside';
import { Button } from '@/components/ui/button';
import { transition, durations } from '@/lib/motion';
import SignInModal from '@/components/shared/SignInModal';

/**
 * `short` is what the phone bar shows. At 360px each of the five slots is
 * roughly 72px wide, so the full label ("Scan and verdict") would wrap to
 * three lines or truncate — both of which turn a navigation bar into a
 * guessing game. `locked` is the sentence a signed-out visitor is shown when
 * they reach for the item, in that item's own terms rather than a generic
 * "Sign in to access Inventory".
 */
const navItems = [
  { icon: Home, label: 'Today', short: 'Today', path: '/', locked: '' },
  {
    icon: ScanLine,
    label: 'Scan a food',
    short: 'Scan',
    path: '/scanner',
    locked: "Sign in and we'll keep every scan you make.",
  },
  {
    icon: ChefHat,
    label: 'Recipes and list',
    short: 'Recipes',
    path: '/recipes',
    locked: 'Sign in to save recipes and build your shopping list.',
  },
  {
    icon: Package,
    label: 'Pantry',
    short: 'Pantry',
    path: '/pantry',
    locked: 'Sign in to keep track of what you have in.',
  },
  {
    icon: Users,
    label: 'Community',
    short: 'People',
    path: '/community',
    locked: 'Sign in to join the conversation.',
  },
  {
    icon: Bot,
    label: 'VitalBot',
    short: 'Ask',
    path: '/chat',
    locked: 'Sign in to ask VitalBot about your food.',
  },
];

const menuVariants = {
  hidden: { opacity: 0, y: -4 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

/** First letter of the name, so an unset avatar is a person rather than a pictogram. */
function monogram(name?: string): string {
  const letter = name?.trim().charAt(0);
  return letter ? letter.toUpperCase() : 'V';
}

function Wordmark({ className = 'text-ink' }: { className?: string }) {
  return <span className={`font-display text-title ${className}`}>VitalAI</span>;
}

export function Navbar() {
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuthStore();
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

  const menuItemClass =
    'w-full flex items-center gap-3 px-3 min-h-[44px] rounded-md text-body text-ink-muted hover:bg-sunk hover:text-ink transition-colors duration-micro ease-entrance';

  return (
    <header className="sticky top-0 z-40 bg-ground/95 backdrop-blur-sm border-b border-line lg:ml-64">
      <nav className="h-16 flex items-center justify-between gap-3 px-4 sm:px-6">
        {/* On large screens the sidebar carries the wordmark; repeating it here
            would be two names for one product, eight pixels apart. */}
        <Link
          to="/"
          className="lg:hidden -ml-1 px-1 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label="VitalAI, home"
        >
          <Wordmark />
        </Link>
        <div className="hidden lg:block" />

        <div className="flex items-center gap-2">
          {isAuthenticated && activeProfile && (
            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => setShowProfileMenu((prev) => !prev)}
                className="flex items-center gap-2 pl-1 pr-2 min-h-[44px] rounded-full border-2 border-ink/10 bg-surface shadow-button text-ink hover:border-ink/25 transition-colors duration-micro ease-entrance focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                aria-haspopup="menu"
                aria-expanded={showProfileMenu}
                aria-label="Open profile menu"
              >
                <span
                  className="h-8 w-8 rounded-full bg-sunk text-ink-muted flex items-center justify-center text-label"
                  aria-hidden="true"
                >
                  {activeProfile.avatar || monogram(activeProfile.name)}
                </span>
                <span className="text-body hidden sm:block max-w-[12ch] truncate">{activeProfile.name}</span>
                <motion.span
                  animate={{ rotate: showProfileMenu ? 180 : 0 }}
                  transition={transition(durations.micro)}
                  className="text-ink-faint flex"
                  aria-hidden="true"
                >
                  <ChevronDown className="h-4 w-4" />
                </motion.span>
              </button>

              <AnimatePresence>
                {showProfileMenu && (
                  <motion.div
                    variants={menuVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={transition(durations.micro)}
                    className="absolute right-0 top-full mt-2 w-[min(18rem,calc(100vw-2rem))] bg-surface border border-line rounded-xl shadow-overlay p-1.5 z-50"
                    role="menu"
                  >
                    <p className="px-3 pt-1 pb-2 text-label text-ink-faint">Who's eating</p>

                    {profiles.map((profile) => {
                      const isActive = activeProfile._id === profile._id;
                      return (
                        <button
                          key={profile._id}
                          onClick={() => {
                            setActiveProfile(profile);
                            setShowProfileMenu(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 min-h-[44px] rounded-md transition-colors duration-micro ease-entrance ${
                            isActive ? 'bg-primary text-ink-inverse' : 'text-ink hover:bg-sunk'
                          }`}
                          role="menuitem"
                          aria-current={isActive ? 'true' : undefined}
                        >
                          <span
                            className={`h-7 w-7 flex-shrink-0 rounded-full flex items-center justify-center text-caption ${
                              isActive ? 'bg-canvas-ink/20 text-ink-inverse' : 'bg-sunk text-ink-muted'
                            }`}
                            aria-hidden="true"
                          >
                            {profile.avatar || monogram(profile.name)}
                          </span>
                          <span className="flex flex-col items-start min-w-0">
                            <span className="text-body truncate max-w-[12rem]">{profile.name}</span>
                            {profile.age ? (
                              <span className={`text-caption ${isActive ? 'text-primary-bright' : 'text-ink-faint'}`}>
                                <span className="tabular">{profile.age}</span> years old
                              </span>
                            ) : null}
                          </span>
                          {isActive && (
                            <span className="ml-auto text-caption text-ink-inverse" aria-label="Currently selected">
                              Now
                            </span>
                          )}
                        </button>
                      );
                    })}

                    <div className="border-t border-line my-1.5" role="separator" />

                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        navigate('/select-profile');
                      }}
                      className={menuItemClass}
                      role="menuitem"
                    >
                      <Users2 className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                      Switch to someone else
                    </button>

                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        navigate('/profile-setup');
                      }}
                      className={menuItemClass}
                      role="menuitem"
                    >
                      <UserCog className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                      Edit who's in the household
                    </button>

                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        navigate('/settings');
                      }}
                      className={menuItemClass}
                      role="menuitem"
                    >
                      <ShieldCheck className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                      Account and data
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {isAuthenticated ? (
            <Button size="icon" variant="ghost" onClick={handleLogout} aria-label="Sign out">
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => navigate('/login')}>
              Sign in
            </Button>
          )}
        </div>
      </nav>
    </header>
  );
}

export function Sidebar() {
  const location = useLocation();
  const { isAuthenticated } = useAuthStore();
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [lockedMessage, setLockedMessage] = useState('');

  const handleNavClick = (item: (typeof navItems)[number], e: React.MouseEvent) => {
    if (!isAuthenticated && item.path !== '/') {
      e.preventDefault();
      setLockedMessage(item.locked);
      setShowSignInModal(true);
    }
  };

  return (
    <>
      {/* Desktop: a full-height dark rail. This is the app's spine — the light
          page needs something to push against, and a solid column of canvas
          gives every screen an edge on the left rather than a hairline. */}
      <div className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-30 w-64 bg-canvas">
        <div className="px-6 py-6 border-b border-canvas-line">
          <Link
            to="/"
            className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-bright"
            aria-label="VitalAI, home"
          >
            <Wordmark className="text-canvas-ink" />
            <span className="block text-caption text-canvas-muted mt-1">Eat well, without the guesswork</span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Sections">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const isLocked = !isAuthenticated && item.path !== '/';
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={(e) => handleNavClick(item, e)}
                // The active item is a solid fill, not a tint: a pale wash on a
                // dark rail is indistinguishable from the rail itself.
                className={`flex items-center gap-3 px-3 min-h-[44px] rounded-md text-body transition-colors duration-micro ease-entrance focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-bright ${
                  isActive
                    ? 'bg-primary-bright text-canvas font-semibold'
                    : 'text-canvas-muted hover:bg-canvas-soft hover:text-canvas-ink'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
                {isLocked && (
                  <>
                    <Lock
                      className={`h-3.5 w-3.5 ml-auto flex-shrink-0 ${isActive ? 'text-canvas' : 'text-canvas-muted'}`}
                      aria-hidden="true"
                    />
                    <span className="sr-only">Sign in required</span>
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        <p className="px-6 py-5 border-t border-canvas-line text-caption text-canvas-muted">
          Warm food, plainly explained.
        </p>
      </div>

      {/* Phone: the same dark block, so the app reads as one thing rather than
          as a page with a pale strip under it. Five slots on an even grid so no
          label is squeezed by its neighbour, each one a 56px target with room
          for the home indicator underneath. */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-canvas lg:hidden pb-[env(safe-area-inset-bottom,0px)]"
        aria-label="Sections"
      >
        <ul className="grid grid-cols-5">
          {navItems.slice(0, 5).map((item) => {
            const isActive = location.pathname === item.path;
            const isLocked = !isAuthenticated && item.path !== '/';
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  onClick={(e) => handleNavClick(item, e)}
                  className={`flex flex-col items-center justify-center gap-1 min-h-[56px] px-1 py-2 transition-colors duration-micro ease-entrance focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary-bright ${
                    isActive ? 'text-canvas' : 'text-canvas-muted'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span
                    className={`relative flex items-center justify-center h-8 w-12 rounded-full transition-colors duration-micro ease-entrance ${
                      isActive ? 'bg-primary-bright' : ''
                    }`}
                  >
                    <item.icon className="h-5 w-5" aria-hidden="true" />
                    {isLocked && (
                      <>
                        <Lock className="h-3 w-3 absolute top-0.5 right-1 text-canvas-muted" aria-hidden="true" />
                        <span className="sr-only">Sign in required</span>
                      </>
                    )}
                  </span>
                  <span
                    className={`text-caption leading-none truncate max-w-full ${
                      isActive ? 'text-canvas-ink font-semibold' : ''
                    }`}
                  >
                    {item.short}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <SignInModal
        open={showSignInModal}
        onOpenChange={setShowSignInModal}
        message={lockedMessage || 'Sign in to pick up where you left off.'}
      />
    </>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ground">
      <Sidebar />
      <Navbar />
      <main className="lg:ml-64 pb-28 lg:pb-12">
        {/*
          The page container lives here, once, rather than in each screen.
          Every page used to set its own max-width with no mx-auto, so content
          hugged the left edge of a wide display and the measure jumped between
          3xl, 4xl and 5xl as you navigated — which reads as the layout moving
          under you. Prose that wants a narrower measure uses max-w-reading on
          the text itself, not on the page.
        */}
        <div className="mx-auto w-full max-w-[72rem] px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
          {children}
        </div>
      </main>
    </div>
  );
}
