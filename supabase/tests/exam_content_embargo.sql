-- Run after all migrations in a disposable/staging database with
-- ON_ERROR_STOP=1. The transaction rolls back all fixtures and grants.
BEGIN;

DO $$
DECLARE
  v_admin constant uuid := '51000000-0000-4000-8000-000000000001';
  v_student constant uuid := '51000000-0000-4000-8000-000000000002';
  v_exam constant uuid := '52000000-0000-4000-8000-000000000001';
  v_question constant uuid := '53000000-0000-4000-8000-000000000001';
  v_exam_question constant uuid := '54000000-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO auth.users(id, raw_user_meta_data) VALUES
    (v_admin, '{"name":"Admin","institute":"IBA"}'),
    (v_student, '{"name":"Student","institute":"Institute"}');
  UPDATE public.profiles SET is_admin = true WHERE id = v_admin;
  INSERT INTO public.subscriptions(
    user_id, plan_type, tests_remaining, extra_tests_purchased, expires_at
  ) VALUES (v_student, 'plan_2', 5, 0, now() + interval '30 days');

  INSERT INTO public.questions(id, category, marks, difficulty, prompt, created_by)
  VALUES (v_question, 'essay', 10, 'medium', 'Embargoed prompt', v_admin);
  INSERT INTO public.exams(
    id, title, time_limit_minutes, starts_at, ends_at,
    is_published, results_published, created_by
  ) VALUES (
    v_exam, 'Embargo Contract', 30, now() - interval '5 minutes',
    now() + interval '1 hour', false, false, v_admin
  );
  INSERT INTO public.exam_questions(id, exam_id, question_id, order_index, marks)
  VALUES (v_exam_question, v_exam, v_question, 0, 10);
  INSERT INTO public.exam_submissions(
    exam_id, user_id, question_id, edited_text, submitted_at,
    grading_result, graded_by
  ) VALUES (
    v_exam, v_student, v_exam_question, 'Submitted answer', now(),
    '{"internal":{"total":8,"max":10,"criteria":[]},"studentFeedback":{"score":"8/10","summary":"Secret feedback","highlights":[]}}',
    'admin'
  );
END;
$$;

GRANT SELECT ON public.questions, public.exams, public.exam_questions,
  public.exam_submissions TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '51000000-0000-4000-8000-000000000002',
  true
);

DO $$
BEGIN
  IF public.can_access_practice_question(
    '53000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'ASSERT: embargoed official question remained available for standalone use';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.questions
    WHERE id = '53000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'ASSERT: student could read an embargoed official prompt directly';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.exam_questions
    WHERE id = '54000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'ASSERT: student could read an embargoed exam mapping directly';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.exam_submissions
    WHERE exam_id = '52000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'ASSERT: student could read grading feedback before publication';
  END IF;
END;
$$;

RESET ROLE;
UPDATE public.exams
SET is_published = true
WHERE id = '52000000-0000-4000-8000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '51000000-0000-4000-8000-000000000002',
  true
);

DO $$
BEGIN
  IF public.can_access_practice_question(
    '53000000-0000-4000-8000-000000000001'
  ) OR EXISTS (
    SELECT 1 FROM public.questions
    WHERE id = '53000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'ASSERT: publishing exposed an exam question before results';
  END IF;
END;
$$;

RESET ROLE;
UPDATE public.exams
SET results_published = true, results_version = 1
WHERE id = '52000000-0000-4000-8000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '51000000-0000-4000-8000-000000000002',
  true
);

DO $$
BEGIN
  IF NOT public.can_access_practice_question(
    '53000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'ASSERT: released question did not return to standalone practice';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.questions
    WHERE id = '53000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'ASSERT: released prompt remained hidden';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.exam_questions
    WHERE id = '54000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'ASSERT: released exam mapping remained hidden';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.exam_submissions
    WHERE exam_id = '52000000-0000-4000-8000-000000000001'
      AND grading_result #>> '{studentFeedback,summary}' = 'Secret feedback'
  ) THEN
    RAISE EXCEPTION 'ASSERT: published own feedback remained hidden';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
