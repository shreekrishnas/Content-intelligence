import { create } from "zustand";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  /** Enter demo mode with a fake user (no Supabase required). */
  loginDemo: () => void;
  /** Clear the current session. */
  logout: () => void;
  /** Set user directly (used when Supabase auth is wired up). */
  setUser: (user: User | null) => void;
}

const DEMO_USER: User = {
  id: "demo_user_001",
  org_id: "demo_org_001",
  name: "Demo User",
  email: "demo@contentintel.app",
  is_org_admin: true,
  created_at: new Date().toISOString(),
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,

  loginDemo: () => set({ user: DEMO_USER }),

  logout: () => set({ user: null }),

  setUser: (user) => set({ user }),
}));
