import { useEffect, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from '@/store';
import { useAccount } from '@/contexts/AccountContext';
import Atmosphere from './Atmosphere';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const AnalyzePage = lazy(() => import('@/pages/AnalyzePage'));
const OpportunitiesPage = lazy(() => import('@/pages/OpportunitiesPage'));
const StudioPage = lazy(() => import('@/pages/StudioPage'));
const KnowledgeBasePage = lazy(() => import('@/pages/KnowledgeBasePage'));
const IdeasLabPage = lazy(() => import('@/pages/IdeasLabPage'));
const TrendsPage = lazy(() => import('@/pages/TrendsPage'));
const CalendarPage = lazy(() => import('@/pages/CalendarPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const AdminPage = lazy(() => import('@/pages/AdminPage'));

const pages: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  analyze: AnalyzePage,
  opportunities: OpportunitiesPage,
  studio: StudioPage,
  kb: KnowledgeBasePage,
  ideas: IdeasLabPage,
  trends: TrendsPage,
  calendar: CalendarPage,
  settings: SettingsPage,
  admin: AdminPage,
};

export default function AppShell() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const { isAdmin } = useAccount();

  useEffect(() => {
    if (activeTab === 'dashboard') setActiveTab('analyze');
  }, [activeTab, setActiveTab]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const currentTab = activeTab === 'dashboard' ? 'analyze' : activeTab;
  const ActivePage = pages[currentTab];

  return (
    <div className="app-outer">
      <Atmosphere />
      <div className="app-shell">
        <div className="glass-panel">
          <Sidebar activeTab={currentTab} onTabChange={setActiveTab} isAdmin={isAdmin} />
          <div className="app-content">
            <Topbar activeTab={currentTab} onToggleTheme={toggleTheme} theme={theme} />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={currentTab}
                className="app-main"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <Suspense fallback={<div className="empty-state"><p>Loading...</p></div>}>
                  {ActivePage && <ActivePage />}
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
