import { supabase, supabaseConfigured } from '@/lib/supabase';
import type { KnowledgeChunk } from '@/types';

const CONSTRAINT_CATEGORIES = (import.meta.env.VITE_CONSTRAINT_CATEGORIES || 'compliance,brand,guidelines').split(',');
const REQUIRED_CATEGORIES = (import.meta.env.VITE_GENERATION_REQUIRED_CATEGORIES || 'brand').split(',');
const TOP_K = parseInt(import.meta.env.VITE_RETRIEVAL_TOP_K || '8', 10);

export interface RetrievalChunk extends KnowledgeChunk {
  similarity?: number;
  file_name?: string;
  category?: string;
}

export interface RetrievalResult {
  refused: boolean;
  reason?: string;
  missing?: string[];
  chunks: RetrievalChunk[];
  constraintChunks: RetrievalChunk[];
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

export async function retrieve(
  accountId: string,
  _queryText: string,
  _taskType?: string,
): Promise<RetrievalResult> {
  if (!supabaseConfigured) {
    return {
      refused: true,
      reason: 'Database not configured',
      missing: ['database_connection'],
      chunks: [],
      constraintChunks: [],
      readiness: { ready: false, categories: {}, missingRequired: REQUIRED_CATEGORIES },
    };
  }

  const readiness = await checkReadiness(accountId);

  // Always fetch constraint chunks (compliance, brand, guidelines)
  const { data: constraintFiles } = await supabase
    .from('knowledge_files')
    .select('id')
    .eq('account_id', accountId)
    .eq('active', true)
    .eq('ingest_status', 'ready')
    .in('category', CONSTRAINT_CATEGORIES);

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

  // Fetch context chunks from non-constraint files
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
      .limit(TOP_K);
    chunks = (data || []).map(mapChunk);
  }

  // THE REFUSAL GATE: if readiness is not met OR no chunks at all, refuse
  if (!readiness.ready || (chunks.length === 0 && constraintChunks.length === 0)) {
    return {
      refused: true,
      reason:
        readiness.missingRequired.length > 0
          ? `Missing required knowledge categories: ${readiness.missingRequired.join(', ')}`
          : 'No relevant knowledge found. Add knowledge files to get started.',
      missing: readiness.missingRequired,
      chunks: [],
      constraintChunks,
      readiness,
    };
  }

  return { refused: false, chunks, constraintChunks, readiness };
}
