interface Props {
  open: boolean;
  onClose: () => void;
}

const NOTIFS = [
  { title: 'Draft ready for review', desc: 'Quality score 94% — ready for your approval', time: '8m ago', color: '#7C3AED' },
  { title: 'New strong trend detected', desc: 'Score 75 — optical retail service shift', time: '2h ago', color: '#10B981' },
  { title: 'Integration reminder', desc: "HubSpot isn't connected — lead sync is paused", time: '1d ago', color: '#F59E0B' },
];

export default function NotificationsDrawer({ open, onClose }: Props) {
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
          <div style={{ fontWeight: 800, fontSize: '.9rem' }}>Notifications</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '.72rem' }}>Mark all read</button>
            <button className="btn-icon" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="18" height="18">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="drawer-body" style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
          {NOTIFS.map((n, i) => (
            <div key={i} className="glass-card-static" style={{ padding: '.85rem', cursor: 'pointer' }}>
              <div style={{ display: 'flex', gap: '.6rem' }}>
                <span className="dot" style={{ background: n.color, marginTop: '.45rem', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '.82rem', fontWeight: 700 }}>{n.title}</div>
                  <div style={{ fontSize: '.76rem', color: 'var(--text-muted)', marginTop: '.15rem' }}>{n.desc}</div>
                  <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: '.3rem' }}>{n.time}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
