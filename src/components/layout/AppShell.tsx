import { useEffect, useState, lazy, Suspense } from 'react';
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

  // Keep-alive tabs: once a tab has been opened, its page component stays
  // mounted (just hidden) instead of unmounting on every switch. Previously
  // each tab was conditionally rendered by key, so leaving and returning to
  // a tab remounted the component from scratch — re-running every
  // data-fetching useEffect and discarding all in-progress state (scroll
  // position, wizard steps, unsaved form fields, loaded records). Now that
  // work only happens once per session per tab; switching back just shows
  // the pane as it was left.
  const [visitedTabs, setVisitedTabs] = useState<string[]>([currentTab]);
  useEffect(() => {
    setVisitedTabs((prev) => (prev.includes(currentTab) ? prev : [...prev, currentTab]));
  }, [currentTab]);

  return (
    <div className="app-outer">
      <Atmosphere />
      <div className="app-shell">
        <div className="glass-panel">
          <Sidebar activeTab={currentTab} onTabChange={setActiveTab} isAdmin={isAdmin} />
          <div className="app-content">
            <Topbar activeTab={currentTab} onToggleTheme={toggleTheme} theme={theme} />
            <div className="app-main" style={{ position: 'relative' }}>
              <Suspense fallback={<div className="empty-state"><p>Loading...</p></div>}>
                {visitedTabs.map((tabKey) => {
                  const Page = pages[tabKey];
                  if (!Page) return null;
                  const isActive = tabKey === currentTab;
                  return (
                    <div key={tabKey} style={{ display: isActive ? 'block' : 'none' }}>
                      <Page />
                    </div>
                  );
                })}
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
