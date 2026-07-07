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

export default function CalendarPage() {
  const calendar = useAppStore((s) => s.calendar);
  const [viewEntry, setViewEntry] = useState<CalendarEntry | null>(null);

  const sorted = [...calendar].sort((a, b) => b.approvedAt - a.approvedAt);

  function handleExport(entry: CalendarEntry) {
    const text = [
      `Title: ${entry.title}`,
      `Format: ${entry.format}`,
      `Approved: ${new Date(entry.approvedAt).toLocaleDateString()}`,
      '',
      '---',
      '',
      entry.draft,
    ].join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${entry.title.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported as .txt');
  }

  return (
    <div>
      <p className="eyebrow">Publishing</p>
      <h1 className="page-title">Content Calendar</h1>
      <p className="page-desc">Approved content ready for scheduling and publishing.</p>

      {sorted.length === 0 ? (
        <div className="empty-state">
          <p>No approved content yet.</p>
          <p style={{ marginTop: 8, opacity: 0.7 }}>Approve drafts in the Studio to populate the calendar.</p>
        </div>
      ) : (
        <div className="glass-card-static" style={{ padding: 0 }}>
          {sorted.map((entry, i) => (
            <div
              key={entry.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
                borderBottom: i < sorted.length - 1 ? '1px solid var(--border)' : undefined,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: 180 }}>
                <p style={{ fontWeight: 600, fontSize: 14 }}>{entry.title}</p>
                <p style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                  {entry.format} &middot; {new Date(entry.approvedAt).toLocaleDateString()}
                </p>
              </div>

              <span className="badge" style={{ background: '#10B98118', color: '#10B981' }}>Approved</span>

              <button className="btn btn-ghost btn-sm" onClick={() => setViewEntry(entry)}>View</button>
              <button className="btn btn-secondary btn-sm" onClick={() => handleExport(entry)}>Export .txt</button>
            </div>
          ))}
        </div>
      )}

      {/* View Modal */}
      {viewEntry && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setViewEntry(null); }}>
          <div className="glass-modal">
            <h3 style={{ fontWeight: 700, marginBottom: 4 }}>{viewEntry.title}</h3>
            <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 16 }}>
              {viewEntry.format} &middot; Approved {new Date(viewEntry.approvedAt).toLocaleDateString()}
            </p>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}>{viewEntry.draft}</pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setViewEntry(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
