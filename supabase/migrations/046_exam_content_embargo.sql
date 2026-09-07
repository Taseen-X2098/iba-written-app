-- Students receive live exam content only from the authenticated, attempt-
-- bound start endpoint. Direct table access is limited to released exams, and
-- standalone question access cannot be used to obtain OCR or AI feedback for
-- a question while any exam containing it is still under embargo. This also
-- protects unpublished draft exams from direct-ID probing.

CREATE OR REPLACE FUNCTION public.can_access_practice_question(p_question_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    public.is_admin()
    OR (
      NOT EXISTS (
        SELECT 1
        FROM public.exam_questions AS exam_question
        JOIN public.exams AS exam ON exam.id = exam_question.exam_id
        WHERE exam_question.question_id = p_question_id
          AND exam.results_published = false
      )
      AND (
        EXISTS (
          SELECT 1
          FROM public.subscriptions AS subscription
          WHERE subscription.user_id = auth.uid()
            AND subscription.is_active = true
            AND subscription.expires_at > now()
        )
        OR EXISTS (
          SELECT 1
          FROM public.free_practice_questions AS free_question
          WHERE free_question.question_id = p_question_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.submissions AS submission
          WHERE submission.user_id = auth.uid()
            AND submission.question_id = p_question_id
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_practice_question(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_practice_question(uuid)
  TO authenticated;

DROP POLICY IF EXISTS "Students view accessible started exam questions"
  ON public.exam_questions;
DROP POLICY IF EXISTS "Students view released exam questions"
  ON public.exam_questions;
CREATE POLICY "Students view released exam questions"
  ON public.exam_questions FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM public.exams AS exam
    WHERE exam.id = exam_id
      AND exam.is_published = true
      AND exam.results_published = true
      AND public.can_access_exam_audience(exam.id, auth.uid())
  ));

-- RLS cannot redact grading_result while exposing edited_text. Pre-publication
-- responses therefore go through the server-only, owner-filtered results data
-- access layer; direct table reads open only after publication.
DROP POLICY IF EXISTS "Users view own accessible exam submissions"
  ON public.exam_submissions;
DROP POLICY IF EXISTS "Users view own released exam submissions"
  ON public.exam_submissions;
CREATE POLICY "Users view own released exam submissions"
  ON public.exam_submissions FOR SELECT
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.exams AS exam
      WHERE exam.id = exam_id
        AND exam.results_published = true
        AND public.can_access_exam_audience(exam.id, auth.uid())
    )
  );
