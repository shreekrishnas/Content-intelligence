import { useEffect, useState, lazy, Suspense, useCallback } from 'react';
import { useAppStore } from '@/store';
import { useAccount } from '@/contexts/AccountContext';
import Atmosphere from './Atmosphere';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import CommandPalette from '@/components/CommandPalette';
import CopilotDrawer from '@/components/CopilotDrawer';
import NotificationsDrawer from '@/components/NotificationsDrawer';

const OverviewPage = lazy(() => import('@/pages/OverviewPage'));
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
  overview: OverviewPage,
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
  const { isMasterAdmin } = useAccount();

  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [notifsOpen, setNotifsOpen] = useState(false);

  // Redirect old 'dashboard' default to 'overview'
  useEffect(() => {
    if (activeTab === 'dashboard') setActiveTab('overview');
  }, [activeTab, setActiveTab]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Cmd+K global shortcut
  const openCmdk = useCallback(() => setCmdkOpen(true), []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openCmdk();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openCmdk]);

  const currentTab = activeTab === 'dashboard' ? 'overview' : activeTab;

  const [visitedTabs, setVisitedTabs] = useState<string[]>([currentTab]);
  useEffect(() => {
    setVisitedTabs((prev) => (prev.includes(currentTab) ? prev : [...prev, currentTab]));
  }, [currentTab]);

  return (
    <div className="app-outer">
      <Atmosphere />
      <div className="app-shell">
        <div className="glass-panel">
          <Sidebar activeTab={currentTab} onTabChange={setActiveTab} isAdmin={isMasterAdmin} />
          <div className="app-content">
            <Topbar
              activeTab={currentTab}
              onToggleTheme={toggleTheme}
              theme={theme}
              onOpenCmdk={openCmdk}
              onOpenCopilot={() => setCopilotOpen(true)}
              onOpenNotifs={() => setNotifsOpen(true)}
            />
            <div className="app-main" style={{ position: 'relative' }}>
              {visitedTabs.map((tabKey) => {
                const Page = pages[tabKey];
                if (!Page) return null;
                const isActive = tabKey === currentTab;
                return (
                  <div key={tabKey} style={{ display: isActive ? 'block' : 'none' }}>
                    <Suspense fallback={<div className="empty-state"><p>Loading...</p></div>}>
                      <Page />
                    </Suspense>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <CommandPalette open={cmdkOpen} onClose={() => setCmdkOpen(false)} />
      <CopilotDrawer open={copilotOpen} onClose={() => setCopilotOpen(false)} />
      <NotificationsDrawer open={notifsOpen} onClose={() => setNotifsOpen(false)} />
    </div>
  );
}
