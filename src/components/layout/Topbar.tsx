interface TopbarProps {
  activeTab: string;
  onToggleTheme: () => void;
  theme: "light" | "dark";
}

const tabMeta: Record<string, { title: string; subtitle: string }> = {
  analyze: {
    title: "New Analysis",
    subtitle: "Give the agent a source — it reads, understands and routes before recommending anything.",
  },
  opportunities: {
    title: "Opportunities",
    subtitle: "Distinct, persona-mapped repurposing ideas. Pick one to move into the Studio.",
  },
  studio: {
    title: "Studio",
    subtitle: "Two-stage generation with a visible quality panel — nothing skips human review.",
  },
  kb: {
    title: "Knowledge Base",
    subtitle: "Everything the agent is allowed to know. Only active files are used.",
  },
  calendar: {
    title: "Calendar",
    subtitle: "Approved content, ready to schedule or export.",
  },
  settings: {
    title: "Settings",
    subtitle: "Integration status — nothing here pretends to be connected when it isn't.",
  },
};

export default function Topbar({ activeTab, onToggleTheme, theme }: TopbarProps) {
  const meta = tabMeta[activeTab] ?? { title: activeTab, subtitle: "" };

  return (
    <div className="topbar">
      <div>
        <div className="topbar-title">{meta.title}</div>
        <div className="topbar-sub">{meta.subtitle}</div>
      </div>
      <div className="topbar-right">
        <span className="pill">&#9888; Demo mode — AI calls are mocked</span>
        <div className="icon-btn" onClick={onToggleTheme} title="Toggle theme">
          {theme === "dark" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
              <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
