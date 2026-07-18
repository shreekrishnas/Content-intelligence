-- topicToRecord() writes content_angle and needs_human_review, but these
-- columns were never added to trend_records — every server-side insert
-- failed with an unknown-column error that was silently swallowed, so
-- scans reported success while saving zero records. (Applied to the live
-- project via MCP on 2026-07-18; kept here so fresh environments match.)
ALTER TABLE public.trend_records
  ADD COLUMN IF NOT EXISTS content_angle      text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS needs_human_review boolean NOT NULL DEFAULT false;
