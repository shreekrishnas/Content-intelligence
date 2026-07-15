import { supabase, supabaseConfigured } from '@/lib/supabase';
import type { KnowledgeChunk } from '@/types';

const CONSTRAINT_CATEGORIES = (import.meta.env.VITE_CONSTRAINT_CATEGORIES || 'compliance,brand,guidelines').split(',');
const REQUIRED_CATEGORIES = (import.meta.env.VITE_GENERATION_REQUIRED_CATEGORIES || 'brand').split(',');
const TOP_K = parseInt(import.meta.env.VITE_RETRIEVAL_TOP_K || '8', 10);
const MIN_SIMILARITY = parseFloat(import.meta.env.VITE_RETRIEVAL_MIN_SIMILARITY || '0.25');
const FETCH_LIMIT = 120;

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
  retrievalMode?: 'semantic' | 'keyword' | 'none';
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
    .slice(0, TOP_K)
    .map(s => ({ ...s.chunk, similarity: s.score }));
  return { chunks, topScore };
}

// ---- Semantic retrieval (pgvector via RPC) --------------------------------

async function embedQuery(text: string): Promise<number[] | null> {
  try {
    const resp = await fetch('/api/embed-query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 8000) }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return Array.isArray(data?.embedding) ? data.embedding : null;
  } catch { return null; }
}

async function scoreBySemantic(accountId: string, queryEmbedding: number[], excludeFileIds: string[]): Promise<{ chunks: RetrievalChunk[]; topScore: number } | null> {
  const { data, error } = await supabase.rpc('match_chunks', {
    p_account_id: accountId,
    p_query_embedding: queryEmbedding as any,
    p_match_count: TOP_K,
    p_exclude_file_ids: excludeFileIds,
  });
  if (error) return null;
  const rows = (data || []) as Array<{ id: string; file_id: string; chunk_text: string; position: number | null; similarity: number; file_name: string; category: string }>;
  const chunks: RetrievalChunk[] = rows.map((r) => ({
    id: r.id,
    file_id: r.file_id,
    account_id: accountId,
    chunk_text: r.chunk_text,
    embed_model: 'text-embedding-3-small',
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
      .limit(30);
    constraintChunks = (data || []).map(mapChunk);
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

  // ---- Semantic retrieval first, keyword fallback ----------------------
  let chunks: RetrievalChunk[] = [];
  let topScore = 0;
  let retrievalMode: 'semantic' | 'keyword' | 'none' = 'none';

  if (contextIds.length > 0) {
    const embedding = await embedQuery(queryText);
    let semanticResult: { chunks: RetrievalChunk[]; topScore: number } | null = null;
    if (embedding) {
      semanticResult = await scoreBySemantic(accountId, embedding, constraintIds);
      if (semanticResult && semanticResult.chunks.length > 0 && semanticResult.topScore >= MIN_SIMILARITY) {
        chunks = semanticResult.chunks;
        topScore = semanticResult.topScore;
        retrievalMode = 'semantic';
      }
    }

    // Fallback: keyword search when semantic is absent, failed, or below threshold.
    // If keyword also finds nothing (topScore === 0), prefer any semantic results
    // we had over an empty response — below-threshold semantic is still better than nothing.
    if (chunks.length === 0) {
      const keyword = await scoreByKeywords(accountId, queryText, contextIds);
      if (keyword.chunks.length > 0 && keyword.topScore > 0) {
        chunks = keyword.chunks;
        topScore = keyword.topScore;
        retrievalMode = 'keyword';
      } else if (semanticResult?.chunks.length) {
        chunks = semanticResult.chunks;
        topScore = semanticResult.topScore;
        retrievalMode = 'semantic';
      } else {
        chunks = keyword.chunks;
        topScore = keyword.topScore;
        retrievalMode = keyword.chunks.length > 0 ? 'keyword' : 'none';
      }
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
  };
}
