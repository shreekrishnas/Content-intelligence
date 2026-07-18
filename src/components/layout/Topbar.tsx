import { useState, useRef, useEffect } from 'react';
import { useAccount } from '@/contexts/AccountContext';
import { useAuthStore } from '@/stores/authStore';

interface TopbarProps {
  activeTab: string;
  onToggleTheme: () => void;
  theme: 'light' | 'dark';
}

const tabMeta: Record<string, { title: string; subtitle: string }> = {
  admin: {
    title: 'Admin Panel',
    subtitle: 'Team assignments, client accounts, and access management.',
  },
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
  trends: {
    title: 'Trends & Alerts',
    subtitle: 'AI supervisor scans live signals, scores relevance, and routes actionable trends to your pipeline.',
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

const ROLE_COLORS: Record<string, string> = {
  td_management: '#8B5CF6',
  pod_head: '#2563EB',
  manager: '#059669',
  executive: '#D97706',
  designer: '#DB2777',
  intern: '#6B7280',
};

function AccountSwitcher() {
  const { account, accounts, isAdmin, switchAccount } = useAccount();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filtered = search
    ? accounts.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
    : accounts;

  const showSearch = accounts.length > 8;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => { setOpen(!open); setSearch(''); }}
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
          maxWidth: 220,
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: isAdmin ? '#8B5CF6' : 'var(--status-success)', flexShrink: 0,
        }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>
          {account?.name || 'Select Account'}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s ease' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          right: 0,
          minWidth: 240,
          maxWidth: 300,
          background: 'var(--surface-card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          zIndex: 100,
          backdropFilter: 'blur(20px)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 420,
        }}>
          <div style={{
            padding: '8px 12px',
            fontSize: '0.65rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            {isAdmin ? `All Accounts (${accounts.length})` : 'Switch Account'}
          </div>

          {showSearch && (
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <input
                autoFocus
                placeholder="Search accounts…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
                style={{
                  width: '100%',
                  padding: '5px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-hover)',
                  color: 'var(--text-primary)',
                  fontSize: '0.76rem',
                  outline: 'none',
                }}
              />
            </div>
          )}

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 && (
              <div style={{ padding: '12px', fontSize: '0.76rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                No accounts found
              </div>
            )}
            {filtered.map((acc) => {
              const isActive = acc.id === account?.id;
              return (
                <button
                  key={acc.id}
                  onClick={() => { switchAccount(acc.id); setOpen(false); setSearch(''); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '9px 12px',
                    border: 'none',
                    background: isActive ? 'var(--accent-primary)' : 'transparent',
                    color: isActive ? '#fff' : 'var(--text-primary)',
                    fontSize: '0.79rem',
                    fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: isActive ? '#fff' : 'var(--text-muted)',
                    flexShrink: 0, opacity: isActive ? 1 : 0.4,
                  }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {acc.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Topbar({ activeTab, onToggleTheme, theme }: TopbarProps) {
  const meta = tabMeta[activeTab] ?? { title: activeTab, subtitle: '' };
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const { userRole, isAdmin } = useAccount();
  const roleColor = ROLE_COLORS[userRole || ''] || 'var(--text-muted)';

  return (
    <div className="topbar">
      <div style={{ overflow: 'hidden', minWidth: 0 }}>
        <div className="topbar-title">{meta.title}</div>
        <div className="topbar-sub">{meta.subtitle}</div>
      </div>
      <div className="topbar-right">
        <AccountSwitcher />
        {user && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-primary)', fontWeight: 500 }}>
              {user.name || user.email?.split('@')[0]}
            </span>
            {(userRole || isAdmin) && (
              <span style={{
                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.05em',
                color: roleColor, textTransform: 'capitalize',
              }}>
                {isAdmin && !userRole ? 'Admin' : (userRole || '').replace('_', ' ')}
              </span>
            )}
          </div>
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
