import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { showToast } from '@/lib/toast';

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  td_role: string | null;
  is_org_admin: boolean;
  accounts: Array<{ id: string; name: string; role: string }>;
}

interface ClientAccount {
  id: string;
  name: string;
  status: string;
  created_at: string;
  members: Array<{ email: string; name: string | null; role: string; td_role: string | null }>;
}

interface TrendReadiness {
  id: string;
  name: string;
  status: string;
  websiteUrl: string;
  hasProfile: boolean;
  trendRecords: number;
  kbFiles: number;
}

const ROLE_BADGE: Record<string, { label: string; color: string }> = {
  td_management: { label: 'TD Management', color: '#8B5CF6' },
  pod_head:      { label: 'Pod Head',       color: '#2563EB' },
  manager:       { label: 'Manager',        color: '#059669' },
  executive:     { label: 'Executive',      color: '#D97706' },
  designer:      { label: 'Designer',       color: '#DB2777' },
  intern:        { label: 'Intern',         color: '#6B7280' },
};

const ACCESS_BADGE: Record<string, { label: string; color: string }> = {
  manager: { label: 'Manager', color: '#059669' },
  editor:  { label: 'Editor',  color: '#2563EB' },
  viewer:  { label: 'Viewer',  color: '#6B7280' },
};

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 20,
      fontSize: '0.65rem',
      fontWeight: 700,
      letterSpacing: '0.04em',
      background: color + '22',
      color,
      border: `1px solid ${color}44`,
      whiteSpace: 'nowrap',
    }}>
      {text}
    </span>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState<'team' | 'accounts' | 'trends'>('team');
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [accounts, setAccountsList] = useState<ClientAccount[]>([]);
  const [trendStatus, setTrendStatus] = useState<TrendReadiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);

    // Fetch all users with their account access
    const { data: users } = await supabase
      .from('users')
      .select('id, name, email, td_role, is_org_admin')
      .order('email');

    // Fetch all account_access joined to accounts and users
    const { data: accessRows } = await supabase
      .from('account_access')
      .select('user_id, role, accounts(id, name, status), users(email, name, td_role)');

    // Fetch all accounts (including trend_profile for the Trend Setup tab)
    const { data: allAccounts } = await supabase
      .from('accounts')
      .select('id, name, status, created_at, profile')
      .order('name');

    const accountIds = (allAccounts || []).map((a: any) => a.id);

    // Trend record + KB file counts, batched per table (no per-account round trips)
    const [{ data: trendCountRows }, { data: kbCountRows }] = await Promise.all([
      supabase.from('trend_records').select('account_id').in('account_id', accountIds),
      supabase.from('knowledge_files').select('account_id').eq('active', true).eq('ingest_status', 'ready').in('account_id', accountIds),
    ]);
    const trendCounts: Record<string, number> = {};
    for (const r of trendCountRows || []) trendCounts[r.account_id] = (trendCounts[r.account_id] || 0) + 1;
    const kbCounts: Record<string, number> = {};
    for (const r of kbCountRows || []) kbCounts[r.account_id] = (kbCounts[r.account_id] || 0) + 1;

    // Build team list
    const accessByUser: Record<string, Array<{ id: string; name: string; role: string }>> = {};
    for (const row of accessRows || []) {
      const uid = row.user_id;
      if (!accessByUser[uid]) accessByUser[uid] = [];
      const acc = row.accounts as any;
      if (acc) {
        accessByUser[uid].push({ id: acc.id, name: acc.name, role: row.role });
      }
    }

    const teamList: TeamMember[] = (users || []).map((u: any) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      td_role: u.td_role,
      is_org_admin: u.is_org_admin,
      accounts: (accessByUser[u.id] || []).sort((a, b) => a.name.localeCompare(b.name)),
    }));

    // Build accounts list
    const accessByAccount: Record<string, Array<{ email: string; name: string | null; role: string; td_role: string | null }>> = {};
    for (const row of accessRows || []) {
      const acc = row.accounts as any;
      if (!acc) continue;
      if (!accessByAccount[acc.id]) accessByAccount[acc.id] = [];
      const u = row.users as any;
      if (u) {
        accessByAccount[acc.id].push({ email: u.email, name: u.name, role: row.role, td_role: u.td_role });
      }
    }

    const accountsList: ClientAccount[] = (allAccounts || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      created_at: a.created_at,
      members: (accessByAccount[a.id] || []).sort((a, b) => a.email.localeCompare(b.email)),
    }));

    // Build trend-readiness list
    const trendList: TrendReadiness[] = (allAccounts || []).map((a: any) => {
      const tp = a.profile?.trend_profile || {};
      return {
        id: a.id,
        name: a.name,
        status: a.status,
        websiteUrl: tp.website_url || '',
        hasProfile: !!(tp.core_topics || tp.industry),
        trendRecords: trendCounts[a.id] || 0,
        kbFiles: kbCounts[a.id] || 0,
      };
    });

    setTeam(teamList);
    setAccountsList(accountsList);
    setTrendStatus(trendList);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filteredTeam = team.filter(m =>
    !search ||
    m.email.toLowerCase().includes(search.toLowerCase()) ||
    (m.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (m.td_role || '').toLowerCase().includes(search.toLowerCase())
  );

  const filteredAccounts = accounts.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredTrendStatus = trendStatus.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: '0 2px', height: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Admin Panel</h2>
              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {team.length} team members · {accounts.length} client accounts
              </p>
            </div>
          </div>
        </div>

        <input
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '7px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--surface-card)',
            color: 'var(--text-primary)',
            fontSize: '0.8rem',
            outline: 'none',
            width: 200,
          }}
        />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {(['team', 'accounts', 'trends'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setSearch(''); }}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              color: tab === t ? 'var(--accent-primary)' : 'var(--text-muted)',
              fontWeight: tab === t ? 700 : 400,
              fontSize: '0.82rem',
              cursor: 'pointer',
              borderBottom: tab === t ? '2px solid var(--accent-primary)' : '2px solid transparent',
              marginBottom: -1,
              transition: 'all 0.15s',
              textTransform: 'capitalize',
            }}
          >
            {t === 'team' ? `Team (${team.length})` : t === 'accounts' ? `Accounts (${accounts.length})` : `Trend Setup (${trendStatus.filter(t => !t.hasProfile).length} pending)`}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="empty-state"><p>Loading…</p></div>
      ) : tab === 'team' ? (
        <TeamTab members={filteredTeam} />
      ) : tab === 'accounts' ? (
        <AccountsTab accounts={filteredAccounts} />
      ) : (
        <TrendSetupTab accounts={filteredTrendStatus} onChanged={loadAll} />
      )}
    </div>
  );
}

function TeamTab({ members }: { members: TeamMember[] }) {
  if (!members.length) return <div className="empty-state"><p>No members found.</p></div>;

  // Group by td_role for organized display
  const groups: Record<string, TeamMember[]> = {};
  const order = ['td_management', 'pod_head', 'manager', 'executive', 'designer', 'intern'];
  for (const m of members) {
    const key = m.td_role || 'other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {order
        .filter(role => groups[role]?.length)
        .map(role => (
          <div key={role}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
              fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--text-muted)',
            }}>
              <Badge text={ROLE_BADGE[role]?.label || role} color={ROLE_BADGE[role]?.color || '#6B7280'} />
              <span>{groups[role].length} member{groups[role].length > 1 ? 's' : ''}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {groups[role].map(m => (
                <MemberCard key={m.id} member={m} />
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

function MemberCard({ member: m }: { member: TeamMember }) {
  const [expanded, setExpanded] = useState(false);
  const initials = (m.name || m.email).slice(0, 2).toUpperCase();
  const rb = ROLE_BADGE[m.td_role || ''];

  return (
    <div style={{
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '12px 14px',
      cursor: m.accounts.length > 0 ? 'pointer' : 'default',
    }}
      onClick={() => m.accounts.length > 0 && setExpanded(!expanded)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: (rb?.color || '#6B7280') + '22',
          color: rb?.color || '#6B7280',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.72rem', fontWeight: 700, flexShrink: 0,
        }}>{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.83rem', color: 'var(--text-primary)' }}>
            {m.name || m.email.split('@')[0]}
            {m.is_org_admin && (
              <span style={{ marginLeft: 6, fontSize: '0.62rem', color: '#8B5CF6', fontWeight: 700 }}>ADMIN</span>
            )}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{m.email}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {rb && <Badge text={rb.label} color={rb.color} />}
          {m.accounts.length > 0 && (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {m.accounts.length} account{m.accounts.length > 1 ? 's' : ''}
            </span>
          )}
          {m.accounts.length > 0 && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: 'var(--text-muted)', transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
          {m.accounts.length === 0 && m.is_org_admin && (
            <span style={{ fontSize: '0.7rem', color: '#8B5CF6' }}>All accounts</span>
          )}
        </div>
      </div>

      {expanded && m.accounts.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {m.accounts.map(a => (
            <span key={a.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 6,
              background: 'var(--surface-hover)',
              border: '1px solid var(--border)',
              fontSize: '0.72rem', color: 'var(--text-secondary)',
            }}>
              {a.name}
              <span style={{ color: ACCESS_BADGE[a.role]?.color || '#6B7280', fontWeight: 700, fontSize: '0.62rem' }}>
                {ACCESS_BADGE[a.role]?.label || a.role}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountsTab({ accounts }: { accounts: ClientAccount[] }) {
  if (!accounts.length) return <div className="empty-state"><p>No accounts found.</p></div>;

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10, alignContent: 'start' }}>
      {accounts.map(a => (
        <AccountCard key={a.id} account={a} />
      ))}
    </div>
  );
}

function AccountCard({ account: a }: { account: ClientAccount }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '12px 14px',
      cursor: a.members.length > 0 ? 'pointer' : 'default',
    }}
      onClick={() => a.members.length > 0 && setExpanded(!expanded)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.83rem', color: 'var(--text-primary)', lineHeight: 1.3 }}>{a.name}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
            {a.members.length} team member{a.members.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            padding: '2px 7px', borderRadius: 20, fontSize: '0.62rem', fontWeight: 700,
            background: a.status === 'active' ? '#05966920' : '#6B728020',
            color: a.status === 'active' ? '#059669' : '#6B7280',
            border: `1px solid ${a.status === 'active' ? '#05966940' : '#6B728040'}`,
          }}>
            {a.status}
          </span>
          {a.members.length > 0 && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: 'var(--text-muted)', transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </div>
      </div>

      {expanded && a.members.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {a.members.map(m => {
            const rb = ROLE_BADGE[m.td_role || ''];
            const ab = ACCESS_BADGE[m.role];
            return (
              <div key={m.email} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: (rb?.color || '#6B7280') + '22',
                  color: rb?.color || '#6B7280',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.58rem', fontWeight: 700, flexShrink: 0,
                }}>
                  {(m.name || m.email).slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.name || m.email.split('@')[0]}
                  </div>
                </div>
                {rb && <Badge text={rb.label} color={rb.color} />}
                {ab && <Badge text={ab.label} color={ab.color} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Trend Setup — bulk-seed each account's trend_profile from a website URL.
// Runs the same auto-detect + save path TrendsPage uses on first open, so an
// admin can backfill accounts as URLs come in instead of waiting on the full
// mapping file, or for owners to individually visit the Trends tab.
// --------------------------------------------------------------------------

function TrendSetupTab({ accounts, onChanged }: { accounts: TrendReadiness[]; onChanged: () => void }) {
  if (!accounts.length) return <div className="empty-state"><p>No accounts found.</p></div>;

  const pending = accounts.filter(a => !a.hasProfile);
  const ready = accounts.filter(a => a.hasProfile);

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Trends & Ideas Lab are already scoped per account — each account's trend profile (industry, topics,
        keywords) drives what gets searched and how relevance is scored, so nothing crosses over. The profile
        just has to exist. Paste a website URL below to auto-detect and save it — same detection TrendsPage runs
        on first open, done here in bulk as URLs come in.
      </div>

      {pending.length > 0 && (
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
            fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'var(--text-muted)',
          }}>
            <Badge text="Needs setup" color="#F59E0B" />
            <span>{pending.length} account{pending.length > 1 ? 's' : ''}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pending.map(a => <TrendSetupRow key={a.id} account={a} onChanged={onChanged} />)}
          </div>
        </div>
      )}

      {ready.length > 0 && (
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
            fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'var(--text-muted)',
          }}>
            <Badge text="Ready" color="#059669" />
            <span>{ready.length} account{ready.length > 1 ? 's' : ''}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ready.map(a => <TrendSetupRow key={a.id} account={a} onChanged={onChanged} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function TrendSetupRow({ account: a, onChanged }: { account: TrendReadiness; onChanged: () => void }) {
  const [url, setUrl] = useState(a.websiteUrl);
  const [busy, setBusy] = useState(false);

  async function detectAndSave() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const detected = await api.trends.autoDetectProfile(url.trim(), a.name);
      if (detected.error || !detected.data) {
        showToast(`${a.name}: detection failed — ${detected.error || 'no data returned'}`, 'error');
        return;
      }
      const nextProfile = {
        enabled: true,
        max_recommendations: 8,
        business_name: a.name,
        ...detected.data,
        website_url: url.trim(),
      };
      const saved = await api.trends.saveProfile(a.id, nextProfile as any);
      if (saved.error) {
        showToast(`${a.name}: save failed — ${saved.error}`, 'error');
        return;
      }
      showToast(`${a.name}: trend profile saved`);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 160, flex: '0 0 auto' }}>
        <div style={{ fontWeight: 600, fontSize: '0.83rem', color: 'var(--text-primary)' }}>{a.name}</div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8 }}>
          <span>{a.trendRecords} trend{a.trendRecords !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>{a.kbFiles} KB file{a.kbFiles !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <input
        placeholder="https://example.com"
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && url.trim() && !busy) detectAndSave(); }}
        style={{
          flex: '1 1 200px',
          minWidth: 160,
          padding: '6px 10px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--surface-hover)',
          color: 'var(--text-primary)',
          fontSize: '0.78rem',
          outline: 'none',
        }}
      />

      <button
        onClick={detectAndSave}
        disabled={busy || !url.trim()}
        style={{
          padding: '6px 14px',
          borderRadius: 8,
          border: 'none',
          background: busy || !url.trim() ? 'var(--surface-hover)' : '#6366F1',
          color: busy || !url.trim() ? 'var(--text-muted)' : '#fff',
          fontSize: '0.76rem',
          fontWeight: 700,
          cursor: busy || !url.trim() ? 'not-allowed' : 'pointer',
          flexShrink: 0,
        }}
      >
        {busy ? 'Detecting…' : a.hasProfile ? 'Re-detect' : 'Detect & Save'}
      </button>

      {a.hasProfile && <Badge text="Profile saved" color="#059669" />}
    </div>
  );
}
