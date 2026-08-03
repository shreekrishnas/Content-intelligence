import { useState, useRef, useEffect } from 'react';
import { useAccount } from '@/contexts/AccountContext';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { showToast } from '@/lib/toast';

interface TopbarProps {
  activeTab: string;
  onToggleTheme: () => void;
  theme: 'light' | 'dark';
  onOpenCmdk?: () => void;
  onOpenCopilot?: () => void;
  onOpenNotifs?: () => void;
}

const tabMeta: Record<string, { title: string; subtitle: string }> = {
  overview: {
    title: 'Overview',
    subtitle: "Your content pipeline at a glance -sourced from live analyses, trends, and studio activity.",
  },
  admin: {
    title: 'Admin Panel',
    subtitle: 'Team assignments, client accounts, and access management.',
  },
  analyze: {
    title: 'New Analysis',
    subtitle: 'Give the agent a source -it reads, understands and routes before recommending anything.',
  },
  opportunities: {
    title: 'Opportunities',
    subtitle: 'Distinct, persona-mapped repurposing ideas. Pick one to move into the Studio.',
  },
  studio: {
    title: 'Studio',
    subtitle: 'Two-stage generation with a visible quality panel -nothing skips human review.',
  },
  kb: {
    title: 'Knowledge Base',
    subtitle: 'Everything the agent is allowed to know. Only active files are used.',
  },
  ideas: {
    title: 'Ideas Lab',
    subtitle: 'Generate, repurpose, and plan content ideas -grounded in your Knowledge Base.',
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

function ViewModeToggle() {
  const { isMasterAdmin, viewMode, setViewMode, accounts } = useAccount();
  if (!isMasterAdmin) return null;

  const Button = ({ mode, label }: { mode: 'admin' | 'personal'; label: string }) => {
    const active = viewMode === mode;
    return (
      <button
        onClick={() => {
          if (active) return;
          setViewMode(mode);
          showToast(mode === 'admin' ? 'Admin view -loading all accounts…' : 'Personal view -loading your accounts…', 'success');
        }}
        title={mode === 'admin' ? `See every account in the org (currently ${accounts.length})` : 'See only accounts you have explicit access to'}
        style={{
          padding: '5px 12px',
          borderRadius: 6,
          border: 'none',
          background: active ? 'var(--accent-primary)' : 'transparent',
          color: active ? '#fff' : 'var(--text-secondary)',
          fontSize: '0.72rem',
          fontWeight: 600,
          cursor: active ? 'default' : 'pointer',
          transition: 'background 120ms ease',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        padding: 3,
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--surface-card)',
      }}
    >
      <Button mode="admin" label="Admin" />
      <Button mode="personal" label="Personal" />
    </div>
  );
}

const MAX_ATTACH_BYTES = 4 * 1024 * 1024; // 4 MB

function FeedbackButton({ activeTab }: { activeTab: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<{ name: string; type: string; data: string } | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((s) => s.user);
  const { account } = useAccount();

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function handleFile(file: File) {
    setAttachError(null);
    if (file.size > MAX_ATTACH_BYTES) {
      setAttachError('File too large — max 4 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachment({ name: file.name, type: file.type, data: reader.result as string });
    };
    reader.readAsDataURL(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function removeAttachment() {
    setAttachment(null);
    setAttachError(null);
  }

  async function submit() {
    const text = message.trim();
    if (!text) { showToast('Please write a message before sending.', 'error'); return; }
    if (!user) { showToast('You must be signed in to send feedback.', 'error'); return; }
    setSending(true);
    const { data, error } = await api.feedback.send({
      message: text,
      account_label: account?.name || '',
      page: activeTab,
      attachment: attachment ?? undefined,
    });
    setSending(false);
    if (error) { showToast(error, 'error'); return; }
    showToast(`Feedback sent to ${data?.delivered_to || 'the team'}. Thanks!`);
    setMessage('');
    setAttachment(null);
    setOpen(false);
  }

  const remaining = 5000 - message.length;
  const isImage = attachment?.type.startsWith('image/');

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Send feedback"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--surface-card)',
          color: 'var(--text-primary)', fontSize: '0.78rem', fontWeight: 600,
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span>Feedback</span>
      </button>

      {open && (
        <div
          ref={cardRef}
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 380,
            background: 'var(--surface-card)', border: '1px solid var(--border)',
            borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)',
            zIndex: 200, overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px 12px',
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'linear-gradient(135deg, var(--accent-primary), #7c3aed)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>Send feedback</span>
            </div>
            <button onClick={() => setOpen(false)}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                width: 26, height: 26, borderRadius: 6, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, lineHeight: 1,
              }}
              title="Close">&times;</button>
          </div>

          {/* Body */}
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Sender pill */}
            {user?.email && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '5px 10px 5px 6px', borderRadius: 20,
                background: 'var(--surface-hover)', border: '1px solid var(--border)',
                alignSelf: 'flex-start',
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--accent-primary), #7c3aed)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.6rem', fontWeight: 700, color: '#fff', flexShrink: 0,
                }}>
                  {(user.name || user.email || '?')[0].toUpperCase()}
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  {user.name
                    ? <><strong style={{ color: 'var(--text-primary)' }}>{user.name}</strong> · {user.email}</>
                    : user.email}
                </span>
              </div>
            )}

            {/* Unified input box */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              style={{
                border: '1.5px solid var(--border)', borderRadius: 10,
                background: 'var(--surface-hover)', overflow: 'hidden',
                transition: 'border-color 0.15s',
              }}
              onFocusCapture={(e) => (e.currentTarget.style.borderColor = 'var(--accent-primary)')}
              onBlurCapture={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 5000))}
                placeholder="What's on your mind? Bug, idea, or praise…"
                rows={5}
                autoFocus
                disabled={sending}
                style={{
                  width: '100%', padding: '12px 14px 8px',
                  border: 'none', background: 'transparent',
                  color: 'var(--text-primary)', fontSize: '0.83rem', lineHeight: 1.55,
                  resize: 'none', outline: 'none',
                  fontFamily: 'inherit', boxSizing: 'border-box', display: 'block',
                }}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); } }}
              />

              {/* Attachment preview inside box */}
              {attachment && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '8px 10px' }}>
                  {isImage ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img src={attachment.data} alt={attachment.name}
                        style={{ height: 64, width: 'auto', maxWidth: '100%', borderRadius: 6, display: 'block', objectFit: 'cover', border: '1px solid var(--border)' }} />
                      <button onClick={removeAttachment}
                        style={{
                          position: 'absolute', top: -6, right: -6,
                          width: 18, height: 18, borderRadius: '50%', border: 'none',
                          background: '#111', color: '#fff', fontSize: 11, lineHeight: 1,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>&times;</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 6, background: '#EDE9FE',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                        </svg>
                      </div>
                      <span style={{ flex: 1, fontSize: '0.74rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {attachment.name}
                      </span>
                      <button onClick={removeAttachment}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px', borderRadius: 4 }}
                        title="Remove">&times;</button>
                    </div>
                  )}
                </div>
              )}

              {/* Toolbar row inside box */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', borderTop: '1px solid var(--border)',
              }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach screenshot or file"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 500,
                    padding: '3px 6px', borderRadius: 6, transition: 'color 0.12s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                  {attachment ? 'Replace' : 'Attach'}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={onFileChange} />
                <span style={{ fontSize: '0.66rem', color: remaining < 200 ? '#F59E0B' : 'var(--text-muted)' }}>
                  {remaining < 500 ? `${remaining} left` : ''}
                </span>
              </div>
            </div>

            {attachError && (
              <div style={{ fontSize: '0.72rem', color: '#DC2626', display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {attachError}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px 14px', gap: 8,
          }}>
            <span style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>
              ⌘/Ctrl+Enter to send
            </span>
            <button
              onClick={submit}
              disabled={sending || !message.trim()}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 18px', borderRadius: 8, border: 'none',
                background: sending || !message.trim()
                  ? 'var(--surface-hover)'
                  : 'linear-gradient(135deg, var(--accent-primary), #7c3aed)',
                color: sending || !message.trim() ? 'var(--text-muted)' : '#fff',
                fontSize: '0.8rem', fontWeight: 600,
                cursor: sending || !message.trim() ? 'default' : 'pointer',
                boxShadow: sending || !message.trim() ? 'none' : '0 2px 8px rgba(124,58,237,0.35)',
                transition: 'all 0.15s',
              }}
            >
              {sending ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  Sending…
                </>
              ) : (
                <>
                  Send
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function UserAvatar({ name, email }: { name?: string | null; email?: string | null }) {
  const initials = name
    ? name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : (email?.split('@')[0]?.[0] || '?').toUpperCase();
  return (
    <div
      className="avatar"
      style={{ width: 34, height: 34, fontSize: '.78rem', flexShrink: 0 }}
      title={name || email || ''}
    >
      {initials}
    </div>
  );
}

export default function Topbar({ activeTab, onToggleTheme, theme, onOpenCmdk, onOpenCopilot, onOpenNotifs }: TopbarProps) {
  const meta = tabMeta[activeTab] ?? { title: activeTab, subtitle: '' };
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  useAccount();

  return (
    <div className="topbar">
      <div style={{ overflow: 'hidden', minWidth: 0 }}>
        <div className="topbar-title">{meta.title}</div>
        <div className="topbar-sub">{meta.subtitle}</div>
      </div>
      <div className="topbar-right">
        {/* Cmd+K search pill */}
        <button
          onClick={onOpenCmdk}
          className="pill-elevated"
          style={{ width: 220, justifyContent: 'space-between', color: 'var(--text-muted)' }}
          title="Search (⌘K)"
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '.45rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
            </svg>
            Search or jump to…
          </span>
          <kbd style={{ fontSize: '.65rem', border: '1px solid var(--border-default)', borderRadius: '.35rem', padding: '.1rem .35rem' }}>⌘K</kbd>
        </button>

        <ViewModeToggle />
        <AccountSwitcher />
        <FeedbackButton activeTab={activeTab} />

        {/* Copilot button */}
        <button className="btn btn-brand btn-sm" onClick={onOpenCopilot} style={{ gap: '.4rem' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
            <path d="M12 2l1.6 5.2L19 9l-5.4 1.8L12 16l-1.6-5.2L5 9l5.4-1.8L12 2z"/>
          </svg>
          Copilot
        </button>

        {/* Notifications bell */}
        <div className="icon-circle" onClick={onOpenNotifs} title="Notifications" style={{ cursor: 'pointer' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.7 21a2 2 0 0 1-3.4 0"/>
          </svg>
          <span className="notif-dot" />
        </div>

        {/* Theme toggle */}
        <div className="icon-circle" onClick={onToggleTheme} title="Toggle theme" style={{ cursor: 'pointer' }}>
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
              <circle cx="12" cy="12" r="4"/>
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
              <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>
            </svg>
          )}
        </div>

        {/* Avatar + sign out */}
        {user && (
          <>
            <UserAvatar name={user.name} email={user.email} />
            <div className="icon-circle" onClick={() => signOut()} title="Sign out" style={{ cursor: 'pointer' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
