import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callLLM } from './_lib/llm.js';
import { extractJSON } from './_lib/json.js';
import { handleOptions, sendError } from './_lib/http.js';
import { logUsage } from './_lib/usage.js';
import type { FileContext, KnowledgeChunk } from './_lib/types.js';

const GROUNDING_SYSTEM_PROMPT = `You are a senior content creator and editor. You write high-quality, publication-ready content that marketing teams can use immediately - across any industry, brand, or audience.

CRITICAL OUTPUT RULE: respond with ONLY raw JSON - no markdown fences, no prose before or after, no explanation. Your entire response must be parseable by JSON.parse().

WRITING RULE - NO EM DASHES: Never use em dashes (-) anywhere in the content you write. Use a hyphen (-), a colon, or restructure the sentence instead.

YOUR APPROACH:
- Write content that is specific, concrete, and actionable - not generic or template-like
- Use the opportunity's title, angle, persona, and source context as your primary creative brief
- Where knowledge base material is provided, use it for brand voice, compliance guardrails, facts, and supporting detail
- Where knowledge base material is absent, draw on the opportunity data and your content expertise
- Every section heading and key point should be a specific claim or insight, not a placeholder like "Introduction" or "Benefits"
- Write in a tone that suits the target persona - not corporate jargon, not overly casual
- Cite sources where available using [Source: <title>] or [KB: <chunk_id>], but do not block content creation on having citations

FORMAT STANDARDS YOU MUST FOLLOW:

BLOG POST / ARTICLE:
- Ideal length: 1,500–2,500 words. Match complexity to topic.
- Structure: Exactly ONE H1 (the title). H2s divide major sections (4–6 sections). H3s for subsections within H2s.
- Paragraphs: 2–3 sentences maximum. Never exceed 4.
- Hook intro: First paragraph must state the problem or insight directly. No "In today's world…" or "Have you ever wondered…" openers.
- Include a FAQ section (5–8 Q&As targeting People Also Ask variants) - highest-leverage addition for SEO and AI overviews.
- Internal link slots: note [INTERNAL LINK: topic] every 300–400 words where a related article would fit.
- End with ONE specific CTA - not vague "learn more" - tied to the persona's next logical step.
- SEO: primary keyword in H1, first 100 words, at least 2 H2s, and the meta description (under 160 chars).

LINKEDIN POST:
- Length: 150–300 words. Hard stop at 3,000 characters.
- First line (hook): must be a specific stat, bold claim, or sharp question. No "I'm excited to share…"
- Structure: Hook → 3–5 short insight lines (one idea per line, line break after each) → CTA.
- Every line break = one idea. Never paragraph-dump.
- CTA: specific action (comment, link, DM) - not "what do you think?"

LINKEDIN CAROUSEL:
- Slide 1 (hook): bold claim or problem statement - makes someone stop scrolling.
- Slides 2–8: ONE insight or step per slide. Headline + 1–2 sentences of body. No slide should have more than 40 words.
- Last slide: CTA slide - what to do next.
- Caption: 100–200 words with the hook from slide 1 restated, brief context, and CTA.

EMAIL:
- Subject line: under 50 characters, specific benefit or curiosity gap. No "Newsletter #12."
- Preheader (preview text): 40–80 chars that complement the subject line.
- Opener: address the reader's situation directly. One sentence. No "Hope this finds you well."
- Body: ONE core insight or offer per email. 150–300 words body. Short paragraphs.
- CTA: one button/link, above the fold where possible. Verb + object ("Download the guide", "Book your call").

SHORT VIDEO / REEL SCRIPT:
- Hook (0–3 seconds): spoken line + visual action that stops scrolling. Must address a pain or curiosity immediately.
- Structure: Hook → Problem → Insight/Solution → Proof or Example → CTA.
- Total length: 30–90 seconds. Write as a verbatim script with [VISUAL: ...] stage directions.
- Captions: assume 80% of viewers watch on mute - every key point must appear as on-screen text.

QUOTE CARD:
- One powerful sentence - a specific claim, stat, or insight from the source. Not a motivational platitude.
- Attribution: name + role/brand.
- Visual note: background mood, typography guidance.

THOUGHT-LEADERSHIP ESSAY:
- POV-led: opens with a specific, arguable claim the author is willing to defend.
- Structure: Claim → Evidence → Implication → Call to rethink.
- Length: 600–1,000 words. No fluffy filler.
- First-person voice. Specific examples over abstract principles.`;


interface GenerateRequest {
  task: 'outline' | 'draft' | 'regenerate' | 'quality_review';
  account_id?: string;
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
  const fmt = (body.opportunity.recommended_format || '').toLowerCase();
  const isBlog = fmt.includes('blog') || fmt.includes('article') || fmt.includes('guide');
  const isEmail = fmt.includes('email') || fmt.includes('newsletter');
  const isCarousel = fmt.includes('carousel');
  const isVideo = fmt.includes('video') || fmt.includes('reel') || fmt.includes('script');
  const isLinkedIn = fmt.includes('linkedin') && !isCarousel;
  const isEssay = fmt.includes('essay') || fmt.includes('thought');

  const formatGuidance = isBlog
    ? `FORMAT RULES (Blog/Article):
- Section count: 4–6 H2 sections + intro + conclusion.
- Include a dedicated FAQ section (5–8 Q&As) as one of the H2s.
- Include an intro section and a conclusion/CTA section.
- Estimated total word count: 1,500–2,500 words.
- Suggest 3–5 SEO keywords; primary keyword should appear in title and first H2.`
    : isEmail
    ? `FORMAT RULES (Email):
- Structure: Subject Line + Preheader → Opener (1 sentence) → Body (1 main insight) → CTA.
- 3 sections max. Estimated word count: 200–400 words.
- Subject line must be under 50 characters; preheader 40–80 characters.`
    : isCarousel
    ? `FORMAT RULES (Carousel):
- Structure: Slide 1 (hook) + Slides 2–8 (one insight each) + Final slide (CTA).
- Each "section" = one slide. 6–9 slides total.
- Each slide: headline + 1–2 sentence body (max 40 words per slide).
- Include post caption as the final section.`
    : isVideo
    ? `FORMAT RULES (Video/Reel Script):
- Structure: Hook (0–3s) → Problem (3–15s) → Insight/Solution (15–45s) → Proof/Example (45–70s) → CTA (last 5s).
- 5 beats. Include [VISUAL: ...] direction for each beat.
- Total runtime: 30–90 seconds.`
    : isLinkedIn
    ? `FORMAT RULES (LinkedIn Post):
- Structure: Hook line → 3–5 insight lines → CTA.
- 5–7 beats. Each beat = 1–2 sentences, line-broken.
- Estimated word count: 150–300 words.`
    : isEssay
    ? `FORMAT RULES (Thought-Leadership Essay):
- Structure: Claim → Evidence → Implication → Call to rethink.
- 4 sections. Estimated word count: 600–1,000 words. First-person POV.`
    : `FORMAT RULES: Aim for 3–6 logical sections appropriate to the format. Each section has a clear purpose.`;

  return `Create a detailed content outline for this specific content opportunity. The outline must be publication-ready - specific section headings, concrete talking points, and a clear narrative arc.

CONTENT BRIEF:
- Title: ${body.opportunity.title}
- Unique Angle: ${body.opportunity.content_angle}
- Format: ${body.opportunity.recommended_format}
- Target Persona: ${body.opportunity.persona_match ?? 'General audience'}
- Source Insight: ${body.opportunity.source_context ?? 'N/A'}
- CTA: ${body.opportunity.suggested_cta ?? 'N/A'}

${formatGuidance}

${context || 'No knowledge base files provided - use the content brief and your expertise.'}

Requirements:
- Each section heading must be a specific, descriptive claim - NOT a generic label like "Introduction" or "Benefits"
- Key points must be concrete talking points a writer can expand, not vague topics
- The outline must flow logically and build a persuasive case for the target persona

Return ONLY a JSON object (no markdown fences) with this structure:
{
  "title": "Specific, compelling working title",
  "format": "${body.opportunity.recommended_format}",
  "estimated_word_count": 0,
  "target_persona": "${body.opportunity.persona_match ?? 'General'}",
  "sections": [
    {
      "heading": "Specific section heading - a claim or question, not a label",
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
  const fmt = (body.opportunity.recommended_format || '').toLowerCase();
  const isBlog = fmt.includes('blog') || fmt.includes('article') || fmt.includes('guide');
  const isEmail = fmt.includes('email') || fmt.includes('newsletter');
  const isCarousel = fmt.includes('carousel');
  const isVideo = fmt.includes('video') || fmt.includes('reel') || fmt.includes('script');
  const isLinkedIn = fmt.includes('linkedin') && !isCarousel;
  const isEssay = fmt.includes('essay') || fmt.includes('thought');
  const isQuote = fmt.includes('quote');

  const formatDraftRules = isBlog
    ? `BLOG DRAFT RULES (apply strictly):
1. Write ONE H1 (the final title). Do NOT use H1 anywhere else in the body.
2. Use H2 for major sections (4–6 H2s). Use H3 for subsections within H2s.
3. Paragraphs: 2–3 sentences max. Never write a 4+ sentence paragraph.
4. HOOK (intro): First paragraph states the reader's problem or the core insight in 2–3 sentences. No "In today's world" openers. No "Have you ever wondered" questions.
5. Include a FAQ section as one of the H2s with 5–8 Q&As. Label it "## Frequently Asked Questions".
6. Add [INTERNAL LINK: <topic>] every 300–400 words where a related article would fit.
7. End with a CTA section: one specific action the reader should take next (not "learn more").
8. SEO: primary keyword in H1, within first 100 words, and in at least 2 H2s.
9. Target: 1,500–2,500 words.`
    : isEmail
    ? `EMAIL DRAFT RULES (apply strictly):
1. Start with: Subject: <under 50 chars> and Preheader: <40–80 chars> on separate lines.
2. Opener: one sentence addressing the reader's situation. No "Hope this finds you well."
3. Body: ONE core insight or offer. 150–300 words. Short paragraphs (2–3 sentences).
4. CTA: one clear action. Verb + object. ("Download the guide", "Book your call"). Above the fold.
5. Sign-off: brief, personal. No "Best regards" boilerplate.`
    : isCarousel
    ? `CAROUSEL DRAFT RULES (apply strictly):
1. Slide 1 (Hook): A bold claim, stat, or sharp question - makes someone stop scrolling. 10–15 words headline + 1 sentence body max.
2. Slides 2–8: ONE insight per slide. Headline (8–12 words) + 1–2 sentence body (max 40 words per slide). No slide should try to cover two ideas.
3. Final slide (CTA): what to do next. Clear verb + destination.
4. Post Caption: 100–200 words. Restate hook, brief context, CTA, 3–5 relevant hashtags.
5. Format each slide in markdown as: ### Slide N: [Headline] then body.`
    : isVideo
    ? `VIDEO/REEL SCRIPT RULES (apply strictly):
1. Hook (0–3s): the FIRST spoken line + a [VISUAL: ...] direction. Must address a pain or curiosity immediately. No "Hey guys" or channel intros.
2. Problem (3–15s): state the problem or tension concisely.
3. Insight/Solution (15–45s): deliver the core value. Use specific examples.
4. Proof/Example (45–70s): one concrete proof point - a stat, story beat, or before/after.
5. CTA (last 5s): one action. Clear and specific.
6. Write as a verbatim script. Every key point gets an [ON-SCREEN TEXT: ...] note - assume 80% of viewers watch on mute.
7. Target runtime: 30–90 seconds.`
    : isLinkedIn
    ? `LINKEDIN POST RULES (apply strictly):
1. Hook (first line): specific stat, bold claim, or sharp question. Under 200 characters. This must make someone pause scrolling.
2. Line break after EVERY 1–2 sentences. No paragraph walls.
3. Core insight: 3–5 short insight lines. One idea per line.
4. CTA last line: specific action (comment with X, click link below, DM for Y).
5. Under 3,000 characters total. Sweet spot: 150–300 words.
6. No hashtags in body. Max 3 hashtags at the very end if used.`
    : isEssay
    ? `THOUGHT-LEADERSHIP ESSAY RULES (apply strictly):
1. Open with your POV - a specific, arguable claim in the first sentence. Not a question. Not context-setting.
2. Structure: Claim → Evidence → Implication → Call to rethink.
3. First-person voice throughout. Specific examples over abstract principles.
4. 600–1,000 words.
5. No bullet lists - this is prose. Arguments, not tips.
6. End by restating the claim and why it matters NOW.`
    : isQuote
    ? `QUOTE CARD RULES: One powerful, specific sentence from the source (a claim, stat, or insight - not a platitude). Attribution on next line. Visual note on third line.`
    : `Write using the format standards described in your system prompt. Apply the appropriate structure for this content type.`;

  return `Write a complete, publication-ready draft based on the outline below. This must be content a marketing team can publish with minimal editing - not a template, not placeholder text.

CONTENT BRIEF:
- Title: ${body.opportunity.title}
- Unique Angle: ${body.opportunity.content_angle}
- Format: ${body.opportunity.recommended_format}
- Target Persona: ${body.opportunity.persona_match ?? 'General audience'}
- CTA: ${body.opportunity.suggested_cta ?? 'N/A'}

${formatDraftRules}

${body.existing_content ? `OUTLINE TO EXPAND:\n${body.existing_content}\n` : ''}
${context || 'No knowledge base files provided - write from the brief and your expertise.'}

Universal writing standards (apply on top of format rules):
- Use specific numbers, names, and scenarios - avoid vague generalities
- Write in active voice
- Cite sources where available as [Source: title] or [KB: chunk_id]

Return ONLY a JSON object (no markdown fences) with this structure:
{
  "title": "Final published title",
  "content": "Full content in markdown - complete, ready to publish",
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
  return `Revise the content below based on the feedback. Make targeted, substantive improvements - do not just rephrase.

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
  const fmt = (body.opportunity.recommended_format || '').toLowerCase();
  const isBlog = fmt.includes('blog') || fmt.includes('article') || fmt.includes('guide');
  const isEmail = fmt.includes('email') || fmt.includes('newsletter');
  const isCarousel = fmt.includes('carousel');
  const isVideo = fmt.includes('video') || fmt.includes('reel');
  const isLinkedIn = fmt.includes('linkedin') && !isCarousel;

  const formatChecklist = isBlog
    ? `FORMAT CHECKLIST (Blog):
□ Has exactly ONE H1 tag (the title)?
□ Has 4–6 H2 sections with specific claim-based headings (not generic labels)?
□ Has a FAQ section with 5–8 Q&As?
□ Paragraphs are 2–3 sentences max?
□ Hook intro does NOT open with a cliché ("In today's world", "Have you ever wondered")?
□ Has a specific, non-generic CTA at the end?
□ Has [INTERNAL LINK] suggestions?
□ Word count is between 1,500–2,500 words?
□ Primary keyword in H1 and first 100 words?
Flag each unmet item as a medium or high issue depending on impact.`
    : isEmail
    ? `FORMAT CHECKLIST (Email):
□ Has a subject line under 50 characters?
□ Has a preheader (preview text) 40–80 chars?
□ Opener avoids "Hope this finds you well" or similar filler?
□ Has ONE clear CTA (not multiple competing asks)?
□ Body is 150–300 words?
□ CTA is specific (verb + object)?
Flag each unmet item.`
    : isCarousel
    ? `FORMAT CHECKLIST (Carousel):
□ Slide 1 is a hook (bold claim, stat, or sharp question)?
□ Each slide has only ONE insight?
□ No slide exceeds 40 words body copy?
□ Final slide is a CTA?
□ Post caption is 100–200 words with hashtags?
Flag each unmet item.`
    : isVideo
    ? `FORMAT CHECKLIST (Video Script):
□ Hook appears in first 3 seconds (spoken + visual)?
□ Follows Hook → Problem → Insight → Proof → CTA structure?
□ Has [ON-SCREEN TEXT] notes for mute viewers?
□ Has [VISUAL] stage directions?
□ Stays within 30–90 second runtime?
Flag each unmet item.`
    : isLinkedIn
    ? `FORMAT CHECKLIST (LinkedIn Post):
□ First line is a specific hook (stat, bold claim, or question)?
□ Line breaks after every 1–2 sentences?
□ Under 3,000 characters?
□ Has a specific CTA (not "what do you think?")?
□ No paragraph walls?
Flag each unmet item.`
    : '';

  return `Review the following content for quality across multiple dimensions.

OPPORTUNITY:
- Title: ${body.opportunity.title}
- Format: ${body.opportunity.recommended_format}
- Target Persona: ${body.opportunity.persona_match ?? 'General'}

CONTENT TO REVIEW:
${body.existing_content ?? 'No content provided for review'}

${context}

${formatChecklist}

Return a JSON object with this structure (no markdown code fences):
{
  "scores": {
    "language": 0.0,
    "readability": 0.0,
    "hook_strength": 0.0,
    "structure_compliance": 0.0,
    "brand_tone": 0.0,
    "persona_fit": 0.0,
    "specificity": 0.0,
    "cta_clarity": 0.0,
    "sales_pressure": 0.0,
    "source_support": 0.0
  },
  "issues": [
    {
      "severity": "high|medium|low",
      "category": "language|readability|structure|hook|brand_voice|persona_fit|compliance|grounding|cta|specificity",
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
- readability: Paragraph length, sentence complexity, accessibility (1.0 = very easy to read)
- hook_strength: How well the opening grabs the target persona (1.0 = immediate, compelling hook)
- structure_compliance: How closely the content follows the format rules for its type (1.0 = perfect)
- brand_tone: Alignment with brand voice guidelines from the knowledge base (1.0 = perfect match)
- persona_fit: How well the content speaks to the target persona's pain points and goals (1.0 = perfect)
- specificity: Use of concrete numbers, examples, scenarios vs vague generalities (1.0 = highly specific)
- cta_clarity: How clear and specific the call-to-action is (1.0 = crystal clear next step)
- sales_pressure: Inverse - 1.0 means no pushy language, 0.0 means overly salesy
- source_support: If KB sources were provided, how well claims are grounded (1.0 = well supported). If NO sources were provided, score 1.0 - do not penalize.

Only flag missing citations when knowledge base sources were actually provided above. Flag any compliance rule violations. Focus issues on hook strength, specificity, structure, persona fit, and CTA clarity.`;
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

    const maxTokens = 6500;

    const { content: raw, usage } = await callLLM(GROUNDING_SYSTEM_PROMPT, userPrompt, {
      maxTokens,
      temperature: body.task === 'quality_review' ? 0.1 : 0.45,
    });
    logUsage({ accountId: body.account_id }, 'generate-content', usage);

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
