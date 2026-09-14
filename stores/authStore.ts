// stores/authStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase';

interface AuthState {
  user: any | null;
  profile: any | null;
  loading: boolean;
  initialize: () => Promise<void>;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  fetchProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        set({ user: session.user });
        await get().fetchProfile();
      } else {
        set({ loading: false });
      }
    } catch (error: any) {
      const isInvalidRefreshToken =
        error?.message?.includes('refresh token') ||
        error?.name === 'AuthApiError';
      if (isInvalidRefreshToken) {
        await supabase.auth.signOut();
      }
      console.error('Auth init error:', error);
      set({ user: null, profile: null, loading: false });
    }
  },

  signIn: async (email, password) => {
    set({ loading: true });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ loading: false });
      throw error;
    }
    set({ user: data.user });
    await get().fetchProfile();
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, profile: null });
  },

  fetchProfile: async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser?.id) {
        set({ profile: null, loading: false });
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();
      set({ profile: data ?? null, loading: false });
    } catch (e) {
      console.error('Fetch profile error:', e);
      set({ profile: null, loading: false });
    }
  },
}));