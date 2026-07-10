-- ============================================================
-- Add per-type analysis guidance to source_types.
-- Optional free-text field the user can fill to override the
-- archetype-based default extraction instructions.
-- ============================================================

ALTER TABLE public.source_types
  ADD COLUMN IF NOT EXISTS analysis_guidance text NOT NULL DEFAULT '';
