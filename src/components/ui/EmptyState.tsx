import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: 'opportunities' | 'knowledge' | 'ideas' | 'trends' | 'calendar' | 'search' | 'generic';
  title: string;
  description?: string;
  action?: ReactNode;
}

const illustrations: Record<string, ReactNode> = {
  opportunities: (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
      <circle cx="36" cy="36" r="32" fill="var(--accent-primary-soft)" />
      <circle cx="36" cy="30" r="10" stroke="var(--accent-primary)" strokeWidth="2.5" fill="none" />
      <path d="M30 30c0-3.3 2.7-6 6-6" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M36 40v6M30 52h12" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="52" cy="22" r="4" fill="var(--status-warning)" opacity="0.7" />
      <circle cx="20" cy="48" r="3" fill="var(--status-success)" opacity="0.6" />
    </svg>
  ),
  knowledge: (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
      <circle cx="36" cy="36" r="32" fill="var(--accent-primary-soft)" />
      <rect x="22" y="20" width="28" height="34" rx="4" stroke="var(--accent-primary)" strokeWidth="2.5" fill="none" />
      <path d="M28 30h16M28 36h16M28 42h10" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="50" cy="50" r="8" fill="var(--surface-base)" stroke="var(--accent-primary)" strokeWidth="2" />
      <path d="M47 50h6M50 47v6" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  ideas: (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
      <circle cx="36" cy="36" r="32" fill="var(--accent-primary-soft)" />
      <path d="M28 34a8 8 0 1 1 10.7 7.5c-1 .4-1.7 1.3-1.7 2.5h-6c0-1.2-.7-2.1-1.7-2.5A8 8 0 0 1 28 34z" stroke="var(--accent-primary)" strokeWidth="2.5" fill="none" />
      <path d="M31 44h10M32 48h8" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M36 22v-4M48 26l2.8-2.8M24 26l-2.8-2.8" stroke="var(--status-warning)" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
    </svg>
  ),
  trends: (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
      <circle cx="36" cy="36" r="32" fill="var(--accent-primary-soft)" />
      <path d="M18 44l10-10 8 6 16-18" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="52" cy="22" r="3" fill="var(--accent-primary)" />
      <path d="M18 50h36" stroke="var(--border-default)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  calendar: (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
      <circle cx="36" cy="36" r="32" fill="var(--accent-primary-soft)" />
      <rect x="20" y="24" width="32" height="28" rx="4" stroke="var(--accent-primary)" strokeWidth="2.5" fill="none" />
      <path d="M20 32h32M28 20v8M44 20v8" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="28" y="38" width="6" height="6" rx="1.5" fill="var(--accent-primary)" opacity="0.5" />
      <rect x="38" y="38" width="6" height="6" rx="1.5" fill="var(--status-success)" opacity="0.5" />
    </svg>
  ),
  search: (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
      <circle cx="36" cy="36" r="32" fill="var(--accent-primary-soft)" />
      <circle cx="33" cy="32" r="11" stroke="var(--accent-primary)" strokeWidth="2.5" fill="none" />
      <path d="M41 40l8 8" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M29 32a4 4 0 0 1 4-4" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    </svg>
  ),
  generic: (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
      <circle cx="36" cy="36" r="32" fill="var(--accent-primary-soft)" />
      <rect x="24" y="24" width="24" height="24" rx="6" stroke="var(--accent-primary)" strokeWidth="2.5" fill="none" />
      <path d="M30 36h12M36 30v12" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  ),
};

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '3rem 1.5rem',
        gap: '0.75rem',
      }}
    >
      <div>{illustrations[icon]}</div>
      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
      {description && (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: 320, lineHeight: 1.5 }}>
          {description}
        </div>
      )}
      {action && <div style={{ marginTop: '0.5rem' }}>{action}</div>}
    </div>
  );
}
