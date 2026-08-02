import { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';
import { retrieve } from '@/lib/retrieval';

type Turn =
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string;
      grounded?: boolean;
      sources?: Array<{ n: number; file_name: string; category: string }>;
      mode?: string;
      error?: boolean;
    };

interface AskKBProps {
  accountId: string | null;
  accountName?: string;
  /** Storage key suffix so history is naturally per-account. */
  storageKey?: string;
}

// ---------------------------------------------------------------------------
// A short-form Q&A box grounded in the current account's Knowledge Base.
// Retrieval runs client-side through the shared hybrid pipeline (semantic
// + keyword + fallback chain, RLS-enforced), so this widget is guaranteed
// to only see the active account's data. Different account -> different KB
// -> different answer, using the same code path Studio/Analyze use.
// ---------------------------------------------------------------------------
export default function AskKB({ accountId, accountName, storageKey }: AskKBProps) {
  const lsKey = `askkb_history_${storageKey || accountId || 'none'}`;
  const [turns, setTurns] = useState<Turn[]>(() => {
    if (typeof window === 'undefined' || !accountId) return [];
    try {
      const raw = localStorage.getItem(lsKey);
      return raw ? JSON.parse(raw) as Turn[] : [];
    } catch { return []; }
  });
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Persist per-account history so switching accounts and coming back
  // keeps its own conversation.
  useEffect(() => {
    try { localStorage.setItem(lsKey, JSON.stringify(turns.slice(-20))); } catch { /* quota */ }
  }, [turns, lsKey]);

  // Reset the box completely when the account switches.
  useEffect(() => {
    try {
      const raw = accountId ? localStorage.getItem(`askkb_history_${storageKey || accountId}`) : null;
      setTurns(raw ? JSON.parse(raw) as Turn[] : []);
    } catch { setTurns([]); }
    setQuestion('');
  }, [accountId, storageKey]);

  // Scroll to bottom on new turn.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns.length, busy]);

  async function ask() {
    const q = question.trim();
    if (!q || busy || !accountId) return;

    const historyForModel = turns
      .filter((t) => !('error' in t) || !t.error)
      .map((t) => ({ role: t.role, content: t.content }));

    setTurns((prev) => [...prev, { role: 'user', content: q }]);
    setQuestion('');
    setBusy(true);

    try {
      // The same retrieval every other feature uses. It is account_id
      // scoped and RLS-enforced -nothing from another account can leak.
      const result = await retrieve(accountId, q, 'kb_ask');

      if (result.refused) {
        setTurns((prev) => [...prev, {
          role: 'assistant',
          content: result.reason || "I don't have anything about that in this account's Knowledge Base. Upload a relevant document and ask again.",
          grounded: false,
          sources: [],
          mode: result.retrievalMode,
        }]);
        return;
      }

      const chunks = result.chunks.map((c) => ({
        file_name: c.file_name,
        category: c.category,
        chunk_text: c.chunk_text,
        similarity: c.similarity,
      }));
      const constraintChunks = result.constraintChunks.slice(0, 20).map((c) => ({
        file_name: c.file_name,
        category: c.category,
        chunk_text: c.chunk_text,
      }));

      const { data, error } = await api.kb.ask({
        question: q,
        chunks,
        constraintChunks,
        history: historyForModel,
      });
      if (error || !data) {
        setTurns((prev) => [...prev, {
          role: 'assistant',
          content: error || 'The assistant failed to respond. Please try again.',
          error: true,
        }]);
        return;
      }

      setTurns((prev) => [...prev, {
        role: 'assistant',
        content: data.answer,
        grounded: data.grounded,
        sources: data.sources,
        mode: result.retrievalMode,
      }]);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask();
    }
  }

  function clear() {
    setTurns([]);
    try { localStorage.removeItem(lsKey); } catch { /* ignore */ }
  }

  const disabled = !accountId || busy;

  return (
    <div className="glass-card-static" style={{ padding: '1.1rem 1.2rem', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: '0.94rem', fontWeight: 800, fontFamily: 'Fraunces, Georgia, serif' }}>
            Ask this Knowledge Base
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Grounded answers from {accountName ? <strong>{accountName}</strong> : 'the active account'}'s uploaded files only -no cross-account bleed, no invented facts.
          </div>
        </div>
        {turns.length > 0 && (
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem' }} onClick={clear}>Clear</button>
        )}
      </div>

      {turns.length > 0 && (
        <div
          ref={listRef}
          style={{
            maxHeight: 320, overflowY: 'auto', padding: '0.5rem 0.2rem',
            display: 'flex', flexDirection: 'column', gap: 10,
            borderTop: '1px solid var(--border-subtle)',
            borderBottom: '1px solid var(--border-subtle)',
            marginBottom: 10,
          }}
        >
          {turns.map((t, i) => (
            <TurnBubble key={i} turn={t} />
          ))}
          {busy && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '0.4rem 0.6rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span className="spin-dot" /> Searching your KB…
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          className="glass-textarea"
          rows={2}
          style={{ flex: 1, minHeight: 44, resize: 'vertical' }}
          placeholder={accountId ? 'Ask a question about this account\'s knowledge -e.g. "What products do we recommend for NRIs?"' : 'Pick an account first.'}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
        />
        <button
          className="btn btn-primary"
          style={{ flexShrink: 0 }}
          onClick={ask}
          disabled={disabled || !question.trim()}
        >
          {busy ? 'Asking…' : 'Ask'}
        </button>
      </div>
      <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 6 }}>
        Enter to send · Shift+Enter for a new line
      </div>
    </div>
  );
}

function TurnBubble({ turn }: { turn: Turn }) {
  if (turn.role === 'user') {
    return (
      <div style={{ alignSelf: 'flex-end', maxWidth: '82%', background: 'var(--accent-primary-soft)', color: 'var(--text-primary)', padding: '0.5rem 0.75rem', borderRadius: 12, fontSize: '0.82rem', lineHeight: 1.5 }}>
        {turn.content}
      </div>
    );
  }
  const isError = turn.error;
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '92%' }}>
      <div style={{
        background: isError ? '#DC262614' : 'var(--surface-card)',
        border: `1px solid ${isError ? '#DC262640' : 'var(--border-subtle)'}`,
        color: isError ? '#DC2626' : 'var(--text-primary)',
        padding: '0.6rem 0.85rem', borderRadius: 12,
        fontSize: '0.84rem', lineHeight: 1.55,
        whiteSpace: 'pre-wrap',
      }}>
        {turn.content}
      </div>
      {turn.sources && turn.sources.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4, fontSize: '0.66rem' }}>
          <span style={{ color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sources:</span>
          {turn.sources.map((s) => (
            <span key={s.n} className="badge" style={{ fontSize: '0.62rem' }}>
              [{s.n}] {s.file_name} <span style={{ opacity: 0.65 }}>· {s.category}</span>
            </span>
          ))}
        </div>
      )}
      {turn.mode && !isError && (
        <div style={{ marginTop: 4, fontSize: '0.62rem', color: 'var(--text-muted)', opacity: 0.7 }}>
          {turn.mode === 'long_context' ? 'Full KB context' : `Retrieval: ${turn.mode}`}
        </div>
      )}
      {turn.grounded === false && !isError && (
        <div style={{ marginTop: 4, fontSize: '0.64rem', color: '#F59E0B' }}>
          No passages cited -answer may be low confidence. Consider uploading more relevant files.
        </div>
      )}
    </div>
  );
}
