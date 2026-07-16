import { create } from 'zustand';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import type { User } from '@/types';
import type { Session, AuthChangeEvent } from '@supabase/supabase-js';

const ALLOWED_DOMAIN = 'trilliantdigital.com';
const AWAY_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours away from app = re-login
const LAST_SEEN_KEY = 'auth_last_seen';
const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000; // update last_seen every 2 min while open

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function touchLastSeen() {
  localStorage.setItem(LAST_SEEN_KEY, Date.now().toString());
}

function clearLastSeen() {
  localStorage.removeItem(LAST_SEEN_KEY);
}

function isAwayTooLong(): boolean {
  const raw = localStorage.getItem(LAST_SEEN_KEY);
  if (!raw) return false; // no record = first login ever, allow through
  return Date.now() - parseInt(raw, 10) > AWAY_TIMEOUT_MS;
}

function startHeartbeat() {
  if (heartbeatTimer) return;
  touchLastSeen();
  heartbeatTimer = setInterval(touchLastSeen, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

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
          clearLastSeen();
          set({ initialized: true, error: `Only @${ALLOWED_DOMAIN} accounts are allowed.` });
          return;
        }

        // Force re-login if closed for more than 8 hours
        if (isAwayTooLong()) {
          await supabase.auth.signOut();
          clearLastSeen();
          set({ initialized: true });
          return;
        }

        startHeartbeat();
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
      (event: AuthChangeEvent, session: Session | null) => {
        if (session) {
          if (!isDomainAllowed(session.user.email)) {
            supabase.auth.signOut();
            clearLastSeen();
            stopHeartbeat();
            set({ session: null, user: null, error: `Only @${ALLOWED_DOMAIN} accounts are allowed.` });
            return;
          }
          if (event === 'SIGNED_IN') {
            touchLastSeen();
            startHeartbeat();
          }
          set({ session, user: mapSupabaseUser(session.user), error: null });
        } else {
          stopHeartbeat();
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
      stopHeartbeat();
      clearLastSeen();
      set({ user: null, session: null, loading: false });
    } catch (err: any) {
      set({ loading: false, error: err.message ?? 'Sign out failed' });
    }
  },
}));
