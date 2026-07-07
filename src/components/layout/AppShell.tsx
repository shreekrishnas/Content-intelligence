import { useState, useEffect, lazy, Suspense } from "react";
import Atmosphere from "./Atmosphere";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

const AnalyzePage = lazy(() => import("@/pages/AnalyzePage"));
const OpportunitiesPage = lazy(() => import("@/pages/OpportunitiesPage"));
const StudioPage = lazy(() => import("@/pages/StudioPage"));
const KnowledgeBasePage = lazy(() => import("@/pages/KnowledgeBasePage"));
const CalendarPage = lazy(() => import("@/pages/CalendarPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));

function getInitialTheme(): "light" | "dark" {
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const pages: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  analyze: AnalyzePage,
  opportunities: OpportunitiesPage,
  studio: StudioPage,
  kb: KnowledgeBasePage,
  calendar: CalendarPage,
  settings: SettingsPage,
};

export default function AppShell() {
  const [activeTab, setActiveTab] = useState("analyze");
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const ActivePage = pages[activeTab];

  return (
    <div className="app-outer">
      <Atmosphere />
      <div className="app-shell">
        <div className="glass-panel">
          <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
          <div className="app-content">
            <Topbar activeTab={activeTab} onToggleTheme={toggleTheme} theme={theme} />
            <div className="app-main page-enter" key={activeTab}>
              <Suspense fallback={<div className="empty-state"><p>Loading...</p></div>}>
                {ActivePage && <ActivePage />}
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
