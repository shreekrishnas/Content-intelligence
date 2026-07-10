import type { VercelRequest, VercelResponse } from '@vercel/node';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000;

const GROUNDING_SYSTEM_PROMPT = `You are a content generation engine for a content intelligence platform. You MUST follow these grounding rules strictly:

GROUNDING CONTRACT:
1. Every claim, statistic, or factual statement in generated content MUST be directly traceable to the provided source references or knowledge base chunks.
2. You MUST NOT use any world knowledge, assumptions, or information not present in the provided inputs.
3. Cite sources using [Source: <title>] for primary sources or [KB: <chunk_reference>] for knowledge base chunks.
4. If you cannot ground a statement in the provided sources, omit it or flag it explicitly.
5. Do NOT hallucinate statistics, quotes, case studies, or facts.
6. When generating content, maintain the persona's tone and the brand voice guidelines while staying grounded in source material.

You return structured JSON. Your output must be valid JSON with no markdown wrapping.`;

interface FileContext {
  file_id: string;
  file_name: string;
  category: string;
  structured?: Record<string, unknown>;
}

interface GenerateRequest {
  task: 'outline' | 'draft' | 'regenerate' | 'quality_review';
  file_context?: FileContext[];
  opportunity: {
    title: string;
    content_angle: string;
    recommended_format: string;
    priority?: string;
    persona_match?: string;
    suggested_cta?: string;
    source_context?: string;
  };
  knowledge_chunks?: Array<{ id: string; content: string; metadata?: Record<string, unknown> }>;
  persona?: {
    name: string;
    description: string;
    tone?: string;
    pain_points?: string[];
    goals?: string[];
  };
  brand_voice?: {
    tone: string;
    style: string;
    guidelines?: string[];
    terminology?: Record<string, string>;
  };
  compliance_rules?: string[];
  existing_content?: string;
  feedback?: string;
  source_refs?: Array<{ title: string; url?: string; excerpt?: string }>;
}

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  options: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured. Add it in Vercel Environment Variables.');

  const model = process.env.LLM_MODEL ?? 'anthropic/claude-3.5-sonnet';
  const maxTokens = options.maxTokens ?? 4096;
  const temperature = options.temperature ?? 0.3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1)));
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

      if (response.status === 429) { lastError = new Error('Rate limited'); continue; }
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
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

const MISSING_KNOWLEDGE_MSG = 'Relevant information is not available in the Knowledge Hub. Please upload a suitable file or add more information before generating this content. You may need brand guidelines, product documents, or relevant research files.';

function buildSourceContext(body: GenerateRequest): string {
  const parts: string[] = [];

  if (body.file_context?.length) {
    const lines = body.file_context.map((f, i) => {
      const s = f.structured as any;
      const summary = s?.summary ? `\n   Summary: ${s.summary}` : '';
      const topics = s?.main_topics?.length ? `\n   Topics: ${s.main_topics.join(', ')}` : '';
      const msgs = s?.key_messages?.length ? `\n   Key messages: ${s.key_messages.slice(0, 3).join(' | ')}` : '';
      return `[KB-File-${i + 1}] "${f.file_name}" (${f.category})${summary}${topics}${msgs}`;
    });
    parts.push(`KNOWLEDGE BASE FILES:\n${lines.join('\n')}`);
  }

  if (body.source_refs?.length) {
    parts.push(
      'SOURCE REFERENCES:\n' +
      body.source_refs.map((ref, i) =>
        `[Source-${i + 1}: ${ref.title}]${ref.url ? ` (${ref.url})` : ''}\n${ref.excerpt ?? 'No excerpt provided'}`
      ).join('\n\n'),
    );
  }

  if (body.knowledge_chunks?.length) {
    parts.push(
      'KNOWLEDGE BASE CHUNKS:\n' +
      body.knowledge_chunks.map((chunk, i) => `[KB-${i + 1}: ${chunk.id}]\n${chunk.content}`).join('\n\n'),
    );
  }

  if (body.persona) {
    parts.push(
      `TARGET PERSONA:\n- Name: ${body.persona.name}\n- Description: ${body.persona.description}${body.persona.tone ? `\n- Tone: ${body.persona.tone}` : ''}${body.persona.pain_points?.length ? `\n- Pain points: ${body.persona.pain_points.join(', ')}` : ''}${body.persona.goals?.length ? `\n- Goals: ${body.persona.goals.join(', ')}` : ''}`,
    );
  }

  if (body.brand_voice) {
    parts.push(
      `BRAND VOICE:\n- Tone: ${body.brand_voice.tone}\n- Style: ${body.brand_voice.style}${body.brand_voice.guidelines?.length ? `\n- Guidelines: ${body.brand_voice.guidelines.join('; ')}` : ''}${body.brand_voice.terminology ? `\n- Terminology: ${Object.entries(body.brand_voice.terminology).map(([k, v]) => `${k} -> ${v}`).join(', ')}` : ''}`,
    );
  }

  if (body.compliance_rules?.length) {
    parts.push(`COMPLIANCE RULES:\n${body.compliance_rules.map((r) => `- ${r}`).join('\n')}`);
  }

  return parts.join('\n\n');
}

function buildOutlinePrompt(body: GenerateRequest, context: string): string {
  return `Generate a structured content outline for the following opportunity.

OPPORTUNITY:
- Title: ${body.opportunity.title}
- Content Angle: ${body.opportunity.content_angle}
- Format: ${body.opportunity.recommended_format}
- Target Persona: ${body.opportunity.persona_match ?? 'General'}
- Source Context: ${body.opportunity.source_context ?? 'N/A'}

${context}

Return a JSON object with this structure (no markdown code fences):
{
  "title": "Working title for the content piece",
  "format": "${body.opportunity.recommended_format}",
  "estimated_word_count": 0,
  "target_persona": "${body.opportunity.persona_match ?? 'General'}",
  "sections": [
    {
      "heading": "Section heading",
      "purpose": "What this section achieves",
      "key_points": ["Point grounded in source [Source: title]"],
      "source_references": ["Which sources support this section"],
      "estimated_words": 0
    }
  ],
  "suggested_cta": "${body.opportunity.suggested_cta ?? 'N/A'}",
  "key_messages": ["Message grounded in source material [Source: title]"],
  "seo_keywords": ["keyword1", "keyword2"],
  "internal_links_suggested": ["Topic areas that could link to other content"]
}

Ground every key point and message in the provided sources. Do not invent claims.`;
}

function buildDraftPrompt(body: GenerateRequest, context: string): string {
  return `Generate publication-ready content based on the following opportunity and outline.

OPPORTUNITY:
- Title: ${body.opportunity.title}
- Content Angle: ${body.opportunity.content_angle}
- Format: ${body.opportunity.recommended_format}
- Target Persona: ${body.opportunity.persona_match ?? 'General'}
- Suggested CTA: ${body.opportunity.suggested_cta ?? 'N/A'}

${body.existing_content ? `OUTLINE / EXISTING CONTENT:\n${body.existing_content}\n\n` : ''}${context}

Return a JSON object with this structure (no markdown code fences):
{
  "title": "Final title",
  "content": "The full content in markdown format, with citations [Source: title] or [KB: id] inline",
  "meta_description": "SEO meta description (under 160 chars)",
  "excerpt": "Short excerpt for previews (under 300 chars)",
  "estimated_read_time_minutes": 0,
  "citations": [
    {
      "reference": "[Source: title] or [KB: id]",
      "context": "What claim this citation supports"
    }
  ],
  "cta": {
    "text": "Call to action text",
    "context": "Why this CTA fits, grounded in source"
  }
}

Write in the brand voice and persona tone specified. Every factual claim must cite its source. Do not invent statistics, quotes, or case studies.`;
}

function buildRegeneratePrompt(body: GenerateRequest, context: string): string {
  return `Revise the following content based on the feedback provided. Maintain grounding in source material.

OPPORTUNITY:
- Title: ${body.opportunity.title}
- Format: ${body.opportunity.recommended_format}

EXISTING CONTENT:
${body.existing_content ?? 'No existing content provided'}

FEEDBACK:
${body.feedback ?? 'No specific feedback provided'}

${context}

Return a JSON object with this structure (no markdown code fences):
{
  "title": "Revised title",
  "content": "The revised content in markdown format, with citations [Source: title] or [KB: id] inline",
  "meta_description": "Updated SEO meta description (under 160 chars)",
  "excerpt": "Updated short excerpt (under 300 chars)",
  "estimated_read_time_minutes": 0,
  "changes_made": [
    {
      "section": "Which part was changed",
      "change": "What was changed and why",
      "feedback_addressed": "Which feedback point this addresses"
    }
  ],
  "citations": [
    {
      "reference": "[Source: title] or [KB: id]",
      "context": "What claim this citation supports"
    }
  ]
}

Preserve all source grounding. If feedback asks for claims you cannot support with sources, flag them instead of inventing facts.`;
}

function buildQualityReviewPrompt(body: GenerateRequest, context: string): string {
  return `Review the following content for quality across multiple dimensions.

OPPORTUNITY:
- Title: ${body.opportunity.title}
- Format: ${body.opportunity.recommended_format}
- Target Persona: ${body.opportunity.persona_match ?? 'General'}

CONTENT TO REVIEW:
${body.existing_content ?? 'No content provided for review'}

${context}

Return a JSON object with this structure (no markdown code fences):
{
  "scores": {
    "language": 0.0,
    "readability": 0.0,
    "india_context": 0.0,
    "brand_tone": 0.0,
    "persona_tone": 0.0,
    "sales_pressure": 0.0,
    "jargon_level": 0.0,
    "source_support": 0.0
  },
  "issues": [
    {
      "severity": "high|medium|low",
      "category": "language|readability|brand_voice|persona_fit|compliance|grounding|tone",
      "description": "What the issue is",
      "location": "Where in the content (quote the relevant text)",
      "suggestion": "How to fix it"
    }
  ],
  "visual_recommendation": {
    "concept": "Describe a visual concept that complements this content",
    "format": "infographic|chart|illustration|photo|diagram|data_visualization",
    "data_callout": "A key data point or quote from the content to highlight visually [Source: title]"
  }
}

Score descriptions:
- language: Grammar, spelling, sentence structure (1.0 = flawless)
- readability: Flesch-Kincaid style assessment (1.0 = very easy to read)
- india_context: Relevance and sensitivity to Indian market context (1.0 = perfectly localized)
- brand_tone: Alignment with brand voice guidelines (1.0 = perfect match)
- persona_tone: Alignment with target persona preferences (1.0 = perfect match)
- sales_pressure: Inverse scale - 1.0 means no pushy sales language, 0.0 means overly salesy
- jargon_level: Inverse scale - 1.0 means accessible language, 0.0 means heavy jargon
- source_support: How well claims are grounded in sources (1.0 = every claim cited)

Flag any claims that lack source citations. Flag any compliance rule violations.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body: GenerateRequest = req.body;

    if (!body.task || !body.opportunity) {
      return res.status(400).json({ error: 'Missing required fields: task and opportunity are required.' });
    }

    const validTasks = ['outline', 'draft', 'regenerate', 'quality_review'];
    if (!validTasks.includes(body.task)) {
      return res.status(400).json({ error: `Invalid task: ${body.task}. Must be one of: ${validTasks.join(', ')}` });
    }

    if ((body.task === 'regenerate' || body.task === 'quality_review') && !body.existing_content) {
      return res.status(400).json({ error: `Task '${body.task}' requires existing_content to be provided.` });
    }

    // Enforce KB requirement: generation must have knowledge to draw from
    const hasKnowledge = (body.knowledge_chunks?.length ?? 0) > 0 || (body.file_context?.length ?? 0) > 0;
    if (!hasKnowledge) {
      return res.status(422).json({ error: MISSING_KNOWLEDGE_MSG });
    }

    const context = buildSourceContext(body);

    let userPrompt: string;
    switch (body.task) {
      case 'outline': userPrompt = buildOutlinePrompt(body, context); break;
      case 'draft': userPrompt = buildDraftPrompt(body, context); break;
      case 'regenerate': userPrompt = buildRegeneratePrompt(body, context); break;
      case 'quality_review': userPrompt = buildQualityReviewPrompt(body, context); break;
      default: throw new Error(`Unhandled task type: ${body.task}`);
    }

    const maxTokens = body.task === 'draft' || body.task === 'regenerate' ? 8192 : 4096;

    const result = await callLLM(GROUNDING_SYSTEM_PROMPT, userPrompt, {
      maxTokens,
      temperature: body.task === 'quality_review' ? 0.1 : 0.3,
    });

    let output;
    try {
      const cleaned = result.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
      output = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({ error: 'Failed to parse generation response as JSON', raw_response: result });
    }

    return res.status(200).json({ success: true, task: body.task, output });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return res.status(500).json({ error: message });
  }
}
