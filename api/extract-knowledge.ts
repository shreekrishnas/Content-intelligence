import type { VercelRequest, VercelResponse } from '@vercel/node';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const SYSTEM_PROMPT = `You are a knowledge extraction engine. Extract structured metadata from the provided content sample. Return only valid JSON, no markdown.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  const { file_name, category, sample_text } = req.body || {};
  if (!sample_text) return res.status(400).json({ error: 'sample_text is required' });

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

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.SITE_URL ?? 'https://content-intelligence-ebon.vercel.app',
        'X-Title': 'Content Intelligence Platform',
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL ?? 'anthropic/claude-3.5-sonnet',
        max_tokens: 1024,
        temperature: 0.1,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return res.status(502).json({ error: `LLM error: ${body}` });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    const cleaned = text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');

    let structured: Record<string, unknown>;
    try {
      structured = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({ error: 'Failed to parse extraction response', raw: text });
    }

    return res.status(200).json({ success: true, structured });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    return res.status(500).json({ error: msg });
  }
}
