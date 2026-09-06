-- Run after all migrations in a disposable/staging database with
-- ON_ERROR_STOP=1. Everything is rolled back.
BEGIN;

DO $$
DECLARE
  v_admin constant uuid := '41000000-0000-4000-8000-000000000001';
  v_viewer constant uuid := '41000000-0000-4000-8000-000000000002';
  v_participant constant uuid := '41000000-0000-4000-8000-000000000003';
  v_question constant uuid := '42000000-0000-4000-8000-000000000001';
  v_default_exam constant uuid := '43000000-0000-4000-8000-000000000001';
  v_free_exam uuid;
  v_starts_at timestamptz := now() - interval '2 hours';
  v_ends_at timestamptz := now() - interval '1 hour';
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
    (v_admin, 'free-exam-admin@example.com', '{"name":"Admin","institute":"IBA"}'),
    (v_viewer, 'free-exam-viewer@example.com', '{"name":"Viewer","institute":"Institute A"}'),
    (v_participant, 'free-exam-participant@example.com', '{"name":"Participant","institute":"Institute B"}');
  UPDATE public.profiles SET is_admin = true WHERE id = v_admin;
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  INSERT INTO public.questions(id, category, marks, difficulty, prompt, created_by)
  VALUES (v_question, 'basic_paragraph', 10, 'medium', 'Write one paragraph.', v_admin);

  -- Existing callers and direct inserts retain paid-exam behavior by default.
  INSERT INTO public.exams(
    id, title, time_limit_minutes, starts_at, ends_at, is_published, created_by
  ) VALUES (
    v_default_exam, 'Default paid exam', 30, v_starts_at, v_ends_at, false, v_admin
  );
  IF (SELECT is_free FROM public.exams WHERE id = v_default_exam) THEN
    RAISE EXCEPTION 'ASSERT: existing exam default changed to free';
  END IF;

  SELECT public.create_exam_definition(
    p_created_by => v_admin,
    p_title => 'Open Assessment',
    p_description => 'Available to every signed-in student.',
    p_time_limit_minutes => 30,
    p_starts_at => v_starts_at,
    p_ends_at => v_ends_at,
    p_is_published => false,
    p_is_magnus_only => false,
    p_is_free => true,
    p_questions => jsonb_build_array(jsonb_build_object(
      'questionId', v_question,
      'orderIndex', 0,
      'marks', 10
    ))
  ) INTO v_free_exam;

  IF NOT EXISTS (
    SELECT 1
    FROM public.exams
    WHERE id = v_free_exam
      AND is_free = true
      AND is_magnus_only = false
      AND time_limit_minutes = 30
      AND starts_at = v_starts_at
      AND ends_at = v_ends_at
  ) THEN
    RAISE EXCEPTION 'ASSERT: free exam definition or timing was not persisted';
  END IF;
  IF (SELECT count(*) FROM public.exam_questions WHERE exam_id = v_free_exam) <> 1 THEN
    RAISE EXCEPTION 'ASSERT: free exam question mapping was not persisted';
  END IF;

  BEGIN
    PERFORM public.create_exam_definition(
      p_created_by => v_admin,
      p_title => 'Contradictory exam',
      p_description => '',
      p_time_limit_minutes => 30,
      p_starts_at => v_starts_at,
      p_ends_at => v_ends_at,
      p_is_published => false,
      p_is_magnus_only => true,
      p_is_free => true,
      p_questions => jsonb_build_array(jsonb_build_object(
        'questionId', v_question,
        'orderIndex', 0,
        'marks', 10
      ))
    );
    RAISE EXCEPTION 'ASSERT: free and Magnus-only exam was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%INVALID_EXAM_AUDIENCE%' THEN RAISE; END IF;
  END;

  PERFORM public.update_exam_definition(
    p_exam_id => v_free_exam,
    p_title => 'Open Assessment',
    p_description => 'Available to every signed-in student.',
    p_time_limit_minutes => 30,
    p_starts_at => v_starts_at,
    p_ends_at => v_ends_at,
    p_is_published => true,
    p_is_magnus_only => false,
    p_is_free => true,
    p_questions => jsonb_build_array(jsonb_build_object(
      'questionId', v_question,
      'orderIndex', 0,
      'marks', 10
    ))
  );

  IF (SELECT audience_locked_at FROM public.exams WHERE id = v_free_exam) IS NULL THEN
    RAISE EXCEPTION 'ASSERT: free exam access did not lock on publication';
  END IF;
  IF NOT public.can_access_exam_audience(v_free_exam, v_viewer) THEN
    RAISE EXCEPTION 'ASSERT: signed-in viewer cannot discover free exam';
  END IF;

  BEGIN
    UPDATE public.exams SET is_free = false WHERE id = v_free_exam;
    RAISE EXCEPTION 'ASSERT: published free access was mutable';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%EXAM_AUDIENCE_LOCKED%' THEN RAISE; END IF;
  END;

  INSERT INTO public.exam_results(exam_id, user_id, total_score, max_score, rank)
  VALUES (v_free_exam, v_participant, 8, 10, 1);
  UPDATE public.exams
  SET results_published = true, results_version = 1
  WHERE id = v_free_exam;
END;
$$;

-- Exercise the authenticated result contract as a viewer with no subscription
-- and no participation row of their own.
GRANT SELECT ON public.exams TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000002', true);
DO $$
DECLARE
  v_exam_id uuid;
  v_page jsonb;
BEGIN
  SELECT id INTO v_exam_id
  FROM public.exams
  WHERE title = 'Open Assessment' AND is_free = true;
  IF v_exam_id IS NULL THEN
    RAISE EXCEPTION 'ASSERT: unsubscribed viewer cannot see published free exam';
  END IF;

  v_page := public.get_published_leaderboard_page(v_exam_id, 1, 100);
  IF jsonb_array_length(v_page -> 'rows') <> 1
    OR (v_page ->> 'total_count')::integer <> 1
  THEN
    RAISE EXCEPTION 'ASSERT: nonparticipant cannot see published free-exam results';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
