import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store';
import { useAccount } from '@/contexts/AccountContext';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { Opportunity, CalendarItem } from '@/types';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
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

function weekLabel(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface KpiData {
  openOpps: number;
  inStudio: number;
  scheduledThisWeek: number;
  avgQuality: number | null;
  loaded: boolean;
}

interface PipelineItem {
  label: string;
  count: number;
  color: string;
}

interface ActivityItem {
  title: string;
  desc: string;
  time: string;
  color: string;
}

interface TrendMini {
  title: string;
  score: number;
}

interface ChartWeek {
  label: string;
  count: number;
}

function buildChartPoints(weeks: ChartWeek[], svgW = 560, svgH = 170) {
  if (!weeks.length) return [];
  const maxCount = Math.max(...weeks.map((w) => w.count), 1);
  return weeks.map((w, i) => {
    const x = (i / (weeks.length - 1)) * svgW;
    const y = svgH - (w.count / maxCount) * (svgH - 20) - 10;
    return [x, y];
  });
}

function polyline(pts: number[][]) {
  return pts.map(([x, y]) => `${x},${y}`).join(' ');
}

function areaPath(pts: number[][], svgH = 170) {
  if (!pts.length) return '';
  const [first] = pts;
  const last = pts[pts.length - 1];
  return `M${polyline(pts)} L${last[0]},${svgH} L${first[0]},${svgH} Z`;
}

function buildVelocityBuckets(calItems: CalendarItem[], range: '8w' | '3m' | '1y'): ChartWeek[] {
  const weeks = range === '8w' ? 8 : range === '3m' ? 13 : 52;
  const buckets: ChartWeek[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    buckets.push({ label: weekLabel(d), count: 0 });
  }
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeks * 7);
  for (const c of calItems) {
    if (c.status !== 'published' || !c.scheduled_for) continue;
    const d = new Date(c.scheduled_for);
    if (d < cutoff) continue;
    const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
    const bucketIdx = weeks - 1 - Math.floor(diffDays / 7);
    if (bucketIdx >= 0 && bucketIdx < weeks) buckets[bucketIdx].count++;
  }
  return buckets;
}

export default function OverviewPage() {
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const { account, accountId } = useAccount();
  const user = useAuthStore((s) => s.user);

  const [kpi, setKpi] = useState<KpiData>({
    openOpps: 0, inStudio: 0, scheduledThisWeek: 0, avgQuality: null, loaded: false,
  });
  const [pipeline, setPipeline] = useState<PipelineItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [trends, setTrends] = useState<TrendMini[]>([]);
  const [chartWeeks, setChartWeeks] = useState<ChartWeek[]>([]);
  const [chartRange, setChartRange] = useState<'8w' | '3m' | '1y'>('8w');
  const [calCache, setCalCache] = useState<CalendarItem[]>([]);

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  const fetchData = useCallback(async (aid: string) => {
    const [oppsResult, calResult, trendResult, assetResult] = await Promise.all([
      api.opportunities.list(aid),
      supabase
        .from('calendar_items')
        .select('*')
        .eq('account_id', aid)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('trend_records')
        .select('topic, domain_relevance_score')
        .eq('account_id', aid)
        .eq('classification', 'domain_trend')
        .order('domain_relevance_score', { ascending: false })
        .limit(3),
      supabase
        .from('assets')
        .select('quality, created_at')
        .eq('account_id', aid)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    const opps: Opportunity[] = oppsResult.data || [];
    const calItems: CalendarItem[] = (calResult.data as CalendarItem[]) || [];
    const trendRecords: Array<{ topic: string; domain_relevance_score: number }> = trendResult.data || [];
    const assets: Array<{ quality: Record<string, any>; created_at: string }> = assetResult.data || [];

    // KPIs
    const openOpps = opps.filter((o) => o.status === 'open').length;
    const inStudio = opps.filter((o) => o.status === 'in_studio').length;

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const scheduledThisWeek = calItems.filter((c) => {
      if (!c.scheduled_for) return false;
      const d = new Date(c.scheduled_for);
      return d >= weekStart && d < weekEnd && c.status === 'scheduled';
    }).length;

    const qScores: number[] = [];
    for (const a of assets) {
      const q = a.quality as Record<string, any>;
      const score = q?.overall_score ?? q?.score ?? q?.quality_score ?? null;
      if (typeof score === 'number') qScores.push(score);
    }
    const avgQuality = qScores.length
      ? Math.round(qScores.reduce((s, n) => s + n, 0) / qScores.length)
      : null;

    setKpi({ openOpps, inStudio, scheduledThisWeek, avgQuality, loaded: true });

    // Pipeline
    const scheduledCount = calItems.filter((c) => c.status === 'scheduled').length;
    const publishedCount = calItems.filter((c) => c.status === 'published').length;
    const total = openOpps + inStudio + scheduledCount + publishedCount || 1;
    setPipeline([
      { label: 'Open', count: openOpps, color: '#7C3AED' },
      { label: 'In Studio', count: inStudio, color: '#0EA5E9' },
      { label: 'Scheduled', count: scheduledCount, color: '#F59E0B' },
      { label: 'Published', count: publishedCount, color: '#10B981' },
    ]);
    void total;

    // Activity: blend recent opps + calendar items, sort by recency
    const actRaw: Array<{ time: Date; title: string; desc: string; color: string }> = [];
    for (const o of opps.slice(0, 8)) {
      if (o.status === 'open') {
        actRaw.push({ time: new Date(o.created_at), title: 'New opportunity', desc: o.title, color: '#7C3AED' });
      } else if (o.status === 'in_studio') {
        actRaw.push({ time: new Date(o.created_at), title: 'Moved to Studio', desc: o.title, color: '#0EA5E9' });
      }
    }
    for (const c of calItems.slice(0, 8)) {
      if (c.status === 'published') {
        actRaw.push({ time: new Date(c.created_at), title: 'Content published', desc: c.title || c.format || 'Content piece', color: '#10B981' });
      } else if (c.status === 'scheduled') {
        actRaw.push({ time: new Date(c.created_at), title: 'Scheduled for publish', desc: c.title || 'Content piece', color: '#F59E0B' });
      }
    }
    actRaw.sort((a, b) => b.time.getTime() - a.time.getTime());

    const activityItems: ActivityItem[] = actRaw.slice(0, 4).map((item) => ({
      title: item.title,
      desc: item.desc,
      time: formatRelative(item.time),
      color: item.color,
    }));
    if (activityItems.length === 0) {
      activityItems.push({
        title: 'No recent activity',
        desc: 'Start by running an analysis or adding an opportunity.',
        time: '',
        color: '#94a3b8',
      });
    }
    setActivity(activityItems);

    // Trend signals
    setTrends(trendRecords.map((t) => ({ title: t.topic, score: t.domain_relevance_score })));

    // Store cal items for chart range switching
    setCalCache(calItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (accountId) fetchData(accountId);
  }, [accountId, fetchData]);

  // Rebuild chart whenever range or cached data changes
  useEffect(() => {
    setChartWeeks(buildVelocityBuckets(calCache, chartRange));
  }, [chartRange, calCache]);

  const chartPoints = buildChartPoints(chartWeeks);
  const pipelineTotal = pipeline.reduce((s, p) => s + p.count, 0) || 1;

  const kpiCards = [
    {
      label: 'Open Opportunities',
      value: kpi.loaded ? String(kpi.openOpps) : '-',
      meta: kpi.loaded ? `${kpi.openOpps === 1 ? '1 active opportunity' : `${kpi.openOpps} active opportunities`}` : 'Loading...',
      accent: '#7C3AED',
    },
    {
      label: 'In Studio',
      value: kpi.loaded ? String(kpi.inStudio) : '-',
      meta: kpi.loaded ? 'Pieces being drafted' : 'Loading...',
      accent: '#0EA5E9',
    },
    {
      label: 'Scheduled This Week',
      value: kpi.loaded ? String(kpi.scheduledThisWeek) : '-',
      meta: kpi.loaded ? 'Items on calendar' : 'Loading...',
      accent: '#F59E0B',
    },
    {
      label: 'Avg Quality Score',
      value: kpi.loaded ? (kpi.avgQuality !== null ? `${kpi.avgQuality}` : 'N/A') : '-',
      meta: kpi.loaded ? (kpi.avgQuality !== null ? 'Across recent drafts' : 'No scored drafts yet') : 'Loading...',
      accent: '#10B981',
    },
  ];

  return (
    <div className="stagger">
      <div className="eyebrow">COMMAND CENTER</div>
      <div className="page-title">{greeting()}, {firstName}</div>
      <p className="page-desc" style={{ marginBottom: '1.5rem' }}>
        {account?.name ? `${account.name}'s` : 'Your'} content pipeline at a glance - sourced from live analyses, trends, and studio activity.
      </p>

      {/* KPI Grid */}
      <div className="kpi-grid">
        {kpiCards.map((k) => (
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
              <p style={{ fontSize: '.76rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Pieces published, last {chartRange === '8w' ? '8 weeks' : chartRange === '3m' ? '3 months' : '1 year'}
              </p>
            </div>
            <div className="segmented">
              {(['8w', '3m', '1y'] as const).map((r) => (
                <button
                  key={r}
                  className={`seg-chip${chartRange === r ? ' active' : ''}`}
                  onClick={() => setChartRange(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          {chartPoints.length > 1 ? (
            <svg viewBox="0 0 560 170" width="100%" height="170" preserveAspectRatio="none">
              <defs>
                <linearGradient id="overviewAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0" />
                </linearGradient>
              </defs>
              <g stroke="rgba(148,163,184,0.1)" strokeWidth="1">
                {[20, 55, 90, 125, 160].map((y) => (
                  <line key={y} x1="0" y1={y} x2="560" y2={y} />
                ))}
              </g>
              <path d={areaPath(chartPoints)} fill="url(#overviewAreaFill)" />
              <polyline
                points={polyline(chartPoints)}
                fill="none"
                stroke="#0EA5E9"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <g fill="#0EA5E9">
                {chartPoints.map(([x, y], i) => (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r={i === chartPoints.length - 1 ? 4 : 3.5}
                    stroke={i === chartPoints.length - 1 ? '#fff' : undefined}
                    strokeWidth={i === chartPoints.length - 1 ? 2 : undefined}
                  />
                ))}
              </g>
            </svg>
          ) : (
            <div style={{ height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '.82rem' }}>
              No published content in this period
            </div>
          )}
          {chartWeeks.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.68rem', color: 'var(--text-muted)', marginTop: '.3rem' }}>
              <span>{chartWeeks[0]?.label}</span>
              <span>{chartWeeks[Math.floor(chartWeeks.length / 2)]?.label}</span>
              <span>{chartWeeks[chartWeeks.length - 1]?.label}</span>
            </div>
          )}
        </div>

        <div className="glass-card-static" style={{ padding: '1.4rem', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '.95rem', fontWeight: 800, margin: '0 0 .9rem' }}>Pipeline by Stage</h3>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
            <svg width="150" height="150" viewBox="0 0 42 42">
              <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="rgba(148,163,184,.2)" strokeWidth="5" />
              {pipeline.map((p, i) => {
                const pct = Math.round((p.count / pipelineTotal) * 100);
                const offset = -pipeline.slice(0, i).reduce((a, b) => a + Math.round((b.count / pipelineTotal) * 100), 0);
                return (
                  <circle
                    key={p.label}
                    cx="21"
                    cy="21"
                    r="15.9"
                    fill="transparent"
                    stroke={pct > 0 ? p.color : 'none'}
                    strokeWidth="5"
                    strokeDasharray={`${pct} ${100 - pct}`}
                    strokeDashoffset={25 + offset}
                    strokeLinecap="round"
                  />
                );
              })}
              <text x="21" y="19.5" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="var(--text-primary)">
                {pipelineTotal === 1 && pipeline.every((p) => p.count === 0) ? '0' : pipeline.reduce((s, p) => s + p.count, 0)}
              </text>
              <text x="21" y="25.5" textAnchor="middle" fontSize="2.6" fill="var(--text-muted)">total items</text>
            </svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.55rem', fontSize: '.78rem' }}>
            {pipeline.map((p) => (
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
            {activity.length === 0 && !kpi.loaded ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '.82rem', padding: '.5rem 0' }}>Loading...</div>
            ) : (
              activity.map((a, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex', gap: '.75rem', padding: '.7rem 0',
                    borderBottom: i < activity.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  }}
                >
                  <span className="dot" style={{ background: a.color, marginTop: '.4rem', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.83rem', fontWeight: 600, color: 'var(--text-primary)' }}>{a.title}</div>
                    <div style={{ fontSize: '.77rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.desc}</div>
                  </div>
                  {a.time && (
                    <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{a.time}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="glass-card-static" style={{ padding: '1.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '.95rem', fontWeight: 800, margin: 0 }}>Top Trend Signals</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab('trends')}>View all</button>
          </div>
          {!kpi.loaded ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>Loading...</div>
          ) : trends.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>
              No trend signals yet. Run a trend scan to surface relevant topics.
            </div>
          ) : (
            trends.map((t) => (
              <div key={t.title} style={{ marginBottom: '.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', marginBottom: '.3rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                    {t.title}
                  </span>
                  <span className="num" style={{ fontWeight: 700, color: '#7C3AED', flexShrink: 0 }}>{t.score}</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${t.score}%`, background: 'linear-gradient(90deg,#7C3AED,#0EA5E9)' }} />
                </div>
              </div>
            ))
          )}
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
