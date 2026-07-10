import type { VercelRequest, VercelResponse } from '@vercel/node';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000;

const GROUNDING_SYSTEM_PROMPT = `You are a senior content strategist for a financial services brand. Your job is to turn raw source material into specific, actionable content opportunities that a marketing team can execute immediately.

CRITICAL OUTPUT RULE: respond with ONLY raw JSON — no markdown fences, no prose before or after. Your entire response must be parseable by JSON.parse().

YOUR ROLE:
- Extract the most valuable, specific, shareable insights from the source
- Suggest CONCRETE content ideas with real angles — not generic templates
- Match content to the right audience with real persona-specific angles
- Every opportunity title should be a specific headline a writer could use directly
- Use your knowledge of content marketing, audience psychology, and format effectiveness
- Do NOT just restate what the source says — synthesise it into publishable ideas`;

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

interface FileContext {
  file_id: string;
  file_name: string;
  category: string;
  structured?: Record<string, unknown>;
}

interface AnalyzeRequest {
  source_text: string;
  source_type: string;
  source_title: string;
  source_owner?: string;
  source_url?: string;
  marketing_notes?: string;
  knowledge_chunks?: Array<{ id: string; content: string; metadata?: Record<string, unknown> }>;
  file_context?: FileContext[];
  personas?: Array<{ name: string; description: string; pain_points?: string[]; goals?: string[] }>;
  account_id: string;
}

function buildFileContextSection(files: FileContext[]): string {
  if (!files?.length) return '';
  const lines = files.map((f, i) => {
    const s = f.structured as any;
    const summary = s?.summary ? `\n   Summary: ${s.summary}` : '';
    const topics = s?.main_topics?.length ? `\n   Topics: ${s.main_topics.join(', ')}` : '';
    const messages = s?.key_messages?.length ? `\n   Key messages: ${s.key_messages.slice(0, 3).join(' | ')}` : '';
    return `[KB-File-${i + 1}] "${f.file_name}" (${f.category})${summary}${topics}${messages}`;
  });
  return `\n\nKNOWLEDGE BASE FILES:\n${lines.join('\n')}`;
}

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  options: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured. Add it in Vercel Environment Variables.');
  }

  const model = process.env.LLM_MODEL ?? 'anthropic/claude-sonnet-4-5';
  const maxTokens = options.maxTokens ?? 4096;
  const temperature = options.temperature ?? 0.3;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }

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
          model,
          max_tokens: maxTokens,
          temperature,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (response.status === 429) {
        lastError = new Error('Rate limit reached. Please wait a moment and try again.');
        continue;
      }
      if (!response.ok) {
        let msg: string;
        try {
          const body = await response.json();
          const detail = body?.error?.message || 'Unknown error';
          if (response.status === 401) msg = 'Invalid API key. Check your OPENROUTER_API_KEY in Vercel Environment Variables.';
          else if (response.status === 402) msg = 'OpenRouter account has insufficient credits. Add credits at openrouter.ai.';
          else if (response.status === 404) msg = `Model not found on OpenRouter. Set a valid LLM_MODEL in Vercel Environment Variables. Detail: ${detail}`;
          else msg = `LLM service error (${response.status}): ${detail}`;
        } catch {
          msg = `LLM service error (${response.status}). Please try again.`;
        }
        throw new Error(msg);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('No content in LLM response');
      return content;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Rate limited')) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new Error('Failed to call LLM after retries');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body: AnalyzeRequest = req.body;

    if (!body.source_text || !body.source_type || !body.source_title || !body.account_id) {
      return res.status(400).json({
        error: 'Missing required fields: source_text, source_type, source_title, and account_id are required.',
      });
    }

    const fileContextSection = body.file_context?.length ? buildFileContextSection(body.file_context) : '';
    const knowledgeSection = body.knowledge_chunks?.length
      ? `\n\nKNOWLEDGE BASE CHUNKS:\n${body.knowledge_chunks.map((chunk, i) => `[KB-${i + 1}: ${chunk.id}]\n${chunk.content}`).join('\n\n')}`
      : '';

    const personaSection = body.personas?.length
      ? `\n\nTARGET PERSONAS:\n${body.personas.map((p) => `- ${p.name}: ${p.description}${p.pain_points?.length ? `\n  Pain points: ${p.pain_points.join(', ')}` : ''}${p.goals?.length ? `\n  Goals: ${p.goals.join(', ')}` : ''}`).join('\n')}`
      : '';

    const marketingSection = body.marketing_notes
      ? `\n\nMARKETING NOTES:\n${body.marketing_notes}`
      : '';

    const userPrompt = `You are analysing source content for a financial services content team. Extract specific, usable marketing insights and content opportunities.

SOURCE: "${body.source_title}" — ${body.source_type} by ${body.source_owner ?? 'Unknown'}
${marketingSection}${fileContextSection}${knowledgeSection}${personaSection}

SOURCE CONTENT:
${String(body.source_text).slice(0, 12000)}

---
Now output a JSON object. Rules:
- "summary": 2-3 sentences describing what this source is about and why it matters for content
- "topics": 3-6 specific topic strings extracted from the source (not generic — e.g. "AIF minimum investment of 1 crore" not "investing")
- "insights": 4-6 insights that a marketer can act on. Each "text" must be a specific, surprising, or counterintuitive point from the source — not a restatement. "confidence" is high/medium/low. "source_reference" is a short direct quote.
- "persona_matches": match the source content to the personas listed above (or infer likely audience from content if none given). "relevance_score" 0.0-1.0. "suggested_angle" must be a specific hook, not generic ("Why HNI investors are switching from MFs to AIFs despite the 1Cr lock-in" not "Investment advice for HNIs").
- "depth_analysis": for each major topic, rate depth as surface/moderate/deep and list specific key points and what the source does NOT cover (gaps)
- "opportunities": 4-6 SPECIFIC content opportunities. Each "title" must be a publishable headline (specific, compelling — something a writer could use directly). "content_angle" is the specific unique angle. "recommended_format" is blog_post/social_post/email/case_study/video_script/carousel/infographic. "priority" is high/medium/low. "persona_match" names the target. "suggested_cta" is specific. "source_context" is the key quote/point that inspired this opportunity.
- "quality_check": rate source_richness/actionability/uniqueness/completeness as high/medium/low
- "warnings": any content risks, compliance concerns, or gaps worth flagging (empty array if none)

Output ONLY the raw JSON object, no fences, no extra text.`;

    const result = await callLLM(GROUNDING_SYSTEM_PROMPT, userPrompt, {
      maxTokens: 8192,
      temperature: 0.2,
    });

    let analysis;
    try {
      analysis = extractJSON(result);
    } catch {
      const preview = result.slice(0, 300).replace(/\n/g, ' ');
      return res.status(502).json({
        error: `Analysis failed: the model returned an unexpected response. Try with shorter content or fewer knowledge files. Preview: "${preview}..."`,
      });
    }

    return res.status(200).json({ success: true, analysis, id: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return res.status(500).json({ error: message });
  }
}
