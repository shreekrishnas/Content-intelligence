import { useState, useEffect, useCallback } from 'react';
import { useAccount } from '@/contexts/AccountContext';
import { api } from '@/lib/api';
import { auditLog } from '@/lib/audit';
import type { CalendarItem } from '@/types';

function showToast(msg: string, kind: 'success' | 'error' | 'warn' = 'success') {
  const el = document.createElement('div');
  el.className = 'toast';
  const color = kind === 'error' ? '#DC2626' : kind === 'warn' ? '#F59E0B' : '#10B981';
  el.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>${msg}`;
  const root = document.getElementById('toastRoot');
  if (root) root.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s ease'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3200);
}

type StatusFilter = 'all' | 'scheduled' | 'published' | 'cancelled';

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  scheduled: { bg: '#0EA5E918', color: '#0EA5E9', label: 'Scheduled' },
  published: { bg: '#6366F118', color: '#6366F1', label: 'Published' },
  cancelled: { bg: '#9CA3AF18', color: '#9CA3AF', label: 'Cancelled' },
};

export default function CalendarPage() {
  const { accountId } = useAccount();
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');

  const loadItems = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const { data } = await api.calendar.list(accountId);
    setItems(data || []);
    setLoading(false);
  }, [accountId]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const filtered = items
    .filter((e) => statusFilter === 'all' || e.status === statusFilter)
    .sort((a, b) => {
      if (a.scheduled_for && b.scheduled_for) return new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime();
      if (a.scheduled_for) return -1;
      if (b.scheduled_for) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const counts = { all: items.length, scheduled: 0, published: 0, cancelled: 0 };
  items.forEach((e) => {
    if (e.status in counts) (counts as any)[e.status]++;
  });

  async function handleSchedule(id: string) {
    if (!scheduleDate) { showToast('Pick a date first', 'warn'); return; }
    const { error } = await api.calendar.schedule(id, scheduleDate);
    if (error) { showToast(error, 'error'); return; }

    await auditLog({
      accountId: accountId!,
      action: 'schedule',
      targetType: 'calendar_item',
      targetId: id,
      detail: { scheduled_for: scheduleDate },
    });

    setScheduleId(null);
    setScheduleDate('');
    showToast('Content scheduled');
    loadItems();
  }

  async function handleExport(item: CalendarItem) {
    const { data, error } = await api.calendar.export(item.id);
    if (error) { showToast(error, 'error'); return; }

    const blob = new Blob([data!], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(item.title || 'content').replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported');
  }

  if (loading) {
    return (
      <div>
        <p className="eyebrow">Publishing</p>
        <h1 className="page-title">Content Calendar</h1>
        <div className="empty-state"><p>Loading...</p></div>
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow">Publishing</p>
      <h1 className="page-title">Content Calendar</h1>
      <p className="page-desc">Approved content ready for scheduling and publishing.</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {(['all', 'scheduled', 'published', 'cancelled'] as StatusFilter[]).map((s) => (
          <button
            key={s}
            className="badge"
            style={{ cursor: 'pointer', background: statusFilter === s ? 'var(--brand)' : undefined, color: statusFilter === s ? '#fff' : undefined }}
            onClick={() => setStatusFilter(s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)} ({counts[s]})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <p>{items.length === 0 ? 'No calendar items yet. Approve drafts in Studio to populate the calendar.' : `No ${statusFilter} content.`}</p>
        </div>
      ) : (
        <div className="glass-card-static" style={{ padding: 0 }}>
          {filtered.map((item, i) => {
            const badge = STATUS_BADGE[item.status] || STATUS_BADGE.scheduled;
            return (
              <div key={item.id}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
                    borderBottom: i < filtered.length - 1 && scheduleId !== item.id ? '1px solid var(--border)' : undefined,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <p style={{ fontWeight: 600, fontSize: 14 }}>{item.title || 'Untitled'}</p>
                    <p style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                      {item.format || 'N/A'}
                      {item.scheduled_for && ` · ${new Date(item.scheduled_for).toLocaleString()}`}
                    </p>
                  </div>

                  <span className="badge" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>

                  <button className="btn btn-secondary btn-sm" onClick={() => handleExport(item)}>Export</button>

                  {item.status === 'scheduled' && !item.scheduled_for && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => { setScheduleId(scheduleId === item.id ? null : item.id); setScheduleDate(''); }}
                    >
                      Set Date
                    </button>
                  )}
                </div>

                {scheduleId === item.id && (
                  <div style={{
                    padding: '12px 20px', background: 'var(--surface-card)',
                    borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : undefined,
                    display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
                  }}>
                    <input
                      type="datetime-local"
                      className="glass-input"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      style={{ flex: 1, minWidth: 200 }}
                    />
                    <button className="btn btn-primary btn-sm" onClick={() => handleSchedule(item.id)}>Confirm</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setScheduleId(null)}>Cancel</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
