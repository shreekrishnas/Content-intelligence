-- ============================================================
-- pgvector semantic retrieval for knowledge_chunks.
-- Replaces the keyword-overlap retrieval that used to live only
-- in the client. Adds a nullable embedding column so existing
-- chunks continue to work (fallback path handles them).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- 1024 dims accommodates both providers:
--   Voyage AI voyage-3        (native 1024, free tier: 200M tokens)
--   OpenAI text-embedding-3-* (reducible to 1024 via `dimensions` param)
ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- HNSW index on cosine distance. Only chunks with a non-null embedding
-- are indexed automatically; queries use ORDER BY embedding <=> query.
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_hnsw
  ON public.knowledge_chunks
  USING hnsw (embedding vector_cosine_ops);

-- ============================================================
-- RPC: match_chunks
--   Semantic top-k retrieval scoped to a single account.
--   SECURITY INVOKER — RLS on knowledge_chunks still applies,
--   so a caller can only match rows the RLS policy would let
--   them SELECT anyway. The p_account_id parameter is an
--   optimisation filter — RLS is the actual authorisation check.
-- ============================================================
CREATE OR REPLACE FUNCTION public.match_chunks(
  p_account_id uuid,
  p_query_embedding vector(1024),
  p_match_count int DEFAULT 8,
  p_exclude_file_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS TABLE (
  id uuid,
  file_id uuid,
  chunk_text text,
  position int,
  similarity float,
  file_name text,
  category text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    kc.id,
    kc.file_id,
    kc.chunk_text,
    kc.position,
    (1 - (kc.embedding <=> p_query_embedding))::float AS similarity,
    kf.file_name,
    kf.category
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_files kf ON kf.id = kc.file_id
  WHERE kc.account_id = p_account_id
    AND kc.embedding IS NOT NULL
    AND kf.active = true
    AND kf.ingest_status = 'ready'
    AND (
      COALESCE(array_length(p_exclude_file_ids, 1), 0) = 0
      OR NOT (kc.file_id = ANY(p_exclude_file_ids))
    )
  ORDER BY kc.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_chunks(uuid, vector, int, uuid[]) TO authenticated;
