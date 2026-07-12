import type { VercelRequest, VercelResponse } from '@vercel/node';

// ============================================================
// Embed a single query string. Provider is auto-selected by which
// env var is set: VOYAGE_API_KEY (default) → OPENAI_API_KEY.
// Fully self-contained per the repo rule (no cross-file imports).
// ============================================================

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3';
const OPENAI_URL = 'https://api.openai.com/v1/embeddings';
const OPENAI_MODEL = 'text-embedding-3-small';
const TARGET_DIMS = 1024;
const MAX_INPUT_CHARS = 8000;

type Provider = 'voyage' | 'openai';

function pickProvider(): Provider | null {
  const forced = (process.env.EMBED_PROVIDER || '').toLowerCase() as Provider;
  if (forced === 'voyage' && process.env.VOYAGE_API_KEY) return 'voyage';
  if (forced === 'openai' && process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.VOYAGE_API_KEY) return 'voyage';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return null;
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function embedTextVoyage(input: string): Promise<number[]> {
  for (let attempt = 0; attempt <= 3; attempt++) {
    const resp = await fetch(VOYAGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({
        model: VOYAGE_MODEL,
        input: input.slice(0, MAX_INPUT_CHARS),
        input_type: 'query',
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      const embedding = data?.data?.[0]?.embedding;
      if (!Array.isArray(embedding)) throw new Error('Empty embedding response from Voyage');
      return embedding;
    }
    if (resp.status === 429 && attempt < 3) {
      const retryAfter = resp.headers.get('retry-after');
      const waitMs = retryAfter ? Math.min(30_000, parseInt(retryAfter, 10) * 1000) : 8_000 * Math.pow(2, attempt);
      await sleep(waitMs);
      continue;
    }
    let msg: string;
    try {
      const body = await resp.json();
      const detail = body?.error?.message || body?.detail || 'Unknown error';
      if (resp.status === 401) msg = 'Invalid VOYAGE_API_KEY.';
      else if (resp.status === 429) msg = 'Voyage rate limit — try again in a minute.';
      else msg = `Voyage embeddings error (${resp.status}): ${detail}`;
    } catch { msg = `Voyage embeddings error (${resp.status}).`; }
    throw new Error(msg);
  }
  throw new Error('Voyage embed failed after retries');
}

async function embedTextOpenAI(input: string): Promise<number[]> {
  const resp = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: input.slice(0, MAX_INPUT_CHARS),
      dimensions: TARGET_DIMS,
    }),
  });
  if (!resp.ok) {
    let msg: string;
    try {
      const body = await resp.json();
      const detail = body?.error?.message || 'Unknown error';
      if (resp.status === 401) msg = 'Invalid OPENAI_API_KEY.';
      else if (resp.status === 429) msg = 'OpenAI rate limit — try again shortly.';
      else msg = `OpenAI embeddings error (${resp.status}): ${detail}`;
    } catch { msg = `OpenAI embeddings error (${resp.status}).`; }
    throw new Error(msg);
  }
  const data = await resp.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) throw new Error('Empty embedding response from OpenAI');
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

    const provider = pickProvider();
    if (!provider) {
      return res.status(503).json({ error: 'No embedding provider configured. Set VOYAGE_API_KEY (free 200M tokens) or OPENAI_API_KEY in Vercel Environment Variables. Client will fall back to keyword scoring.' });
    }

    const embedding = provider === 'voyage' ? await embedTextVoyage(text) : await embedTextOpenAI(text);
    return res.status(200).json({ embedding, provider, model: provider === 'voyage' ? VOYAGE_MODEL : OPENAI_MODEL, dims: embedding.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    return res.status(500).json({ error: msg });
  }
}
