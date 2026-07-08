import { useState, useRef, useEffect, useCallback } from 'react';
import { useAccount } from '@/contexts/AccountContext';
import { api } from '@/lib/api';
import { auditLog } from '@/lib/audit';
import type { KnowledgeFile, KnowledgeCategory, Priority } from '@/types';

function showToast(msg: string, kind: 'success' | 'error' | 'warn' = 'success') {
  const el = document.createElement('div');
  el.className = 'toast';
  const color = kind === 'error' ? '#DC2626' : kind === 'warn' ? '#F59E0B' : '#10B981';
  el.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>${msg}`;
  const root = document.getElementById('toastRoot');
  if (root) root.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s ease'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3200);
}

const KB_CATEGORIES: { id: KnowledgeCategory; label: string; desc: string }[] = [
  { id: 'persona', label: 'Persona / ICP Files', desc: 'Customer ICP docs, segmentation, interview insights' },
  { id: 'brand', label: 'Brand Tone of Voice', desc: 'Writing guidelines, approved messaging' },
  { id: 'expert', label: 'Expert Voice Files', desc: 'Voice of experts — transcripts and writing samples' },
  { id: 'guidelines', label: 'Content & Creative Guidelines', desc: 'Platform rules — LinkedIn, Instagram, blog' },
  { id: 'compliance', label: 'Compliance / Restrictions', desc: 'Claims restrictions, disclaimers, legal rules' },
  { id: 'terminology', label: 'Terminology', desc: 'Preferred terms and approved explanations' },
  { id: 'raw_notes', label: 'Raw Notes', desc: 'Unstructured notes and research' },
  { id: 'data', label: 'Data', desc: 'Datasets and statistics' },
  { id: 'idea', label: 'Ideas', desc: 'Content ideas and brainstorms' },
];

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#DC2626',
  high: '#F59E0B',
  standard: '#0EA5E9',
  low: '#9CA3AF',
};

const ACCEPTED_TYPES = '.pdf,.txt,.md,.docx,.csv';

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: '#9CA3AF18', color: '#9CA3AF', label: 'Pending' },
  processing: { bg: '#F59E0B18', color: '#F59E0B', label: 'Processing' },
  ready: { bg: '#10B98118', color: '#10B981', label: 'Ready' },
  failed: { bg: '#DC262618', color: '#DC2626', label: 'Failed' },
};

function categoryLabel(id: string) {
  return KB_CATEGORIES.find((c) => c.id === id)?.label || id;
}

export default function KnowledgeBasePage() {
  const { accountId } = useAccount();
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState<string>('all');
  const [showUpload, setShowUpload] = useState(false);
  const [previewFile, setPreviewFile] = useState<KnowledgeFile | null>(null);

  const [uploadCat, setUploadCat] = useState<KnowledgeCategory>('persona');
  const [uploadPriority, setUploadPriority] = useState<Priority>('standard');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const { data } = await api.kb.list(accountId);
    setFiles(data || []);
    setLoading(false);
  }, [accountId]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const filtered = catFilter === 'all' ? files : files.filter((f) => f.category === catFilter);

  const catCounts: Record<string, number> = {};
  files.forEach((f) => { catCounts[f.category] = (catCounts[f.category] || 0) + 1; });

  const readiness = KB_CATEGORIES.map((cat) => ({
    ...cat,
    ready: files.some((f) => f.category === cat.id && f.active && f.ingest_status === 'ready'),
  }));

  async function handleUpload() {
    if (!selectedFile || !accountId) {
      showToast('Select a file to upload', 'warn');
      return;
    }

    setUploading(true);
    try {
      const { data, error } = await api.kb.upload(accountId, selectedFile, {
        category: uploadCat,
        priority: uploadPriority,
      });

      if (error) throw new Error(error);

      await auditLog({
        accountId,
        action: 'kb_upload',
        targetType: 'knowledge_file',
        targetId: data?.id,
        detail: { file_name: selectedFile.name, category: uploadCat },
      });

      setShowUpload(false);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      showToast('File uploaded successfully');
      loadFiles();
    } catch (err: any) {
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleToggleActive(file: KnowledgeFile) {
    const { error } = await api.kb.toggleActive(file.id, !file.active);
    if (error) { showToast(error, 'error'); return; }
    await auditLog({
      accountId: accountId!,
      action: file.active ? 'kb_deactivate' : 'kb_activate',
      targetType: 'knowledge_file',
      targetId: file.id,
    });
    loadFiles();
  }

  async function handleDelete(file: KnowledgeFile) {
    const { error } = await api.kb.delete(file.id);
    if (error) { showToast(error, 'error'); return; }
    await auditLog({
      accountId: accountId!,
      action: 'kb_delete',
      targetType: 'knowledge_file',
      targetId: file.id,
      detail: { file_name: file.file_name },
    });
    showToast('File deleted');
    loadFiles();
  }

  if (loading) {
    return (
      <div>
        <p className="eyebrow">Knowledge Management</p>
        <h1 className="page-title">Knowledge Base</h1>
        <div className="empty-state"><p>Loading...</p></div>
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow">Knowledge Management</p>
      <h1 className="page-title">Knowledge Base</h1>
      <p className="page-desc">Manage the files that ground every piece of content the agent creates.</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button
          className="badge"
          style={{ cursor: 'pointer', background: catFilter === 'all' ? 'var(--brand)' : undefined, color: catFilter === 'all' ? '#fff' : undefined }}
          onClick={() => setCatFilter('all')}
        >
          All ({files.length})
        </button>
        {KB_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className="badge"
            style={{ cursor: 'pointer', background: catFilter === cat.id ? 'var(--brand)' : undefined, color: catFilter === cat.id ? '#fff' : undefined }}
            onClick={() => setCatFilter(cat.id)}
          >
            {cat.label} ({catCounts[cat.id] || 0})
          </button>
        ))}
      </div>

      <div className="glass-card-static" style={{ padding: 20, marginBottom: 20 }}>
        <h4 style={{ fontWeight: 700, marginBottom: 12 }}>Agent Readiness</h4>
        <div className="grid grid-4">
          {readiness.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: r.ready ? '#10B981' : '#F59E0B' }} />
              <span style={{ fontSize: 13 }}>{r.label}</span>
              <span style={{ fontSize: 11, opacity: 0.5 }}>{r.ready ? 'Ready' : 'Missing'}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setShowUpload(true)}>Upload File</button>
      </div>

      <div className="glass-card-static" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: 32 }}>
            <p>{files.length === 0 ? 'No knowledge files yet. Upload files to get started.' : 'No files in this category.'}</p>
          </div>
        ) : (
          filtered.map((file, i) => {
            const pc = PRIORITY_COLORS[file.priority] || '#9CA3AF';
            const sc = STATUS_COLORS[file.ingest_status] || STATUS_COLORS.pending;
            return (
              <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : undefined, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 20, opacity: 0.5, flexShrink: 0 }}>&#128196;</span>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{file.file_name}</span>
                    <span className="badge" style={{ fontSize: 10 }}>v{file.version}</span>
                    <span className="badge" style={{ fontSize: 10, background: sc.bg, color: sc.color }}>{sc.label}</span>
                  </div>
                  <p style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                    {new Date(file.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="badge">{categoryLabel(file.category)}</span>
                <span className="badge" style={{ background: pc + '18', color: pc, fontWeight: 600 }}>{file.priority}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12 }}>
                  <input type="checkbox" checked={file.active} onChange={() => handleToggleActive(file)} />
                  Active
                </label>
                <button className="btn btn-ghost btn-sm" onClick={() => setPreviewFile(file)}>Details</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(file)}>Delete</button>
              </div>
            );
          })
        )}
      </div>

      {showUpload && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowUpload(false); }}>
          <div className="glass-modal">
            <h3 style={{ fontWeight: 700, marginBottom: 16 }}>Upload Knowledge File</h3>

            <div className="field" style={{ marginBottom: '0.8rem' }}>
              <label className="field-label">Select File</label>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setSelectedFile(f);
                }}
                style={{ fontSize: 13 }}
              />
              {selectedFile && (
                <p style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>{selectedFile.name}</p>
              )}
            </div>

            <div className="field">
              <label className="field-label">Category</label>
              <select className="glass-select" value={uploadCat} onChange={(e) => setUploadCat(e.target.value as KnowledgeCategory)}>
                {KB_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field-label">Priority</label>
              <select className="glass-select" value={uploadPriority} onChange={(e) => setUploadPriority(e.target.value as Priority)}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="standard">Standard</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setShowUpload(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpload} disabled={uploading || !selectedFile}>
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewFile && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPreviewFile(null); }}>
          <div className="glass-modal">
            <h3 style={{ fontWeight: 700, marginBottom: 16 }}>{previewFile.file_name}</h3>

            <div style={{ fontSize: 13, marginBottom: 8 }}><strong>Category:</strong> {categoryLabel(previewFile.category)}</div>
            <div style={{ fontSize: 13, marginBottom: 8 }}><strong>Priority:</strong> {previewFile.priority}</div>
            <div style={{ fontSize: 13, marginBottom: 8 }}><strong>Version:</strong> {previewFile.version}</div>
            <div style={{ fontSize: 13, marginBottom: 8 }}><strong>Active:</strong> {previewFile.active ? 'Yes' : 'No'}</div>
            <div style={{ fontSize: 13, marginBottom: 8 }}><strong>Status:</strong> {previewFile.ingest_status}</div>
            <div style={{ fontSize: 13, marginBottom: 8 }}><strong>Source:</strong> {previewFile.source_type}</div>
            <div style={{ fontSize: 13, marginBottom: 8 }}><strong>Created:</strong> {new Date(previewFile.created_at).toLocaleDateString()}</div>

            {previewFile.structured && Object.keys(previewFile.structured).length > 0 && (
              <>
                <div className="hairline" />
                <h4 style={{ fontWeight: 700, marginBottom: 8 }}>Structured Data</h4>
                <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', background: 'var(--surface-card)', padding: 12, borderRadius: 8 }}>
                  {JSON.stringify(previewFile.structured, null, 2)}
                </pre>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setPreviewFile(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
