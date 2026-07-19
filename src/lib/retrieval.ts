import { supabase, supabaseConfigured } from '@/lib/supabase';
import type { KnowledgeChunk } from '@/types';

const CONSTRAINT_CATEGORIES = (import.meta.env.VITE_CONSTRAINT_CATEGORIES || 'compliance,brand,guidelines').split(',');
const REQUIRED_CATEGORIES = (import.meta.env.VITE_GENERATION_REQUIRED_CATEGORIES || 'brand').split(',');
const TOP_K = parseInt(import.meta.env.VITE_RETRIEVAL_TOP_K || '10', 10);
const MIN_SIMILARITY = parseFloat(import.meta.env.VITE_RETRIEVAL_MIN_SIMILARITY || '0.25');
const FETCH_LIMIT = 120;
// How many candidates to pull from semantic search before diversity cut.
const SEMANTIC_FETCH_MULT = 3;
// Adaptive context budget: total characters of chunk text handed to the LLM.
// Keeps retrieved context + constraints + prompt inside the model window
// instead of overflowing it on accounts with long chunks.
const CONTEXT_BUDGET_CHARS = parseInt(import.meta.env.VITE_RETRIEVAL_CONTEXT_BUDGET || '24000', 10);
// Reciprocal Rank Fusion constant (standard value from the RRF paper).
const RRF_K = 60;

export interface RetrievalChunk extends KnowledgeChunk {
  similarity?: number;
  file_name?: string;
  category?: string;
}

export interface KBFileContext {
  file_id: string;
  file_name: string;
  category: string;
  structured?: Record<string, unknown>;
}

export interface RetrievalResult {
  refused: boolean;
  reason?: string;
  missing?: string[];
  chunks: RetrievalChunk[];
  constraintChunks: RetrievalChunk[];
  sourcesUsed: KBFileContext[];
  topScore: number;
  readiness: {
    ready: boolean;
    categories: Record<string, boolean>;
    missingRequired: string[];
  };
  /** How the context chunks were selected — useful for diagnostics/UI. */
  retrievalMode?: 'hybrid' | 'semantic' | 'keyword' | 'rewritten' | 'none';
}

export async function checkReadiness(accountId: string): Promise<{
  ready: boolean;
  categories: Record<string, boolean>;
  missingRequired: string[];
}> {
  if (!supabaseConfigured) {
    return { ready: false, categories: {}, missingRequired: REQUIRED_CATEGORIES };
  }

  const { data: files } = await supabase
    .from('knowledge_files')
    .select('category')
    .eq('account_id', accountId)
    .eq('active', true)
    .eq('ingest_status', 'ready');

  const present = new Set((files || []).map((f: any) => f.category));
  const categories: Record<string, boolean> = {};
  for (const cat of [...new Set([...CONSTRAINT_CATEGORIES, ...REQUIRED_CATEGORIES])]) {
    categories[cat] = present.has(cat);
  }
  const missingRequired = REQUIRED_CATEGORIES.filter((c: string) => !present.has(c));

  return { ready: missingRequired.length === 0, categories, missingRequired };
}

function mapChunk(c: any): RetrievalChunk {
  return {
    ...c,
    file_name: c.knowledge_files?.file_name,
    category: c.knowledge_files?.category,
    knowledge_files: undefined,
  };
}

// ---- Keyword fallback (existing behaviour, extracted) --------------------

function getQueryWords(text: string): string[] {
  return [...new Set(
    text.toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 2)
      .slice(0, 120),
  )];
}

function scoreChunkKeywords(chunkText: string, queryWords: string[]): number {
  if (!queryWords.length) return 1;
  const lower = chunkText.toLowerCase();
  return queryWords.reduce((acc, w) => acc + (lower.includes(w) ? 1 : 0), 0);
}

async function scoreByKeywords(accountId: string, queryText: string, contextIds: string[]): Promise<{ chunks: RetrievalChunk[]; topScore: number }> {
  if (!contextIds.length) return { chunks: [], topScore: 0 };
  const { data } = await supabase
    .from('knowledge_chunks')
    .select('*, knowledge_files!inner(file_name, category)')
    .eq('account_id', accountId)
    .in('file_id', contextIds)
    .order('position', { ascending: true })
    .limit(FETCH_LIMIT);
  const candidates = (data || []).map(mapChunk);
  const words = getQueryWords(queryText);
  const scored = candidates
    .map(c => ({ chunk: c, score: scoreChunkKeywords(c.chunk_text, words) }))
    .sort((a, b) => b.score - a.score);
  const topScore = scored[0]?.score ?? 0;
  const chunks = scored
    .slice(0, TOP_K * SEMANTIC_FETCH_MULT)
    .map(s => ({ ...s.chunk, similarity: s.score }));
  return { chunks, topScore };
}

// ---- Semantic retrieval (pgvector via RPC) --------------------------------

async function embedQuery(text: string): Promise<number[] | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const resp = await fetch('/api/embed-query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 8000) }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const data = await resp.json();
    return Array.isArray(data?.embedding) ? data.embedding : null;
  } catch { return null; }
}

async function scoreBySemantic(accountId: string, queryEmbedding: number[], excludeFileIds: string[]): Promise<{ chunks: RetrievalChunk[]; topScore: number } | null> {
  const { data, error } = await supabase.rpc('match_chunks', {
    p_account_id: accountId,
    p_query_embedding: queryEmbedding as any,
    p_match_count: TOP_K * SEMANTIC_FETCH_MULT,
    p_exclude_file_ids: excludeFileIds,
  });
  if (error) return null;
  const rows = (data || []) as Array<{ id: string; file_id: string; chunk_text: string; position: number | null; similarity: number; file_name: string; category: string }>;
  const chunks: RetrievalChunk[] = rows.map((r) => ({
    id: r.id,
    file_id: r.file_id,
    account_id: accountId,
    chunk_text: r.chunk_text,
    embed_model: import.meta.env.VITE_EMBED_MODEL || 'text-embedding-3-large',
    token_count: null,
    position: r.position,
    created_at: '',
    similarity: r.similarity,
    file_name: r.file_name,
    category: r.category,
  }));
  const topScore = rows[0]?.similarity ?? 0;
  return { chunks, topScore };
}

// ---- Hybrid fusion, dedup, budget ----------------------------------------

/** Normalized key for near-identical chunk detection. */
function chunkKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** Drop near-identical chunks (same normalized text) — duplicate uploads and
 *  chunk overlap otherwise pollute the context with repeated passages. */
function dedupeChunks(chunks: RetrievalChunk[]): RetrievalChunk[] {
  const seen = new Set<string>();
  return chunks.filter((c) => {
    const key = chunkKey(c.chunk_text || '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Trim the chunk list so total text stays inside the context budget.
 *  Always keeps at least one chunk. */
function fitToBudget(chunks: RetrievalChunk[], budgetChars = CONTEXT_BUDGET_CHARS): RetrievalChunk[] {
  const out: RetrievalChunk[] = [];
  let used = 0;
  for (const c of chunks) {
    const len = (c.chunk_text || '').length;
    if (out.length > 0 && used + len > budgetChars) break;
    out.push(c);
    used += len;
  }
  return out;
}

/** Round-robin file diversification. Given a ranked list, interleave chunks
 *  from different files so no single document monopolises the context. Each
 *  file gets at least one slot (if it has relevant chunks) before any file
 *  gets a second. Within each file's allocation, original rank is preserved. */
function diversifyByFile(chunks: RetrievalChunk[], limit: number): RetrievalChunk[] {
  if (chunks.length <= 1) return chunks;
  const byFile = new Map<string, RetrievalChunk[]>();
  for (const c of chunks) {
    const fid = c.file_id || '_';
    if (!byFile.has(fid)) byFile.set(fid, []);
    byFile.get(fid)!.push(c);
  }
  if (byFile.size <= 1) return chunks.slice(0, limit);

  const out: RetrievalChunk[] = [];
  const queues = [...byFile.values()];
  const idx = new Array(queues.length).fill(0);
  while (out.length < limit) {
    let added = false;
    for (let q = 0; q < queues.length; q++) {
      if (idx[q] < queues[q].length && out.length < limit) {
        out.push(queues[q][idx[q]++]);
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}

/** Reciprocal Rank Fusion: combines semantic and keyword rankings. Chunks
 *  that appear in BOTH lists get boosted; either list alone still surfaces
 *  its top results. This is the standard hybrid-retrieval merge — BM25-style
 *  keyword match and dense vectors fail on different queries, so fusing them
 *  beats either alone. */
function fuseRRF(semantic: RetrievalChunk[], keyword: RetrievalChunk[]): RetrievalChunk[] {
  const scores = new Map<string, { chunk: RetrievalChunk; score: number }>();
  const add = (list: RetrievalChunk[]) => {
    list.forEach((c, rank) => {
      const key = c.id || chunkKey(c.chunk_text || '');
      const rrf = 1 / (RRF_K + rank + 1);
      const existing = scores.get(key);
      if (existing) existing.score += rrf;
      else scores.set(key, { chunk: c, score: rrf });
    });
  };
  add(semantic);
  add(keyword);
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map((s) => s.chunk);
}

/** Deterministic query rewrite for the empty-retrieval fallback: keep only
 *  the most distinctive terms (longest words, deduped, no stopwords). A
 *  long conversational query often fails keyword matching that its core
 *  nouns would hit. */
const REWRITE_STOPWORDS = new Set(['the','a','an','and','or','but','for','with','about','this','that','these','those','from','into','have','has','will','would','could','should','their','there','what','when','where','which','while','been','being','make','made','want','need','like','just','very','really','please','content','create','generate','write']);
function rewriteQuery(queryText: string): string {
  const words = [...new Set(
    queryText.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !REWRITE_STOPWORDS.has(w)),
  )];
  return words.sort((a, b) => b.length - a.length).slice(0, 8).join(' ');
}

// ---- Main retrieve() ------------------------------------------------------

export async function retrieve(
  accountId: string,
  queryText: string,
  _taskType?: string,
): Promise<RetrievalResult> {
  if (!supabaseConfigured) {
    return {
      refused: true,
      reason: 'Database not configured',
      missing: ['database_connection'],
      chunks: [],
      constraintChunks: [],
      sourcesUsed: [],
      topScore: 0,
      readiness: { ready: false, categories: {}, missingRequired: REQUIRED_CATEGORIES },
      retrievalMode: 'none',
    };
  }

  let readiness: Awaited<ReturnType<typeof checkReadiness>>;
  try {
    readiness = await checkReadiness(accountId);
  } catch {
    return {
      refused: true,
      reason: 'Could not connect to the knowledge base. Check your database configuration.',
      missing: [],
      chunks: [],
      constraintChunks: [],
      sourcesUsed: [],
      topScore: 0,
      readiness: { ready: false, categories: {}, missingRequired: REQUIRED_CATEGORIES },
      retrievalMode: 'none',
    };
  }

  // Always fetch all constraint chunks (brand, compliance, guidelines).
  const { data: constraintFiles, error: constraintFilesErr } = await supabase
    .from('knowledge_files')
    .select('id')
    .eq('account_id', accountId)
    .eq('active', true)
    .eq('ingest_status', 'ready')
    .in('category', CONSTRAINT_CATEGORIES);

  if (constraintFilesErr) {
    return {
      refused: true,
      reason: 'Failed to load knowledge base files. Please try again.',
      missing: [],
      chunks: [],
      constraintChunks: [],
      sourcesUsed: [],
      topScore: 0,
      readiness,
      retrievalMode: 'none',
    };
  }

  const constraintIds = (constraintFiles || []).map((f: any) => f.id);

  let constraintChunks: RetrievalChunk[] = [];
  if (constraintIds.length > 0) {
    const { data } = await supabase
      .from('knowledge_chunks')
      .select('*, knowledge_files!inner(file_name, category)')
      .eq('account_id', accountId)
      .in('file_id', constraintIds)
      .order('position', { ascending: true })
      .limit(200);
    constraintChunks = dedupeChunks((data || []).map(mapChunk));
  }

  const { data: contextFiles } = await supabase
    .from('knowledge_files')
    .select('id')
    .eq('account_id', accountId)
    .eq('active', true)
    .eq('ingest_status', 'ready');

  const contextIds = (contextFiles || [])
    .map((f: any) => f.id)
    .filter((id: string) => !constraintIds.includes(id));

  // ---- Hybrid retrieval: semantic + keyword fused with RRF --------------
  // The two retrievers fail on different queries: dense vectors miss exact
  // names/jargon; keyword misses paraphrases. Run both, fuse, then apply a
  // fallback chain (query rewrite → graceful refuse) so the LLM is never
  // handed an empty or junk context silently.
  let chunks: RetrievalChunk[] = [];
  let topScore = 0;
  let retrievalMode: 'hybrid' | 'semantic' | 'keyword' | 'rewritten' | 'none' = 'none';

  if (contextIds.length > 0) {
    const embedding = await embedQuery(queryText);
    const [semanticResult, keywordResult] = await Promise.all([
      embedding ? scoreBySemantic(accountId, embedding, constraintIds) : Promise.resolve(null),
      scoreByKeywords(accountId, queryText, contextIds),
    ]);

    // Low-confidence gate: semantic hits below MIN_SIMILARITY are not
    // trusted on their own; keyword hits need at least one matched term.
    const semanticOk = !!semanticResult && semanticResult.chunks.length > 0 && semanticResult.topScore >= MIN_SIMILARITY;
    const keywordOk = keywordResult.chunks.length > 0 && keywordResult.topScore > 0;

    if (semanticOk && keywordOk) {
      chunks = fuseRRF(semanticResult!.chunks, keywordResult.chunks);
      topScore = semanticResult!.topScore;
      retrievalMode = 'hybrid';
    } else if (semanticOk) {
      chunks = semanticResult!.chunks;
      topScore = semanticResult!.topScore;
      retrievalMode = 'semantic';
    } else if (keywordOk) {
      chunks = keywordResult.chunks;
      topScore = keywordResult.topScore;
      retrievalMode = 'keyword';
    }

    // Fallback chain step 1: rewrite the query to its distinctive terms and
    // retry keyword scoring — long conversational queries often fail where
    // their core nouns would hit.
    if (chunks.length === 0) {
      const rewritten = rewriteQuery(queryText);
      if (rewritten && rewritten !== queryText.toLowerCase().trim()) {
        const retry = await scoreByKeywords(accountId, rewritten, contextIds);
        if (retry.chunks.length > 0 && retry.topScore > 0) {
          chunks = retry.chunks;
          topScore = retry.topScore;
          retrievalMode = 'rewritten';
        }
      }
    }

    // Fallback chain step 2: below-threshold semantic beats an empty
    // context — the LLM handles weakly-relevant passages better than none.
    if (chunks.length === 0 && semanticResult?.chunks.length) {
      chunks = semanticResult.chunks;
      topScore = semanticResult.topScore;
      retrievalMode = 'semantic';
    }

    // Diversify across files so a single document can't monopolise all
    // slots, then dedup near-identical passages and trim to budget.
    chunks = fitToBudget(dedupeChunks(diversifyByFile(chunks, TOP_K)));
  }

  // Fetch structured metadata for all files used.
  const usedFileIds = [...new Set([
    ...constraintChunks.map((c: any) => c.file_id),
    ...chunks.map((c: any) => c.file_id),
  ])].filter(Boolean) as string[];

  let sourcesUsed: KBFileContext[] = [];
  if (usedFileIds.length > 0) {
    const { data: fileRows } = await supabase
      .from('knowledge_files')
      .select('id, file_name, category, structured')
      .in('id', usedFileIds);

    if (fileRows) {
      const seen = new Set<string>();
      const orderedIds = [
        ...constraintChunks.map((c: any) => c.file_id),
        ...chunks.map((c: any) => c.file_id),
      ].filter(id => {
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      const fileMap = new Map(fileRows.map((f: any) => [f.id, f]));
      sourcesUsed = orderedIds
        .map(id => fileMap.get(id))
        .filter(Boolean)
        .map((f: any) => ({
          file_id: f.id,
          file_name: f.file_name,
          category: f.category,
          structured: f.structured ?? undefined,
        }));
    }
  }

  // Grounding gate: refuse only when there are truly no chunks from any source.
  // The LLM handles irrelevant context gracefully — an empty response is worse.
  const noContext = chunks.length === 0;
  const noConstraints = constraintChunks.length === 0;
  if (noContext && noConstraints) {
    return {
      refused: true,
      reason: "I don't have that idea in the knowledge base. Add relevant knowledge files (persona, brand, guidelines, or expert content) that cover this topic — I can only generate content that is grounded in your KB.",
      missing: readiness.missingRequired,
      chunks: [],
      constraintChunks: [],
      sourcesUsed: [],
      topScore: 0,
      readiness,
      retrievalMode,
    };
  }

  const finalChunks = chunks;

  return {
    refused: false,
    reason: readiness.missingRequired.length > 0
      ? `Note: Missing knowledge categories (${readiness.missingRequired.join(', ')}). Results may be less grounded. Upload files in these categories for better output.`
      : undefined,
    missing: readiness.missingRequired,
    chunks: finalChunks,
    constraintChunks,
    sourcesUsed,
    topScore,
    readiness,
    retrievalMode,
  };
}
