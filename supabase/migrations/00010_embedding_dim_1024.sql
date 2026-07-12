-- ============================================================
-- Idempotent: if 00009 was applied with vector(1536), migrate
-- the column, index, and RPC to vector(1024) so Voyage AI
-- (voyage-3, 1024 dims) works. Fresh installs pick up 1024
-- directly from the updated 00009 and this migration is a no-op.
-- ============================================================

DO $$
DECLARE
  current_dim int;
BEGIN
  SELECT atttypmod - 4 INTO current_dim
  FROM pg_attribute
  WHERE attrelid = 'public.knowledge_chunks'::regclass
    AND attname = 'embedding';

  IF current_dim IS NOT NULL AND current_dim <> 1024 THEN
    -- Existing embeddings are for a different provider — drop and recreate.
    -- No data loss risk because embeddings are always re-generable via
    -- /api/backfill-embeddings.
    DROP INDEX IF EXISTS public.knowledge_chunks_embedding_hnsw;
    ALTER TABLE public.knowledge_chunks DROP COLUMN embedding;
    ALTER TABLE public.knowledge_chunks ADD COLUMN embedding vector(1024);
    CREATE INDEX knowledge_chunks_embedding_hnsw
      ON public.knowledge_chunks
      USING hnsw (embedding vector_cosine_ops);
  END IF;
END $$;

-- Recreate the RPC unconditionally with vector(1024) signature.
DROP FUNCTION IF EXISTS public.match_chunks(uuid, vector, int, uuid[]);

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
  "position" int,
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
    kc."position",
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
