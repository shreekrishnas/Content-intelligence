import { create } from 'zustand';
import { persist, type PersistOptions } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PersonaMeta {
  name: string;
  painPoint: string;
  goal: string;
  tone: string;
}

export interface KnowledgeFile {
  id: string;
  fileName: string;
  category: string;
  description: string;
  priority: string;
  active: boolean;
  version: number;
  sample: boolean;
  uploadedAt: number;
  personaMeta?: PersonaMeta;
}

export interface IntegrationItem {
  id: string;
  name: string;
  category: string;
  feature: string;
  provider: string;
  status: string;
  fallback: string;
}

export interface OpportunityItem {
  id: string;
  title: string;
  topicId: string;
  sourceInsight: string;
  personaId: string | null;
  personaName: string | null;
  personaRelevanceScore: number;
  personaPainPoint: string | null;
  personaQuestion: string | null;
  contentAngle: string;
  recommendedFormat: string;
  recommendationReason: string;
  unsuitableFormatNotes: string;
  priority: string;
  timeliness: string;
  suggestedCTA: string;
  expertAttribution: string;
  sourceContext: string;
  status: string;
  createdAt: number;
  analysisId: string | null;
}

export interface AnalysisItem {
  id: string;
  createdAt: number;
  sourceType: string;
  sourceTypeLabel: string;
  sourceTitle: string;
  sourceOwner: string;
  sourceUrl: string;
  sourceSummary: any;
  topics: any[];
  insights: any[];
  personaMatches: any[];
  depthAnalysis: any[];
  opportunities: any[];
  knowledgeContext: any;
  sourceReferences: any[];
  qualityCheck: any;
  analysisWarnings: string[];
}

export interface CalendarEntry {
  id: string;
  opportunityId: string;
  title: string;
  format: string;
  draft: string;
  quality: any;
  approvedAt: number;
  scheduled: string | null;
}

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

export interface AppState {
  // Theme
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;

  // Active tab
  activeTab: string;
  setActiveTab: (tab: string) => void;

  // Knowledge base
  kb: KnowledgeFile[];
  addKbFile: (file: KnowledgeFile) => void;
  toggleKbActive: (id: string) => void;
  deleteKbFile: (id: string) => void;

  // Integrations
  integrations: IntegrationItem[];

  // Analyses
  analyses: AnalysisItem[];
  addAnalysis: (analysis: AnalysisItem) => void;

  // Opportunities
  opportunities: OpportunityItem[];
  addOpportunities: (opps: OpportunityItem[]) => void;
  updateOpportunityStatus: (id: string, status: string) => void;

  // Studio
  activeStudioOpp: string | null;
  setActiveStudioOpp: (id: string | null) => void;
  studioAsset: StudioAsset | null;
  setStudioAsset: (asset: StudioAsset | null) => void;

  // Calendar
  calendar: CalendarEntry[];
  addCalendarEntry: (entry: CalendarEntry) => void;

  // Auth (simplified for demo)
  user: { id: string; email: string; name: string } | null;
  activeAccountId: string | null;
  setUser: (user: AppState['user']) => void;
  setActiveAccountId: (id: string | null) => void;
}

// ---------------------------------------------------------------------------
// Default / sample data
// ---------------------------------------------------------------------------

const defaultKb: KnowledgeFile[] = [
  {
    id: 'kb1',
    fileName: 'RH_ICP_Wealth_Professionals.pdf',
    category: 'persona',
    description:
      'Persona: Wealth-building professional, 35–50, salaried + some equity income',
    priority: 'Critical',
    active: true,
    version: 1,
    sample: true,
    uploadedAt: Date.now(),
    personaMeta: {
      name: 'Wealth-Building Professional',
      painPoint:
        'Portfolio is scattered across ad-hoc mutual funds and stocks bought on tips; no clear goal mapping.',
      goal: 'Wants a structured plan to grow wealth steadily while staying liquid for near-term goals.',
      tone: 'Direct, practical, respects their time — no jargon without explanation.',
    },
  },
  {
    id: 'kb2',
    fileName: 'RH_ICP_Business_Owners.pdf',
    category: 'persona',
    description:
      'Persona: Business owner / promoter, 40–60, concentrated wealth in own business',
    priority: 'Critical',
    active: true,
    version: 1,
    sample: true,
    uploadedAt: Date.now(),
    personaMeta: {
      name: 'Business Owner / Promoter',
      painPoint:
        'Most net worth is tied up in the business; personal wealth diversification has been an afterthought.',
      goal: 'Wants to de-risk personal finances and plan succession without disturbing the business.',
      tone: 'Peer-to-peer, respectful of their expertise, avoids sounding like it is teaching them business.',
    },
  },
  {
    id: 'kb3',
    fileName: 'RH_ICP_NRI_Investors.pdf',
    category: 'persona',
    description: 'Persona: NRI investor managing Indian assets remotely',
    priority: 'High',
    active: true,
    version: 1,
    sample: true,
    uploadedAt: Date.now(),
    personaMeta: {
      name: 'NRI Investor',
      painPoint:
        'Finds it hard to track and rebalance Indian investments from abroad; unclear on compliance changes.',
      goal: 'Wants a trustworthy adviser who can manage things end-to-end with clear remote reporting.',
      tone: 'Reassuring, clear on process and compliance, avoids assuming physical presence in India.',
    },
  },
  {
    id: 'kb4',
    fileName: 'RH_Brand_Voice_Guidelines.pdf',
    category: 'brand',
    description:
      'Right Horizons tone of voice — calm, educational, non-promotional',
    priority: 'Critical',
    active: true,
    version: 2,
    sample: true,
    uploadedAt: Date.now(),
  },
  {
    id: 'kb5',
    fileName: 'RH_Compliance_Restrictions.pdf',
    category: 'compliance',
    description: 'Claims that must not be made; disclaimer requirements',
    priority: 'Critical',
    active: true,
    version: 1,
    sample: true,
    uploadedAt: Date.now(),
  },
  {
    id: 'kb6',
    fileName: 'India_Financial_Glossary.pdf',
    category: 'terminology',
    description: 'Preferred Indian financial terms and explanations',
    priority: 'Standard',
    active: true,
    version: 1,
    sample: true,
    uploadedAt: Date.now(),
  },
  {
    id: 'kb7',
    fileName: 'Voice_of_Anil_Reference.pdf',
    category: 'expert',
    description: 'Anil interview transcripts and published articles',
    priority: 'High',
    active: false,
    version: 1,
    sample: true,
    uploadedAt: Date.now(),
  },
  {
    id: 'kb8',
    fileName: 'LinkedIn_Carousel_Guidelines.pdf',
    category: 'guidelines',
    description: 'Platform rules for LinkedIn posts and carousels',
    priority: 'Standard',
    active: true,
    version: 1,
    sample: true,
    uploadedAt: Date.now(),
  },
];

const defaultIntegrations: IntegrationItem[] = [
  {
    id: 'llm',
    name: 'AI / LLM Analysis',
    category: 'AI / LLM',
    feature: 'Source analysis, persona matching, content generation',
    provider: 'Claude API',
    status: 'Not Connected',
    fallback:
      'Showing sample analysis using keyword heuristics (DEMO MODE).',
  },
  {
    id: 'urlfetch',
    name: 'URL Content Extraction',
    category: 'Web Extraction',
    feature: 'Analyse External Source URL',
    provider: 'Web-fetch / crawling service',
    status: 'Not Connected',
    fallback: 'Paste the article text manually instead of a link.',
  },
  {
    id: 'alerts',
    name: 'Google Alerts Ingestion',
    category: 'Search / News Monitoring',
    feature: 'Trending Topic sourcing',
    provider: 'Google Alerts',
    status: 'Not Connected',
    fallback: 'Paste trending topic content manually.',
  },
  {
    id: 'canva',
    name: 'Canva Integration',
    category: 'Creative',
    feature: 'Push approved creative briefs to Canva',
    provider: 'Canva API',
    status: 'Not Connected',
    fallback: 'Export the creative brief as text/PDF instead.',
  },
  {
    id: 'social',
    name: 'Social Publishing',
    category: 'Publishing',
    feature: 'Publish approved content directly',
    provider: 'Meta / LinkedIn API',
    status: 'Not Connected',
    fallback: 'Export approved content and publish manually.',
  },
  {
    id: 'storage',
    name: 'Cloud File Storage',
    category: 'Storage',
    feature: 'Permanent knowledge file storage',
    provider: 'S3 / GDrive',
    status: 'Not Connected',
    fallback: 'Files are kept in this browser only (localStorage).',
  },
];

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type AppPersist = PersistOptions<AppState, Pick<AppState,
  'theme' | 'activeTab' | 'kb' | 'integrations' | 'analyses' |
  'opportunities' | 'activeStudioOpp' | 'studioAsset' | 'calendar' |
  'user' | 'activeAccountId'
>>;

const persistConfig: AppPersist = {
  name: 'cia_rh_state_v1',

  // Only persist data slices, not action functions.
  partialize: (state) => ({
    theme: state.theme,
    activeTab: state.activeTab,
    kb: state.kb,
    integrations: state.integrations,
    analyses: state.analyses,
    opportunities: state.opportunities,
    activeStudioOpp: state.activeStudioOpp,
    studioAsset: state.studioAsset,
    calendar: state.calendar,
    user: state.user,
    activeAccountId: state.activeAccountId,
  }),

  // Deep-merge persisted state with defaults so newly added fields never
  // disappear when loading an older localStorage snapshot.
  merge: (persistedState, currentState) => {
    const stored = (persistedState as Partial<AppState>) ?? {};
    return {
      ...currentState,
      ...stored,
      // Ensure arrays always fall back to defaults when missing from storage.
      kb: stored.kb ?? currentState.kb,
      integrations: stored.integrations ?? currentState.integrations,
      analyses: stored.analyses ?? currentState.analyses,
      opportunities: stored.opportunities ?? currentState.opportunities,
      calendar: stored.calendar ?? currentState.calendar,
    };
  },
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // ----- Theme -----
      theme: 'light',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),

      // ----- Active tab -----
      activeTab: 'dashboard',
      setActiveTab: (tab) => set({ activeTab: tab }),

      // ----- Knowledge base -----
      kb: defaultKb,
      addKbFile: (file) => set((s) => ({ kb: [...s.kb, file] })),
      toggleKbActive: (id) =>
        set((s) => ({
          kb: s.kb.map((f) =>
            f.id === id ? { ...f, active: !f.active } : f,
          ),
        })),
      deleteKbFile: (id) =>
        set((s) => ({ kb: s.kb.filter((f) => f.id !== id) })),

      // ----- Integrations -----
      integrations: defaultIntegrations,

      // ----- Analyses -----
      analyses: [],
      addAnalysis: (analysis) =>
        set((s) => ({ analyses: [analysis, ...s.analyses] })),

      // ----- Opportunities -----
      opportunities: [],
      addOpportunities: (opps) =>
        set((s) => ({ opportunities: [...s.opportunities, ...opps] })),
      updateOpportunityStatus: (id, status) =>
        set((s) => ({
          opportunities: s.opportunities.map((o) =>
            o.id === id ? { ...o, status } : o,
          ),
        })),

      // ----- Studio -----
      activeStudioOpp: null,
      setActiveStudioOpp: (id) => set({ activeStudioOpp: id }),
      studioAsset: null,
      setStudioAsset: (asset) => set({ studioAsset: asset }),

      // ----- Calendar -----
      calendar: [],
      addCalendarEntry: (entry) =>
        set((s) => ({ calendar: [...s.calendar, entry] })),

      // ----- Auth -----
      user: null,
      activeAccountId: null,
      setUser: (user) => set({ user }),
      setActiveAccountId: (id) => set({ activeAccountId: id }),
    }),
    persistConfig,
  ),
);
