-- Run after all migrations in a disposable/staging database with
-- ON_ERROR_STOP=1. Everything is rolled back.
BEGIN;

DO $$
DECLARE
  v_admin constant uuid := '51000000-0000-4000-8000-000000000001';
  v_student_1 constant uuid := '51000000-0000-4000-8000-000000000002';
  v_student_2 constant uuid := '51000000-0000-4000-8000-000000000003';
  v_question constant uuid := '52000000-0000-4000-8000-000000000001';
  v_exam constant uuid := '53000000-0000-4000-8000-000000000001';
  v_exam_question uuid;
  v_submission_1 uuid;
  v_submission_2 uuid;
  v_official_job uuid;
  v_practice_job uuid;
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
    (v_admin, 'bulk-grading-admin@example.com', '{"name":"Admin","institute":"IBA"}'),
    (v_student_1, 'bulk-grading-one@example.com', '{"name":"Student One","institute":"Institute A"}'),
    (v_student_2, 'bulk-grading-two@example.com', '{"name":"Student Two","institute":"Institute B"}');
  UPDATE public.profiles SET is_admin = true WHERE id = v_admin;

  INSERT INTO public.questions(id, category, marks, difficulty, prompt, created_by)
  VALUES (v_question, 'essay', 10, 'medium', 'Write an essay.', v_admin);
  INSERT INTO public.exams(
    id, title, time_limit_minutes, starts_at, ends_at, is_published, created_by
  ) VALUES (
    v_exam, 'Bulk Grading Reliability', 30,
    now() - interval '1 hour', now() + interval '1 hour', true, v_admin
  );
  INSERT INTO public.exam_questions(exam_id, question_id, order_index, marks)
  VALUES (v_exam, v_question, 0, 10)
  RETURNING id INTO v_exam_question;

  INSERT INTO public.exam_submissions(exam_id, user_id, question_id, edited_text)
  VALUES (v_exam, v_student_1, v_exam_question, 'First student answer.')
  RETURNING id INTO v_submission_1;
  INSERT INTO public.exam_submissions(exam_id, user_id, question_id, edited_text)
  VALUES (v_exam, v_student_2, v_exam_question, 'Second student answer.')
  RETURNING id INTO v_submission_2;

  INSERT INTO public.grading_jobs(kind, exam_id, requested_by, total_items)
  VALUES ('official_exam', v_exam, v_admin, 2)
  RETURNING id INTO v_official_job;
  INSERT INTO public.grading_job_items(
    job_id, exam_question_id, exam_submission_id
  ) VALUES
    (v_official_job, v_exam_question, v_submission_1),
    (v_official_job, v_exam_question, v_submission_2);

  IF (
    SELECT count(*)
    FROM public.grading_job_items
    WHERE job_id = v_official_job
  ) <> 2 THEN
    RAISE EXCEPTION 'ASSERT: bulk official job did not retain both student submissions';
  END IF;

  BEGIN
    INSERT INTO public.grading_job_items(
      job_id, exam_question_id, exam_submission_id
    ) VALUES (v_official_job, v_exam_question, v_submission_1);
    RAISE EXCEPTION 'ASSERT: an official submission was queued twice in one job';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  INSERT INTO public.grading_jobs(kind, exam_id, requested_by, total_items)
  VALUES ('practice_exam', v_exam, v_student_1, 1)
  RETURNING id INTO v_practice_job;
  INSERT INTO public.grading_job_items(job_id, exam_question_id)
  VALUES (v_practice_job, v_exam_question);

  BEGIN
    INSERT INTO public.grading_job_items(job_id, exam_question_id)
    VALUES (v_practice_job, v_exam_question);
    RAISE EXCEPTION 'ASSERT: a practice question was queued twice in one job';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END;
$$;

ROLLBACK;
