import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callLLM } from './_lib/llm.js';
import { extractJSON } from './_lib/json.js';
import { handleOptions, sendError } from './_lib/http.js';
import { getServiceClient } from './_lib/supabase.js';
import { logUsage } from './_lib/usage.js';

const SYSTEM_PROMPT = `You are a senior social media content strategist. Generate a monthly content calendar for a financial planning brand. Output only raw JSON parseable by JSON.parse() — no markdown fences, no prose before or after.

DEPTH LEVELS:
- Level 1 (Foundational): Simple explanations, broad appeal, beginner-friendly concepts
- Level 2 (Intermediate): Scenario-based, specific strategies, practitioner audience
- Level 3+ (Advanced): Uncommon angles, sophisticated nuance, expert-to-expert tone

WRITING RULES:
- Every title must be specific — name a fact, number, scenario, or objection. No "The Ultimate Guide to X" or "Top 5 Ways to Y".
- Every hook must stop a scroll — tension, surprising stat, or direct challenge.
- body_points must be actionable bullet lines (not vague summaries).
- cta must be a concrete verb + destination (not "Learn more" or "Follow us").
- Hashtags: 4–6, mix brand-niche + broad (#RetirementPlanning, #NRIInvesting, #WealthManagement, etc.).
- No em dashes. Use a hyphen or restructure instead.

OUTPUT SCHEMA — return a JSON object with a "posts" array. Each post:
{
  "post_date": "YYYY-MM-DD",
  "pillar": "string",
  "post_type": "Carousel" | "Static Image" | "Reel" | "Poll",
  "title": "Specific publishable title (≤ 85 chars)",
  "hook": "Opening line that stops the scroll (≤ 160 chars)",
  "body_points": ["actionable point 1", "point 2", "point 3", "point 4"],
  "cta": "Verb + object + destination",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4"]
}`;

function kbSection(chunks: Array<{ content: string; file_name: string; category: string }>): string {
  if (!chunks.length) return '\nNo knowledge base content available. Use financial planning best practices.';
  return `\nKNOWLEDGE BASE (ground all content in these brand facts, tone, and compliance requirements):\n${
    chunks.slice(0, 20).map((c, i) => `[KB-${i + 1}] (${c.category} / ${c.file_name})\n${c.content.slice(0, 1200)}`).join('\n\n')
  }`;
}

function avoidSection(titles: string[]): string {
  if (!titles.length) return '';
  return `\n\nDO NOT REPEAT — generate fresh angles for all of these past titles:\n${
    titles.slice(0, 60).map((t) => `- ${t}`).join('\n')
  }`;
}

function buildUserPrompt(params: {
  month: string;
  postDates: string[];
  level: number;
  context: string;
  kbChunks: Array<{ content: string; file_name: string; category: string }>;
  pastTitles: string[];
  pillars: string[];
  typeDist: Array<{ type: string; count: number }>;
}): string {
  const { month, postDates, level, context, kbChunks, pastTitles, pillars, typeDist } = params;
  const typeInstr = typeDist.map((t) => `- ${t.type}: ${t.count} posts`).join('\n');
  const pillarInstr = pillars.map((p) => `- ${p}`).join('\n');
  const dateList = postDates.join(', ');

  return `Generate a ${postDates.length}-post social media calendar for ${month}.

DEPTH LEVEL: ${level} (${level === 1 ? 'Foundational' : level === 2 ? 'Intermediate' : 'Advanced'})

POST DATES (assign one post per date, in order):
${dateList}

POST TYPE DISTRIBUTION (use exactly this count for each type):
${typeInstr}

CONTENT PILLARS (distribute posts across these, weighted as listed):
${pillarInstr}

${context ? `THIS MONTH'S FOCUS:\n${context}\n` : ''}
${kbSection(kbChunks)}
${avoidSection(pastTitles)}

Return exactly ${postDates.length} post objects in the "posts" array, one per date listed above, in chronological order.`;
}

function getPostDatesForMonth(month: string, count: number): string[] {
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  // Spread posts evenly across the month (skip Sundays for social media)
  const allDays: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, mon - 1, d);
    if (dt.getDay() !== 0) { // skip Sundays
      allDays.push(`${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
  }
  // Pick evenly-spaced days
  if (allDays.length <= count) return allDays.slice(0, count);
  const step = allDays.length / count;
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(allDays[Math.round(i * step)]);
  }
  return picked;
}

function getTypeDistribution(total: number): Array<{ type: string; count: number }> {
  const carousel = Math.round(total * 0.42);
  const staticImg = Math.round(total * 0.38);
  const reel = Math.round(total * 0.1);
  const poll = total - carousel - staticImg - reel;
  return [
    { type: 'Carousel', count: carousel },
    { type: 'Static Image', count: staticImg },
    { type: 'Reel', count: reel },
    { type: 'Poll', count: Math.max(0, poll) },
  ];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') { sendError(res, 405, 'method_not_allowed', 'POST required'); return; }

  const { account_id, month, context = '', post_count = 20 } = req.body || {};
  if (!account_id) { sendError(res, 400, 'missing_account', 'account_id is required'); return; }
  if (!month || !/^\d{4}-\d{2}$/.test(month)) { sendError(res, 400, 'invalid_month', 'month must be YYYY-MM'); return; }

  const count = Math.min(Math.max(Number(post_count) || 20, 10), 30);
  const admin = getServiceClient();

  // ---- 1. KB retrieval: pull brand/guidelines/persona/expert/data chunks ----
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

  // Sample up to 20 chunks — prioritise brand/guidelines/persona
  const priority = ['brand', 'guidelines', 'persona'];
  const priorityChunks = kbChunks.filter((c) => priority.includes(c.category));
  const otherChunks = kbChunks.filter((c) => !priority.includes(c.category));
  const selectedChunks = [
    ...priorityChunks.slice(0, 14),
    ...otherChunks.slice(0, 6),
  ].slice(0, 20);

  // ---- 2. Level escalation: count past generations for this account ---------
  const { count: existingCount } = await admin
    .from('calendar_posts')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', account_id);

  const level = Math.min(3, Math.floor(((existingCount || 0) / 20)) + 1);

  // ---- 3. Repetition avoidance: last 200 titles ----------------------------
  const { data: pastRows } = await admin
    .from('calendar_posts')
    .select('title')
    .eq('account_id', account_id)
    .order('created_at', { ascending: false })
    .limit(200);
  const pastTitles = (pastRows || []).map((r: any) => r.title as string).filter(Boolean);

  // ---- 4. Detect pillars from KB or use defaults ---------------------------
  const pillarsFromKB = detectPillars(kbChunks);

  // ---- 5. Build generation params ------------------------------------------
  const postDates = getPostDatesForMonth(month, count);
  const typeDist = getTypeDistribution(count);

  const userPrompt = buildUserPrompt({
    month,
    postDates,
    level,
    context: String(context || '').slice(0, 500),
    kbChunks: selectedChunks,
    pastTitles,
    pillars: pillarsFromKB,
    typeDist,
  });

  // ---- 6. Call LLM ---------------------------------------------------------
  let llmResult: { content: string; usage: any };
  try {
    llmResult = await callLLM(SYSTEM_PROMPT, userPrompt, {
      maxTokens: 8000,
      temperature: 0.6,
    });
  } catch (e: any) {
    sendError(res, 502, 'llm_error', e?.message || 'LLM call failed');
    return;
  }

  // ---- 7. Parse response ---------------------------------------------------
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

  // ---- 8. Delete existing posts for this month then insert -----------------
  await admin.from('calendar_posts').delete().eq('account_id', account_id).eq('month', month);

  const rows = posts.map((p: any, i: number) => ({
    account_id,
    month,
    generation: level,
    post_date: p.post_date || postDates[i] || postDates[0],
    pillar: String(p.pillar || 'General').slice(0, 100),
    post_type: normaliseType(p.post_type),
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
      generation: level,
      total_posts: rows.length,
    },
  });
}

const VALID_TYPES = ['Carousel', 'Static Image', 'Reel', 'Poll'];
function normaliseType(raw: unknown): string {
  const s = String(raw || '').trim();
  return VALID_TYPES.find((t) => t.toLowerCase() === s.toLowerCase()) || 'Static Image';
}

function detectPillars(chunks: Array<{ content: string; category: string }>): string[] {
  const combined = chunks.map((c) => c.content).join(' ').toLowerCase();

  const pillarCandidates: Record<string, string[]> = {
    'Retirement Planning': ['retirement', 'pension', 'nps', 'epf', 'gratuity', 'corpus', 'post-retirement'],
    'NRI Wealth': ['nri', 'non-resident', 'fcnr', 'nre', 'nro', 'overseas', 'repatriation', 'dtaa', 'fema'],
    'ESOPs': ['esop', 'espp', 'rsu', 'stock option', 'vesting', 'equity compensation'],
    'Family Office': ['family office', 'succession', 'estate planning', 'hni', 'ultra hni', 'wealth structuring'],
    'Tax Planning': ['tax', 'itr', 'tds', 'capital gains', 'section 80', 'deduction'],
    'Investment Strategy': ['mutual fund', 'equity', 'portfolio', 'sip', 'diversification', 'asset allocation'],
  };

  const found = Object.entries(pillarCandidates)
    .filter(([, keywords]) => keywords.some((kw) => combined.includes(kw)))
    .map(([pillar]) => pillar);

  if (found.length === 0) {
    return ['Retirement Planning (35%)', 'NRI Wealth (27%)', 'ESOPs (15%)', 'Family Office (12%)', 'Emerging Topics (11%)'];
  }

  return found.length >= 4 ? found : [
    ...found,
    'Emerging Topics',
  ];
}
