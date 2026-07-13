import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callLLM } from './_lib/llm';
import { extractJSON } from './_lib/json';
import { handleOptions, sendError } from './_lib/http';

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
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'method_not_allowed', 'Method not allowed');

  try {
    const { url, account_name } = req.body || {};
    if (!url || typeof url !== 'string') return sendError(res, 400, 'missing_url', 'URL is required');

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

    const { content: raw } = await callLLM(sys, user, { maxTokens: 2000, temperature: 0.2 });
    const profile = extractJSON(raw) as Record<string, unknown>;

    return res.status(200).json({ success: true, profile, source: websiteContent ? 'website' : tavilyContent ? 'tavily' : 'llm_knowledge' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return res.status(500).json({ error: message });
  }
}
