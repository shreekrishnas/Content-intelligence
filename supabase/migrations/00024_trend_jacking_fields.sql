-- ============================================================
-- Trend-jacking: viral signals bridged onto brand context
-- ============================================================
-- signal_type distinguishes topics born from the brand's niche
-- ('niche') vs. broad viral trends the bridge layer connected to
-- the brand ('viral_bridged'). Trend-jacked cards show their
-- underlying_theme + bridge_angle so the user can gut-check the
-- creative connection before publishing.

ALTER TABLE public.trend_records
  ADD COLUMN IF NOT EXISTS signal_type         text NOT NULL DEFAULT 'niche',
  ADD COLUMN IF NOT EXISTS bridge_angle        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS underlying_theme    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bridge_confidence   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sensitivity_warning text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_trend_records_signal_type
  ON public.trend_records(account_id, signal_type);
