-- Run after migrations in a disposable/staging database with ON_ERROR_STOP=1.
-- The transaction is rolled back so this doubles as a deploy-time smoke test.
BEGIN;

DO $$
DECLARE
  v_admin constant uuid := '10000000-0000-0000-0000-000000000001';
  v_user_1 constant uuid := '10000000-0000-0000-0000-000000000002';
  v_user_2 constant uuid := '10000000-0000-0000-0000-000000000003';
  v_exam uuid;
  v_question uuid;
  v_translation uuid;
  v_eq uuid;
  v_translation_eq uuid;
  v_attempt_1 exam_attempts;
  v_attempt_2 exam_attempts;
  v_practice_1 exam_attempts;
  v_practice_2 exam_attempts;
  v_charge usage_charges;
  v_standalone_1 standalone_usage_charges;
  v_standalone_2 standalone_usage_charges;
  v_version integer;
  v_count integer;
BEGIN
  INSERT INTO auth.users(id, raw_user_meta_data) VALUES
    (v_admin, '{"name":"Admin","institute":"IBA"}'),
    (v_user_1, '{"name":"Student One","institute":"Institute A"}'),
    (v_user_2, '{"name":"Student Two","institute":"Institute B"}');
  UPDATE profiles SET is_admin = true WHERE id = v_admin;
  INSERT INTO subscriptions(user_id, plan_type, tests_remaining, extra_tests_purchased, expires_at)
  VALUES
    (v_user_1, 'plan_2', 5, 1, now() + interval '30 days'),
    (v_user_2, 'plan_2', 5, 0, now() + interval '30 days');

  INSERT INTO questions(category, marks, difficulty, prompt, created_by)
  VALUES ('essay', 10, 'medium', 'Write an essay.', v_admin)
  RETURNING id INTO v_question;
  INSERT INTO questions(category, marks, difficulty, prompt, created_by)
  VALUES ('translation', 5, 'medium', 'Translate this.', v_admin)
  RETURNING id INTO v_translation;

  INSERT INTO exams(title, time_limit_minutes, starts_at, ends_at, is_published, created_by)
  VALUES ('Reliability Audit', 30, now() - interval '5 minutes', now() + interval '1 hour', true, v_admin)
  RETURNING id INTO v_exam;
  INSERT INTO exam_questions(exam_id, question_id, order_index, marks)
  VALUES (v_exam, v_question, 0, 10) RETURNING id INTO v_eq;
  INSERT INTO exam_questions(exam_id, question_id, order_index, marks)
  VALUES (v_exam, v_translation, 1, 5) RETURNING id INTO v_translation_eq;

  SELECT * INTO v_attempt_1 FROM start_exam_attempt(
    v_exam, v_user_1, 'official', now() + interval '30 minutes', 'writer-1'
  );
  SELECT * INTO v_attempt_2 FROM start_exam_attempt(
    v_exam, v_user_2, 'official', now() + interval '30 minutes', 'writer-2'
  );
  PERFORM finalize_exam_attempt(v_attempt_1.id, v_user_1, 'writer-1', '{}'::jsonb);
  PERFORM finalize_exam_attempt(
    v_attempt_2.id,
    v_user_2,
    'writer-2',
    jsonb_build_object(v_eq::text, jsonb_build_object('ocrText', '', 'editedText', 'A nonblank answer.'))
  );

  SELECT count(*) INTO v_count FROM exam_submissions WHERE attempt_id = v_attempt_1.id;
  IF v_count <> 2 THEN RAISE EXCEPTION 'ASSERT: finalization did not snapshot every answer'; END IF;
  IF EXISTS (
    SELECT 1 FROM exam_submissions
    WHERE attempt_id = v_attempt_1.id
      AND ((grading_result #>> '{internal,total}')::numeric <> 0 OR graded_by <> 'admin')
  ) THEN RAISE EXCEPTION 'ASSERT: blanks must have explicit admin zero grades'; END IF;

  BEGIN
    PERFORM publish_exam_results_once(v_exam);
    RAISE EXCEPTION 'ASSERT: early publication was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%EXAM_NOT_ENDED%' THEN RAISE; END IF;
  END;

  UPDATE exams SET ends_at = now() - interval '1 second' WHERE id = v_exam;
  BEGIN
    PERFORM publish_exam_results_once(v_exam);
    RAISE EXCEPTION 'ASSERT: incomplete publication was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%GRADING_INCOMPLETE%' THEN RAISE; END IF;
  END;

  PERFORM save_manual_exam_grade(
    (SELECT id FROM exam_submissions WHERE attempt_id = v_attempt_2.id AND question_id = v_eq),
    '{"internal":{"total":0,"max":10,"criteria":[]},"studentFeedback":{"score":"0/10","summary":"Reviewed","highlights":[]}}'::jsonb
  );
  SELECT publish_exam_results_once(v_exam) INTO v_version;
  IF v_version <> 1 THEN RAISE EXCEPTION 'ASSERT: first publication version must be 1'; END IF;
  IF (SELECT count(DISTINCT rank) FROM exam_results WHERE exam_id = v_exam) <> 1 THEN
    RAISE EXCEPTION 'ASSERT: equal scores must share a rank';
  END IF;
  BEGIN
    PERFORM publish_exam_results_once(v_exam);
    RAISE EXCEPTION 'ASSERT: published results were publishable twice';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%RESULTS_ALREADY_PUBLISHED%' THEN RAISE; END IF;
  END;

  PERFORM extend_exam_deadline(v_exam, 1);
  IF (SELECT results_published FROM exams WHERE id = v_exam) THEN
    RAISE EXCEPTION 'ASSERT: deadline extension did not reopen publication';
  END IF;
  BEGIN
    PERFORM publish_exam_results_once(v_exam);
    RAISE EXCEPTION 'ASSERT: results were publishable before the extended deadline';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%EXAM_NOT_ENDED%' THEN RAISE; END IF;
  END;
  UPDATE exams SET ends_at = now() - interval '1 second' WHERE id = v_exam;
  SELECT publish_exam_results_once(v_exam) INTO v_version;
  IF v_version <> 2 THEN
    RAISE EXCEPTION 'ASSERT: publication after an extension must increment the version';
  END IF;

  SELECT * INTO v_practice_1 FROM start_exam_attempt(
    v_exam, v_user_1, 'practice', now() + interval '30 minutes', 'practice-writer-1'
  );
  PERFORM lock_practice_attempt(v_practice_1.id, v_user_1, 'practice-writer-1');
  PERFORM reserve_practice_usage(v_user_1, v_practice_1.id, ARRAY[v_eq]);
  SELECT * INTO v_charge FROM usage_charges
  WHERE attempt_id = v_practice_1.id AND exam_question_id = v_eq;
  IF v_charge.source <> 'extra' OR v_charge.status <> 'reserved' THEN
    RAISE EXCEPTION 'ASSERT: practice must reserve one auditable slot';
  END IF;
  PERFORM finish_usage_charge(v_practice_1.id, v_eq, false);
  IF (SELECT status FROM usage_charges WHERE id = v_charge.id) <> 'released' THEN
    RAISE EXCEPTION 'ASSERT: failed grading must release its slot';
  END IF;
  PERFORM reserve_practice_usage(v_user_1, v_practice_1.id, ARRAY[v_eq]);
  IF (SELECT status FROM usage_charges WHERE id = v_charge.id) <> 'reserved' THEN
    RAISE EXCEPTION 'ASSERT: released practice charge must be retryable';
  END IF;
  UPDATE exam_attempts SET status = 'finalized', finalized_at = now() WHERE id = v_practice_1.id;
  SELECT * INTO v_practice_2 FROM start_exam_attempt(
    v_exam, v_user_1, 'practice', now() + interval '30 minutes', 'practice-writer-2'
  );
  IF v_practice_2.id = v_practice_1.id THEN RAISE EXCEPTION 'ASSERT: practice must allow a new run'; END IF;

  SELECT * INTO v_standalone_1 FROM reserve_standalone_usage(
    v_user_2, v_question, '20000000-0000-0000-0000-000000000001'
  );
  SELECT * INTO v_standalone_2 FROM reserve_standalone_usage(
    v_user_2, v_question, '20000000-0000-0000-0000-000000000001'
  );
  IF v_standalone_1.id <> v_standalone_2.id THEN
    RAISE EXCEPTION 'ASSERT: standalone reservation is not idempotent';
  END IF;
END;
$$;

ROLLBACK;
