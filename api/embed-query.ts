import type { VercelRequest, VercelResponse } from '@vercel/node';

// ============================================================
// Embed a single query string with OpenAI text-embedding-3-small.
// Called by src/lib/retrieval.ts every time retrieve() runs.
// Fully self-contained per the repo rule (no cross-file imports).
// ============================================================

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const EMBED_MODEL = 'text-embedding-3-small';
const MAX_INPUT_CHARS = 8000;

async function embedText(input: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured. Semantic retrieval unavailable — client will fall back to keyword scoring.');

  const resp = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: input.slice(0, MAX_INPUT_CHARS),
    }),
  });

  if (!resp.ok) {
    let msg: string;
    try {
      const body = await resp.json();
      const detail = body?.error?.message || 'Unknown error';
      if (resp.status === 401) msg = 'Invalid OpenAI API key.';
      else if (resp.status === 429) msg = 'OpenAI rate limit reached — try again shortly.';
      else msg = `Embeddings error (${resp.status}): ${detail}`;
    } catch { msg = `Embeddings error (${resp.status}).`; }
    throw new Error(msg);
  }

  const data = await resp.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) throw new Error('Empty embedding response');
  return embedding;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { text } = (req.body || {}) as { text?: string };
    if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });

    const embedding = await embedText(text);
    return res.status(200).json({ embedding, model: EMBED_MODEL, dims: embedding.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    // 503 signals "service unavailable" so the client knows to fall back
    // to keyword retrieval rather than treat this as a hard failure.
    if (msg.includes('not configured')) return res.status(503).json({ error: msg });
    return res.status(500).json({ error: msg });
  }
}
