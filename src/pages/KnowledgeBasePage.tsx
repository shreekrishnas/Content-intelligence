import { useState, useRef } from 'react';
import { useAppStore, type KnowledgeFile } from '@/store';
import { parseFile } from '@/lib/fileParser';
import { chunkText } from '@/lib/chunker';

const uid = (prefix: string) => prefix + '_' + Math.random().toString(36).slice(2, 9);

function showToast(msg: string, kind: 'success' | 'error' | 'warn' = 'success') {
  const el = document.createElement('div');
  el.className = 'toast';
  const color = kind === 'error' ? '#DC2626' : kind === 'warn' ? '#F59E0B' : '#10B981';
  el.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>${msg}`;
  const root = document.getElementById('toastRoot');
  if (root) root.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s ease'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3200);
}

const KB_CATEGORIES = [
  { id: 'persona', label: 'Persona / ICP Files', desc: 'Customer ICP docs, segmentation, interview insights, pain points' },
  { id: 'brand', label: 'Brand Tone of Voice', desc: 'Writing guidelines, approved messaging' },
  { id: 'personaTone', label: 'Persona-Specific Tone', desc: 'Tone documents for individual approved personas' },
  { id: 'expert', label: 'Expert Voice Files', desc: 'Voice of experts — transcripts and writing samples' },
  { id: 'guidelines', label: 'Content & Creative Guidelines', desc: 'Platform rules — LinkedIn, Instagram, blog, carousel, CTA' },
  { id: 'business', label: 'Right Horizons Business Knowledge', desc: 'Services, philosophy, advisory approach' },
  { id: 'compliance', label: 'Compliance / Restrictions', desc: 'Claims that must not be made, disclaimers, legal review rules' },
  { id: 'terminology', label: 'India Financial Terminology', desc: 'Preferred Indian financial terms and approved explanations' },
];

const PRIORITY_COLORS: Record<string, string> = {
  Critical: '#DC2626',
  High: '#F59E0B',
  Standard: '#0EA5E9',
  Low: '#9CA3AF',
};

const ACCEPTED_TYPES = '.pdf,.txt,.md,.docx,.csv';

function categoryLabel(id: string) {
  return KB_CATEGORIES.find((c) => c.id === id)?.label || id;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function KnowledgeBasePage() {
  const kb = useAppStore((s) => s.kb);
  const addKbFile = useAppStore((s) => s.addKbFile);
  const toggleKbActive = useAppStore((s) => s.toggleKbActive);
  const deleteKbFile = useAppStore((s) => s.deleteKbFile);

  const [catFilter, setCatFilter] = useState<string>('all');
  const [showUpload, setShowUpload] = useState(false);
  const [previewFile, setPreviewFile] = useState<KnowledgeFile | null>(null);

  const [uploadName, setUploadName] = useState('');
  const [uploadCat, setUploadCat] = useState('persona');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadPriority, setUploadPriority] = useState('Standard');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = catFilter === 'all' ? kb : kb.filter((f) => f.category === catFilter);

  const catCounts: Record<string, number> = {};
  kb.forEach((f) => { catCounts[f.category] = (catCounts[f.category] || 0) + 1; });

  const readiness = KB_CATEGORIES.map((cat) => ({
    ...cat,
    ready: kb.some((f) => f.category === cat.id && f.active),
  }));

  const brandConflict = kb.filter((f) => f.category === 'brand' && f.active && f.priority === 'Critical').length > 1;

  async function handleUpload() {
    if (!uploadName.trim() && !selectedFile) {
      showToast('File name or file is required', 'warn');
      return;
    }

    setUploading(true);

    try {
      let content = '';
      let fileSize = 0;
      let chunkCount = 0;
      const fileName = selectedFile?.name || uploadName.trim();

      if (selectedFile) {
        fileSize = selectedFile.size;
        content = await parseFile(selectedFile);
        const chunks = chunkText(content);
        chunkCount = chunks.length;
      }

      const newFile: KnowledgeFile = {
        id: uid('kb'),
        fileName,
        category: uploadCat,
        description: uploadDesc.trim(),
        priority: uploadPriority,
        active: true,
        version: 1,
        sample: false,
        uploadedAt: Date.now(),
        content,
        fileSize,
        chunkCount,
      };

      addKbFile(newFile);
      setShowUpload(false);
      setUploadName('');
      setUploadDesc('');
      setUploadPriority('Standard');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      showToast(`File added — ${chunkCount} chunks created`);
    } catch (err: any) {
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
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
          All ({kb.length})
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

      {brandConflict && (
        <div className="glass-card-static" style={{ padding: 16, marginBottom: 16, borderLeft: '3px solid #F59E0B' }}>
          <p style={{ fontSize: 13, color: '#F59E0B' }}>
            Warning: Multiple active Brand Tone files with Critical priority detected. This may cause conflicting guidance.
          </p>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setShowUpload(true)}>Upload File</button>
      </div>

      <div className="glass-card-static" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: 32 }}>
            <p>No files in this category.</p>
          </div>
        ) : (
          filtered.map((file, i) => {
            const pc = PRIORITY_COLORS[file.priority] || '#9CA3AF';
            return (
              <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : undefined, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 20, opacity: 0.5, flexShrink: 0 }}>&#128196;</span>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{file.fileName}</span>
                    <span className="badge" style={{ fontSize: 10 }}>v{file.version}</span>
                    {file.sample && <span className="badge" style={{ fontSize: 10, background: '#0EA5E918', color: '#0EA5E9' }}>Sample</span>}
                    {file.chunkCount != null && file.chunkCount > 0 && (
                      <span className="badge" style={{ fontSize: 10 }}>{file.chunkCount} chunks</span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                    {file.description}
                    {file.fileSize ? ` · ${formatFileSize(file.fileSize)}` : ''}
                  </p>
                </div>
                <span className="badge">{categoryLabel(file.category)}</span>
                <span className="badge" style={{ background: pc + '18', color: pc, fontWeight: 600 }}>{file.priority}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12 }}>
                  <input type="checkbox" checked={file.active} onChange={() => toggleKbActive(file.id)} />
                  Active
                </label>
                <button className="btn btn-ghost btn-sm" onClick={() => setPreviewFile(file)}>Preview</button>
                <button className="btn btn-danger btn-sm" onClick={() => { deleteKbFile(file.id); showToast('File deleted'); }}>Delete</button>
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
                  if (f) {
                    setSelectedFile(f);
                    if (!uploadName) setUploadName(f.name);
                  }
                }}
                style={{ fontSize: 13 }}
              />
              {selectedFile && (
                <p style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                  {selectedFile.name} — {formatFileSize(selectedFile.size)}
                </p>
              )}
            </div>

            <div className="field">
              <label className="field-label">File Name</label>
              <input className="glass-input" placeholder="e.g. RH_New_Persona.pdf" value={uploadName} onChange={(e) => setUploadName(e.target.value)} />
            </div>

            <div className="field">
              <label className="field-label">Category</label>
              <select className="glass-select" value={uploadCat} onChange={(e) => setUploadCat(e.target.value)}>
                {KB_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field-label">Description</label>
              <textarea className="glass-textarea" placeholder="Brief description of this file..." value={uploadDesc} onChange={(e) => setUploadDesc(e.target.value)} />
            </div>

            <div className="field">
              <label className="field-label">Priority</label>
              <select className="glass-select" value={uploadPriority} onChange={(e) => setUploadPriority(e.target.value)}>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Standard">Standard</option>
                <option value="Low">Low</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setShowUpload(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpload} disabled={uploading}>
                {uploading ? 'Processing...' : 'Add File'}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewFile && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPreviewFile(null); }}>
          <div className="glass-modal">
            <h3 style={{ fontWeight: 700, marginBottom: 16 }}>{previewFile.fileName}</h3>

            <div style={{ fontSize: 13, marginBottom: 8 }}><strong>Category:</strong> {categoryLabel(previewFile.category)}</div>
            <div style={{ fontSize: 13, marginBottom: 8 }}><strong>Priority:</strong> {previewFile.priority}</div>
            <div style={{ fontSize: 13, marginBottom: 8 }}><strong>Version:</strong> {previewFile.version}</div>
            <div style={{ fontSize: 13, marginBottom: 8 }}><strong>Active:</strong> {previewFile.active ? 'Yes' : 'No'}</div>
            <div style={{ fontSize: 13, marginBottom: 8 }}><strong>Description:</strong> {previewFile.description}</div>
            {previewFile.chunkCount != null && (
              <div style={{ fontSize: 13, marginBottom: 8 }}><strong>Chunks:</strong> {previewFile.chunkCount}</div>
            )}
            {previewFile.fileSize != null && previewFile.fileSize > 0 && (
              <div style={{ fontSize: 13, marginBottom: 8 }}><strong>Size:</strong> {formatFileSize(previewFile.fileSize)}</div>
            )}
            <div style={{ fontSize: 13, marginBottom: 8 }}><strong>Uploaded:</strong> {new Date(previewFile.uploadedAt).toLocaleDateString()}</div>

            {previewFile.content && (
              <>
                <div className="hairline" />
                <h4 style={{ fontWeight: 700, marginBottom: 8 }}>Content Preview</h4>
                <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', background: 'var(--surface-card)', padding: 12, borderRadius: 8 }}>
                  {previewFile.content.slice(0, 1000)}{previewFile.content.length > 1000 ? '\n\n... (truncated)' : ''}
                </pre>
              </>
            )}

            {previewFile.personaMeta && (
              <>
                <div className="hairline" />
                <h4 style={{ fontWeight: 700, marginBottom: 8 }}>Persona Details</h4>
                <div style={{ fontSize: 13, marginBottom: 6 }}><strong>Name:</strong> {previewFile.personaMeta.name}</div>
                <div style={{ fontSize: 13, marginBottom: 6 }}><strong>Pain Point:</strong> {previewFile.personaMeta.painPoint}</div>
                <div style={{ fontSize: 13, marginBottom: 6 }}><strong>Goal:</strong> {previewFile.personaMeta.goal}</div>
                <div style={{ fontSize: 13, marginBottom: 6 }}><strong>Tone:</strong> {previewFile.personaMeta.tone}</div>
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
