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

let isInitializing = false;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,

  initialize: async () => {
    if (isInitializing) return;
    isInitializing = true;

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        // Refresh token is expired, revoked, or invalid on Supabase
        console.warn('Session error, clearing stale auth data:', error.message);
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        set({ user: null, profile: null, loading: false });
        return;
      }

      if (data?.session?.user) {
        set({ user: data.session.user });
        await get().fetchProfile();
      } else {
        set({ user: null, profile: null, loading: false });
      }
    } catch (error: any) {
      console.error('Auth init error:', error);
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      set({ user: null, profile: null, loading: false });
    } finally {
      isInitializing = false;
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
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Server signout failed, performing local signout:', e);
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    } finally {
      set({ user: null, profile: null, loading: false });
    }
  },

  fetchProfile: async () => {
    try {
      const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();
      if (userError || !authUser?.id) {
        if (
          userError?.message?.includes('refresh token') ||
          userError?.message?.includes('Refresh Token') ||
          userError?.name === 'AuthApiError'
        ) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        }
        set({ profile: null, user: null, loading: false });
        return;
      }
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();
      if (profileError) {
        console.warn('Fetch profile query error:', profileError.message);
      }
      set({ profile: data ?? null, loading: false });
    } catch (e) {
      console.error('Fetch profile error:', e);
      set({ profile: null, loading: false });
    }
  },
}));