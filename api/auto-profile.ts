import type { VercelRequest, VercelResponse } from '@vercel/node';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000;

async function callLLM(sys: string, user: string, opts: { maxTokens?: number; temperature?: number } = {}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured.');
  const model = process.env.LLM_MODEL ?? 'anthropic/claude-sonnet-4-5';
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1)));
    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.SITE_URL ?? 'https://content-intelligence-ebon.vercel.app',
          'X-Title': 'Content Intelligence Platform',
        },
        body: JSON.stringify({
          model, max_tokens: opts.maxTokens ?? 4000, temperature: opts.temperature ?? 0.2,
          messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
        }),
      });
      if (response.status === 429) { lastError = new Error('Rate limit reached.'); continue; }
      if (!response.ok) {
        let msg: string;
        try { const b = await response.json(); msg = b?.error?.message || `LLM service error (${response.status})`; }
        catch { msg = `LLM service error (${response.status})`; }
        throw new Error(msg);
      }
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('No content in LLM response');
      return content;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Rate limit')) { lastError = error; continue; }
      throw error;
    }
  }
  throw lastError ?? new Error('Failed to call LLM after retries');
}

function extractJSON(text: string): unknown {
  const stripped = text.replace(/^```(?:json|javascript|js)?\s*\n?/gim, '').replace(/\n?```\s*$/gim, '').trim();
  try { return JSON.parse(stripped); } catch { /* try bounds */ }
  const ob = stripped.indexOf('{'); const cb = stripped.lastIndexOf('}');
  if (ob !== -1 && cb > ob) {
    try { return JSON.parse(stripped.slice(ob, cb + 1)); } catch { /* fall through */ }
  }
  throw new Error('Could not parse LLM response as JSON.');
}

function htmlToText(html: string): string {
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, ' ');
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
  const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
  const metaMatch = text.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  const metaDesc = metaMatch ? metaMatch[1].trim() : '';
  const kwMatch = text.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']+)["']/i);
  const metaKw = kwMatch ? kwMatch[1].trim() : '';
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  const header = [title && `Title: ${title}`, metaDesc && `Description: ${metaDesc}`, metaKw && `Keywords: ${metaKw}`].filter(Boolean).join('\n');
  return header ? `${header}\n\n${text}` : text;
}

async function tryFetchWebsite(url: string): Promise<string | null> {
  let normalizedUrl = url.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const html = await resp.text();
    return htmlToText(html).slice(0, 10000);
  } catch {
    return null;
  }
}

async function tryTavilySearch(url: string): Promise<string | null> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  try {
    const domain = url.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    const resp = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, query: `${domain} company about`, search_depth: 'basic', max_results: 5, include_domains: [domain] }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const results = (data.results || []).map((r: any) => `${r.title || ''}: ${r.content || ''}`).join('\n\n');
    return results.slice(0, 8000) || null;
  } catch {
    return null;
  }
}

const PROFILE_JSON_SCHEMA = `{
  "business_name": "company/brand name",
  "industry": "primary industry/sector",
  "products": "main products (comma-separated)",
  "services": "main services (comma-separated)",
  "core_topics": "key content topics this business should cover (comma-separated, 5-8 topics)",
  "target_keywords": "SEO-relevant keywords for this business (comma-separated, 5-10)",
  "target_audience": "who their customers/audience are",
  "target_locations": "geographic focus if detectable",
  "business_goals": "inferred business objectives",
  "content_categories": "types of content they should produce (comma-separated)",
  "brand_tone": "brand voice/tone (e.g. professional, casual, authoritative)",
  "competitors": "likely competitors if identifiable (comma-separated)",
  "risk_tolerance": "low, medium, or high based on industry"
}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { url, account_name } = req.body || {};
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL is required' });

    const [websiteContent, tavilyContent] = await Promise.all([
      tryFetchWebsite(url),
      tryTavilySearch(url),
    ]);

    const hasContent = websiteContent || tavilyContent;

    const sys = `You are a business analyst. Given a company URL${hasContent ? ' and website content' : ''}, extract a structured business profile. Output ONLY raw JSON — no markdown fences, no prose.`;

    const contentBlock = hasContent
      ? `\nWEBSITE CONTENT:\n${websiteContent || ''}\n${tavilyContent ? `\nADDITIONAL SEARCH RESULTS:\n${tavilyContent}` : ''}`
      : `\nNote: Could not fetch the website directly. Use your knowledge about this company/URL to build the profile. The URL domain itself reveals the brand and industry.`;

    const user = `Analyze this business and extract a detailed profile.

WEBSITE URL: ${url}${account_name ? `\nACCOUNT NAME: ${account_name}` : ''}${contentBlock}

Return ONLY this JSON structure (fill every field you can infer, leave empty string for unknowns):
${PROFILE_JSON_SCHEMA}`;

    const raw = await callLLM(sys, user, { maxTokens: 2000, temperature: 0.2 });
    const profile = extractJSON(raw) as Record<string, unknown>;

    return res.status(200).json({ success: true, profile, source: websiteContent ? 'website' : tavilyContent ? 'tavily' : 'llm_knowledge' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return res.status(500).json({ error: message });
  }
}
