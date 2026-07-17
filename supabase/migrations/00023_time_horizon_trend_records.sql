-- Migration 00023: add time_horizon to trend_records
-- Applied via MCP 2026-07-17.
--
-- Distinguishes reactive (this week's news, good for newsjacking) from
-- strategic (a durable multi-month shift worth planning a content pillar
-- around) so the Trends UI can group/filter instead of showing one
-- undifferentiated feed of day-of news.
ALTER TABLE public.trend_records ADD COLUMN IF NOT EXISTS time_horizon text;
