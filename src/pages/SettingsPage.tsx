import { useState, useEffect, useCallback } from 'react';
import { useAccount } from '@/contexts/AccountContext';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
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
  const { account, accountId } = useAccount();
  const user = useAuthStore((s) => s.user);

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [configModal, setConfigModal] = useState<Integration | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);

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
