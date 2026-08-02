-- Allow the master admin to read feedback whether they sign in with the
-- trilliant identity OR the gmail identity (Resend sandbox owner). Server
-- check in /api/feedback-list matches this set.

DROP POLICY IF EXISTS "feedback_admin_select" ON public.feedback;
CREATE POLICY "feedback_admin_select" ON public.feedback
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() ->> 'email') IN (
      'shreekrishna.basri@trilliantdigital.com',
      'shreekrishnabhasri07@gmail.com'
    )
  );
