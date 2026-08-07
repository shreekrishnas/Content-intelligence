import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount } from '@/contexts/AccountContext';
import { api } from '@/lib/api';
import { showToast } from '@/lib/toast';
import type { CalendarPost } from '@/types';

const POST_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  Carousel:      { bg: '#6366F118', color: '#6366F1' },
  'Static Image':{ bg: '#0EA5E918', color: '#0EA5E9' },
  Reel:          { bg: '#F59E0B18', color: '#F59E0B' },
  Poll:          { bg: '#10B98118', color: '#10B981' },
};

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', weekday: 'short' });
  } catch { return iso; }
}

function formatMonth(ym: string) {
  try {
    const [y, m] = ym.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  } catch { return ym; }
}

type EditingCell = { id: string; field: keyof CalendarPost } | null;

export default function AICalendarPage() {
  const { accountId } = useAccount();
  const [month, setMonth] = useState(getCurrentMonth);
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [meta, setMeta] = useState<{ level: number; kb_chunks_used: number } | null>(null);
  const [context, setContext] = useState('');
  const [postCount, setPostCount] = useState(20);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState('');
  const [existingMonths, setExistingMonths] = useState<string[]>([]);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const loadPosts = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const { data, error } = await api.aiCalendar.list(accountId, month);
    if (error) showToast(error, 'error');
    else setPosts(data || []);
    setLoading(false);
  }, [accountId, month]);

  const loadMonths = useCallback(async () => {
    if (!accountId) return;
    const { data } = await api.aiCalendar.listMonths(accountId);
    if (data) setExistingMonths(data);
  }, [accountId]);

  useEffect(() => { loadPosts(); }, [loadPosts]);
  useEffect(() => { loadMonths(); }, [loadMonths]);

  useEffect(() => {
    if (editingCell && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingCell]);

  async function handleGenerate() {
    if (!accountId) return;
    setGenerating(true);
    setLoadingMsg('Retrieving knowledge base…');
    const t = setTimeout(() => setLoadingMsg('Generating content calendar with AI…'), 2500);
    const { data, error } = await api.aiCalendar.generate({ accountId, month, context, postCount });
    clearTimeout(t);
    setGenerating(false);
    if (error) { showToast(error, 'error'); return; }
    setPosts(data!.posts);
    setMeta({ level: data!.meta.level, kb_chunks_used: data!.meta.kb_chunks_used });
    setExistingMonths((prev) => [...new Set([month, ...prev])]);
    showToast(`Generated ${data!.posts.length} posts (Level ${data!.meta.level}, ${data!.meta.kb_chunks_used} KB chunks used)`);
  }

  async function handleDeleteMonth() {
    if (!accountId || !posts.length) return;
    if (!confirm(`Delete all ${posts.length} posts for ${formatMonth(month)}?`)) return;
    const { error } = await api.aiCalendar.deleteMonth(accountId, month);
    if (error) { showToast(error, 'error'); return; }
    setPosts([]);
    setMeta(null);
    setExistingMonths((prev) => prev.filter((m) => m !== month));
    showToast('Calendar deleted');
  }

  function startEdit(post: CalendarPost, field: keyof CalendarPost) {
    const val = post[field];
    setEditValue(Array.isArray(val) ? (val as string[]).join('\n') : String(val ?? ''));
    setEditingCell({ id: post.id, field });
  }

  async function commitEdit(post: CalendarPost) {
    if (!accountId || !editingCell) return;
    const { field } = editingCell;
    let newVal: any = editValue;
    if (field === 'body_points' || field === 'hashtags') {
      newVal = editValue.split('\n').map((s) => s.trim()).filter(Boolean);
    }
    setEditingCell(null);
    const patch: any = { [field]: newVal };
    const { error } = await api.aiCalendar.update(accountId, post.id, patch);
    if (error) { showToast(error, 'error'); return; }
    setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, [field]: newVal } : p));
  }

  function exportCSV() {
    if (!posts.length) return;
    const headers = ['Date', 'Pillar', 'Post Type', 'Title', 'Hook', 'Body Points', 'CTA', 'Hashtags', 'Status'];
    const rows = posts.map((p) => [
      p.post_date,
      p.pillar,
      p.post_type,
      p.title,
      p.hook || '',
      (p.body_points || []).join(' | '),
      p.cta || '',
      (p.hashtags || []).join(' '),
      p.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calendar-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported');
  }

  const isEditing = (id: string, field: keyof CalendarPost) =>
    editingCell?.id === id && editingCell?.field === field;

  function EditableCell({
    post,
    field,
    multiline = false,
    style,
  }: {
    post: CalendarPost;
    field: keyof CalendarPost;
    multiline?: boolean;
    style?: React.CSSProperties;
  }) {
    const val = post[field];
    const display = Array.isArray(val) ? (val as string[]).join('\n') : String(val ?? '');

    if (isEditing(post.id, field)) {
      return (
        <textarea
          ref={editRef}
          className="glass-input"
          value={editValue}
          rows={multiline ? 4 : 2}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => commitEdit(post)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditingCell(null);
            if (e.key === 'Enter' && !multiline) { e.preventDefault(); commitEdit(post); }
          }}
          style={{ width: '100%', minWidth: 160, fontSize: 12, ...style }}
        />
      );
    }

    return (
      <div
        onClick={() => startEdit(post, field)}
        title="Click to edit"
        style={{
          cursor: 'text',
          padding: '4px 6px',
          borderRadius: 4,
          minHeight: 28,
          fontSize: 12,
          whiteSpace: 'pre-line',
          lineHeight: 1.4,
          border: '1px solid transparent',
          ...style,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}
      >
        {display || <span style={{ opacity: 0.35, fontStyle: 'italic' }}>—</span>}
      </div>
    );
  }

  if (loading && posts.length === 0) {
    return (
      <div>
        <p className="eyebrow">Content</p>
        <h1 className="page-title">AI Content Calendar</h1>
        <div className="empty-state"><p>Loading…</p></div>
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow">Content</p>
      <h1 className="page-title">AI Content Calendar</h1>
      <p className="page-desc">
        Generate a full month of social media posts grounded in your knowledge base. Click any cell to edit.
      </p>

      {/* Controls */}
      <div className="glass-card-static" style={{ padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Month</label>
            <input
              type="month"
              className="glass-input"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={{ minWidth: 160 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Posts</label>
            <select
              className="glass-input"
              value={postCount}
              onChange={(e) => setPostCount(Number(e.target.value))}
              style={{ minWidth: 90 }}
            >
              {[10, 15, 20, 25, 30].map((n) => (
                <option key={n} value={n}>{n} posts</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Focus (optional)</label>
            <input
              type="text"
              className="glass-input"
              placeholder="e.g. budget season, NRI tax filing deadline…"
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={generating}
            style={{ height: 38, whiteSpace: 'nowrap' }}
          >
            {generating ? loadingMsg || 'Generating…' : posts.length > 0 ? 'Regenerate' : 'Generate Calendar'}
          </button>
          {posts.length > 0 && (
            <>
              <button className="btn btn-secondary" onClick={exportCSV} style={{ height: 38 }}>
                Export CSV
              </button>
              <button className="btn btn-ghost btn-sm" onClick={handleDeleteMonth} style={{ height: 38, color: '#EF4444' }}>
                Delete
              </button>
            </>
          )}
        </div>

        {/* Existing month shortcuts */}
        {existingMonths.length > 1 && (
          <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, opacity: 0.5 }}>Saved:</span>
            {existingMonths.map((m) => (
              <button
                key={m}
                className="badge"
                style={{ cursor: 'pointer', background: m === month ? 'var(--brand)' : undefined, color: m === month ? '#fff' : undefined }}
                onClick={() => setMonth(m)}
              >
                {formatMonth(m)}
              </button>
            ))}
          </div>
        )}

        {/* Meta info */}
        {meta && (
          <div style={{ marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, opacity: 0.7 }}>
            <span>Level {meta.level} depth</span>
            <span>{meta.kb_chunks_used} KB chunks used for RAG grounding</span>
            <span>{posts.length} posts</span>
          </div>
        )}
      </div>

      {/* Post type legend */}
      {posts.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {Object.entries(POST_TYPE_COLORS).map(([type, { bg, color }]) => {
            const n = posts.filter((p) => p.post_type === type).length;
            return (
              <span key={type} className="badge" style={{ background: bg, color }}>
                {type} ({n})
              </span>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {posts.length === 0 && !generating && (
        <div className="empty-state">
          <p>
            No calendar generated for {formatMonth(month)} yet. Click <strong>Generate Calendar</strong> to create posts grounded in your knowledge base.
          </p>
        </div>
      )}

      {/* Generating state */}
      {generating && (
        <div className="empty-state">
          <p>{loadingMsg || 'Starting…'}</p>
        </div>
      )}

      {/* Posts table */}
      {posts.length > 0 && !generating && (
        <div style={{ overflowX: 'auto' }}>
          <div className="glass-card-static" style={{ padding: 0, minWidth: 900 }}>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '90px 140px 110px 1fr 160px 180px 160px 80px',
              padding: '8px 12px',
              borderBottom: '1px solid var(--border)',
              fontSize: 11,
              opacity: 0.55,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              gap: 8,
            }}>
              <span>Date</span>
              <span>Pillar</span>
              <span>Type</span>
              <span>Title</span>
              <span>Hook</span>
              <span>Body Points</span>
              <span>CTA</span>
              <span>Status</span>
            </div>

            {posts.map((post, i) => {
              const typeColor = POST_TYPE_COLORS[post.post_type] || POST_TYPE_COLORS['Static Image'];
              return (
                <div
                  key={post.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '90px 140px 110px 1fr 160px 180px 160px 80px',
                    padding: '8px 12px',
                    borderBottom: i < posts.length - 1 ? '1px solid var(--border)' : undefined,
                    alignItems: 'start',
                    gap: 8,
                  }}
                >
                  {/* Date */}
                  <div style={{ fontSize: 11, paddingTop: 6, whiteSpace: 'nowrap', opacity: 0.8 }}>
                    {formatDate(post.post_date)}
                  </div>

                  {/* Pillar */}
                  <EditableCell post={post} field="pillar" />

                  {/* Post type */}
                  <div>
                    <span className="badge" style={{ background: typeColor.bg, color: typeColor.color, fontSize: 10 }}>
                      {post.post_type}
                    </span>
                  </div>

                  {/* Title */}
                  <EditableCell post={post} field="title" style={{ fontWeight: 600 }} />

                  {/* Hook */}
                  <EditableCell post={post} field="hook" multiline />

                  {/* Body points */}
                  <EditableCell post={post} field="body_points" multiline />

                  {/* CTA */}
                  <EditableCell post={post} field="cta" />

                  {/* Status */}
                  <div>
                    <button
                      className="badge"
                      style={{
                        cursor: 'pointer',
                        background: post.status === 'approved' ? '#10B98120' : undefined,
                        color: post.status === 'approved' ? '#10B981' : undefined,
                        border: 'none',
                        fontSize: 10,
                      }}
                      onClick={async () => {
                        if (!accountId) return;
                        const next = post.status === 'approved' ? 'draft' : 'approved';
                        const { error } = await api.aiCalendar.update(accountId, post.id, { status: next });
                        if (error) { showToast(error, 'error'); return; }
                        setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, status: next } : p));
                      }}
                    >
                      {post.status === 'approved' ? 'Approved' : 'Draft'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hashtag row for approved posts */}
      {posts.some((p) => p.status === 'approved') && (
        <div className="glass-card-static" style={{ padding: '12px 20px', marginTop: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Approved posts — hashtags</p>
          {posts.filter((p) => p.status === 'approved').map((p) => (
            <div key={p.id} style={{ marginBottom: 6, fontSize: 12 }}>
              <span style={{ opacity: 0.6 }}>{formatDate(p.post_date)}</span>
              {' · '}
              <span style={{ color: 'var(--brand)' }}>{(p.hashtags || []).join(' ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
