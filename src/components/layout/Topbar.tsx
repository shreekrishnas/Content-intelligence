import { useState, useRef, useEffect } from 'react';
import { useAccount } from '@/contexts/AccountContext';
import { useAuthStore } from '@/stores/authStore';

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
  ideas: {
    title: 'Ideas Lab',
    subtitle: 'Generate, repurpose, and plan content ideas — grounded in your Knowledge Base.',
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

function AccountSwitcher() {
  const { account, accounts, switchAccount } = useAccount();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--surface-card)',
          color: 'var(--text-primary)',
          fontSize: '0.78rem',
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: 'var(--status-success)', flexShrink: 0,
        }} />
        {account?.name || 'Select Account'}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s ease' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          right: 0,
          minWidth: 200,
          background: 'var(--surface-card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          zIndex: 100,
          overflow: 'hidden',
          backdropFilter: 'blur(20px)',
        }}>
          <div style={{
            padding: '8px 12px',
            fontSize: '0.65rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)',
            borderBottom: '1px solid var(--border)',
          }}>
            Switch Account
          </div>
          {accounts.map((acc) => {
            const isActive = acc.id === account?.id;
            return (
              <button
                key={acc.id}
                onClick={() => { switchAccount(acc.id); setOpen(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '10px 12px',
                  border: 'none',
                  background: isActive ? 'var(--accent-primary)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text-primary)',
                  fontSize: '0.8rem',
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.target as HTMLElement).style.background = 'var(--surface-hover)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.target as HTMLElement).style.background = 'transparent';
                }}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: isActive ? '#fff' : 'var(--text-muted)',
                  flexShrink: 0, opacity: isActive ? 1 : 0.4,
                }} />
                {acc.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Topbar({ activeTab, onToggleTheme, theme }: TopbarProps) {
  const meta = tabMeta[activeTab] ?? { title: activeTab, subtitle: '' };
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <div className="topbar">
      <div>
        <div className="topbar-title">{meta.title}</div>
        <div className="topbar-sub">{meta.subtitle}</div>
      </div>
      <div className="topbar-right">
        <AccountSwitcher />
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
