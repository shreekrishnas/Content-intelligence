import type { VercelRequest, VercelResponse } from '@vercel/node';

// ============================================================
// Backfill embeddings for chunks that were uploaded before
// pgvector was enabled. Called from KnowledgeBasePage's
// "Rebuild search index" button.
//
// Auth: caller must be a signed-in user with manager or editor
// role on the target account. We verify via account_access
// using the user's JWT, then use the service role for the
// heavy write step so we don't fight RLS on every UPDATE.
//
// Progress: each call embeds up to MAX_PER_CALL chunks and
// returns { embedded, remaining, total }. The client loops
// until remaining = 0.
//
// Self-contained per the repo rule (no cross-file imports).
// ============================================================

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3';
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const OPENAI_MODEL = 'text-embedding-3-small';
const TARGET_DIMS = 1024;
const EMBED_BATCH = 100;
const EMBED_INPUT_MAX_CHARS = 8000;
const MAX_PER_CALL = 500;

type EmbedProvider = 'voyage' | 'openai';
function pickEmbedProvider(): EmbedProvider | null {
  const forced = (process.env.EMBED_PROVIDER || '').toLowerCase() as EmbedProvider;
  if (forced === 'voyage' && process.env.VOYAGE_API_KEY) return 'voyage';
  if (forced === 'openai' && process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.VOYAGE_API_KEY) return 'voyage';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return null;
}

async function embedBatch(texts: string[]): Promise<{ embeddings: number[][]; model: string }> {
  const provider = pickEmbedProvider();
  if (!provider) throw new Error('No embedding provider configured. Set VOYAGE_API_KEY (free 200M tokens) or OPENAI_API_KEY in Vercel Environment Variables.');

  const inputs = texts.map((t) => (t || '').slice(0, EMBED_INPUT_MAX_CHARS));
  const url = provider === 'voyage' ? VOYAGE_URL : OPENAI_EMBEDDINGS_URL;
  const model = provider === 'voyage' ? VOYAGE_MODEL : OPENAI_MODEL;
  const apiKey = provider === 'voyage' ? process.env.VOYAGE_API_KEY : process.env.OPENAI_API_KEY;
  const body = provider === 'voyage'
    ? { model, input: inputs, input_type: 'document' }
    : { model, input: inputs, dimensions: TARGET_DIMS };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    let msg: string;
    try {
      const b = await resp.json();
      const detail = b?.error?.message || b?.detail || 'Unknown error';
      if (resp.status === 401) msg = `Invalid ${provider === 'voyage' ? 'VOYAGE_API_KEY' : 'OPENAI_API_KEY'}.`;
      else if (resp.status === 429) msg = `${provider} rate limit — try again in a moment.`;
      else msg = `${provider} embeddings error (${resp.status}): ${detail}`;
    } catch { msg = `${provider} embeddings error (${resp.status}).`; }
    throw new Error(msg);
  }

  const data = await resp.json();
  const embeddings: number[][] = (data?.data || []).map((d: any) => d.embedding);
  if (embeddings.length !== texts.length) throw new Error('Embedding count mismatch');
  return { embeddings, model };
}

function toVectorLiteral(v: number[]): string {
  return '[' + v.join(',') + ']';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { account_id } = (req.body || {}) as { account_id?: string };
  if (!account_id) return res.status(400).json({ error: 'account_id is required' });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return res.status(503).json({
      error: 'Backfill requires SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY server env vars. Ask your admin to configure them.',
    });
  }

  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!jwt) return res.status(401).json({ error: 'Missing user session token' });

  try {
    const { createClient } = await import('@supabase/supabase-js');

    // 1. Verify caller's role on this account via their JWT + RLS.
    const asUser = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: access, error: accessErr } = await asUser
      .from('account_access')
      .select('role')
      .eq('account_id', account_id)
      .maybeSingle();
    if (accessErr) return res.status(500).json({ error: `Auth check failed: ${accessErr.message}` });
    const role = (access as any)?.role;
    if (role !== 'manager' && role !== 'editor') {
      return res.status(403).json({ error: 'Only account managers or editors can rebuild the search index.' });
    }

    // 2. Read chunks needing embeddings (service role — read + write cheap).
    const admin = createClient(url, serviceKey);

    const { count: totalMissingRaw, error: countErr } = await admin
      .from('knowledge_chunks')
      .select('id', { head: true, count: 'exact' })
      .eq('account_id', account_id)
      .is('embedding', null);
    if (countErr) return res.status(500).json({ error: `Count failed: ${countErr.message}` });
    const totalMissing = totalMissingRaw ?? 0;

    if (totalMissing === 0) {
      return res.status(200).json({ embedded: 0, remaining: 0, total: 0, done: true });
    }

    const { data: chunks, error: fetchErr } = await admin
      .from('knowledge_chunks')
      .select('id, chunk_text')
      .eq('account_id', account_id)
      .is('embedding', null)
      .order('created_at', { ascending: true })
      .limit(MAX_PER_CALL);
    if (fetchErr) return res.status(500).json({ error: `Fetch failed: ${fetchErr.message}` });
    if (!chunks || !chunks.length) {
      return res.status(200).json({ embedded: 0, remaining: totalMissing, total: totalMissing, done: totalMissing === 0 });
    }

    // 3. Embed in batches and write back.
    let embedded = 0;
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH);
      const { embeddings, model } = await embedBatch(batch.map((c: any) => c.chunk_text));
      for (let j = 0; j < batch.length; j++) {
        const row = batch[j] as any;
        const vec = embeddings[j];
        if (!row || !vec) continue;
        const { error: updErr } = await admin
          .from('knowledge_chunks')
          .update({ embedding: toVectorLiteral(vec), embed_model: model })
          .eq('id', row.id);
        if (updErr) {
          return res.status(200).json({
            embedded,
            remaining: totalMissing - embedded,
            total: totalMissing,
            done: false,
            error: `Update failed at chunk ${row.id}: ${updErr.message}`,
          });
        }
        embedded++;
      }
    }

    const remaining = totalMissing - embedded;
    return res.status(200).json({
      embedded,
      remaining,
      total: totalMissing,
      done: remaining <= 0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    return res.status(500).json({ error: msg });
  }
}
