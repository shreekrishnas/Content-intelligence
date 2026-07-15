-- Allow the anon role to call match_chunks.
-- Auth was removed from the API layer, so retrieval calls run as anon.
-- RLS on knowledge_chunks still controls which rows are visible.
GRANT EXECUTE ON FUNCTION public.match_chunks(uuid, vector, int, uuid[]) TO anon;
