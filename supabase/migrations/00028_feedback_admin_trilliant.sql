-- Master admin identity locked to the trilliant login. Update the SELECT
-- policy so the feedback inbox is readable by that email.

DROP POLICY IF EXISTS "feedback_admin_select" ON public.feedback;
CREATE POLICY "feedback_admin_select" ON public.feedback
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'shreekrishna.basri@trilliantdigital.com'
  );
