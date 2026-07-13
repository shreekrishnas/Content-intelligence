const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3';
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const OPENAI_MODEL = 'text-embedding-3-small';
const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';
const TARGET_DIMS = 1024;
const EMBED_INPUT_MAX_CHARS = 4000;
const MAX_RATE_LIMIT_RETRIES = 4;

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

export type EmbedProvider = 'voyage' | 'openai' | 'openrouter';

export function pickEmbedProvider(): EmbedProvider | null {
  const forced = (process.env.EMBED_PROVIDER || '').toLowerCase() as EmbedProvider;
  if (forced === 'voyage' && process.env.VOYAGE_API_KEY) return 'voyage';
  if (forced === 'openai' && process.env.OPENAI_API_KEY) return 'openai';
  if (forced === 'openrouter' && process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (process.env.VOYAGE_API_KEY) return 'voyage';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  return null;
}

function getOpenRouterEmbedModel(): string {
  return process.env.OPENROUTER_EMBED_MODEL || 'openai/text-embedding-3-small';
}

export function getEmbedModel(provider: EmbedProvider): string {
  if (provider === 'voyage') return VOYAGE_MODEL;
  if (provider === 'openrouter') return getOpenRouterEmbedModel();
  return OPENAI_MODEL;
}

export async function embedSingle(text: string, inputType: 'query' | 'document' = 'query'): Promise<{ embedding: number[]; model: string; provider: EmbedProvider }> {
  const provider = pickEmbedProvider();
  if (!provider) throw new Error('No embedding provider configured. Set VOYAGE_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY.');

  const input = text.slice(0, EMBED_INPUT_MAX_CHARS).trim() || ' ';
  const model = getEmbedModel(provider);

  if (provider === 'voyage') {
    const embedding = await embedVoyageSingle(input, inputType);
    return { embedding, model, provider };
  }
  if (provider === 'openai') {
    const embedding = await embedOpenAISingle(input);
    return { embedding, model, provider };
  }
  const embedding = await embedOpenRouterSingle(input);
  return { embedding, model, provider };
}

async function embedVoyageSingle(input: string, inputType: 'query' | 'document'): Promise<number[]> {
  for (let attempt = 0; attempt <= 3; attempt++) {
    const resp = await fetch(VOYAGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}` },
      body: JSON.stringify({ model: VOYAGE_MODEL, input, input_type: inputType }),
    });
    if (resp.ok) {
      const data = await resp.json();
      const emb = data?.data?.[0]?.embedding;
      if (!Array.isArray(emb)) throw new Error('Empty embedding response from Voyage');
      return emb;
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

async function embedOpenAISingle(input: string): Promise<number[]> {
  const resp = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: OPENAI_MODEL, input, dimensions: TARGET_DIMS }),
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
  const emb = data?.data?.[0]?.embedding;
  if (!Array.isArray(emb)) throw new Error('Empty embedding response from OpenAI');
  return emb;
}

async function embedOpenRouterSingle(input: string): Promise<number[]> {
  const model = getOpenRouterEmbedModel();
  const resp = await fetch(OPENROUTER_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': process.env.SITE_URL ?? 'https://content-intelligence-ebon.vercel.app',
      'X-Title': 'Content Intelligence Platform',
    },
    body: JSON.stringify({ model, input, dimensions: TARGET_DIMS }),
  });
  if (!resp.ok) {
    let msg: string;
    try {
      const body = await resp.json();
      const detail = body?.error?.message || body?.detail || 'Unknown error';
      if (resp.status === 401) msg = 'Invalid OPENROUTER_API_KEY.';
      else if (resp.status === 404) msg = `OpenRouter does not currently expose embeddings for '${model}'. Try VOYAGE_API_KEY (free) or OPENAI_API_KEY instead.`;
      else if (resp.status === 429) msg = 'OpenRouter rate limit — try again shortly.';
      else msg = `OpenRouter embeddings error (${resp.status}): ${detail}`;
    } catch { msg = `OpenRouter embeddings error (${resp.status}).`; }
    throw new Error(msg);
  }
  const data = await resp.json();
  const emb = data?.data?.[0]?.embedding;
  if (!Array.isArray(emb)) throw new Error('Empty embedding response from OpenRouter');
  return emb;
}

export async function embedBatch(texts: string[]): Promise<{ embeddings: (number[] | null)[]; model: string }> {
  const provider = pickEmbedProvider();
  if (!provider) throw new Error('No embedding provider configured. Set VOYAGE_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY.');

  const inputs = texts.map((t) => {
    const s = (t || '').slice(0, EMBED_INPUT_MAX_CHARS).trim();
    return s.length > 0 ? s : ' ';
  });

  const model = getEmbedModel(provider);
  const url = provider === 'voyage' ? VOYAGE_URL : provider === 'openrouter' ? OPENROUTER_EMBEDDINGS_URL : OPENAI_EMBEDDINGS_URL;
  const apiKey = provider === 'voyage' ? process.env.VOYAGE_API_KEY : provider === 'openrouter' ? process.env.OPENROUTER_API_KEY : process.env.OPENAI_API_KEY;
  const extraHeaders: Record<string, string> = provider === 'openrouter'
    ? { 'HTTP-Referer': process.env.SITE_URL ?? 'https://content-intelligence-ebon.vercel.app', 'X-Title': 'Content Intelligence Platform' }
    : {};

  if (provider === 'openrouter') {
    const embeddings: Array<number[] | null> = [];
    for (const single of inputs) {
      const body = { model, input: single, dimensions: TARGET_DIMS };
      let placed = false;
      for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, ...extraHeaders },
          body: JSON.stringify(body),
        });
        if (resp.ok) {
          const data = await resp.json();
          const emb = data?.data?.[0]?.embedding;
          embeddings.push(Array.isArray(emb) ? emb : null);
          placed = true;
          break;
        }
        if (resp.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
          const retryAfter = resp.headers.get('retry-after');
          const waitMs = retryAfter ? Math.min(30_000, parseInt(retryAfter, 10) * 1000) : 5_000 * Math.pow(2, attempt);
          await sleep(waitMs);
          continue;
        }
        if (resp.status === 401 || resp.status === 404) {
          let msg = `OpenRouter embeddings error (${resp.status}).`;
          try {
            const b = await resp.json();
            if (resp.status === 401) msg = 'Invalid OPENROUTER_API_KEY.';
            else if (resp.status === 404) msg = `OpenRouter does not currently expose embeddings for '${model}'. Try VOYAGE_API_KEY (free) or OPENAI_API_KEY instead.`;
            else msg = `OpenRouter embeddings error (${resp.status}): ${b?.error?.message || 'Unknown'}`;
          } catch { /* keep default */ }
          throw new Error(msg);
        }
        embeddings.push(null);
        placed = true;
        break;
      }
      if (!placed) embeddings.push(null);
    }
    return { embeddings, model };
  }

  const body = provider === 'voyage'
    ? { model, input: inputs, input_type: 'document' as const }
    : { model, input: inputs, dimensions: TARGET_DIMS };

  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, ...extraHeaders },
      body: JSON.stringify(body),
    });
    if (resp.ok) {
      const data = await resp.json();
      const embeddings: number[][] = (data?.data || []).map((d: any) => d.embedding);
      if (embeddings.length !== texts.length) {
        throw new Error(`Embedding count mismatch: sent ${texts.length}, got ${embeddings.length}. Provider: ${provider}`);
      }
      return { embeddings, model };
    }
    if (resp.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const retryAfter = resp.headers.get('retry-after');
      const waitMs = retryAfter ? Math.min(60_000, parseInt(retryAfter, 10) * 1000) : 15_000 * Math.pow(2, attempt);
      await sleep(waitMs);
      continue;
    }
    let msg: string;
    try {
      const b = await resp.json();
      const detail = b?.error?.message || b?.detail || 'Unknown error';
      if (resp.status === 401) msg = `Invalid ${provider === 'voyage' ? 'VOYAGE_API_KEY' : 'OPENAI_API_KEY'}.`;
      else if (resp.status === 429) msg = `${provider} rate limit hit repeatedly — will retry on the next click.`;
      else msg = `${provider} embeddings error (${resp.status}): ${detail}`;
    } catch { msg = `${provider} embeddings error (${resp.status}).`; }
    throw new Error(msg);
  }
  throw new Error('Failed to embed after retries');
}

export function toVectorLiteral(v: number[]): string {
  return '[' + v.join(',') + ']';
}
