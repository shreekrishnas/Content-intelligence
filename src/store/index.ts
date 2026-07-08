import { create } from 'zustand';

export interface StudioAsset {
  stage: 'outline' | 'draft' | 'approved';
  outline: string;
  draft: string;
  feedbackLog: Array<{ stage: string; feedback: string; at: number }>;
  sourceRefs: any[];
  visualRec: { concept: string; format: string; data: string };
  calendared: boolean;
  quality?: any;
}

interface AppState {
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;

  activeTab: string;
  setActiveTab: (tab: string) => void;

  activeStudioOpp: string | null;
  setActiveStudioOpp: (id: string | null) => void;
  studioAsset: StudioAsset | null;
  setStudioAsset: (asset: StudioAsset | null) => void;
}

function getInitialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('ci_theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const useAppStore = create<AppState>((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    localStorage.setItem('ci_theme', theme);
    set({ theme });
  },
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('ci_theme', next);
      return { theme: next };
    }),

  activeTab: 'analyze',
  setActiveTab: (tab) => set({ activeTab: tab }),

  activeStudioOpp: null,
  setActiveStudioOpp: (id) => set({ activeStudioOpp: id }),
  studioAsset: null,
  setStudioAsset: (asset) => set({ studioAsset: asset }),
}));
