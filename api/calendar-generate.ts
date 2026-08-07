import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callLLM } from './_lib/llm.js';
import { extractJSON } from './_lib/json.js';
import { handleOptions, sendError } from './_lib/http.js';
import { getServiceClient } from './_lib/supabase.js';
import { logUsage } from './_lib/usage.js';

// Right Horizons content DNA — fixed per brand spec.
const RH_PILLARS = [
  'Retirement Planning',   // 35%
  'NRI Wealth',            // 27%
  'ESOPs',                 // 15%
  'Family Office',         // 12%
  'Emerging Topics',       // 11%
] as const;

// Pillar weight → number of posts out of 20
const PILLAR_WEIGHTS: Record<string, number> = {
  'Retirement Planning': 7,   // 35%
  'NRI Wealth': 5,            // 27%
  'ESOPs': 3,                 // 15%
  'Family Office': 3,         // 12%
  'Emerging Topics': 2,       // 11%
};

const SYSTEM_PROMPT = `You are the lead content strategist for Right Horizons, a SEBI-registered fee-only financial planning firm based in India. Right Horizons serves HNI clients — primarily senior corporate professionals, NRIs, ESOP holders, and family wealth owners.

Generate a monthly LinkedIn + Instagram content calendar for Right Horizons. Every post must reflect the firm's brand: data-backed, jargon-busted, trust-first, never salesy.

RIGHT HORIZONS CONTENT DNA:
- Retirement Planning (35%) — EPF, NPS, SWP strategies, post-retirement corpus drawdown, timeline planning for corporate professionals retiring at 55-60.
- NRI Wealth (27%) — DTAA optimisation, FEMA compliance, NRE/NRO/FCNR structuring, repatriation, India-entry for returning NRIs.
- ESOPs (15%) — ESOP taxation (perquisite + capital gains), vesting strategy, concentrated equity risk, diversification playbook.
- Family Office (12%) — Succession planning, will and trust structures, HUF strategy, intergenerational wealth transfer, family governance.
- Emerging Topics (11%) — Budget announcements, SEBI rule changes, market commentary grounded in Right Horizons' POV.

POST TYPE DISTRIBUTION (follow exactly):
- Carousel: 42% — multi-slide educational breakdowns, step-by-step frameworks
- Static Image: 38% — single punchy stat, myth-bust, quote from insight
- Reel: 10% — 30–60 sec script, hook in first 3 seconds, one key takeaway
- Poll: 10% — binary or A/B question that surfaces a knowledge gap or common misconception

DEPTH LEVELS:
- Level 1 (Foundational): Define the concept, why it matters, broad audience
- Level 2 (Intermediate): Scenario-based, specific numbers/thresholds, practitioner-level
- Level 3+ (Advanced): Edge cases, uncommon angles, expert-to-expert tone

BRAND VOICE: Authoritative but approachable. No jargon without explanation. Specific numbers > vague claims. Real client scenarios > hypotheticals. Compliance-aware (no explicit return promises).

WRITING RULES:
- Every title must name a fact, threshold, scenario, or named regulation — no "The Ultimate Guide to X" or "Top 5 Tips for Y"
- Every hook must stop a scroll: a surprising number, a common mistake named directly, or a misconception challenged
- body_points: 4 actionable bullets the designer can turn into slide copy or caption lines
- cta: specific verb + object + destination — not "Learn more" or "Follow us"
- hashtags: 4–6, mix (#RetirementPlanning #NRIInvesting #ESOPs #FamilyOffice #WealthManagement #RightHorizons)
- No em dashes. Hyphen or restructure instead.
- Compliance: never promise specific returns; use "historically", "can help", "potential"

CRITICAL: Respond with ONLY raw JSON parseable by JSON.parse(). No markdown fences, no prose.

Output schema — "posts" array, each post:
{
  "post_date": "YYYY-MM-DD",
  "pillar": "Retirement Planning" | "NRI Wealth" | "ESOPs" | "Family Office" | "Emerging Topics",
  "post_type": "Carousel" | "Static Image" | "Reel" | "Poll",
  "title": "Specific publishable title (max 85 chars)",
  "hook": "Opening line that stops the scroll (max 160 chars)",
  "body_points": ["point 1", "point 2", "point 3", "point 4"],
  "cta": "Verb + object + destination",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]
}`;

function kbSection(chunks: Array<{ content: string; file_name: string; category: string }>): string {
  if (!chunks.length) return '\nNo knowledge base provided — rely on Right Horizons brand voice and financial planning expertise.';
  return `\nRIGHT HORIZONS KNOWLEDGE BASE (ground all content in these brand facts, client scenarios, and compliance notes):\n${
    chunks.slice(0, 20).map((c, i) => `[KB-${i + 1}] (${c.category} / ${c.file_name})\n${c.content.slice(0, 1200)}`).join('\n\n')
  }`;
}

function avoidSection(titles: string[]): string {
  if (!titles.length) return '';
  return `\n\nDO NOT REPEAT — generate fresh angles for all of these past Right Horizons posts:\n${
    titles.slice(0, 60).map((t) => `- ${t}`).join('\n')
  }`;
}

function buildPillarInstructions(total: number): { pillarList: string; typeDist: string } {
  const pillarLines = Object.entries(PILLAR_WEIGHTS).map(([p, n]) => `- ${p}: ${n} posts`);
  const carousel = Math.round(total * 0.42);
  const staticImg = Math.round(total * 0.38);
  const reel = Math.round(total * 0.10);
  const poll = total - carousel - staticImg - reel;
  const typeLines = [
    `- Carousel: ${carousel} posts`,
    `- Static Image: ${staticImg} posts`,
    `- Reel: ${reel} posts`,
    `- Poll: ${Math.max(0, poll)} posts`,
  ];
  return { pillarList: pillarLines.join('\n'), typeDist: typeLines.join('\n') };
}

function getPostDatesForMonth(month: string, count: number): string[] {
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const allDays: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, mon - 1, d);
    if (dt.getDay() !== 0) { // skip Sundays
      allDays.push(`${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
  }
  if (allDays.length <= count) return allDays;
  const step = allDays.length / count;
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(allDays[Math.min(Math.round(i * step), allDays.length - 1)]);
  }
  return picked;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') { sendError(res, 405, 'method_not_allowed', 'POST required'); return; }

  const { account_id, month, context = '', post_count = 20 } = req.body || {};
  if (!account_id) { sendError(res, 400, 'missing_account', 'account_id is required'); return; }
  if (!month || !/^\d{4}-\d{2}$/.test(month)) { sendError(res, 400, 'invalid_month', 'month must be YYYY-MM'); return; }

  const count = Math.min(Math.max(Number(post_count) || 20, 10), 30);
  const admin = getServiceClient();

  // ---- 1. RAG: pull KB chunks (brand/guidelines/persona first) -------------
  const { data: kbRows } = await admin
    .from('knowledge_chunks')
    .select('chunk_text, knowledge_files!inner(file_name, category)')
    .eq('account_id', account_id)
    .eq('knowledge_files.active', true)
    .eq('knowledge_files.ingest_status', 'ready')
    .limit(200);

  const kbChunks = (kbRows || [])
    .map((r: any) => ({
      content: r.chunk_text as string,
      file_name: (r.knowledge_files?.file_name || 'unknown') as string,
      category: (r.knowledge_files?.category || 'unknown') as string,
    }))
    .filter((c) => c.content && c.content.length > 50);

  const priority = ['brand', 'guidelines', 'compliance', 'persona'];
  const priorityChunks = kbChunks.filter((c) => priority.includes(c.category));
  const otherChunks = kbChunks.filter((c) => !priority.includes(c.category));
  const selectedChunks = [
    ...priorityChunks.slice(0, 14),
    ...otherChunks.slice(0, 6),
  ].slice(0, 20);

  // ---- 2. Level escalation: depth increases with each generation -----------
  const { count: existingCount } = await admin
    .from('calendar_posts')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', account_id);

  const level = Math.min(3, Math.floor(((existingCount || 0) / 20)) + 1);

  // ---- 3. Repetition avoidance: last 200 Right Horizons titles ------------
  const { data: pastRows } = await admin
    .from('calendar_posts')
    .select('title')
    .eq('account_id', account_id)
    .order('created_at', { ascending: false })
    .limit(200);
  const pastTitles = (pastRows || []).map((r: any) => r.title as string).filter(Boolean);

  // ---- 4. Build prompt -----------------------------------------------------
  const postDates = getPostDatesForMonth(month, count);
  const { pillarList, typeDist } = buildPillarInstructions(count);

  const userPrompt = `Generate a ${count}-post Right Horizons content calendar for ${month}.

DEPTH LEVEL: ${level} (${level === 1 ? 'Foundational — broad concepts, clear definitions' : level === 2 ? 'Intermediate — specific scenarios, real thresholds and numbers' : 'Advanced — edge cases, uncommon angles, expert-to-expert'})

POST DATES (assign one post per date, in chronological order):
${postDates.join(', ')}

PILLAR DISTRIBUTION (assign posts across pillars in roughly these counts):
${pillarList}

POST TYPE DISTRIBUTION (use exactly this count for each type):
${typeDist}

${context ? `THIS MONTH'S FOCUS — weave into relevant posts:\n${String(context).slice(0, 500)}\n` : ''}
${kbSection(selectedChunks)}
${avoidSection(pastTitles)}

Return exactly ${count} post objects in the "posts" array, one per date, in chronological order.`;

  // ---- 5. Call LLM ---------------------------------------------------------
  let llmResult: { content: string; usage: any };
  try {
    llmResult = await callLLM(SYSTEM_PROMPT, userPrompt, {
      maxTokens: 8000,
      temperature: 0.65,
    });
  } catch (e: any) {
    sendError(res, 502, 'llm_error', e?.message || 'LLM call failed');
    return;
  }

  // ---- 6. Parse + validate -------------------------------------------------
  let parsed: any;
  try {
    parsed = extractJSON(llmResult.content);
  } catch {
    sendError(res, 502, 'parse_error', 'Could not parse calendar from AI response. Please retry.');
    return;
  }

  const posts: any[] = Array.isArray(parsed?.posts) ? parsed.posts : [];
  if (posts.length === 0) {
    sendError(res, 502, 'empty_response', 'AI returned no posts. Please retry.');
    return;
  }

  // ---- 7. Persist (replace existing month) ---------------------------------
  await admin.from('calendar_posts').delete().eq('account_id', account_id).eq('month', month);

  const VALID_PILLARS = new Set(RH_PILLARS as readonly string[]);
  const VALID_TYPES = ['Carousel', 'Static Image', 'Reel', 'Poll'];

  const rows = posts.map((p: any, i: number) => ({
    account_id,
    month,
    generation: level,
    post_date: p.post_date || postDates[i] || postDates[0],
    pillar: VALID_PILLARS.has(p.pillar) ? p.pillar : 'Emerging Topics',
    post_type: VALID_TYPES.find((t) => t.toLowerCase() === String(p.post_type || '').toLowerCase()) || 'Static Image',
    title: String(p.title || 'Untitled').slice(0, 200),
    hook: String(p.hook || '').slice(0, 400),
    body_points: Array.isArray(p.body_points) ? p.body_points.map(String) : [],
    cta: String(p.cta || '').slice(0, 300),
    hashtags: Array.isArray(p.hashtags) ? p.hashtags.map(String) : [],
    kb_chunks_used: selectedChunks.length,
    status: 'draft',
  }));

  const { data: inserted, error: insertErr } = await admin
    .from('calendar_posts')
    .insert(rows)
    .select();

  if (insertErr) {
    sendError(res, 500, 'db_error', insertErr.message);
    return;
  }

  await logUsage({ accountId: account_id }, 'calendar-generate', llmResult.usage);

  res.status(200).json({
    posts: inserted,
    meta: {
      month,
      level,
      kb_chunks_used: selectedChunks.length,
      total_posts: rows.length,
    },
  });
}
