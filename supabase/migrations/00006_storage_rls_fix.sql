-- ============================================================
-- Fix Storage RLS — allow uploads to knowledge-files bucket
-- ============================================================

-- Allow all operations on the knowledge-files storage bucket
-- (RLS is soft until auth is enforced, matching the table policies)

CREATE POLICY "knowledge_files_storage_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'knowledge-files');

CREATE POLICY "knowledge_files_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'knowledge-files');

CREATE POLICY "knowledge_files_storage_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'knowledge-files');

CREATE POLICY "knowledge_files_storage_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'knowledge-files');
