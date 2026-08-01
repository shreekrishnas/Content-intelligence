-- Master admin identity moved from the trilliant address to the gmail
-- login that actually signs in to the app. Update the SELECT policy so
-- the feedback inbox is readable by that email.

DROP POLICY IF EXISTS "feedback_admin_select" ON public.feedback;
CREATE POLICY "feedback_admin_select" ON public.feedback
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'shreekrishnabhasri07@gmail.com'
  );
