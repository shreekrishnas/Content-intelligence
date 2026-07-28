import { supabase, supabaseConfigured } from '@/lib/supabase';
import type { KnowledgeChunk } from '@/types';

const CONSTRAINT_CATEGORIES = (import.meta.env.VITE_CONSTRAINT_CATEGORIES || 'compliance,brand,guidelines').split(',');
const REQUIRED_CATEGORIES = (import.meta.env.VITE_GENERATION_REQUIRED_CATEGORIES || 'brand').split(',');
// Final chunk cap AFTER rerank. Fewer, stronger chunks beats many loose ones —
// the LLM otherwise mixes documents and cites everything it saw.
const TOP_K = parseInt(import.meta.env.VITE_RETRIEVAL_TOP_K || '6', 10);
const MIN_SIMILARITY = parseFloat(import.meta.env.VITE_RETRIEVAL_MIN_SIMILARITY || '0.25');
// After rerank, chunks below this score are dropped — prevents padding the
// context with loosely-related material just because the top slot was strong.
const MIN_RERANK_SCORE = parseFloat(import.meta.env.VITE_RETRIEVAL_MIN_RERANK || '1.2');
const FETCH_LIMIT = 120;
// How many candidates to pull from semantic search before rerank / diversity cut.
const SEMANTIC_FETCH_MULT = 4;
// Adaptive context budget: total characters of chunk text handed to the LLM.
// Keeps retrieved context + constraints + prompt inside the model window
// instead of overflowing it on accounts with long chunks.
const CONTEXT_BUDGET_CHARS = parseInt(import.meta.env.VITE_RETRIEVAL_CONTEXT_BUDGET || '24000', 10);
// Long-context mode: if the account has fewer than this many non-constraint
// chunks, skip retrieval and send everything. ~500 chunks × ~600 tokens
// each = ~300k tokens, well within modern model windows.
const LONG_CONTEXT_MAX_CHUNKS = parseInt(import.meta.env.VITE_LONG_CONTEXT_MAX_CHUNKS || '500', 10);
// Higher budget for long-context mode so the model actually sees most of
// the KB, not just the first 24k chars.
const LONG_CONTEXT_BUDGET = parseInt(import.meta.env.VITE_LONG_CONTEXT_BUDGET || '120000', 10);
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
  retrievalMode?: 'hybrid' | 'semantic' | 'keyword' | 'rewritten' | 'long_context' | 'none';
  /** Extracted intent applied as a metadata filter, for debugging/UI. */
  intent?: {
    fileNames: string[];
    categories: string[];
    entities: string[];
    phrases: string[];
  };
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

// ---- Intent parsing, rerank, dedup, budget --------------------------------

/** Normalized key for exact-duplicate chunk detection. */
function chunkKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** 5-word shingles for near-duplicate detection via Jaccard similarity. */
function shingles(text: string, n = 5): Set<string> {
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(' '));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const s of a) if (b.has(s)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Drop near-identical chunks (Jaccard ≥ 0.55 on 5-shingles). Chunk overlap
 *  and duplicate uploads otherwise pollute the context with repeated passages
 *  and inflate the citation list. */
function dedupeChunks(chunks: RetrievalChunk[], threshold = 0.55): RetrievalChunk[] {
  const kept: Array<{ chunk: RetrievalChunk; sh: Set<string>; key: string }> = [];
  for (const c of chunks) {
    const text = c.chunk_text || '';
    const key = chunkKey(text);
    if (!key) continue;
    if (kept.some((k) => k.key === key)) continue;
    const sh = shingles(text);
    if (sh.size < 3) {
      kept.push({ chunk: c, sh, key });
      continue;
    }
    let dup = false;
    for (const k of kept) {
      if (k.sh.size >= 3 && jaccard(sh, k.sh) >= threshold) { dup = true; break; }
    }
    if (!dup) kept.push({ chunk: c, sh, key });
  }
  return kept.map((k) => k.chunk);
}

/** Parse the user query into a metadata filter + rerank signals. Extracted
 *  without an LLM call — cheap, deterministic, and enough to catch the
 *  common cases: "the persona file", "in ICP.pdf", '"exact phrase"',
 *  named entities like company/product names. */
async function extractIntent(
  accountId: string,
  queryText: string,
): Promise<{
  fileIds: string[] | null;
  fileNames: string[];
  categories: string[];
  entities: string[];
  phrases: string[];
}> {
  const phrases = [...queryText.matchAll(/"([^"]{3,})"/g)].map((m) => m[1].trim()).filter(Boolean);

  const lower = queryText.toLowerCase();
  const CAT_HINTS: Record<string, string> = {
    brand: 'brand',
    compliance: 'compliance',
    guideline: 'guidelines',
    guidelines: 'guidelines',
    persona: 'persona',
    icp: 'persona',
    expert: 'expert',
    example: 'example',
  };
  const categories = [...new Set(
    Object.keys(CAT_HINTS).filter((k) => new RegExp(`\\b${k}\\b`).test(lower)).map((k) => CAT_HINTS[k]),
  )];

  const fileIds: string[] = [];
  const fileNames: string[] = [];
  const { data: files } = await supabase
    .from('knowledge_files')
    .select('id, file_name')
    .eq('account_id', accountId)
    .eq('active', true)
    .eq('ingest_status', 'ready');

  for (const f of (files || []) as Array<{ id: string; file_name: string }>) {
    const stem = f.file_name.replace(/\.[a-z0-9]{2,5}$/i, '').toLowerCase();
    if (!stem) continue;
    if (lower.includes(f.file_name.toLowerCase()) || lower.includes(stem)) {
      fileIds.push(f.id);
      fileNames.push(f.file_name);
      continue;
    }
    const stemWords = stem.split(/[\s_\-.]+/).filter((w) => w.length >= 4);
    if (stemWords.length >= 2) {
      const hits = stemWords.filter((w) => lower.includes(w)).length;
      if (hits >= 2) {
        fileIds.push(f.id);
        fileNames.push(f.file_name);
      }
    }
  }

  const entityRe = /\b[A-Z][a-zA-Z0-9]{2,}(?:\s+[A-Z][a-zA-Z0-9]+){0,3}\b/g;
  const rawEntities = [...queryText.matchAll(entityRe)].map((m) => m[0].trim());
  const entities = [...new Set(rawEntities.filter((_e, i) => !(i === 0 && rawEntities.length === 1)))];

  return {
    fileIds: fileIds.length > 0 ? [...new Set(fileIds)] : null,
    fileNames: [...new Set(fileNames)],
    categories,
    entities,
    phrases,
  };
}

/** Lexical reranker: score candidates by how directly they answer the query,
 *  not just embedding neighbourhood. Weights (highest → lowest):
 *   • exact quoted phrase present → +10
 *   • named entity present → +3
 *   • query-word coverage ratio → +5 × ratio
 *   • embedding similarity carried forward → +2 × sim
 *  Then applies a light length penalty for stubs and a small boost for
 *  chunks whose file was named in the query. */
function rerank(
  chunks: RetrievalChunk[],
  queryText: string,
  phrases: string[],
  entities: string[],
  filteredFileIds: Set<string> | null,
): Array<RetrievalChunk & { rerankScore: number }> {
  const qWords = [...new Set(
    queryText.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !REWRITE_STOPWORDS.has(w)),
  )];
  const phrasesLower = phrases.map((p) => p.toLowerCase());
  const entitiesLower = entities.map((e) => e.toLowerCase());

  return chunks
    .map((c) => {
      const text = (c.chunk_text || '').toLowerCase();
      if (!text) return { ...c, rerankScore: 0 };

      let score = 0;
      for (const p of phrasesLower) if (text.includes(p)) score += 10;
      for (const e of entitiesLower) if (text.includes(e)) score += 3;

      if (qWords.length) {
        const hits = qWords.filter((w) => text.includes(w)).length;
        score += (hits / qWords.length) * 5;
      }

      score += Math.max(0, Math.min(1, c.similarity ?? 0)) * 2;

      if (filteredFileIds && c.file_id && filteredFileIds.has(c.file_id)) score += 1;
      if (text.length < 120) score *= 0.5;

      return { ...c, rerankScore: score };
    })
    .sort((a, b) => b.rerankScore - a.rerankScore);
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
    .select('id, category')
    .eq('account_id', accountId)
    .eq('active', true)
    .eq('ingest_status', 'ready');

  const allContextRows = (contextFiles || []) as Array<{ id: string; category: string | null }>;
  const allContextIds = allContextRows
    .map((f) => f.id)
    .filter((id: string) => !constraintIds.includes(id));

  // Step 1 (intent) — parse the query into a metadata filter.
  const intent = await extractIntent(accountId, queryText);
  const intentFileIdSet = intent.fileIds ? new Set(intent.fileIds) : null;

  // Step 2 (metadata filter) — narrow the retrieval pool BEFORE scoring.
  // If the query names a specific file, restrict to those files.
  // Otherwise, if it names a category (persona/expert/example), restrict
  // to files in those categories. Falls back to the full pool if the
  // narrowed set would be empty, so filter mistakes never zero-out results.
  let contextIds = allContextIds;
  if (intentFileIdSet) {
    const narrowed = allContextIds.filter((id) => intentFileIdSet.has(id));
    if (narrowed.length > 0) contextIds = narrowed;
  } else if (intent.categories.length > 0) {
    const wanted = new Set(intent.categories);
    const narrowed = allContextRows
      .filter((f) => f.category && wanted.has(f.category) && !constraintIds.includes(f.id))
      .map((f) => f.id);
    if (narrowed.length > 0) contextIds = narrowed;
  }

  // ---- Smart routing: long context vs RAG ----------------------------------
  let chunks: RetrievalChunk[] = [];
  let topScore = 0;
  let retrievalMode: RetrievalResult['retrievalMode'] = 'none';

  if (contextIds.length > 0) {
    // Cheap probe: count chunks without downloading text.
    const { count: chunkCount } = await supabase
      .from('knowledge_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .in('file_id', contextIds);

    const totalChunks = chunkCount ?? 0;

    if (totalChunks > 0 && totalChunks <= LONG_CONTEXT_MAX_CHUNKS) {
      // ---- Long-context mode: KB is small, send everything ----------------
      // No retrieval lottery — the model sees the complete KB and can reason
      // across documents, compare data, and spot gaps between files.
      const { data: allChunks } = await supabase
        .from('knowledge_chunks')
        .select('*, knowledge_files!inner(file_name, category)')
        .eq('account_id', accountId)
        .in('file_id', contextIds)
        .order('file_id', { ascending: true })
        .order('position', { ascending: true })
        .limit(LONG_CONTEXT_MAX_CHUNKS);

      const allMapped = dedupeChunks((allChunks || []).map(mapChunk));
      chunks = fitToBudget(allMapped, LONG_CONTEXT_BUDGET);
      topScore = 1;
      retrievalMode = 'long_context';
    } else if (totalChunks > 0) {
      // ---- RAG mode: KB is large, use hybrid retrieval --------------------
      const embedding = await embedQuery(queryText);
      const [semanticResult, keywordResult] = await Promise.all([
        embedding ? scoreBySemantic(accountId, embedding, constraintIds) : Promise.resolve(null),
        scoreByKeywords(accountId, queryText, contextIds),
      ]);

      // Apply the file-scope filter to semantic results (RPC can't filter by
      // arbitrary file IDs — we do it here). Keyword search already scoped
      // via contextIds. If the filter zeroes out semantic, fall through so
      // downstream logic still works.
      const contextIdSet = new Set(contextIds);
      const scopedSemantic = semanticResult
        ? { ...semanticResult, chunks: semanticResult.chunks.filter((c) => c.file_id && contextIdSet.has(c.file_id)) }
        : null;

      const semanticOk = !!scopedSemantic && scopedSemantic.chunks.length > 0 && scopedSemantic.topScore >= MIN_SIMILARITY;
      const keywordOk = keywordResult.chunks.length > 0 && keywordResult.topScore > 0;

      if (semanticOk && keywordOk) {
        chunks = fuseRRF(scopedSemantic!.chunks, keywordResult.chunks);
        topScore = scopedSemantic!.topScore;
        retrievalMode = 'hybrid';
      } else if (semanticOk) {
        chunks = scopedSemantic!.chunks;
        topScore = scopedSemantic!.topScore;
        retrievalMode = 'semantic';
      } else if (keywordOk) {
        chunks = keywordResult.chunks;
        topScore = keywordResult.topScore;
        retrievalMode = 'keyword';
      }

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

      if (chunks.length === 0 && scopedSemantic?.chunks.length) {
        chunks = scopedSemantic.chunks;
        topScore = scopedSemantic.topScore;
        retrievalMode = 'semantic';
      }

      // Step 3 (dedup) — remove near-identical passages before rerank so the
      // reranker doesn't waste slots comparing the same content twice.
      chunks = dedupeChunks(chunks);

      // Step 4 (rerank) — score by direct query match, not just embedding
      // neighbourhood. This is the critical step that stops loosely-related
      // chunks from leaking through just because they share vector-space
      // vicinity with the true answer.
      const reranked = rerank(chunks, queryText, intent.phrases, intent.entities, intentFileIdSet);

      // Step 5 (score floor) — drop anything below the minimum. Prevents the
      // "top slot was strong so we padded the rest" failure mode.
      const strong = reranked.filter((c) => c.rerankScore >= MIN_RERANK_SCORE);
      const kept = strong.length > 0 ? strong : reranked.slice(0, Math.min(3, reranked.length));

      // Step 6 (diversity + budget) — round-robin across files so a single
      // document can't monopolise the answer, then trim to context budget.
      chunks = fitToBudget(diversifyByFile(kept, TOP_K));
    }
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
    intent: {
      fileNames: intent.fileNames,
      categories: intent.categories,
      entities: intent.entities,
      phrases: intent.phrases,
    },
  };
}
