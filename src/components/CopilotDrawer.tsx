import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useAppStore } from '@/store';
import { useAccount } from '@/contexts/AccountContext';
import { api } from '@/lib/api';
import { retrieve } from '@/lib/retrieval';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

const SUGGESTIONS = [
  'Draft a plan for unscheduled content',
  "Summarise this week's pipeline",
  'Flag any compliance risks in Studio',
];

export default function CopilotDrawer({ open, onClose }: Props) {
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const { account, accountId } = useAccount();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, sending]);

  async function sendMessage(text: string) {
    const q = text.trim();
    if (!q || sending) return;

    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    setInput('');
    setSending(true);

    try {
      const history = messages.slice(-6).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.text,
      }));

      // Try to get KB context; if it fails for any reason, proceed with none.
      let chunks: Array<{ file_name?: string; category?: string; chunk_text?: string; similarity?: number }> = [];
      let constraintChunks: Array<{ file_name?: string; category?: string; chunk_text?: string }> = [];

      if (accountId) {
        try {
          const result = await retrieve(accountId, q, 'kb_ask');
          if (!result.refused) {
            chunks = result.chunks.map((c) => ({
              file_name: c.file_name,
              category: c.category,
              chunk_text: c.chunk_text,
              similarity: c.similarity,
            }));
            constraintChunks = result.constraintChunks.slice(0, 20).map((c) => ({
              file_name: c.file_name,
              category: c.category,
              chunk_text: c.chunk_text,
            }));
          }
        } catch {
          // Retrieval unavailable - proceed with no context
        }
      }

      const { data, error } = await api.kb.ask({ question: q, chunks, constraintChunks, history });

      if (error || !data) {
        setMessages((prev) => [...prev, {
          role: 'assistant',
          text: error || 'Something went wrong. Please try again.',
        }]);
        return;
      }

      setMessages((prev) => [...prev, { role: 'assistant', text: data.answer }]);
    } catch {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        text: 'Network error - please check your connection and try again.',
      }]);
    } finally {
      setSending(false);
    }
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  // Backdrop: plain div, no CSS class (avoids drawer-overlay flex layout conflict)
  const backdrop = open ? (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.35)',
        backdropFilter: 'blur(3px)',
        zIndex: 209,
      }}
    />
  ) : null;

  return (
    <>
      {backdrop}
      <div
        className={`drawer-panel${open ? ' open' : ''}`}
        style={{ zIndex: 210 }}
      >
        {/* Header */}
        <div className="drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
            <div style={{
              width: 34, height: 34, borderRadius: '.7rem',
              background: 'linear-gradient(135deg,#7C3AED,#4F46E5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l1.6 5.2L19 9l-5.4 1.8L12 16l-1.6-5.2L5 9l5.4-1.8L12 2z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '.9rem' }}>AI Copilot</div>
              <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                Grounded in {account?.name || 'your'} knowledge base
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
            {messages.length > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setMessages([])}
                style={{ fontSize: '.72rem' }}
              >
                Clear
              </button>
            )}
            <button className="btn-icon" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="18" height="18">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          ref={bodyRef}
          className="drawer-body"
          style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          {messages.length === 0 ? (
            <>
              <div className="glass-card-static" style={{ padding: '.9rem' }}>
                <p style={{ fontSize: '.83rem', color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>
                  I can help draft plans, surface content gaps, and answer questions - grounded in your Knowledge Base.
                  What would you like help with?
                </p>
              </div>

              <div style={{ fontSize: '.71rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-muted)' }}>
                Quick Actions
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    className="btn btn-secondary"
                    style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', padding: '.6rem .85rem' }}
                    onClick={() => sendMessage(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
              {messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '85%',
                      padding: '.6rem .85rem',
                      borderRadius: m.role === 'user' ? '1rem 1rem 0 1rem' : '1rem 1rem 1rem 0',
                      background: m.role === 'user'
                        ? 'linear-gradient(135deg,#7C3AED,#4F46E5)'
                        : 'var(--surface-card)',
                      color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                      fontSize: '.83rem',
                      lineHeight: 1.55,
                      border: m.role === 'assistant' ? '1px solid var(--border-subtle)' : 'none',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {sending && (
                <div style={{ display: 'flex', gap: '.28rem', padding: '.3rem 0 .3rem .1rem' }}>
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: 'var(--accent-primary)',
                        animation: `pulseDot 1.2s ease-in-out ${i * 0.18}s infinite`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="drawer-footer">
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <input
              ref={inputRef}
              className="glass-input"
              placeholder="Ask about your pipeline..."
              style={{ flex: 1 }}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={sending}
            />
            <button
              className="btn btn-primary"
              style={{ borderRadius: '.875rem', padding: '0 .9rem', flexShrink: 0 }}
              onClick={() => sendMessage(input)}
              disabled={sending || !input.trim()}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            </button>
          </div>
          <p style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: '.6rem', textAlign: 'center' }}>
            For full grounded answers from your files, use{' '}
            <button
              onClick={() => { setActiveTab('kb'); onClose(); }}
              style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 'inherit' }}
            >
              Knowledge Base
            </button>.
          </p>
        </div>
      </div>
    </>
  );
}
