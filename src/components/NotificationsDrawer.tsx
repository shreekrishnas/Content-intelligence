import { useEffect, useState, useCallback } from 'react';
import { useAccount } from '@/contexts/AccountContext';
import { supabase } from '@/lib/supabase';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Notif {
  id: string;
  title: string;
  desc: string;
  time: string;
  color: string;
  read: boolean;
}

function formatRelative(d: Date) {
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays}d ago`;
}

export default function NotificationsDrawer({ open, onClose }: Props) {
  const { accountId } = useAccount();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifs = useCallback(async (aid: string) => {
    setLoading(true);
    try {
      const [assetsRes, trendsRes, intRes] = await Promise.all([
        supabase
          .from('assets')
          .select('id, stage, quality, created_at')
          .eq('account_id', aid)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('trend_records')
          .select('id, topic, domain_relevance_score, created_at')
          .eq('account_id', aid)
          .eq('classification', 'domain_trend')
          .gte('domain_relevance_score', 70)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('integrations')
          .select('id, provider, status, created_at')
          .eq('account_id', aid)
          .neq('status', 'active')
          .limit(3),
      ]);

      const derived: Notif[] = [];

      // Assets: notify about high-quality drafts ready for review
      for (const asset of (assetsRes.data || [])) {
        const q = asset.quality as Record<string, any>;
        const score = q?.overall_score ?? q?.score ?? q?.quality_score ?? null;
        if (asset.stage === 'draft' && typeof score === 'number' && score >= 85) {
          derived.push({
            id: `asset-${asset.id}`,
            title: 'Draft ready for review',
            desc: `Quality score ${score}% - ready for your approval`,
            time: formatRelative(new Date(asset.created_at)),
            color: '#7C3AED',
            read: false,
          });
        }
      }

      // Trends: high relevance signals
      for (const t of (trendsRes.data || [])) {
        derived.push({
          id: `trend-${t.id}`,
          title: 'New strong trend detected',
          desc: `Score ${t.domain_relevance_score} - ${t.topic}`,
          time: formatRelative(new Date(t.created_at)),
          color: '#10B981',
          read: false,
        });
      }

      // Integrations: disconnected/error
      for (const integration of (intRes.data || [])) {
        const provider = integration.provider || 'Integration';
        derived.push({
          id: `int-${integration.id}`,
          title: `${provider} needs attention`,
          desc: `Status: ${integration.status} - reconnect to resume sync`,
          time: formatRelative(new Date(integration.created_at)),
          color: '#F59E0B',
          read: false,
        });
      }

      // Sort by recency (keep original order as proxy since they're already sorted)
      setNotifs(derived.slice(0, 8));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && accountId) fetchNotifs(accountId);
  }, [open, accountId, fetchNotifs]);

  const unreadCount = notifs.filter((n) => !n.read).length;

  function markAllRead() {
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function markRead(id: string) {
    setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.3)', backdropFilter: 'blur(3px)', zIndex: 209 }}
        />
      )}
      <div className={`drawer-panel${open ? ' open' : ''}`}>
        <div className="drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <span style={{ fontWeight: 800, fontSize: '.9rem' }}>Notifications</span>
            {unreadCount > 0 && (
              <span style={{
                background: 'var(--accent-primary)',
                color: '#fff',
                borderRadius: '9999px',
                fontSize: '.65rem',
                fontWeight: 700,
                padding: '1px 6px',
                lineHeight: '16px',
              }}>
                {unreadCount}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            {unreadCount > 0 && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: '.72rem' }} onClick={markAllRead}>
                Mark all read
              </button>
            )}
            <button className="btn-icon" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="18" height="18">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="drawer-body" style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
          {loading ? (
            <div style={{ display: 'flex', gap: '.3rem', padding: '1rem 0', alignItems: 'center' }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: 'var(--accent-primary)',
                    animation: `pulseDot 1.2s ease-in-out ${i * 0.18}s infinite`,
                  }}
                />
              ))}
            </div>
          ) : notifs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)', fontSize: '.83rem' }}>
              <div style={{ fontSize: '1.4rem', marginBottom: '.4rem' }}>-</div>
              No new notifications
            </div>
          ) : (
            notifs.map((n) => (
              <div
                key={n.id}
                className="glass-card-static"
                style={{ padding: '.85rem', cursor: 'pointer', opacity: n.read ? 0.6 : 1, transition: 'opacity .2s' }}
                onClick={() => markRead(n.id)}
              >
                <div style={{ display: 'flex', gap: '.6rem' }}>
                  <span className="dot" style={{ background: n.color, marginTop: '.45rem', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.4rem' }}>
                      <div style={{ fontSize: '.82rem', fontWeight: 700 }}>{n.title}</div>
                      {!n.read && (
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-primary)', flexShrink: 0, marginTop: 5 }} />
                      )}
                    </div>
                    <div style={{ fontSize: '.76rem', color: 'var(--text-muted)', marginTop: '.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.desc}
                    </div>
                    <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: '.3rem' }}>{n.time}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
