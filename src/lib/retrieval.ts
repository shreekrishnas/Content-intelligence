import { supabase, supabaseConfigured } from '@/lib/supabase';
import type { KnowledgeChunk } from '@/types';

const CONSTRAINT_CATEGORIES = (import.meta.env.VITE_CONSTRAINT_CATEGORIES || 'compliance,brand,guidelines').split(',');
const REQUIRED_CATEGORIES = (import.meta.env.VITE_GENERATION_REQUIRED_CATEGORIES || 'brand').split(',');
const TOP_K = parseInt(import.meta.env.VITE_RETRIEVAL_TOP_K || '8', 10);
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
  readiness: {
    ready: boolean;
    categories: Record<string, boolean>;
    missingRequired: string[];
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

function getQueryWords(text: string): string[] {
  return [...new Set(
    text.toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 4)
      .slice(0, 80),
  )];
}

function scoreChunk(chunkText: string, queryWords: string[]): number {
  if (!queryWords.length) return 1;
  const lower = chunkText.toLowerCase();
  return queryWords.reduce((acc, w) => acc + (lower.includes(w) ? 1 : 0), 0);
}

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
      readiness: { ready: false, categories: {}, missingRequired: REQUIRED_CATEGORIES },
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
      readiness: { ready: false, categories: {}, missingRequired: REQUIRED_CATEGORIES },
    };
  }

  const queryWords = getQueryWords(queryText);

  // Always fetch all constraint chunks (brand, compliance, guidelines)
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
      readiness,
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
      .order('position', { ascending: true });
    constraintChunks = (data || []).map(mapChunk);
  }

  // Fetch context chunks — more than TOP_K, then score by relevance
  const { data: contextFiles } = await supabase
    .from('knowledge_files')
    .select('id')
    .eq('account_id', accountId)
    .eq('active', true)
    .eq('ingest_status', 'ready');

  const contextIds = (contextFiles || [])
    .map((f: any) => f.id)
    .filter((id: string) => !constraintIds.includes(id));

  let chunks: RetrievalChunk[] = [];
  if (contextIds.length > 0) {
    const { data } = await supabase
      .from('knowledge_chunks')
      .select('*, knowledge_files!inner(file_name, category)')
      .eq('account_id', accountId)
      .in('file_id', contextIds)
      .order('position', { ascending: true })
      .limit(FETCH_LIMIT);

    const candidates = (data || []).map(mapChunk);
    chunks = candidates
      .map(c => ({ chunk: c, score: scoreChunk(c.chunk_text, queryWords) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K)
      .map(s => ({ ...s.chunk, similarity: s.score }));
  }

  // Fetch structured metadata for all files used
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

  return {
    refused: false,
    reason: readiness.missingRequired.length > 0
      ? `Note: Missing knowledge categories (${readiness.missingRequired.join(', ')}). Results may be less grounded. Upload files in these categories for better output.`
      : undefined,
    missing: readiness.missingRequired,
    chunks,
    constraintChunks,
    sourcesUsed,
    readiness,
  };
}
