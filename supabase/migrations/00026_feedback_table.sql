-- Feedback log: every submission from the in-app Feedback card is stored
-- here so the destination admin can review submissions in Settings even
-- if the outbound email failed or gets buried in Gmail. Only the fixed
-- destination admin can read; everyone else is blocked by RLS.

CREATE TABLE IF NOT EXISTS public.feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_email    text NOT NULL,
  sender_name     text,
  account_label   text,
  page            text,
  message         text NOT NULL,
  delivered       boolean NOT NULL DEFAULT false,
  deliver_error   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON public.feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_sender_email_idx ON public.feedback (sender_email);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Only the fixed destination admin can read feedback. Service role
-- bypasses RLS so /api/feedback (which uses the service key) can insert
-- and the /api/feedback-list endpoint reads under service key too — we
-- gate that endpoint by verifying the caller's email server-side.
DROP POLICY IF EXISTS "feedback_admin_select" ON public.feedback;
CREATE POLICY "feedback_admin_select" ON public.feedback
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'shreekrishna.basri@trilliantdigital.com'
  );

-- No user-level INSERT policy — only the server (service role) inserts.
