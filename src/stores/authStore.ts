import { create } from 'zustand';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import type { User } from '@/types';
import type { Session, AuthChangeEvent } from '@supabase/supabase-js';

const ALLOWED_DOMAIN = 'trilliantdigital.com';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;

  initialize: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
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

function isDomainAllowed(email?: string): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
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
        if (!isDomainAllowed(data.session.user.email)) {
          await supabase.auth.signOut();
          set({ initialized: true, error: `Only @${ALLOWED_DOMAIN} accounts are allowed.` });
          return;
        }
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
          if (!isDomainAllowed(session.user.email)) {
            supabase.auth.signOut();
            set({ session: null, user: null, error: `Only @${ALLOWED_DOMAIN} accounts are allowed.` });
            return;
          }
          set({ session, user: mapSupabaseUser(session.user), error: null });
        } else {
          set({ session: null, user: null });
        }
      },
    );
  },

  signInWithGoogle: async () => {
    set({ loading: true, error: null });
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          queryParams: { hd: ALLOWED_DOMAIN },
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      set({ loading: false, error: err.message ?? 'Google sign-in failed' });
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
