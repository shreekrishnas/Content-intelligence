import { useAppStore } from '@/store';
import { useAccount } from '@/contexts/AccountContext';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SUGGESTIONS = [
  { label: 'Draft a plan for unscheduled content', action: null },
  { label: 'Summarise this week\'s pipeline', action: null },
  { label: 'Flag any compliance risks in Studio', action: null },
];

export default function CopilotDrawer({ open, onClose }: Props) {
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const { account } = useAccount();

  return (
    <>
      {open && (
        <div
          className="drawer-overlay"
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.3)', backdropFilter: 'blur(3px)', zIndex: 209 }}
        />
      )}
      <div className={`drawer-panel${open ? ' open' : ''}`}>
        <div className="drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
            <div style={{
              width: 34, height: 34, borderRadius: '.7rem',
              background: 'linear-gradient(135deg,#7C3AED,#4F46E5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l1.6 5.2L19 9l-5.4 1.8L12 16l-1.6-5.2L5 9l5.4-1.8L12 2z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '.9rem' }}>AI Copilot</div>
              <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                Grounded in {account?.name || 'your'} knowledge base
              </div>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="18" height="18">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="drawer-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="glass-card-static" style={{ padding: '.9rem', background: 'var(--surface-card-header)' }}>
            <p style={{ fontSize: '.83rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
              I can see your pipeline, draft plans, and surface content gaps -all grounded in your Knowledge Base.
              What would you like help with?
            </p>
          </div>

          <div style={{ fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-muted)' }}>
            QUICK ACTIONS
          </div>

          {SUGGESTIONS.map((s, i) => (
            <button key={i} className="btn btn-secondary" style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left' }}>
              {s.label}
            </button>
          ))}
        </div>

        <div className="drawer-footer">
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <input className="glass-input" placeholder="Ask Copilot about your pipeline…" style={{ flex: 1 }} />
            <button className="btn btn-primary" style={{ borderRadius: '.875rem', padding: '0 .9rem', flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            </button>
          </div>
          <p style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: '.6rem', textAlign: 'center' }}>
            For grounded answers from your files, try{' '}
            <button
              onClick={() => { setActiveTab('kb'); onClose(); }}
              style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 'inherit' }}
            >
              Knowledge Base
            </button>.
          </p>
        </div>
      </div>
    </>
  );
}
