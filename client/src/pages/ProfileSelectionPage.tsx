import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Settings, LogOut } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const avatarColors: Record<string, string> = {
  '🍎': '#EF4444', '💪': '#10B981', '🧘': '#6366F1', '🏃‍♀️': '#F59E0B',
  '🧠': '#8B5CF6', '❤️': '#EC4899', '🥗': '#22C55E', '💊': '#3B82F6',
  '🩺': '#14B8A6', '🥦': '#84CC16', '🏋️': '#F97316', '🚴': '#06B6D4',
  '🧑‍⚕️': '#0EA5E9', '🫀': '#DC2626', '🦷': '#A855F7', '🌙': '#6366F1',
  '☀️': '#EAB308', '🫁': '#2DD4BF', '🦴': '#D1D5DB', '👁️': '#6366F1',
};

export default function ProfileSelectionPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { profiles, activeProfile, setActiveProfile } = useProfileStore();

  useEffect(() => {
    if (profiles.length === 1 && activeProfile) {
      navigate('/', { replace: true });
    }
  }, [profiles, activeProfile, navigate]);

  const handleSelectProfile = (profile: typeof profiles[0]) => {
    setActiveProfile(profile);
    navigate('/');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (profiles.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div className="h-16 w-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">👤</span>
          </div>
          <h1 className="text-3xl font-bold text-text-primary mb-2">No profiles yet</h1>
          <p className="text-text-muted mb-8">Create your first profile to get started with personalized health tracking.</p>
          <Button size="lg" onClick={() => navigate('/profile-setup')} className="h-12">
            <Plus className="h-5 w-5 mr-2" /> Create Your First Profile
          </Button>
          <button
            onClick={handleLogout}
            className="mt-4 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            Sign out
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-3xl"
        >
          <h1 className="text-3xl md:text-4xl font-bold text-text-primary text-center mb-2">
            Who's using VitalAI?
          </h1>
          <p className="text-text-muted text-center mb-10">
            Select a profile to continue
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-6 justify-items-center">
            {profiles.map((profile, i) => (
              <motion.div
                key={profile._id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                whileHover={{ scale: 1.05, y: -4 }}
                whileTap={{ scale: 0.95 }}
              >
                <button
                  onClick={() => handleSelectProfile(profile)}
                  className="flex flex-col items-center text-center group focus:outline-none focus:ring-2 focus:ring-primary/50 rounded-2xl p-2"
                  aria-label={`Select profile: ${profile.name}`}
                >
                  <div
                    className="w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center text-3xl md:text-4xl mb-3 transition-shadow group-hover:shadow-lg group-hover:shadow-primary/20"
                    style={{ backgroundColor: `${avatarColors[profile.avatar] || '#6366F1'}20` }}
                  >
                    {profile.avatar || '👤'}
                  </div>
                  <p className="text-sm md:text-base font-semibold text-text-primary group-hover:text-primary transition-colors">
                    {profile.name}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {profile.age ? `${profile.age} · ` : ''}{profile.dietType || 'No diet set'}
                  </p>
                </button>
              </motion.div>
            ))}

            {profiles.length < 6 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: profiles.length * 0.08 }}
                whileHover={{ scale: 1.05, y: -4 }}
                whileTap={{ scale: 0.95 }}
              >
                <button
                  onClick={() => navigate('/profile-setup')}
                  className="flex flex-col items-center text-center group focus:outline-none focus:ring-2 focus:ring-primary/50 rounded-2xl p-2"
                  aria-label="Add new profile"
                >
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-full border-2 border-dashed border-border flex items-center justify-center mb-3 group-hover:border-primary/50 transition-colors">
                    <Plus className="h-8 w-8 text-text-muted group-hover:text-primary transition-colors" />
                  </div>
                  <p className="text-sm md:text-base font-semibold text-text-muted group-hover:text-primary transition-colors">
                    Add Profile
                  </p>
                </button>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>

      <div className="p-4 flex justify-center gap-4 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/profile-setup')}
          className="text-text-muted"
        >
          <Settings className="h-4 w-4 mr-2" /> Manage Profiles
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="text-text-muted"
        >
          <LogOut className="h-4 w-4 mr-2" /> Sign Out
        </Button>
      </div>
    </div>
  );
}
