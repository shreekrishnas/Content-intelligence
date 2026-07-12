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

// Embedding provider config — Voyage default (free 200M tokens), OpenAI optional.
const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3';
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const OPENAI_MODEL = 'text-embedding-3-small';
const TARGET_DIMS = 1024;
const EMBED_BATCH = 100;
const EMBED_INPUT_MAX_CHARS = 8000;

type EmbedProvider = 'voyage' | 'openai';
function pickEmbedProvider(): EmbedProvider | null {
  const forced = (process.env.EMBED_PROVIDER || '').toLowerCase() as EmbedProvider;
  if (forced === 'voyage' && process.env.VOYAGE_API_KEY) return 'voyage';
  if (forced === 'openai' && process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.VOYAGE_API_KEY) return 'voyage';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return null;
}

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
// Batch embedding — provider auto-picked (Voyage default, OpenAI optional).
// Returns { embeddings, model } aligned to the input array.
// ---------------------------------------------------------------------------
function embedSleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function embedBatch(texts: string[]): Promise<{ embeddings: number[][]; model: string }> {
  const provider = pickEmbedProvider();
  if (!provider) throw new Error('No embedding provider configured (VOYAGE_API_KEY or OPENAI_API_KEY)');

  const inputs = texts.map((t) => (t || '').slice(0, EMBED_INPUT_MAX_CHARS));
  const url = provider === 'voyage' ? VOYAGE_URL : OPENAI_EMBEDDINGS_URL;
  const model = provider === 'voyage' ? VOYAGE_MODEL : OPENAI_MODEL;
  const apiKey = provider === 'voyage' ? process.env.VOYAGE_API_KEY : process.env.OPENAI_API_KEY;
  const body = provider === 'voyage'
    ? { model, input: inputs, input_type: 'document' }
    : { model, input: inputs, dimensions: TARGET_DIMS };

  for (let attempt = 0; attempt <= 4; attempt++) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (resp.ok) {
      const data = await resp.json();
      const embeddings: number[][] = (data?.data || []).map((d: any) => d.embedding);
      if (embeddings.length !== texts.length) throw new Error('Embedding count mismatch');
      return { embeddings, model };
    }

    if (resp.status === 429 && attempt < 4) {
      const retryAfter = resp.headers.get('retry-after');
      const waitMs = retryAfter ? Math.min(60_000, parseInt(retryAfter, 10) * 1000) : 15_000 * Math.pow(2, attempt);
      await embedSleep(waitMs);
      continue;
    }

    let msg: string;
    try {
      const b = await resp.json();
      const detail = b?.error?.message || b?.detail || 'Unknown error';
      if (resp.status === 401) msg = `Invalid ${provider === 'voyage' ? 'VOYAGE_API_KEY' : 'OPENAI_API_KEY'}.`;
      else if (resp.status === 429) msg = `${provider} rate limit hit repeatedly.`;
      else msg = `${provider} embeddings error (${resp.status}): ${detail}`;
    } catch { msg = `${provider} embeddings error (${resp.status}).`; }
    throw new Error(msg);
  }

  throw new Error('embedBatch failed after retries');
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
  if (!pickEmbedProvider()) return { embedded_count: 0, note: 'No embedding provider configured (VOYAGE_API_KEY or OPENAI_API_KEY) — chunks stored without embeddings; run "Rebuild search index" later.' };

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
