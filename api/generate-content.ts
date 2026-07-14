import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callLLM } from './_lib/llm.js';
import { extractJSON } from './_lib/json.js';
import { handleOptions, sendError } from './_lib/http.js';
import { logUsage } from './_lib/usage.js';
import type { FileContext, KnowledgeChunk } from './_lib/types.js';

const GROUNDING_SYSTEM_PROMPT = `You are a senior content creator for a financial services brand in India. You write high-quality, publication-ready content that marketing teams can use immediately.

CRITICAL OUTPUT RULE: respond with ONLY raw JSON — no markdown fences, no prose before or after, no explanation. Your entire response must be parseable by JSON.parse().

YOUR APPROACH:
- Write content that is specific, concrete, and actionable — not generic or template-like
- Use the opportunity's title, angle, and source context as your primary creative brief
- Where knowledge base material is provided, use it to add brand voice, compliance guardrails, and supporting detail
- Where knowledge base material is absent, draw on the opportunity data itself and your expertise in Indian financial services content
- Every section heading and key point should be a specific claim or insight, not a placeholder
- Write in a tone that suits the target persona — not corporate jargon, not overly casual
- Cite sources where available using [Source: <title>] or [KB: <chunk_id>], but do not block content creation on having citations`;

interface GenerateRequest {
  task: 'outline' | 'draft' | 'regenerate' | 'quality_review';
  file_context?: (FileContext & { structured?: Record<string, unknown> })[];
  opportunity: {
    title: string;
    content_angle: string;
    recommended_format: string;
    priority?: string;
    persona_match?: string;
    suggested_cta?: string;
    source_context?: string;
  };
  knowledge_chunks?: (KnowledgeChunk & { metadata?: Record<string, unknown> })[];
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
  return `Create a detailed content outline for this specific content opportunity. The outline must be publication-ready — specific section headings, concrete talking points, and a clear narrative arc.

CONTENT BRIEF:
- Title: ${body.opportunity.title}
- Unique Angle: ${body.opportunity.content_angle}
- Format: ${body.opportunity.recommended_format}
- Target Persona: ${body.opportunity.persona_match ?? 'General audience'}
- Source Insight: ${body.opportunity.source_context ?? 'N/A'}
- CTA: ${body.opportunity.suggested_cta ?? 'N/A'}

${context || 'No knowledge base files provided — use the content brief and your financial services expertise.'}

Requirements:
- Each section heading must be a specific, descriptive claim — NOT a generic label like "Introduction" or "Benefits"
- Key points must be concrete talking points a writer can expand, not vague topics
- The outline must flow logically and build a persuasive case for the target persona
- Aim for the right length for the format (blog: 4-6 sections; social: 3-4 beats; email: 3 sections)

Return ONLY a JSON object (no markdown fences) with this structure:
{
  "title": "Specific, compelling working title",
  "format": "${body.opportunity.recommended_format}",
  "estimated_word_count": 0,
  "target_persona": "${body.opportunity.persona_match ?? 'General'}",
  "sections": [
    {
      "heading": "Specific section heading — a claim or question, not a label",
      "purpose": "What this section achieves for the reader",
      "key_points": ["Specific talking point with concrete detail", "Another concrete point"],
      "estimated_words": 0
    }
  ],
  "suggested_cta": "Specific call-to-action text",
  "key_messages": ["Core message 1 in one crisp sentence", "Core message 2"],
  "seo_keywords": ["keyword1", "keyword2", "keyword3"]
}`;
}

function buildDraftPrompt(body: GenerateRequest, context: string): string {
  return `Write a complete, publication-ready draft based on the outline below. This must be content a marketing team can publish with minimal editing — not a template, not placeholder text.

CONTENT BRIEF:
- Title: ${body.opportunity.title}
- Unique Angle: ${body.opportunity.content_angle}
- Format: ${body.opportunity.recommended_format}
- Target Persona: ${body.opportunity.persona_match ?? 'General audience'}
- CTA: ${body.opportunity.suggested_cta ?? 'N/A'}

${body.existing_content ? `OUTLINE TO EXPAND:\n${body.existing_content}\n` : ''}
${context || 'No knowledge base files provided — write from the brief and your financial services expertise.'}

Writing standards:
- Open with a hook that speaks directly to the persona's pain point or aspiration
- Use specific numbers, examples, and scenarios where relevant — avoid vague generalities
- Write in active voice, short paragraphs (2-3 sentences), and accessible language
- Format appropriately for the content type (use headers/bullets for blog; tight copy for email/social)
- End with a clear, specific call-to-action that matches the persona's next likely step
- Cite sources where available as [Source: title] or [KB: chunk_id]

Return ONLY a JSON object (no markdown fences) with this structure:
{
  "title": "Final published title",
  "content": "Full content in markdown — complete, ready to publish",
  "meta_description": "SEO meta description under 160 chars",
  "excerpt": "Preview text under 300 chars",
  "estimated_read_time_minutes": 0,
  "cta": {
    "text": "Specific CTA button or link text",
    "context": "Where this CTA leads and why it fits"
  },
  "citations": []
}`;
}

function buildRegeneratePrompt(body: GenerateRequest, context: string): string {
  return `Revise the content below based on the feedback. Make targeted, substantive improvements — do not just rephrase.

CONTENT BRIEF:
- Title: ${body.opportunity.title}
- Format: ${body.opportunity.recommended_format}

EXISTING CONTENT:
${body.existing_content ?? 'No existing content provided'}

FEEDBACK TO ADDRESS:
${body.feedback ?? 'Improve overall quality, specificity, and engagement'}

${context || 'No additional knowledge base files.'}

Apply the feedback precisely. If the feedback is to make content more specific, add concrete details. If to change tone, rewrite the relevant sections. If to shorten, cut ruthlessly. Return ONLY a JSON object (no markdown fences):
{
  "title": "Revised title if changed",
  "content": "Full revised content in markdown",
  "meta_description": "Updated SEO meta description under 160 chars",
  "excerpt": "Updated preview text under 300 chars",
  "estimated_read_time_minutes": 0,
  "changes_made": [
    {
      "section": "Which part changed",
      "change": "What specifically changed",
      "feedback_addressed": "Which feedback point this resolves"
    }
  ],
  "citations": []
}`;
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
- source_support: If knowledge base sources were provided, how well claims are grounded in them (1.0 = well supported). If NO sources were provided, score this 1.0 and do not penalize — the content was written from the brief.

Only flag missing citations when knowledge base sources were actually provided above. Flag any compliance rule violations. Focus your issues on specificity, clarity, persona fit, and engagement.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') return sendError(res, 405, 'method_not_allowed', 'Method not allowed');

  try {
    const body: GenerateRequest = req.body;

    if (!body.task || !body.opportunity) {
      return sendError(res, 400, 'missing_fields', 'Missing required fields: task and opportunity are required.');
    }

    const validTasks = ['outline', 'draft', 'regenerate', 'quality_review'];
    if (!validTasks.includes(body.task)) {
      return sendError(res, 400, 'invalid_task', `Invalid task: ${body.task}. Must be one of: ${validTasks.join(', ')}`);
    }

    if ((body.task === 'regenerate' || body.task === 'quality_review') && !body.existing_content) {
      return sendError(res, 400, 'missing_content', `Task '${body.task}' requires existing_content to be provided.`);
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

    const maxTokens = 8192;

    const { content: raw, usage } = await callLLM(GROUNDING_SYSTEM_PROMPT, userPrompt, {
      maxTokens,
      temperature: body.task === 'quality_review' ? 0.1 : 0.45,
    });
    logUsage(null, 'generate-content', usage);

    let output;
    try {
      output = extractJSON(raw);
    } catch {
      const preview = raw.slice(0, 300).replace(/\n/g, ' ');
      return sendError(res, 502, 'parse_error', `Generation failed: the model returned an unexpected response. Try again or reduce content length. Preview: "${preview}..."`);
    }

    return res.status(200).json({ success: true, task: body.task, output });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return sendError(res, 500, 'internal_error', message);
  }
}
