import { useState } from 'react';
import { useAppStore, type CalendarEntry } from '@/store';

function showToast(msg: string, kind: 'success' | 'error' | 'warn' = 'success') {
  const el = document.createElement('div');
  el.className = 'toast';
  const color = kind === 'error' ? '#DC2626' : kind === 'warn' ? '#F59E0B' : '#10B981';
  el.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>${msg}`;
  const root = document.getElementById('toastRoot');
  if (root) root.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s ease'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3200);
}

type StatusFilter = 'all' | 'approved' | 'scheduled' | 'published';

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  approved: { bg: '#10B98118', color: '#10B981', label: 'Approved' },
  scheduled: { bg: '#0EA5E918', color: '#0EA5E9', label: 'Scheduled' },
  published: { bg: '#6366F118', color: '#6366F1', label: 'Published' },
};

function getStatus(entry: CalendarEntry): string {
  if ((entry as any).status === 'published') return 'published';
  if (entry.scheduled) return 'scheduled';
  return 'approved';
}

export default function CalendarPage() {
  const calendar = useAppStore((s) => s.calendar);
  const updateCalendarEntry = useAppStore((s) => s.updateCalendarEntry);
  const deleteCalendarEntry = useAppStore((s) => s.deleteCalendarEntry);

  const [viewEntry, setViewEntry] = useState<CalendarEntry | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');

  const filtered = calendar
    .filter((e) => statusFilter === 'all' || getStatus(e) === statusFilter)
    .sort((a, b) => {
      if (a.scheduled && b.scheduled) return new Date(a.scheduled).getTime() - new Date(b.scheduled).getTime();
      if (a.scheduled) return -1;
      if (b.scheduled) return 1;
      return b.approvedAt - a.approvedAt;
    });

  const counts = { all: calendar.length, approved: 0, scheduled: 0, published: 0 };
  calendar.forEach((e) => {
    const s = getStatus(e);
    if (s === 'approved') counts.approved++;
    else if (s === 'scheduled') counts.scheduled++;
    else if (s === 'published') counts.published++;
  });

  function handleSchedule(id: string) {
    if (!scheduleDate) {
      showToast('Pick a date and time first', 'warn');
      return;
    }
    updateCalendarEntry(id, { scheduled: scheduleDate });
    setScheduleId(null);
    setScheduleDate('');
    showToast('Content scheduled');
  }

  function handleMarkPublished(id: string) {
    updateCalendarEntry(id, { scheduled: calendar.find((c) => c.id === id)?.scheduled ?? new Date().toISOString() } as any);
    const entry = calendar.find((c) => c.id === id);
    if (entry) {
      updateCalendarEntry(id, { ...entry, scheduled: entry.scheduled } as any);
    }
    useAppStore.setState((s) => ({
      calendar: s.calendar.map((c) => c.id === id ? { ...c, status: 'published' } as any : c),
    }));
    showToast('Marked as published');
  }

  function handleCopyContent(entry: CalendarEntry) {
    navigator.clipboard.writeText(entry.draft).then(
      () => showToast('Content copied to clipboard'),
      () => showToast('Copy failed', 'error'),
    );
  }

  function handleExport(entry: CalendarEntry) {
    const status = getStatus(entry);
    const text = [
      `Title: ${entry.title}`,
      `Format: ${entry.format}`,
      `Status: ${status}`,
      `Approved: ${new Date(entry.approvedAt).toLocaleDateString()}`,
      entry.scheduled ? `Scheduled: ${new Date(entry.scheduled).toLocaleString()}` : '',
      '',
      '---',
      '',
      entry.draft,
    ].filter(Boolean).join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${entry.title.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported as .txt');
  }

  function handleDelete(id: string) {
    deleteCalendarEntry(id);
    showToast('Entry removed');
  }

  return (
    <div>
      <p className="eyebrow">Publishing</p>
      <h1 className="page-title">Content Calendar</h1>
      <p className="page-desc">Approved content ready for scheduling and publishing.</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {(['all', 'approved', 'scheduled', 'published'] as StatusFilter[]).map((s) => (
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
          <p>No {statusFilter === 'all' ? 'approved content' : `${statusFilter} content`} yet.</p>
          <p style={{ marginTop: 8, opacity: 0.7 }}>Approve drafts in the Studio to populate the calendar.</p>
        </div>
      ) : (
        <div className="glass-card-static" style={{ padding: 0 }}>
          {filtered.map((entry, i) => {
            const status = getStatus(entry);
            const badge = STATUS_BADGE[status] || STATUS_BADGE.approved;
            return (
              <div key={entry.id}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
                    borderBottom: i < filtered.length - 1 && scheduleId !== entry.id ? '1px solid var(--border)' : undefined,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <p style={{ fontWeight: 600, fontSize: 14 }}>{entry.title}</p>
                    <p style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                      {entry.format} &middot; Approved {new Date(entry.approvedAt).toLocaleDateString()}
                      {entry.scheduled && ` · Scheduled ${new Date(entry.scheduled).toLocaleString()}`}
                    </p>
                  </div>

                  <span className="badge" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>

                  <button className="btn btn-ghost btn-sm" onClick={() => setViewEntry(entry)}>View</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleCopyContent(entry)}>Copy</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleExport(entry)}>Export</button>

                  {status === 'approved' && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => { setScheduleId(scheduleId === entry.id ? null : entry.id); setScheduleDate(''); }}
                    >
                      Schedule
                    </button>
                  )}
                  {status === 'scheduled' && (
                    <button className="btn btn-primary btn-sm" onClick={() => handleMarkPublished(entry.id)}>
                      Mark Published
                    </button>
                  )}
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(entry.id)}>Remove</button>
                </div>

                {scheduleId === entry.id && (
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
                    <button className="btn btn-primary btn-sm" onClick={() => handleSchedule(entry.id)}>Confirm</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setScheduleId(null)}>Cancel</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {viewEntry && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setViewEntry(null); }}>
          <div className="glass-modal">
            <h3 style={{ fontWeight: 700, marginBottom: 4 }}>{viewEntry.title}</h3>
            <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>
              {viewEntry.format} &middot; Approved {new Date(viewEntry.approvedAt).toLocaleDateString()}
            </p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              <span className="badge" style={{ background: STATUS_BADGE[getStatus(viewEntry)].bg, color: STATUS_BADGE[getStatus(viewEntry)].color }}>
                {STATUS_BADGE[getStatus(viewEntry)].label}
              </span>
              {viewEntry.scheduled && (
                <span className="badge">Scheduled: {new Date(viewEntry.scheduled).toLocaleString()}</span>
              )}
            </div>

            {viewEntry.quality && (
              <div style={{ marginBottom: 12 }}>
                <h4 style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Quality</h4>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {Object.entries(viewEntry.quality).map(([k, v]) => {
                    const color = v === 'ok' ? '#10B981' : v === 'fail' ? '#DC2626' : '#F59E0B';
                    return (
                      <span key={k} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                        {k}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="hairline" />
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}>{viewEntry.draft}</pre>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => handleCopyContent(viewEntry)}>Copy</button>
              <button className="btn btn-secondary btn-sm" onClick={() => handleExport(viewEntry)}>Export</button>
              <button className="btn btn-ghost" onClick={() => setViewEntry(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
