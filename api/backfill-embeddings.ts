import type { VercelRequest, VercelResponse } from '@vercel/node';
import { embedBatch, pickEmbedProvider, toVectorLiteral } from './_lib/embedding.js';
import { handleOptions, sendError, cors } from './_lib/http.js';
import { getServiceClient } from './_lib/supabase.js';

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
// ============================================================

const EMBED_BATCH = 100;
const MAX_PER_CALL = 400;
const VOYAGE_INTER_BATCH_MS = 21_000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'method_not_allowed', 'Method not allowed');

  cors(res);
  const account_id = (req.body as any)?.account_id || (req.headers['x-account-id'] as string) || '';

  let admin;
  try {
    admin = getServiceClient();
  } catch {
    return sendError(res, 503, 'missing_env',
      'Backfill requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY server env vars. Ask your admin to configure them.');
  }

  try {
    const { count: totalMissingRaw, error: countErr } = await admin
      .from('knowledge_chunks')
      .select('id', { head: true, count: 'exact' })
      .eq('account_id', account_id)
      .is('embedding', null)
      .neq('embed_model', 'skipped_provider_error');
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
      .neq('embed_model', 'skipped_provider_error')
      .order('created_at', { ascending: true })
      .limit(MAX_PER_CALL);
    if (fetchErr) return res.status(500).json({ error: `Fetch failed: ${fetchErr.message}` });
    if (!chunks || !chunks.length) {
      return res.status(200).json({ embedded: 0, remaining: totalMissing, total: totalMissing, done: totalMissing === 0 });
    }

    // 3. Embed in batches and write back. Throttle between Voyage batches
    //    (free tier is 3 RPM). Individual chunks that couldn't be embedded
    //    (e.g., single oversized chunk) are recorded as skipped so the run
    //    doesn't abort halfway through.
    const provider = pickEmbedProvider();
    let embedded = 0;
    let skipped = 0;
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH);
      const { embeddings, model } = await embedBatch(batch.map((c: any) => c.chunk_text));
      for (let j = 0; j < batch.length; j++) {
        const row = batch[j] as any;
        const vec = (embeddings as any[])[j];
        if (!row) continue;
        if (!vec) {
          // Mark the chunk as skipped so subsequent backfill runs don't
          // repeatedly try (and fail) on the same content.
          await admin
            .from('knowledge_chunks')
            .update({ embed_model: 'skipped_provider_error' })
            .eq('id', row.id);
          skipped++;
          continue;
        }
        const { error: updErr } = await admin
          .from('knowledge_chunks')
          .update({ embedding: toVectorLiteral(vec as number[]), embed_model: model })
          .eq('id', row.id);
        if (updErr) {
          return res.status(200).json({
            embedded,
            skipped,
            remaining: totalMissing - embedded - skipped,
            total: totalMissing,
            done: false,
            error: `Update failed at chunk ${row.id}: ${updErr.message}`,
          });
        }
        embedded++;
      }
      // Throttle before the NEXT batch (skip after the last one).
      // Only Voyage's 3 RPM ceiling needs this.
      if (provider === 'voyage' && i + EMBED_BATCH < chunks.length) {
        await new Promise((r) => setTimeout(r, VOYAGE_INTER_BATCH_MS));
      }
    }

    // Skipped chunks won't show up in the next call (they still have NULL
    // embedding). Report them so the client knows to stop looping.
    const remaining = Math.max(0, totalMissing - embedded - skipped);
    return res.status(200).json({
      embedded,
      skipped,
      remaining,
      total: totalMissing,
      done: remaining === 0 || (embedded === 0 && skipped > 0),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    return res.status(500).json({ error: msg });
  }
}
