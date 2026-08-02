import { useAppStore } from '@/store';
import { useAccount } from '@/contexts/AccountContext';
import { useAuthStore } from '@/stores/authStore';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const KPI_CARDS = [
  { label: 'Open Opportunities', value: '—', meta: 'Loading…', accent: '#7C3AED' },
  { label: 'In Studio', value: '—', meta: 'Loading…', accent: '#0EA5E9' },
  { label: 'Scheduled This Week', value: '—', meta: 'Loading…', accent: '#F59E0B' },
  { label: 'Avg Quality Score', value: '—', meta: 'Loading…', accent: '#10B981' },
];

const ACTIVITY = [
  { title: 'Draft approved', desc: 'Content moved to Calendar', time: '12m ago', color: '#10B981' },
  { title: 'New opportunity', desc: 'Surfaced from latest analysis', time: '1h ago', color: '#7C3AED' },
  { title: 'Trend actioned', desc: 'Signal sent to Ideas Lab', time: '3h ago', color: '#0EA5E9' },
  { title: 'Quality review complete', desc: '2 claims re-sourced in draft', time: 'Yesterday', color: '#F59E0B' },
];

const TREND_MINI = [
  { title: 'HOYA Sensei Innovation event series', score: 79 },
  { title: 'Optical retail service shift', score: 75 },
  { title: 'Presbyopia telehealth screening rise', score: 68 },
];

const PIPELINE = [
  { label: 'Open', count: 9, color: '#7C3AED', pct: 36 },
  { label: 'In Studio', count: 5, color: '#0EA5E9', pct: 20 },
  { label: 'Scheduled', count: 6, color: '#F59E0B', pct: 24 },
  { label: 'Published', count: 5, color: '#10B981', pct: 20 },
];

const CHART_POINTS = [
  [0, 150], [80, 130], [160, 140], [240, 90],
  [320, 100], [400, 55], [480, 70], [560, 30],
];

function polyline(pts: number[][]) {
  return pts.map(([x, y]) => `${x},${y}`).join(' ');
}

function areaPath(pts: number[][]) {
  const [first] = pts;
  const last = pts[pts.length - 1];
  return `M${polyline(pts)} L${last[0]},190 L${first[0]},190 Z`;
}

export default function OverviewPage() {
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const { account } = useAccount();
  const user = useAuthStore((s) => s.user);

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  return (
    <div className="stagger">
      <div className="eyebrow">COMMAND CENTER</div>
      <div className="page-title">{greeting()}, {firstName}</div>
      <p className="page-desc" style={{ marginBottom: '1.5rem' }}>
        {account?.name ? `${account.name}'s` : 'Your'} content pipeline at a glance — sourced from live analyses, trends, and studio activity.
      </p>

      {/* KPI Grid */}
      <div className="kpi-grid">
        {KPI_CARDS.map((k) => (
          <div key={k.label} className="kpi-card" style={{ '--accent': k.accent } as React.CSSProperties}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: 'var(--text-primary)' }}>{k.value}</div>
            <div className="kpi-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      {/* Row 1: chart + pipeline */}
      <div className="two-col">
        <div className="glass-card-static" style={{ padding: '1.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '.95rem', fontWeight: 800, margin: 0 }}>Content Velocity</h3>
              <p style={{ fontSize: '.76rem', color: 'var(--text-muted)', marginTop: 2 }}>Pieces published, last 8 weeks</p>
            </div>
            <div className="segmented">
              <button className="seg-chip active">8w</button>
              <button className="seg-chip">3m</button>
              <button className="seg-chip">1y</button>
            </div>
          </div>
          <svg viewBox="0 0 560 190" width="100%" height="190" preserveAspectRatio="none">
            <defs>
              <linearGradient id="overviewAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0" />
              </linearGradient>
            </defs>
            <g stroke="rgba(15,23,42,0.06)" strokeWidth="1">
              {[20, 60, 100, 140, 180].map((y) => (
                <line key={y} x1="0" y1={y} x2="560" y2={y} />
              ))}
            </g>
            <path d={areaPath(CHART_POINTS)} fill="url(#overviewAreaFill)" />
            <polyline
              points={polyline(CHART_POINTS)}
              fill="none"
              stroke="#0EA5E9"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <g fill="#0EA5E9">
              {CHART_POINTS.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={i === CHART_POINTS.length - 1 ? 4 : 3.5}
                  stroke={i === CHART_POINTS.length - 1 ? '#fff' : undefined}
                  strokeWidth={i === CHART_POINTS.length - 1 ? 2 : undefined} />
              ))}
            </g>
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.68rem', color: 'var(--text-muted)', marginTop: '.3rem' }}>
            <span>Jun 08</span><span>Jun 22</span><span>Jul 06</span><span>Jul 20</span><span>Aug 02</span>
          </div>
        </div>

        <div className="glass-card-static" style={{ padding: '1.4rem', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '.95rem', fontWeight: 800, margin: '0 0 .9rem' }}>Pipeline by Stage</h3>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
            <svg width="150" height="150" viewBox="0 0 42 42">
              <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="rgba(148,163,184,.2)" strokeWidth="5" />
              {PIPELINE.map((p, i) => {
                const offset = -PIPELINE.slice(0, i).reduce((a, b) => a + b.pct, 0);
                return (
                  <circle key={p.label} cx="21" cy="21" r="15.9" fill="transparent"
                    stroke={p.color} strokeWidth="5"
                    strokeDasharray={`${p.pct} ${100 - p.pct}`}
                    strokeDashoffset={25 + offset}
                    strokeLinecap="round" />
                );
              })}
              <text x="21" y="19.5" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="var(--text-primary)">25</text>
              <text x="21" y="25.5" textAnchor="middle" fontSize="2.6" fill="var(--text-muted)">total items</text>
            </svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.55rem', fontSize: '.78rem' }}>
            {PIPELINE.map((p) => (
              <div key={p.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                  <span className="dot" style={{ background: p.color }} />
                  {p.label}
                </span>
                <span className="num" style={{ fontWeight: 700 }}>{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: activity + trends */}
      <div className="two-col" style={{ marginTop: '1.5rem' }}>
        <div className="glass-card-static" style={{ padding: '1.4rem' }}>
          <h3 style={{ fontSize: '.95rem', fontWeight: 800, margin: '0 0 1rem' }}>Recent Activity</h3>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {ACTIVITY.map((a, i) => (
              <div key={i} style={{
                display: 'flex', gap: '.75rem', padding: '.7rem 0',
                borderBottom: i < ACTIVITY.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              }}>
                <span className="dot" style={{ background: a.color, marginTop: '.4rem', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '.83rem', fontWeight: 600, color: 'var(--text-primary)' }}>{a.title}</div>
                  <div style={{ fontSize: '.77rem', color: 'var(--text-muted)' }}>{a.desc}</div>
                </div>
                <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{a.time}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card-static" style={{ padding: '1.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '.95rem', fontWeight: 800, margin: 0 }}>Top Trend Signals</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab('trends')}>View all</button>
          </div>
          {TREND_MINI.map((t) => (
            <div key={t.title} style={{ marginBottom: '.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', marginBottom: '.3rem' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.title}</span>
                <span className="num" style={{ fontWeight: 700, color: '#7C3AED' }}>{t.score}</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${t.score}%`, background: 'linear-gradient(90deg,#7C3AED,#0EA5E9)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="glass-card-static" style={{ padding: '1.4rem', marginTop: '1.5rem' }}>
        <h3 style={{ fontSize: '.9rem', fontWeight: 800, margin: '0 0 1rem' }}>Quick Actions</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem' }}>
          {[
            { label: 'New Analysis', tab: 'analyze', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg> },
            { label: 'Ideas Lab', tab: 'ideas', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 3h6M10 3v6.5L5.2 18a1.6 1.6 0 0 0 1.4 2.5h10.8a1.6 1.6 0 0 0 1.4-2.5L14 9.5V3"/></svg> },
            { label: 'View Opportunities', tab: 'opportunities', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2.3h6c0-1.1.4-1.8 1-2.3A7 7 0 0 0 12 2z"/></svg> },
            { label: 'Open Studio', tab: 'studio', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg> },
            { label: 'Check Trends', tab: 'trends', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> },
          ].map(({ label, tab, icon }) => (
            <button key={tab} className="btn btn-secondary" onClick={() => setActiveTab(tab)} style={{ gap: '.4rem' }}>
              {icon} {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
