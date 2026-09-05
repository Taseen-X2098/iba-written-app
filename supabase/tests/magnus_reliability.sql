-- Run after all migrations in a disposable/staging database with
-- ON_ERROR_STOP=1. Everything is rolled back.
BEGIN;

DO $$
DECLARE
  v_admin constant uuid := '20000000-0000-4000-8000-000000000001';
  v_approval_candidate constant uuid := '20000000-0000-4000-8000-000000000002';
  v_pending constant uuid := '20000000-0000-4000-8000-000000000003';
  v_approved constant uuid := '20000000-0000-4000-8000-000000000004';
  v_normal constant uuid := '20000000-0000-4000-8000-000000000005';
  v_claim_user constant uuid := '20000000-0000-4000-8000-000000000006';
  v_claim constant uuid := '20000000-0000-4000-8000-000000000007';
  v_direct constant uuid := '20000000-0000-4000-8000-000000000008';
  v_magnus_exam constant uuid := '21000000-0000-4000-8000-000000000001';
  v_normal_exam constant uuid := '21000000-0000-4000-8000-000000000002';
  v_empty_exam constant uuid := '21000000-0000-4000-8000-000000000003';
  v_question constant uuid := '22000000-0000-4000-8000-000000000001';
  v_magnus_eq uuid;
  v_normal_eq uuid;
  v_old_expiry timestamptz := now() + interval '10 days';
  v_new_expiry timestamptz;
  v_subscription_id uuid;
  v_attempt public.exam_attempts;
  v_page jsonb;
  v_version integer;
  v_count integer;
  v_student uuid;
  v_attempt_id uuid;
  v_score integer;
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
    (v_admin, 'admin@example.com', '{"name":"Admin","institute":"IBA"}'),
    (v_approval_candidate, 'candidate@example.com', '{"name":"Candidate","institute":"Magnus"}'),
    (v_pending, 'pending@example.com', '{"name":"Pending","institute":"Magnus"}'),
    (v_approved, 'approved@example.com', '{"name":"Approved","institute":"Magnus"}'),
    (v_normal, 'normal@example.com', '{"name":"Normal","institute":"Other"}'),
    (v_direct, 'direct@example.com', '{"name":"Direct Approval","institute":"Other"}');
  UPDATE public.profiles SET is_admin = true WHERE id = v_admin;

  INSERT INTO public.magnus_memberships(user_id, status, source)
  VALUES
    (v_approval_candidate, 'pending', 'promo'),
    (v_pending, 'pending', 'promo');
  INSERT INTO public.magnus_memberships(
    user_id, status, source, approved_at, approved_by
  ) VALUES (
    v_approved, 'approved', 'admin', now(), v_admin
  );

  INSERT INTO public.subscriptions(
    user_id, plan_type, tests_remaining, extra_tests_purchased, expires_at
  ) VALUES
    (v_approval_candidate, 'plan_1', 7, 2, v_old_expiry),
    (v_approval_candidate, 'plan_2', 999, 999, now() - interval '1 day'),
    (v_pending, 'plan_2', 5, 0, now() + interval '30 days'),
    (v_approved, 'plan_2', 5, 0, now() + interval '30 days'),
    (v_normal, 'plan_2', 5, 0, now() + interval '30 days');

  -- Signup claims are email-bound, one-time, and consumed by the auth trigger.
  INSERT INTO public.magnus_signup_claims(token, email, expires_at)
  VALUES (v_claim, 'claim@example.com', now() + interval '10 minutes');
  INSERT INTO auth.users(id, email, raw_user_meta_data)
  VALUES (
    v_claim_user,
    'claim@example.com',
    jsonb_build_object(
      'name', 'Claim Student',
      'institute', 'Magnus',
      'magnus_signup_claim', v_claim::text
    )
  );
  IF (SELECT status FROM public.magnus_memberships WHERE user_id = v_claim_user) <> 'pending' THEN
    RAISE EXCEPTION 'ASSERT: signup claim did not create pending membership';
  END IF;
  IF EXISTS (SELECT 1 FROM public.magnus_signup_claims WHERE token = v_claim) THEN
    RAISE EXCEPTION 'ASSERT: signup claim was not consumed';
  END IF;

  -- Approval preserves paid time, grants up to 300 tests without stacking a
  -- second 300-test allowance, and
  -- queues exactly one durable welcome delivery.
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  SELECT count(*) INTO v_count
  FROM public.approve_magnus_students(ARRAY[
    v_approval_candidate, v_approval_candidate
  ]);
  IF v_count <> 1 THEN RAISE EXCEPTION 'ASSERT: deduplicated approval did not approve once'; END IF;
  IF (SELECT source FROM public.magnus_memberships WHERE user_id = v_approval_candidate) <> 'promo' THEN
    RAISE EXCEPTION 'ASSERT: promo source was not preserved';
  END IF;
  SELECT id, expires_at INTO v_subscription_id, v_new_expiry
  FROM public.subscriptions
  WHERE user_id = v_approval_candidate AND is_active = true;
  IF v_new_expiry < v_old_expiry + interval '29 days 23 hours'
    OR v_new_expiry > v_old_expiry + interval '30 days 1 hour'
  THEN
    RAISE EXCEPTION 'ASSERT: prior paid time was not preserved';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = v_approval_candidate
      AND is_active = true
      AND plan_type = 'plan_2'
      AND tests_remaining = 300
      AND extra_tests_purchased = 2
  ) THEN
    RAISE EXCEPTION 'ASSERT: Magnus Plan 2 grant stacked or lost test slots';
  END IF;
  IF (SELECT count(*) FROM public.retention_notification_jobs
      WHERE user_id = v_approval_candidate AND kind = 'magnus_approved') <> 1 THEN
    RAISE EXCEPTION 'ASSERT: welcome delivery job was not queued exactly once';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.approve_magnus_students(ARRAY[v_approval_candidate]);
  IF v_count <> 0 THEN RAISE EXCEPTION 'ASSERT: repeated approval was not idempotent'; END IF;
  IF (SELECT count(*) FROM public.subscriptions
      WHERE user_id = v_approval_candidate AND is_active = true) <> 1 THEN
    RAISE EXCEPTION 'ASSERT: repeated approval duplicated the active plan';
  END IF;
  IF NOT public.disable_magnus_student(v_approval_candidate) THEN
    RAISE EXCEPTION 'ASSERT: approved Magnus status was not disabled';
  END IF;
  IF (SELECT status FROM public.magnus_memberships
      WHERE user_id = v_approval_candidate) <> 'disabled' THEN
    RAISE EXCEPTION 'ASSERT: disabled Magnus status was not retained for audit';
  END IF;
  IF public.is_magnus_student(v_approval_candidate) THEN
    RAISE EXCEPTION 'ASSERT: disabled student retained Magnus-only access';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = v_approval_candidate
      AND is_active = true
      AND plan_type = 'plan_2'
      AND tests_remaining = 300
      AND extra_tests_purchased = 2
  ) THEN
    RAISE EXCEPTION 'ASSERT: disabling Magnus changed the active plan or slots';
  END IF;
  IF public.disable_magnus_student(v_approval_candidate) THEN
    RAISE EXCEPTION 'ASSERT: repeated Magnus disable was not idempotent';
  END IF;
  IF NOT public.reenable_magnus_student(v_approval_candidate)
    OR (SELECT status FROM public.magnus_memberships
        WHERE user_id = v_approval_candidate) <> 'approved'
  THEN
    RAISE EXCEPTION 'ASSERT: disabled Magnus status could not be re-enabled';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE id = v_subscription_id
      AND user_id = v_approval_candidate
      AND is_active = true
      AND plan_type = 'plan_2'
      AND tests_remaining = 300
      AND extra_tests_purchased = 2
      AND expires_at = v_new_expiry
  ) OR (SELECT count(*) FROM public.subscriptions
        WHERE user_id = v_approval_candidate AND is_active = true) <> 1 THEN
    RAISE EXCEPTION 'ASSERT: re-enabling Magnus changed the plan, balance, or expiry';
  END IF;
  IF (SELECT count(*) FROM public.retention_notification_jobs
      WHERE user_id = v_approval_candidate AND kind = 'magnus_approved') <> 2 THEN
    RAISE EXCEPTION 'ASSERT: re-enabled Magnus status did not queue a new welcome delivery';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.approve_magnus_students(ARRAY[v_direct]);
  IF v_count <> 1
    OR (SELECT source FROM public.magnus_memberships WHERE user_id = v_direct) <> 'admin'
  THEN RAISE EXCEPTION 'ASSERT: direct admin approval did not create an admin-source membership'; END IF;

  INSERT INTO public.questions(
    id, category, marks, difficulty, prompt, created_by
  ) VALUES (
    v_question, 'basic_paragraph', 10, 'medium', 'Magnus reliability question', v_admin
  );

  INSERT INTO public.exams(
    id, title, time_limit_minutes, starts_at, ends_at,
    is_published, is_magnus_only, created_by
  ) VALUES (
    v_magnus_exam, 'Private Magnus Exam', 30,
    now() + interval '30 minutes', now() + interval '2 hours',
    false, true, v_admin
  );
  INSERT INTO public.exam_questions(exam_id, question_id, order_index, marks)
  VALUES (v_magnus_exam, v_question, 0, 10)
  RETURNING id INTO v_magnus_eq;

  IF public.can_access_exam_audience(v_magnus_exam, v_pending) THEN
    RAISE EXCEPTION 'ASSERT: pending student can access Magnus audience';
  END IF;
  IF NOT public.can_access_exam_audience(v_magnus_exam, v_approved) THEN
    RAISE EXCEPTION 'ASSERT: approved student cannot access Magnus audience';
  END IF;

  BEGIN
    PERFORM public.start_exam_attempt(
      v_magnus_exam, v_pending, 'official', now() + interval '20 minutes', 'pending-writer'
    );
    RAISE EXCEPTION 'ASSERT: pending official Magnus attempt was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%EXAM_NOT_FOUND%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.start_exam_attempt(
      v_magnus_exam, v_pending, 'practice', now() + interval '20 minutes', 'pending-practice'
    );
    RAISE EXCEPTION 'ASSERT: pending practice Magnus attempt was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%EXAM_NOT_FOUND%' THEN RAISE; END IF;
  END;
  SELECT * INTO v_attempt FROM public.start_exam_attempt(
    v_magnus_exam, v_approved, 'official', now() + interval '20 minutes', 'approved-writer'
  );
  IF v_attempt.user_id <> v_approved THEN
    RAISE EXCEPTION 'ASSERT: approved official Magnus attempt failed';
  END IF;
  SELECT * INTO v_attempt FROM public.start_exam_attempt(
    v_magnus_exam, v_approved, 'practice', now() + interval '20 minutes', 'approved-practice'
  );
  IF v_attempt.mode <> 'practice' THEN
    RAISE EXCEPTION 'ASSERT: approved practice Magnus attempt failed';
  END IF;

  -- Publication notifications and scheduled reminders include eligible plans
  -- but never normal or pending students.
  UPDATE public.exams SET is_published = true WHERE id = v_magnus_exam;
  IF NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = v_approved AND exam_id = v_magnus_exam AND type = 'exam_available'
  ) THEN RAISE EXCEPTION 'ASSERT: approved Magnus publication notification missing'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id IN (v_pending, v_normal) AND exam_id = v_magnus_exam
  ) THEN RAISE EXCEPTION 'ASSERT: Magnus publication notification leaked'; END IF;

  PERFORM public.enqueue_due_retention_notification_jobs(now());
  IF NOT EXISTS (
    SELECT 1 FROM public.retention_notification_jobs
    WHERE user_id = v_approved AND exam_id = v_magnus_exam AND kind = 'exam_reminder'
  ) THEN RAISE EXCEPTION 'ASSERT: approved Magnus reminder missing'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.retention_notification_jobs
    WHERE user_id IN (v_pending, v_normal) AND exam_id = v_magnus_exam
  ) THEN RAISE EXCEPTION 'ASSERT: Magnus reminder leaked'; END IF;
  UPDATE public.exams
  SET starts_at = now() - interval '1 minute'
  WHERE id = v_magnus_exam;

  BEGIN
    UPDATE public.exams SET is_magnus_only = false WHERE id = v_magnus_exam;
    RAISE EXCEPTION 'ASSERT: published audience was mutable';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%EXAM_AUDIENCE_LOCKED%' THEN RAISE; END IF;
  END;

  -- Result notifications independently re-check the audience.
  INSERT INTO public.exam_results(exam_id, user_id, total_score, max_score, rank)
  VALUES
    (v_magnus_exam, v_approved, 8, 10, 1),
    (v_magnus_exam, v_pending, 7, 10, 2);
  UPDATE public.exams SET results_published = true WHERE id = v_magnus_exam;
  IF NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = v_approved AND exam_id = v_magnus_exam AND type = 'results_published'
  ) THEN RAISE EXCEPTION 'ASSERT: approved Magnus result notification missing'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = v_pending AND exam_id = v_magnus_exam AND type = 'results_published'
  ) THEN RAISE EXCEPTION 'ASSERT: Magnus result notification leaked'; END IF;

  -- A normal exam remains compatible and drives a 101-participant leaderboard.
  INSERT INTO public.exams(
    id, title, time_limit_minutes, starts_at, ends_at,
    is_published, is_magnus_only, created_by
  ) VALUES (
    v_normal_exam, 'Normal Pagination Exam', 30,
    now() - interval '2 hours', now() - interval '1 hour',
    true, false, v_admin
  );
  INSERT INTO public.exam_questions(exam_id, question_id, order_index, marks)
  VALUES (v_normal_exam, v_question, 0, 10)
  RETURNING id INTO v_normal_eq;
  IF NOT public.can_access_exam_audience(v_normal_exam, v_pending) THEN
    RAISE EXCEPTION 'ASSERT: normal exam compatibility broke';
  END IF;

  FOR i IN 1..101 LOOP
    v_student := ('30000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    v_attempt_id := ('31000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    v_score := CASE WHEN i <= 2 THEN 10 ELSE i % 9 END;
    INSERT INTO auth.users(id, email, raw_user_meta_data)
    VALUES (
      v_student,
      'leader-' || i::text || '@example.com',
      jsonb_build_object('name', 'Leaderboard Student ' || lpad(i::text, 3, '0'), 'institute', 'Institute')
    );
    INSERT INTO public.exam_attempts(
      id, exam_id, user_id, mode, status, started_at, expires_at,
      submitted_at, finalized_at, writer_token_hash
    ) VALUES (
      v_attempt_id, v_normal_exam, v_student, 'official', 'finalized',
      now() - interval '2 hours', now() - interval '90 minutes',
      now() - interval '90 minutes', now() - interval '90 minutes', 'writer'
    );
    INSERT INTO public.exam_submissions(
      exam_id, user_id, question_id, attempt_id, edited_text,
      submitted_at, grading_result, graded_by
    ) VALUES (
      v_normal_exam, v_student, v_normal_eq, v_attempt_id, 'Official answer',
      now() - interval '90 minutes',
      jsonb_build_object(
        'internal', jsonb_build_object('total', v_score, 'max', 10, 'criteria', '[]'::jsonb),
        'studentFeedback', jsonb_build_object('score', v_score::text || '/10', 'summary', 'Reviewed', 'highlights', '[]'::jsonb)
      ),
      'admin'
    );
  END LOOP;

  -- Rogue legacy and practice rows must not alter official totals or count.
  INSERT INTO public.exam_submissions(
    exam_id, user_id, question_id, attempt_id, edited_text,
    submitted_at, grading_result, graded_by
  ) VALUES (
    v_normal_exam,
    '30000000-0000-4000-8000-000000000001',
    v_normal_eq,
    NULL,
    'Rogue legacy answer',
    now() - interval '90 minutes',
    '{"internal":{"total":999,"max":10,"criteria":[]},"studentFeedback":{"score":"999/10","summary":"Rogue","highlights":[]}}',
    'admin'
  );
  INSERT INTO public.exam_attempts(
    id, exam_id, user_id, mode, status, started_at, expires_at,
    submitted_at, finalized_at, writer_token_hash
  ) VALUES (
    '32000000-0000-4000-8000-000000000001',
    v_normal_exam,
    '30000000-0000-4000-8000-000000000001',
    'practice', 'finalized', now() - interval '1 hour', now() - interval '30 minutes',
    now() - interval '30 minutes', now() - interval '30 minutes', 'practice'
  );
  INSERT INTO public.exam_submissions(
    exam_id, user_id, question_id, attempt_id, edited_text,
    submitted_at, grading_result, graded_by
  ) VALUES (
    v_normal_exam,
    '30000000-0000-4000-8000-000000000001',
    v_normal_eq,
    '32000000-0000-4000-8000-000000000001',
    'Practice answer',
    now() - interval '30 minutes',
    '{"internal":{"total":999,"max":10,"criteria":[]},"studentFeedback":{"score":"999/10","summary":"Practice","highlights":[]}}',
    'admin'
  );

  SELECT public.publish_exam_results_once(v_normal_exam) INTO v_version;
  IF v_version <> 1 THEN RAISE EXCEPTION 'ASSERT: first normal result version is not 1'; END IF;
  IF (SELECT count(*) FROM public.exam_results WHERE exam_id = v_normal_exam) <> 101 THEN
    RAISE EXCEPTION 'ASSERT: practice or rogue rows changed participant count';
  END IF;
  IF (SELECT total_score FROM public.exam_results
      WHERE exam_id = v_normal_exam AND user_id = '30000000-0000-4000-8000-000000000001') <> 10 THEN
    RAISE EXCEPTION 'ASSERT: practice or rogue rows changed official score';
  END IF;
  IF (SELECT rank FROM public.exam_results
      WHERE exam_id = v_normal_exam AND user_id = '30000000-0000-4000-8000-000000000001')
     <> (SELECT rank FROM public.exam_results
         WHERE exam_id = v_normal_exam AND user_id = '30000000-0000-4000-8000-000000000002')
  THEN RAISE EXCEPTION 'ASSERT: equal scores do not share competition rank'; END IF;

  PERFORM set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
  v_page := public.get_published_leaderboard_page(v_normal_exam, 1, 100);
  IF jsonb_array_length(v_page -> 'rows') <> 100
    OR (v_page ->> 'total_count')::integer <> 101
    OR (v_page ->> 'results_version')::integer <> 1
  THEN RAISE EXCEPTION 'ASSERT: leaderboard page 1 metadata is incorrect'; END IF;
  v_page := public.get_published_leaderboard_page(v_normal_exam, 2, 100);
  IF jsonb_array_length(v_page -> 'rows') <> 1
    OR (v_page ->> 'total_count')::integer <> 101
  THEN RAISE EXCEPTION 'ASSERT: leaderboard page 2 is incorrect'; END IF;
  SELECT count(*) INTO v_count
  FROM public.get_published_leaderboard(v_normal_exam, 1, 100);
  IF v_count <> 100 THEN
    RAISE EXCEPTION 'ASSERT: guarded compatibility leaderboard broke';
  END IF;
  BEGIN
    PERFORM public.get_published_leaderboard_page(v_normal_exam, 3, 100);
    RAISE EXCEPTION 'ASSERT: out-of-range leaderboard page was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%INVALID_PAGE%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.publish_exam_results_once(v_normal_exam);
    RAISE EXCEPTION 'ASSERT: already-published results were publishable again';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%RESULTS_ALREADY_PUBLISHED%' THEN RAISE; END IF;
  END;

  PERFORM public.extend_exam_deadline(v_normal_exam, 120);
  IF (SELECT results_published FROM public.exams WHERE id = v_normal_exam) THEN
    RAISE EXCEPTION 'ASSERT: deadline extension did not reopen publication';
  END IF;
  BEGIN
    PERFORM public.publish_exam_results_once(v_normal_exam);
    RAISE EXCEPTION 'ASSERT: results were publishable before the extended deadline';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%EXAM_NOT_ENDED%' THEN RAISE; END IF;
  END;
  UPDATE public.exams SET ends_at = now() - interval '1 second' WHERE id = v_normal_exam;
  SELECT public.publish_exam_results_once(v_normal_exam) INTO v_version;
  IF v_version <> 2 THEN
    RAISE EXCEPTION 'ASSERT: post-extension publication did not invalidate result version';
  END IF;
  IF (SELECT count(*) FROM public.notifications
      WHERE user_id = '30000000-0000-4000-8000-000000000001'
        AND exam_id = v_normal_exam
        AND type = 'results_published') <> 2 THEN
    RAISE EXCEPTION 'ASSERT: post-extension publication did not notify again exactly once';
  END IF;

  INSERT INTO public.exams(
    id, title, time_limit_minutes, starts_at, ends_at,
    is_published, created_by
  ) VALUES (
    v_empty_exam, 'Empty Exam', 30,
    now() - interval '2 hours', now() - interval '1 hour', true, v_admin
  );
  INSERT INTO public.exam_questions(exam_id, question_id, order_index, marks)
  VALUES (v_empty_exam, v_question, 0, 10);
  BEGIN
    PERFORM public.publish_exam_results_once(v_empty_exam);
    RAISE EXCEPTION 'ASSERT: zero-participant result publication was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%NO_PARTICIPANTS%' THEN RAISE; END IF;
  END;
  UPDATE public.exams
  SET results_published = true, results_version = 1
  WHERE id = v_empty_exam;
  v_page := public.get_published_leaderboard_page(v_empty_exam, 1, 100);
  IF jsonb_array_length(v_page -> 'rows') <> 0
    OR (v_page ->> 'total_count')::integer <> 0
    OR (v_page ->> 'results_version')::integer <> 1
  THEN RAISE EXCEPTION 'ASSERT: empty leaderboard lost metadata'; END IF;
END;
$$;

-- Exercise the actual policies as the authenticated role instead of as the
-- database owner (which bypasses RLS).
GRANT SELECT ON public.magnus_memberships, public.exams, public.exam_questions,
  public.exam_attempts, public.exam_submissions, public.exam_results
  TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.magnus_memberships;
  IF v_count <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.magnus_memberships
    WHERE user_id = '20000000-0000-4000-8000-000000000003' AND status = 'pending'
  ) THEN RAISE EXCEPTION 'ASSERT: membership RLS exposed another student'; END IF;
  IF public.is_magnus_student('20000000-0000-4000-8000-000000000004') THEN
    RAISE EXCEPTION 'ASSERT: Magnus helper exposed another student status';
  END IF;
  IF public.can_access_exam_audience(
    '21000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000004'
  ) THEN RAISE EXCEPTION 'ASSERT: audience helper exposed another student status'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.exams WHERE id = '21000000-0000-4000-8000-000000000001'
  ) THEN RAISE EXCEPTION 'ASSERT: pending user can discover Magnus exam by id'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.exam_questions WHERE exam_id = '21000000-0000-4000-8000-000000000001'
  ) THEN RAISE EXCEPTION 'ASSERT: pending user can discover Magnus question mapping'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.exam_results WHERE exam_id = '21000000-0000-4000-8000-000000000001'
  ) THEN RAISE EXCEPTION 'ASSERT: pending user can discover Magnus results'; END IF;
  BEGIN
    PERFORM public.get_published_leaderboard_page(
      '21000000-0000-4000-8000-000000000001', 1, 100
    );
    RAISE EXCEPTION 'ASSERT: pending user can call Magnus leaderboard';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%EXAM_NOT_FOUND%' THEN RAISE; END IF;
  END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.exams WHERE id = '21000000-0000-4000-8000-000000000001'
  ) THEN RAISE EXCEPTION 'ASSERT: approved user cannot see Magnus exam'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.exam_questions WHERE exam_id = '21000000-0000-4000-8000-000000000001'
  ) THEN RAISE EXCEPTION 'ASSERT: approved user cannot see Magnus question mapping'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.exam_results
    WHERE exam_id = '21000000-0000-4000-8000-000000000001'
      AND user_id = '20000000-0000-4000-8000-000000000004'
  ) THEN RAISE EXCEPTION 'ASSERT: approved user cannot see Magnus leaderboard row'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.exam_results
    WHERE exam_id = '21000000-0000-4000-8000-000000000001'
      AND user_id = '20000000-0000-4000-8000-000000000003'
  ) THEN RAISE EXCEPTION 'ASSERT: rogue pending Magnus result was exposed'; END IF;
  IF jsonb_array_length(public.get_published_leaderboard_page(
      '21000000-0000-4000-8000-000000000001', 1, 100
    ) -> 'rows') <> 1
  THEN RAISE EXCEPTION 'ASSERT: Magnus leaderboard audience filtering failed'; END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
