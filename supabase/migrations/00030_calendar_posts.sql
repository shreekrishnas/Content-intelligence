-- AI-generated content calendar posts. Each row is one post in a monthly
-- calendar batch. Generation level and repetition tracking live here.

CREATE TABLE IF NOT EXISTS public.calendar_posts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  month         text        NOT NULL,  -- YYYY-MM
  generation    integer     NOT NULL DEFAULT 1,
  post_date     date        NOT NULL,
  pillar        text        NOT NULL,
  post_type     text        NOT NULL,  -- Carousel | Static Image | Reel | Poll
  title         text        NOT NULL,
  hook          text,
  body_points   jsonb       NOT NULL DEFAULT '[]',
  cta           text,
  hashtags      jsonb       NOT NULL DEFAULT '[]',
  kb_chunks_used integer    NOT NULL DEFAULT 0,
  status        text        NOT NULL DEFAULT 'draft',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calendar_posts_account_month_idx
  ON public.calendar_posts (account_id, month);

CREATE INDEX IF NOT EXISTS calendar_posts_account_created_idx
  ON public.calendar_posts (account_id, created_at DESC);

ALTER TABLE public.calendar_posts ENABLE ROW LEVEL SECURITY;

-- Users can read posts for accounts they have access to
CREATE POLICY "calendar_posts_select" ON public.calendar_posts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.account_access
      WHERE account_access.account_id = calendar_posts.account_id
        AND account_access.user_id = auth.uid()
    )
  );

-- Users with manager/editor role can update (status, edits)
CREATE POLICY "calendar_posts_update" ON public.calendar_posts
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.account_access
      WHERE account_access.account_id = calendar_posts.account_id
        AND account_access.user_id = auth.uid()
        AND account_access.role IN ('manager', 'editor')
    )
  );
