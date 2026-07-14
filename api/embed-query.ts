import type { VercelRequest, VercelResponse } from '@vercel/node';
import { embedSingle, pickEmbedProvider } from './_lib/embedding';
import { handleOptions, sendError } from './_lib/http';
import { cors } from './_lib/http';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'method_not_allowed', 'Method not allowed');

  cors(res);

  try {
    const { text } = (req.body || {}) as { text?: string };
    if (!text || !text.trim()) return sendError(res, 400, 'missing_text', 'text is required');

    const provider = pickEmbedProvider();
    if (!provider) {
      return sendError(res, 503, 'no_provider', 'No embedding provider configured. Set VOYAGE_API_KEY (free 200M tokens), OPENAI_API_KEY, or use OPENROUTER_API_KEY (with EMBED_PROVIDER=openrouter) in Vercel Environment Variables. Client will fall back to keyword scoring.');
    }

    const result = await embedSingle(text, 'query');
    return res.status(200).json({
      embedding: result.embedding,
      provider: result.provider,
      model: result.model,
      dims: result.embedding.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    return sendError(res, 500, 'embed_error', msg);
  }
}
