import { create } from 'zustand';
import { profiles as profilesApi } from '@/lib/api';

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
  hasSelectedProfile: false,
  fetchProfiles: async () => {
    set({ isLoading: true });
    try {
      const res = await profilesApi.getAll();
      const profiles = res.data.profiles || res.data;
      const savedId = localStorage.getItem('activeProfileId');
      const hasSaved = !!savedId && profiles.some((p: Profile) => p._id === savedId);
      const found = hasSaved ? profiles.find((p: Profile) => p._id === savedId) : null;

      set({
        profiles,
        isLoading: false,
        hasSelectedProfile: hasSaved,
        activeProfile: found || null,
      });

      if (found) {
        localStorage.setItem('activeProfileId', found._id);
      }
    } catch {
      set({ isLoading: false });
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
      set({ activeProfile: newProfile });
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
      return { profiles: filtered, activeProfile: newActive };
    });
  },
}));
