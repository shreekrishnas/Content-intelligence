import { create } from 'zustand';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import type { User } from '@/types';
import type { Session, AuthChangeEvent } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;

  initialize: () => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

function mapSupabaseUser(supaUser: {
  id: string;
  email?: string;
  user_metadata: Record<string, any>;
  created_at: string;
}): User {
  const meta = supaUser.user_metadata ?? {};
  return {
    id: supaUser.id,
    org_id: meta.org_id ?? '',
    name: meta.name ?? meta.full_name ?? null,
    email: supaUser.email ?? '',
    is_org_admin: meta.is_org_admin ?? false,
    created_at: supaUser.created_at,
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: false,
  error: null,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;

    if (!supabaseConfigured) {
      set({ initialized: true });
      return;
    }

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      if (data.session) {
        set({
          session: data.session,
          user: mapSupabaseUser(data.session.user),
          initialized: true,
        });
      } else {
        set({ initialized: true });
      }
    } catch {
      set({ initialized: true });
    }

    supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (session) {
          set({ session, user: mapSupabaseUser(session.user) });
        } else {
          set({ session: null, user: null });
        }
      },
    );
  },

  signUp: async (email, password, name) => {
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) throw error;

      if (data.session) {
        set({
          session: data.session,
          user: mapSupabaseUser(data.session.user),
          loading: false,
        });
      } else {
        set({ loading: false, error: 'Check your email to confirm your account.' });
      }
    } catch (err: any) {
      set({ loading: false, error: err.message ?? 'Sign up failed' });
    }
  },

  signIn: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      set({
        session: data.session,
        user: mapSupabaseUser(data.session.user),
        loading: false,
      });
    } catch (err: any) {
      set({ loading: false, error: err.message ?? 'Sign in failed' });
    }
  },

  signOut: async () => {
    set({ loading: true, error: null });
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      set({ user: null, session: null, loading: false });
    } catch (err: any) {
      set({ loading: false, error: err.message ?? 'Sign out failed' });
    }
  },
}));
