import { useAccount } from '@/contexts/AccountContext';
import { useAuthStore } from '@/stores/authStore';
import { supabaseConfigured } from '@/lib/supabase';

interface TopbarProps {
  activeTab: string;
  onToggleTheme: () => void;
  theme: 'light' | 'dark';
}

const tabMeta: Record<string, { title: string; subtitle: string }> = {
  analyze: {
    title: 'New Analysis',
    subtitle: 'Give the agent a source — it reads, understands and routes before recommending anything.',
  },
  opportunities: {
    title: 'Opportunities',
    subtitle: 'Distinct, persona-mapped repurposing ideas. Pick one to move into the Studio.',
  },
  studio: {
    title: 'Studio',
    subtitle: 'Two-stage generation with a visible quality panel — nothing skips human review.',
  },
  kb: {
    title: 'Knowledge Base',
    subtitle: 'Everything the agent is allowed to know. Only active files are used.',
  },
  calendar: {
    title: 'Calendar',
    subtitle: 'Approved content, ready to schedule or export.',
  },
  settings: {
    title: 'Settings',
    subtitle: 'Integration status and account configuration.',
  },
};

export default function Topbar({ activeTab, onToggleTheme, theme }: TopbarProps) {
  const meta = tabMeta[activeTab] ?? { title: activeTab, subtitle: '' };
  const { account } = useAccount();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <div className="topbar">
      <div>
        <div className="topbar-title">{meta.title}</div>
        <div className="topbar-sub">{meta.subtitle}</div>
      </div>
      <div className="topbar-right">
        {account && (
          <span className="pill" title={`Account: ${account.id}`}>
            {account.name}
          </span>
        )}
        {!account && (
          <span className="pill">{supabaseConfigured ? 'Connected' : 'Setup Required'}</span>
        )}
        {user && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {user.name || user.email}
          </span>
        )}
        <div className="icon-btn" onClick={onToggleTheme} title="Toggle theme">
          {theme === 'dark' ? (
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
        {user && (
          <div className="icon-btn" onClick={() => signOut()} title="Sign out">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
