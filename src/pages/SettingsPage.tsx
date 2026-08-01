import { useState, useEffect, useCallback } from 'react';
import { useAccount, MASTER_ADMIN_EMAIL } from '@/contexts/AccountContext';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import type { FeedbackItem } from '@/lib/api';
import { supabaseConfigured } from '@/lib/supabase';
import type { Integration } from '@/types';
import { showToast } from '@/lib/toast';


const STATUS_COLORS: Record<string, string> = {
  connected: '#10B981',
  active: '#10B981',
  configuration_required: '#F59E0B',
  error: '#DC2626',
  inactive: '#9CA3AF',
};

export default function SettingsPage() {
  const { account, accountId, isMasterAdmin, viewMode } = useAccount();
  const user = useAuthStore((s) => s.user);

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [configModal, setConfigModal] = useState<Integration | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);

  // Feedback inbox is shown only to the master admin AND only when they're in Admin view.
  // In Personal view the section is hidden so the app feels like a normal user's app.
  const isFeedbackAdmin = isMasterAdmin && viewMode === 'admin';
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [expandedFeedback, setExpandedFeedback] = useState<string | null>(null);

  const loadFeedback = useCallback(async () => {
    if (!isFeedbackAdmin) return;
    setFeedbackLoading(true);
    setFeedbackError(null);
    const { data, error } = await api.feedback.list();
    if (error) setFeedbackError(error); else setFeedbacks(data || []);
    setFeedbackLoading(false);
  }, [isFeedbackAdmin]);

  useEffect(() => { loadFeedback(); }, [loadFeedback]);

  const loadIntegrations = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const { data } = await api.integrations.list(accountId);
    setIntegrations(data || []);
    setLoading(false);
  }, [accountId]);

  useEffect(() => { loadIntegrations(); }, [loadIntegrations]);

  function openConfig(intg: Integration) {
    setConfigModal(intg);
    setConfigValues(intg.config ? { ...intg.config } : {});
  }

  async function saveConfig() {
    if (!configModal) return;
    const { error } = await api.integrations.configure(accountId!, configModal.id, configValues);
    if (error) { showToast(error, 'error'); return; }
    setConfigModal(null);
    showToast('Configuration saved');
    loadIntegrations();
  }

  async function testConnection(intg: Integration) {
    setTesting(intg.id);
    try {
      const hasConfig = intg.config && Object.keys(intg.config).length > 0;
      const newStatus = hasConfig ? 'connected' : 'configuration_required';
      const { error } = await api.integrations.updateStatus(accountId!, intg.id, newStatus);
      if (error) { showToast(error, 'error'); return; }
      showToast(hasConfig ? `${intg.type} connected` : `${intg.type} needs configuration`, hasConfig ? 'success' : 'warn');
    } catch {
      showToast('Connection test failed', 'error');
    } finally {
      setTesting(null);
      loadIntegrations();
    }
  }

  return (
    <div>
      <p className="eyebrow">Configuration</p>
      <h1 className="page-title">Settings &amp; Integrations</h1>
      <p className="page-desc">Manage external service connections and account configuration.</p>

      <div className="glass-card-static" style={{ padding: 20, marginBottom: 24 }}>
        <h4 style={{ fontWeight: 700, marginBottom: 12 }}>Platform Status</h4>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.6 }}>Database: </span>
            <span className="badge" style={{
              background: supabaseConfigured ? '#10B98118' : '#F59E0B18',
              color: supabaseConfigured ? '#10B981' : '#F59E0B',
            }}>
              {supabaseConfigured ? 'Connected' : 'Not Configured'}
            </span>
          </div>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.6 }}>Account: </span>
            <span style={{ fontSize: 13 }}>{account?.name || 'Unknown'}</span>
          </div>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.6 }}>User: </span>
            <span style={{ fontSize: 13 }}>{user ? (user.name || user.email) : 'Not signed in'}</span>
          </div>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.6 }}>Account ID: </span>
            <span style={{ fontSize: 13, fontFamily: 'monospace' }}>{accountId || 'N/A'}</span>
          </div>
        </div>
      </div>

      <h3 style={{ fontWeight: 700, marginBottom: 12 }}>Integrations</h3>

      {loading ? (
        <div className="empty-state"><p>Loading integrations...</p></div>
      ) : integrations.length === 0 ? (
        <div className="empty-state">
          <p>No integrations configured for this account.</p>
          <p style={{ marginTop: 8, opacity: 0.7 }}>Integrations are set up per-account in the database.</p>
        </div>
      ) : (
        <div className="grid grid-2">
          {integrations.map((intg) => {
            const statusColor = STATUS_COLORS[intg.status] || '#9CA3AF';
            return (
              <div className="glass-card-static" key={intg.id} style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <h3 style={{ fontWeight: 700, fontSize: 15 }}>{intg.type}</h3>
                  <span className="badge" style={{ background: statusColor + '18', color: statusColor, fontWeight: 600 }}>
                    {intg.status}
                  </span>
                </div>

                {intg.provider && (
                  <div style={{ fontSize: 13, marginBottom: 6 }}><strong>Provider:</strong> {intg.provider}</div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openConfig(intg)}>Configure</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => testConnection(intg)} disabled={testing === intg.id}>
                    {testing === intg.id ? 'Testing...' : 'Test'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isFeedbackAdmin && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ fontWeight: 700 }}>
              Feedback inbox
              {feedbacks.length > 0 && (
                <span style={{ marginLeft: 8, fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>({feedbacks.length})</span>
              )}
            </h3>
            <button className="btn btn-ghost btn-sm" onClick={loadFeedback} disabled={feedbackLoading}>
              {feedbackLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: -6, marginBottom: 12 }}>
            Only visible to <strong>{MASTER_ADMIN_EMAIL}</strong> in Admin view. Each row shows who sent the message and what account/page they were on.
          </p>

          {feedbackError ? (
            <div className="empty-state" style={{ color: '#DC2626' }}>{feedbackError}</div>
          ) : feedbackLoading ? (
            <div className="empty-state"><p>Loading feedback…</p></div>
          ) : feedbacks.length === 0 ? (
            <div className="empty-state"><p>No feedback yet. When users submit from the Feedback button, it will show up here.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {feedbacks.map((f) => {
                const isOpen = expandedFeedback === f.id;
                const when = new Date(f.created_at);
                const whenLabel = when.toLocaleString();
                return (
                  <div key={f.id} className="glass-card-static" style={{ padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                            {f.sender_name ? `${f.sender_name} ` : ''}
                            <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>&lt;{f.sender_email}&gt;</span>
                          </span>
                          {f.account_label && <span className="badge" style={{ fontSize: '0.65rem' }}>{f.account_label}</span>}
                          {f.page && <span className="badge" style={{ fontSize: '0.65rem', background: '#6366F118', color: '#6366F1' }}>{f.page}</span>}
                          {!f.delivered && <span className="badge" style={{ fontSize: '0.65rem', background: '#DC262618', color: '#DC2626' }}>Email failed</span>}
                        </div>
                        <div
                          style={{
                            fontSize: '0.85rem',
                            lineHeight: 1.55,
                            color: 'var(--text-primary)',
                            whiteSpace: 'pre-wrap',
                            display: isOpen ? 'block' : '-webkit-box',
                            WebkitLineClamp: isOpen ? undefined : 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: isOpen ? 'visible' : 'hidden',
                            wordBreak: 'break-word',
                          }}
                        >
                          {f.message}
                        </div>
                        {!f.delivered && f.deliver_error && isOpen && (
                          <div style={{ marginTop: 8, fontSize: '0.72rem', color: '#DC2626', background: '#DC262612', padding: '6px 8px', borderRadius: 6 }}>
                            Delivery error: {f.deliver_error}
                          </div>
                        )}
                        <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{whenLabel}</span>
                          {f.message.length > 200 && (
                            <button
                              onClick={() => setExpandedFeedback(isOpen ? null : f.id)}
                              style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                            >
                              {isOpen ? 'Show less' : 'Show more'}
                            </button>
                          )}
                          <a
                            href={`mailto:${f.sender_email}?subject=Re:%20your%20feedback`}
                            style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', fontWeight: 600, textDecoration: 'none' }}
                          >
                            Reply
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {configModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setConfigModal(null); }}>
          <div className="glass-modal">
            <h3 style={{ fontWeight: 700, marginBottom: 16 }}>Configure {configModal.type}</h3>

            {Object.entries(configModal.config || {}).length > 0 ? (
              Object.keys(configModal.config).map((key) => (
                <div className="field" key={key} style={{ marginBottom: '0.8rem' }}>
                  <label className="field-label">{key.replace(/_/g, ' ')}</label>
                  <input
                    className="glass-input"
                    type={/key|secret|token|password/i.test(key) ? 'password' : 'text'}
                    value={configValues[key] || ''}
                    onChange={(e) => setConfigValues({ ...configValues, [key]: e.target.value })}
                  />
                </div>
              ))
            ) : (
              <>
                <p style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: 12 }}>
                  This integration has no predefined fields. Enter key/value pairs as JSON.
                </p>
                <div className="field" style={{ marginBottom: '0.8rem' }}>
                  <label className="field-label">Configuration (JSON)</label>
                  <textarea
                    className="glass-textarea"
                    rows={4}
                    placeholder='{"api_key": "your-key"}'
                    value={JSON.stringify(configValues, null, 2)}
                    onChange={(e) => {
                      try { setConfigValues(JSON.parse(e.target.value)); } catch { /* ignore parse errors while typing */ }
                    }}
                  />
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setConfigModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveConfig}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
