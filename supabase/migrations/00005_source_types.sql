-- ============================================================
-- Source Types table — per-account, with RLS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.source_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name        text NOT NULL,
  slug        text NOT NULL,
  description text NOT NULL DEFAULT '',
  formats     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_source_types_account ON public.source_types(account_id);
ALTER TABLE public.source_types ADD CONSTRAINT uq_source_type_slug_per_account UNIQUE (account_id, slug);

ALTER TABLE public.source_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY source_types_select ON public.source_types
  FOR SELECT USING (
    account_id IN (
      SELECT account_id FROM public.account_access
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY source_types_insert ON public.source_types
  FOR INSERT WITH CHECK (
    account_id IN (
      SELECT account_id FROM public.account_access
      WHERE user_id = auth.uid()
      AND role IN ('manager', 'editor')
    )
  );

CREATE POLICY source_types_delete ON public.source_types
  FOR DELETE USING (
    account_id IN (
      SELECT account_id FROM public.account_access
      WHERE user_id = auth.uid()
      AND role IN ('manager', 'editor')
    )
  );

-- ============================================================
-- Seed Right Horizons source types
-- ============================================================

INSERT INTO public.source_types (account_id, name, slug, description, formats) VALUES
  ('00000000-0000-0000-0000-000000000001', 'ET Video',
   'et_video',
   'Economic Times video interviews and panel discussions featuring wealth management experts.',
   '["Blog", "Voice Page", "Single Image", "Carousel"]'::jsonb),

  ('00000000-0000-0000-0000-000000000001', 'Author / Wealth Manager Blog',
   'author_blog',
   'Original blog posts and thought-leadership articles by wealth management professionals.',
   '["LinkedIn Amplification", "Carousel", "Single Image"]'::jsonb),

  ('00000000-0000-0000-0000-000000000001', 'Weekly Anil / Rachana Content',
   'weekly_anil_rachana',
   'Weekly content pieces from Anil and Rachana covering market commentary and investment insights.',
   '["Voice Page", "Single Image", "Carousel"]'::jsonb),

  ('00000000-0000-0000-0000-000000000001', 'Webinar',
   'webinar',
   'Live or recorded webinar sessions on investment topics, market trends, and financial planning.',
   '["Blog", "Short / Reel", "B-roll Video", "Q&A", "Single Image", "Carousel"]'::jsonb),

  ('00000000-0000-0000-0000-000000000001', 'Event / Workshop',
   'event_workshop',
   'In-person or virtual events, workshops, and seminars on wealth management and financial education.',
   '["Blog", "Conversational Blog", "Guide / E-book", "Lead Magnet", "Carousel"]'::jsonb),

  ('00000000-0000-0000-0000-000000000001', 'Trending Topic',
   'trending_topic',
   'Trending market or financial topics relevant to the wealth management audience.',
   '["Single Image", "Carousel", "Educational Carousel", "Blog Pipeline"]'::jsonb);

-- ============================================================
-- Set domain URLs for all 5 accounts
-- ============================================================

UPDATE public.accounts
SET profile = jsonb_set(COALESCE(profile, '{}'::jsonb), '{domain_url}', '"https://www.righthorizons.com/"')
WHERE id = '00000000-0000-0000-0000-000000000001';

UPDATE public.accounts
SET profile = jsonb_set(COALESCE(profile, '{}'::jsonb), '{domain_url}', '"https://www.hoyavision.com/in/"')
WHERE id = '00000000-0000-0000-0000-000000000002';

UPDATE public.accounts
SET profile = jsonb_set(COALESCE(profile, '{}'::jsonb), '{domain_url}', '"https://www.wipro-3d.com/"')
WHERE id = '00000000-0000-0000-0000-000000000003';

UPDATE public.accounts
SET profile = jsonb_set(COALESCE(profile, '{}'::jsonb), '{domain_url}', '"https://www.wiprowater.in/"')
WHERE id = '00000000-0000-0000-0000-000000000004';

UPDATE public.accounts
SET profile = jsonb_set(COALESCE(profile, '{}'::jsonb), '{domain_url}', '"https://wepsol.com/"')
WHERE id = '00000000-0000-0000-0000-000000000005';
