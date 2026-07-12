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

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_BATCH = 100;
const EMBED_INPUT_MAX_CHARS = 8000;
const MAX_PER_CALL = 500; // ceiling per HTTP call to fit inside maxDuration

async function embedBatch(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured. Add it in Vercel Environment Variables to enable semantic retrieval.');

  const inputs = texts.map((t) => (t || '').slice(0, EMBED_INPUT_MAX_CHARS));
  const resp = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
  });

  if (!resp.ok) {
    let msg: string;
    try {
      const body = await resp.json();
      const detail = body?.error?.message || 'Unknown error';
      if (resp.status === 401) msg = 'Invalid OpenAI API key.';
      else if (resp.status === 429) msg = 'OpenAI rate limit — try again in a moment.';
      else msg = `Embeddings error (${resp.status}): ${detail}`;
    } catch { msg = `Embeddings error (${resp.status}).`; }
    throw new Error(msg);
  }

  const data = await resp.json();
  const embeddings: number[][] = (data?.data || []).map((d: any) => d.embedding);
  if (embeddings.length !== texts.length) throw new Error('Embedding count mismatch');
  return embeddings;
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
      const vectors = await embedBatch(batch.map((c: any) => c.chunk_text));
      for (let j = 0; j < batch.length; j++) {
        const row = batch[j] as any;
        const vec = vectors[j];
        if (!row || !vec) continue;
        const { error: updErr } = await admin
          .from('knowledge_chunks')
          .update({ embedding: toVectorLiteral(vec), embed_model: EMBED_MODEL })
          .eq('id', row.id);
        if (updErr) {
          // Return partial progress so the client can retry.
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
