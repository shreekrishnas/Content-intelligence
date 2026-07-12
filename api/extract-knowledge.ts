import type { VercelRequest, VercelResponse } from '@vercel/node';

// ============================================================
// Runs after every KB upload. Two jobs:
// 1. Extract structured metadata (summary, topics, audience, etc.)
//    via OpenRouter — unchanged from the original endpoint.
// 2. Batch-embed the file's chunks via OpenAI embeddings and
//    persist them with the service role (semantic retrieval).
// Both are best-effort — if either is missing an env var or fails,
// the other still runs.
// Self-contained per the repo rule (no cross-file imports).
// ============================================================

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_BATCH = 100;
const EMBED_INPUT_MAX_CHARS = 8000;

const SYSTEM_PROMPT = `You are a knowledge extraction engine. CRITICAL OUTPUT RULE: respond with ONLY raw JSON — no markdown fences, no prose before or after. Your entire response must be parseable by JSON.parse().`;

function extractJSON(text: string): unknown {
  const stripped = text
    .replace(/^```(?:json|javascript|js)?\s*\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .trim();
  try { return JSON.parse(stripped); } catch { /* try brace extraction */ }
  const s = stripped.indexOf('{');
  const e = stripped.lastIndexOf('}');
  if (s !== -1 && e > s) {
    try { return JSON.parse(stripped.slice(s, e + 1)); } catch { /* fall through */ }
  }
  throw new Error('LLM returned a response that could not be parsed as JSON. Please try again.');
}

// ---------------------------------------------------------------------------
// LLM structured extraction — unchanged behaviour.
// ---------------------------------------------------------------------------
async function extractStructured(file_name: string | undefined, category: string | undefined, sample_text: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured');

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

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.SITE_URL ?? 'https://content-intelligence-ebon.vercel.app',
      'X-Title': 'Content Intelligence Platform',
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL ?? 'anthropic/claude-sonnet-4-5',
      max_tokens: 1024,
      temperature: 0.1,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    let msg: string;
    try {
      const body = await response.json();
      const detail = body?.error?.message || 'Unknown error';
      if (response.status === 401) msg = 'Invalid API key. Check OPENROUTER_API_KEY.';
      else if (response.status === 402) msg = 'OpenRouter account has insufficient credits.';
      else if (response.status === 404) msg = `Model not found: ${detail}`;
      else msg = `LLM error (${response.status}): ${detail}`;
    } catch { msg = `LLM error (${response.status}). Please try again.`; }
    throw new Error(msg);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  return extractJSON(text) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Batch embedding via OpenAI. Returns embeddings aligned to the input array.
// ---------------------------------------------------------------------------
async function embedBatch(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

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
      else if (resp.status === 429) msg = 'OpenAI rate limit — try again shortly.';
      else msg = `Embeddings error (${resp.status}): ${detail}`;
    } catch { msg = `Embeddings error (${resp.status}).`; }
    throw new Error(msg);
  }

  const data = await resp.json();
  const embeddings: number[][] = (data?.data || []).map((d: any) => d.embedding);
  if (embeddings.length !== texts.length) throw new Error('Embedding count mismatch');
  return embeddings;
}

// pgvector accepts a string literal '[1.23,4.56,...]' for vector inputs.
function toVectorLiteral(v: number[]): string {
  return '[' + v.join(',') + ']';
}

// ---------------------------------------------------------------------------
// Embed all chunks for a given file. Server-side write via service role.
// Best-effort — returns { embedded_count, note } on skip.
// ---------------------------------------------------------------------------
async function embedFileChunks(fileId: string, accountId: string): Promise<{ embedded_count: number; note?: string }> {
  if (!process.env.OPENAI_API_KEY) return { embedded_count: 0, note: 'OPENAI_API_KEY not set — chunks stored without embeddings; run "Rebuild search index" later.' };

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { embedded_count: 0, note: 'SUPABASE_SERVICE_ROLE_KEY not set — chunks stored without embeddings; run "Rebuild search index" later.' };

  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(url, serviceKey);

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
    const vectors = await embedBatch(batch.map((c: any) => c.chunk_text));
    // Sequential per-row update — pgvector doesn't play nicely with a single
    // bulk upsert of vectors, and the batch size (≤100) keeps this fast enough.
    for (let j = 0; j < batch.length; j++) {
      const row = batch[j] as any;
      const vec = vectors[j];
      if (!row || !vec) continue;
      const { error: updErr } = await admin
        .from('knowledge_chunks')
        .update({ embedding: toVectorLiteral(vec), embed_model: EMBED_MODEL })
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { file_name, category, sample_text, file_id, account_id } = (req.body || {}) as {
    file_name?: string;
    category?: string;
    sample_text?: string;
    file_id?: string;
    account_id?: string;
  };

  if (!sample_text) return res.status(400).json({ error: 'sample_text is required' });

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
    return res.status(502).json({ error: `Structured: ${structuredError}. Embed: ${embedError}` });
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
