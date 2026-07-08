-- Migration: 00003_extend_schema.sql
-- Make embedding nullable (chunks may not have embeddings immediately)
-- Add extra fields to opportunities for analysis-derived data

ALTER TABLE knowledge_chunks ALTER COLUMN embedding DROP NOT NULL;

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS priority text DEFAULT 'standard';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS persona_name text;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS persona_relevance_score numeric;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS recommendation_reason text;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS timeliness text DEFAULT 'standard';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS suggested_cta text;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source_context text;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Add body column to calendar_items for content storage
ALTER TABLE calendar_items ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE calendar_items ADD COLUMN IF NOT EXISTS quality jsonb DEFAULT '{}'::jsonb;
