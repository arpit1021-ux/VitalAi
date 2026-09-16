import { create } from 'zustand';
import { profiles as profilesApi } from '@/lib/api';
import { describeError, isCancellation, type DescribedError } from '@/lib/errors';

interface Profile {
  _id: string;
  name: string;
  age: number;
  gender: string;
  avatar: string;
  dietType: string;
  allergies: string[];
  conditions: string[];
  medications: { name: string; dosage: string }[];
  fitnessGoal: string;
  activityLevel: string;
  userId: string;
}

interface ProfileState {
  profiles: Profile[];
  activeProfile: Profile | null;
  isLoading: boolean;
  /**
   * Set once a fetch has come back, successfully or not. Routing must not act
   * on an empty profile list before this is true: an empty array means
   * "not asked yet" until then.
   */
  hasLoaded: boolean;
  /**
   * Why the last fetch failed, or null. Distinguishes "this account has no
   * profiles" from "we could not find out" — swallowing this sent a user
   * whose request failed into profile setup to re-create a profile they
   * already had.
   */
  loadError: DescribedError | null;
  hasSelectedProfile: boolean;
  fetchProfiles: () => Promise<void>;
  setActiveProfile: (profile: Profile) => void;
  addProfile: (data: any) => Promise<void>;
  updateProfile: (id: string, data: any) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  activeProfile: null,
  isLoading: false,
  hasLoaded: false,
  loadError: null,
  hasSelectedProfile: false,
  fetchProfiles: async () => {
    set({ isLoading: true, loadError: null });
    try {
      const res = await profilesApi.getAll();
      const profiles = res.data.profiles || res.data;
      const savedId = localStorage.getItem('activeProfileId');
      const hasSaved = !!savedId && profiles.some((p: Profile) => p._id === savedId);
      const found = hasSaved ? profiles.find((p: Profile) => p._id === savedId) : null;

      set({
        profiles,
        isLoading: false,
        hasLoaded: true,
        loadError: null,
        hasSelectedProfile: hasSaved,
        activeProfile: found || null,
      });

      if (found) {
        localStorage.setItem('activeProfileId', found._id);
      }
    } catch (error) {
      if (isCancellation(error)) {
        set({ isLoading: false });
        return;
      }
      set({ isLoading: false, hasLoaded: true, loadError: describeError(error) });
    }
  },
  setActiveProfile: (profile) => {
    set({ activeProfile: profile, hasSelectedProfile: true });
    localStorage.setItem('activeProfileId', profile._id);
  },
  addProfile: async (data) => {
    const res = await profilesApi.create(data);
    const newProfile = res.data.profile || res.data;
    set((state) => ({ profiles: [...state.profiles, newProfile] }));
    if (!get().activeProfile) {
      // `hasSelectedProfile` has to move with `activeProfile`. Without it the
      // guard saw "profiles exist but none chosen", redirected to
      // /select-profile, which saw a single profile already active and
      // redirected back to / — a loop that rendered as a blank white page
      // until a reload read the choice back out of localStorage.
      set({ activeProfile: newProfile, hasSelectedProfile: true });
      localStorage.setItem('activeProfileId', newProfile._id);
    }
  },
  updateProfile: async (id, data) => {
    const res = await profilesApi.update(id, data);
    const updated = res.data.profile || res.data;
    set((state) => ({
      profiles: state.profiles.map((p) => (p._id === id ? updated : p)),
      activeProfile: state.activeProfile?._id === id ? updated : state.activeProfile,
    }));
  },
  removeProfile: async (id) => {
    await profilesApi.delete(id);
    set((state) => {
      const filtered = state.profiles.filter((p) => p._id !== id);
      const newActive = state.activeProfile?._id === id ? filtered[0] || null : state.activeProfile;
      if (newActive) localStorage.setItem('activeProfileId', newActive._id);
      else localStorage.removeItem('activeProfileId');
      return { profiles: filtered, activeProfile: newActive, hasSelectedProfile: newActive !== null };
    });
  },
}));
