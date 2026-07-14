import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callLLM } from './_lib/llm.js';
import { extractJSON } from './_lib/json.js';
import { handleOptions, sendError, cors } from './_lib/http.js';
import { embedBatch, pickEmbedProvider, toVectorLiteral } from './_lib/embedding.js';
import { getServiceClient } from './_lib/supabase.js';

// ============================================================
// Runs after every KB upload. Two jobs:
// 1. Extract structured metadata (summary, topics, audience, etc.)
//    via OpenRouter LLM.
// 2. Batch-embed the file's chunks and persist them with the
//    service role (semantic retrieval).
// Both are best-effort — if either fails, the other still runs.
// ============================================================

const EMBED_BATCH = 100;

const SYSTEM_PROMPT = `You are a knowledge extraction engine. CRITICAL OUTPUT RULE: respond with ONLY raw JSON — no markdown fences, no prose before or after. Your entire response must be parseable by JSON.parse().`;

// ---------------------------------------------------------------------------
// LLM structured extraction
// ---------------------------------------------------------------------------
async function extractStructured(file_name: string | undefined, category: string | undefined, sample_text: string): Promise<Record<string, unknown>> {
  const prompt = `Extract structured knowledge metadata from this content.

FILE NAME: ${file_name ?? 'Unknown'}
CATEGORY: ${category ?? 'Unknown'}

CONTENT SAMPLE (first ~2000 chars):
${String(sample_text).slice(0, 2000)}

Return JSON with this exact structure:
{
  "detected_source_type": "webinar_transcript|blog|brand_guidelines|product_document|campaign_report|competitor_content|research_document|website_content|other",
  "summary": "2-3 sentence summary of what this document is about",
  "main_topics": ["topic1", "topic2"],
  "key_messages": ["core message or claim from this content"],
  "audience": "Who this content targets",
  "tone_of_voice": "professional|conversational|technical|inspirational|educational",
  "products_services": ["product or service name mentioned"],
  "important_facts": ["key fact, statistic, or claim from content"]
}`;

  const { content } = await callLLM(SYSTEM_PROMPT, prompt, { maxTokens: 1024, temperature: 0.1 });
  return extractJSON(content) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Embed all chunks for a given file. Server-side write via service role.
// Best-effort — returns { embedded_count, note } on skip.
// ---------------------------------------------------------------------------
async function embedFileChunks(fileId: string, accountId: string): Promise<{ embedded_count: number; note?: string }> {
  if (!pickEmbedProvider()) return { embedded_count: 0, note: 'No embedding provider configured (VOYAGE_API_KEY or OPENAI_API_KEY) — chunks stored without embeddings; run "Rebuild search index" later.' };

  let admin;
  try {
    admin = getServiceClient();
  } catch {
    return { embedded_count: 0, note: 'SUPABASE_SERVICE_ROLE_KEY not set — chunks stored without embeddings; run "Rebuild search index" later.' };
  }

  const { data: chunks, error: fetchErr } = await admin
    .from('knowledge_chunks')
    .select('id, chunk_text')
    .eq('file_id', fileId)
    .eq('account_id', accountId)
    .is('embedding', null)
    .order('position', { ascending: true });

  if (fetchErr) return { embedded_count: 0, note: `Could not read chunks: ${fetchErr.message}` };
  if (!chunks || !chunks.length) return { embedded_count: 0 };

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
      if (updErr) return { embedded_count: embedded, note: `Update failed at chunk ${row.id}: ${updErr.message}` };
      embedded++;
    }
  }
  return { embedded_count: embedded };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'method_not_allowed', 'Method not allowed');

  cors(res);

  const body = (req.body || {}) as {
    file_name?: string;
    category?: string;
    sample_text?: string;
    file_id?: string;
    account_id?: string;
  };
  const { file_name, category, sample_text, file_id } = body;
  const account_id = body.account_id || (req.headers['x-account-id'] as string) || '';

  if (!sample_text) return sendError(res, 400, 'missing_field', 'sample_text is required');

  // 1. Structured extraction (best-effort — matches the original behaviour).
  let structured: Record<string, unknown> | undefined;
  let structuredError: string | undefined;
  try {
    structured = await extractStructured(file_name, category, sample_text);
  } catch (e) {
    structuredError = e instanceof Error ? e.message : 'Structured extraction failed';
  }

  // 2. Embed the file's chunks (best-effort). Only runs when the client
  //    provides file_id + account_id AND both keys are configured.
  let embed: { embedded_count: number; note?: string } = { embedded_count: 0 };
  let embedError: string | undefined;
  if (file_id && account_id) {
    try {
      embed = await embedFileChunks(file_id, account_id);
    } catch (e) {
      embedError = e instanceof Error ? e.message : 'Embedding failed';
    }
  } else if (!file_id || !account_id) {
    embed = { embedded_count: 0, note: 'file_id + account_id not provided — embedding skipped.' };
  }

  // If BOTH failed, propagate an error so the client can surface it.
  if (!structured && structuredError && embed.embedded_count === 0 && embedError) {
    return sendError(res, 502, 'dual_failure', `Structured: ${structuredError}. Embed: ${embedError}`);
  }

  return res.status(200).json({
    success: true,
    structured: structured ?? null,
    structured_error: structuredError,
    embedded_count: embed.embedded_count,
    embed_note: embed.note,
    embed_error: embedError,
  });
}
