import { useState, useEffect, useCallback } from 'react';
import EmptyState from '@/components/ui/EmptyState';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { useAppStore } from '@/store';
import { useAccount } from '@/contexts/AccountContext';
import { api } from '@/lib/api';
import { auditLog } from '@/lib/audit';
import type { Opportunity } from '@/types';
import { showToast } from '@/lib/toast';


const PRIORITY_COLORS: Record<string, string> = {
  high: '#DC2626',
  medium: '#F59E0B',
  standard: '#0EA5E9',
  low: '#9CA3AF',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  open: { bg: '#10B98118', color: '#10B981' },
  in_studio: { bg: '#6366F118', color: '#6366F1' },
  dropped: { bg: '#9CA3AF18', color: '#9CA3AF' },
};

export default function OpportunitiesPage() {
  const { accountId } = useAccount();
  const setActiveStudioOpp = useAppStore((s) => s.setActiveStudioOpp);
  const setStudioAsset = useAppStore((s) => s.setStudioAsset);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [confirmDropAll, setConfirmDropAll] = useState(false);
  const [droppingAll, setDroppingAll] = useState(false);

  const loadOpps = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const { data } = await api.opportunities.list(accountId);
    setOpportunities(data || []);
    setLoading(false);
  }, [accountId]);

  useEffect(() => { loadOpps(); }, [loadOpps]);

  const filtered = opportunities.filter((o) => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    return true;
  });

  async function handleSendToStudio(opp: Opportunity) {
    const { error } = await api.opportunities.updateStatus(accountId!, opp.id, 'in_studio');
    if (error) { showToast(error, 'error'); return; }

    await auditLog({
      accountId: accountId!,
      action: 'send_to_studio',
      targetType: 'opportunity',
      targetId: opp.id,
    });

    setActiveStudioOpp(opp.id);
    setStudioAsset(null);
    setActiveTab('studio');
    showToast('Opportunity sent to Studio');
    loadOpps();
  }

  async function handleDrop(opp: Opportunity) {
    const { error } = await api.opportunities.updateStatus(accountId!, opp.id, 'dropped');
    if (error) { showToast(error, 'error'); return; }
    showToast('Opportunity dropped');
    loadOpps();
  }

  async function handleReopen(opp: Opportunity) {
    const { error } = await api.opportunities.updateStatus(accountId!, opp.id, 'open');
    if (error) { showToast(error, 'error'); return; }
    showToast('Opportunity reopened');
    loadOpps();
  }

  function handleOpenInStudio(opp: Opportunity) {
    setActiveStudioOpp(opp.id);
    setStudioAsset(null);
    setActiveTab('studio');
  }

  async function handleDropAll() {
    if (!accountId || droppingAll) return;
    setDroppingAll(true);
    const { data: count, error } = await api.opportunities.dropAllOpen(accountId);
    setDroppingAll(false);
    setConfirmDropAll(false);
    if (error) { showToast(error, 'error'); return; }
    auditLog({ accountId, action: 'drop_all_opportunities', targetType: 'opportunity', detail: { count } }).catch(() => {});
    showToast(`Dropped ${count} open opportunit${count === 1 ? 'y' : 'ies'}`);
    loadOpps();
  }

  if (loading) {
    return (
      <div>
        <p className="eyebrow">Content Pipeline</p>
        <h1 className="page-title">Opportunities</h1>
        <div className="grid grid-3" style={{ marginTop: 16 }}>
          {[1,2,3,4,5,6].map(i => <CardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  const openCount = opportunities.filter((o) => o.status === 'open').length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <p className="eyebrow">Content Pipeline</p>
          <h1 className="page-title">Opportunities</h1>
          <p className="page-desc">Content opportunities surfaced from analyses. Filter, review, and send to Studio.</p>
        </div>
        {openCount > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ flexShrink: 0, color: '#DC2626', border: '1px solid #DC262640' }}
            onClick={() => setConfirmDropAll(true)}
          >
            Drop all
          </button>
        )}
      </div>

      {confirmDropAll && (
        <div className="modal-overlay" onClick={() => !droppingAll && setConfirmDropAll(false)}>
          <div className="glass-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '0.6rem', fontFamily: 'Fraunces, Georgia, serif' }}>
              Drop all open opportunities?
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              This will mark all <strong>{openCount}</strong> open opportunit{openCount === 1 ? 'y' : 'ies'} as dropped.
            </p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1.2rem' }}>
              Nothing is deleted - dropped items stay under the &ldquo;Dropped&rdquo; filter and can be reopened one by one. Items already in Studio are not touched.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDropAll(false)} disabled={droppingAll}>Cancel</button>
              <button
                className="btn btn-sm"
                style={{ background: '#DC2626', color: '#fff', fontWeight: 700 }}
                onClick={handleDropAll}
                disabled={droppingAll}
              >
                {droppingAll ? 'Dropping…' : `Drop ${openCount} opportunit${openCount === 1 ? 'y' : 'ies'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          { key: 'all', label: `All (${opportunities.length})` },
          { key: 'open', label: `Open (${opportunities.filter((o) => o.status === 'open').length})` },
          { key: 'in_studio', label: `In Studio (${opportunities.filter((o) => o.status === 'in_studio').length})` },
          { key: 'dropped', label: `Dropped (${opportunities.filter((o) => o.status === 'dropped').length})` },
        ].map((f) => (
          <button
            key={f.key}
            className="badge"
            style={{ cursor: 'pointer', background: statusFilter === f.key ? 'var(--brand)' : undefined, color: statusFilter === f.key ? '#fff' : undefined }}
            onClick={() => setStatusFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="opportunities"
          title={opportunities.length === 0 ? 'No opportunities yet' : 'No matches'}
          description={opportunities.length === 0 ? 'Run an analysis to generate content opportunities from your sources.' : 'No opportunities match the current filter. Try adjusting or clearing it.'}
        />
      ) : (
        <div className="grid grid-3">
          {filtered.map((opp) => {
            const pc = PRIORITY_COLORS[opp.priority || 'standard'] || '#9CA3AF';
            const sc = STATUS_COLORS[opp.status] || STATUS_COLORS.open;
            return (
              <div className="glass-card-static" key={opp.id} style={{ padding: 20 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {opp.priority && (
                    <span className="badge" style={{ background: pc + '18', color: pc, fontWeight: 600 }}>
                      {opp.priority}
                    </span>
                  )}
                  <span className="badge" style={{ background: sc.bg, color: sc.color }}>
                    {opp.status.replace('_', ' ')}
                  </span>
                </div>

                <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{opp.title}</h3>

                {opp.persona_name && (
                  <p style={{ fontSize: 13, opacity: 0.75, marginBottom: 4 }}>
                    {opp.persona_name}
                    {opp.persona_relevance_score != null && ` - relevance ${opp.persona_relevance_score}`}
                  </p>
                )}

                {opp.content_angle && <p style={{ fontSize: 13, marginBottom: 10 }}>{opp.content_angle}</p>}

                <div className="hairline" />

                {opp.format && (
                  <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}><strong>Format:</strong> {opp.format}</p>
                )}
                {opp.recommendation_reason && (
                  <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>{opp.recommendation_reason}</p>
                )}

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {opp.status === 'open' && (
                    <>
                      <button className="btn btn-primary btn-sm" onClick={() => handleSendToStudio(opp)}>
                        Send to Studio &rarr;
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDrop(opp)}>
                        Drop
                      </button>
                    </>
                  )}
                  {opp.status === 'in_studio' && (
                    <button className="btn btn-secondary btn-sm" onClick={() => handleOpenInStudio(opp)}>
                      Open in Studio &rarr;
                    </button>
                  )}
                  {opp.status === 'dropped' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => handleReopen(opp)}>
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
