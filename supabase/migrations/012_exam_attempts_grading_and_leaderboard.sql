-- Durable exam attempts, atomic usage accounting, grading queues, and
-- transaction-safe result publication.

CREATE TYPE exam_attempt_mode AS ENUM ('official', 'practice');
CREATE TYPE exam_attempt_status AS ENUM (
  'active',
  'locked',
  'awaiting_selection',
  'grading',
  'finalized'
);
CREATE TYPE grading_job_kind AS ENUM ('official_exam', 'practice_exam');
CREATE TYPE grading_job_status AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE grading_item_status AS ENUM ('queued', 'running', 'completed', 'failed', 'skipped', 'cancelled');
CREATE TYPE usage_source AS ENUM ('extra', 'plan', 'free');
CREATE TYPE usage_charge_status AS ENUM ('reserved', 'consumed', 'released');

ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS results_version integer NOT NULL DEFAULT 0;

CREATE TABLE exam_attempts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mode exam_attempt_mode NOT NULL,
  status exam_attempt_status NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  submitted_at timestamptz,
  finalized_at timestamptz,
  writer_token_hash text NOT NULL,
  writer_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_attempt_time_order CHECK (expires_at > started_at)
);

CREATE UNIQUE INDEX exam_attempts_one_official
  ON exam_attempts(exam_id, user_id)
  WHERE mode = 'official';
CREATE INDEX exam_attempts_due
  ON exam_attempts(status, expires_at)
  WHERE status IN ('active', 'locked');
CREATE INDEX exam_attempts_user
  ON exam_attempts(user_id, created_at DESC);

ALTER TABLE exam_submissions
  ADD COLUMN IF NOT EXISTS attempt_id uuid REFERENCES exam_attempts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS exam_submissions_attempt ON exam_submissions(attempt_id);

CREATE TABLE grading_jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind grading_job_kind NOT NULL,
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  attempt_id uuid REFERENCES exam_attempts(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES profiles(id),
  status grading_job_status NOT NULL DEFAULT 'queued',
  allow_regrade boolean NOT NULL DEFAULT false,
  total_items integer NOT NULL DEFAULT 0,
  completed_items integer NOT NULL DEFAULT 0,
  failed_items integer NOT NULL DEFAULT 0,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX grading_jobs_status ON grading_jobs(status, created_at);

CREATE TABLE grading_job_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id uuid NOT NULL REFERENCES grading_jobs(id) ON DELETE CASCADE,
  exam_question_id uuid NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
  exam_submission_id uuid REFERENCES exam_submissions(id) ON DELETE CASCADE,
  status grading_item_status NOT NULL DEFAULT 'queued',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_by text,
  claimed_at timestamptz,
  result jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id, exam_question_id)
);

CREATE INDEX grading_job_items_claim
  ON grading_job_items(status, next_attempt_at, created_at)
  WHERE status IN ('queued', 'running');

CREATE TABLE usage_charges (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  exam_question_id uuid NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
  source usage_source NOT NULL,
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  status usage_charge_status NOT NULL DEFAULT 'reserved',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, attempt_id, exam_question_id)
);

ALTER TABLE exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE grading_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE grading_job_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own attempts" ON exam_attempts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all attempts" ON exam_attempts
  FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins manage attempts" ON exam_attempts
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Users can view own practice jobs" ON grading_jobs
  FOR SELECT USING (auth.uid() = requested_by);
CREATE POLICY "Admins manage grading jobs" ON grading_jobs
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Users can view own job items" ON grading_job_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM grading_jobs j
      WHERE j.id = job_id AND j.requested_by = auth.uid()
    )
  );
CREATE POLICY "Admins manage grading items" ON grading_job_items
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Users can view own usage charges" ON usage_charges
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins manage usage charges" ON usage_charges
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Atomic attempt creation/resume. All eligibility and duration inputs are
-- derived by the server; the function is service-role only.
CREATE OR REPLACE FUNCTION public.start_exam_attempt(
  p_exam_id uuid,
  p_user_id uuid,
  p_mode exam_attempt_mode,
  p_expires_at timestamptz,
  p_writer_token_hash text
)
RETURNS exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt exam_attempts;
BEGIN
  IF p_mode = 'official' THEN
    SELECT * INTO v_attempt
    FROM exam_attempts
    WHERE exam_id = p_exam_id AND user_id = p_user_id AND mode = 'official'
    FOR UPDATE;
  ELSE
    SELECT * INTO v_attempt
    FROM exam_attempts
    WHERE exam_id = p_exam_id
      AND user_id = p_user_id
      AND mode = 'practice'
      AND status IN ('active', 'locked', 'awaiting_selection', 'grading')
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF FOUND THEN
    RETURN v_attempt;
  END IF;

  INSERT INTO exam_attempts (
    exam_id, user_id, mode, status, started_at, expires_at, writer_token_hash
  ) VALUES (
    p_exam_id, p_user_id, p_mode, 'active', now(), p_expires_at, p_writer_token_hash
  ) RETURNING * INTO v_attempt;

  RETURN v_attempt;
END;
$$;

CREATE OR REPLACE FUNCTION public.take_over_exam_attempt(
  p_attempt_id uuid,
  p_user_id uuid,
  p_writer_token_hash text
)
RETURNS exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt exam_attempts;
BEGIN
  UPDATE exam_attempts
  SET writer_token_hash = p_writer_token_hash,
      writer_version = writer_version + 1,
      updated_at = now()
  WHERE id = p_attempt_id
    AND user_id = p_user_id
    AND status = 'active'
    AND expires_at + interval '3 minutes' >= now()
  RETURNING * INTO v_attempt;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_ACTIVE';
  END IF;
  RETURN v_attempt;
END;
$$;

-- Reserve one slot per selected practice answer. Existing reservations make
-- retries idempotent. Counter rows are locked before being decremented.
CREATE OR REPLACE FUNCTION public.reserve_practice_usage(
  p_user_id uuid,
  p_attempt_id uuid,
  p_exam_question_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_question_id uuid;
  v_subscription subscriptions;
  v_profile profiles;
  v_reserved integer := 0;
BEGIN
  SELECT * INTO v_subscription
  FROM subscriptions
  WHERE user_id = p_user_id
    AND is_active = true
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id FOR UPDATE;

  FOREACH v_question_id IN ARRAY p_exam_question_ids LOOP
    IF EXISTS (
      SELECT 1 FROM usage_charges
      WHERE user_id = p_user_id
        AND attempt_id = p_attempt_id
        AND exam_question_id = v_question_id
        AND status IN ('reserved', 'consumed')
    ) THEN
      v_reserved := v_reserved + 1;
      CONTINUE;
    END IF;

    IF v_subscription.id IS NOT NULL AND v_subscription.extra_tests_purchased > 0 THEN
      v_subscription.extra_tests_purchased := v_subscription.extra_tests_purchased - 1;
      UPDATE subscriptions SET extra_tests_purchased = v_subscription.extra_tests_purchased
      WHERE id = v_subscription.id;
      INSERT INTO usage_charges(user_id, attempt_id, exam_question_id, source, subscription_id)
      VALUES (p_user_id, p_attempt_id, v_question_id, 'extra', v_subscription.id);
    ELSIF v_subscription.id IS NOT NULL
      AND v_subscription.plan_type IN ('plan_1', 'plan_2')
      AND v_subscription.tests_remaining > 0 THEN
      v_subscription.tests_remaining := v_subscription.tests_remaining - 1;
      UPDATE subscriptions SET tests_remaining = v_subscription.tests_remaining
      WHERE id = v_subscription.id;
      INSERT INTO usage_charges(user_id, attempt_id, exam_question_id, source, subscription_id)
      VALUES (p_user_id, p_attempt_id, v_question_id, 'plan', v_subscription.id);
    ELSIF v_profile.free_tests_remaining > 0 THEN
      v_profile.free_tests_remaining := v_profile.free_tests_remaining - 1;
      UPDATE profiles SET free_tests_remaining = v_profile.free_tests_remaining
      WHERE id = v_profile.id;
      INSERT INTO usage_charges(user_id, attempt_id, exam_question_id, source)
      VALUES (p_user_id, p_attempt_id, v_question_id, 'free');
    ELSE
      RAISE EXCEPTION 'INSUFFICIENT_SLOTS';
    END IF;

    v_reserved := v_reserved + 1;
  END LOOP;

  RETURN v_reserved;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_usage_charge(
  p_attempt_id uuid,
  p_exam_question_id uuid,
  p_success boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge usage_charges;
BEGIN
  SELECT * INTO v_charge
  FROM usage_charges
  WHERE attempt_id = p_attempt_id AND exam_question_id = p_exam_question_id
  FOR UPDATE;

  IF NOT FOUND OR v_charge.status <> 'reserved' THEN
    RETURN;
  END IF;

  IF p_success THEN
    UPDATE usage_charges SET status = 'consumed', updated_at = now()
    WHERE id = v_charge.id;
    RETURN;
  END IF;

  IF v_charge.source = 'free' THEN
    UPDATE profiles SET free_tests_remaining = free_tests_remaining + 1
    WHERE id = v_charge.user_id;
  ELSIF v_charge.source = 'extra' THEN
    UPDATE subscriptions SET extra_tests_purchased = extra_tests_purchased + 1
    WHERE id = v_charge.subscription_id;
  ELSE
    UPDATE subscriptions SET tests_remaining = tests_remaining + 1
    WHERE id = v_charge.subscription_id;
  END IF;

  UPDATE usage_charges SET status = 'released', updated_at = now()
  WHERE id = v_charge.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_grading_items(
  p_worker_id text,
  p_limit integer DEFAULT 4
)
RETURNS SETOF grading_job_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT i.id
    FROM grading_job_items i
    JOIN grading_jobs j ON j.id = i.job_id
    WHERE j.status IN ('queued', 'running')
      AND i.status = 'queued'
      AND i.next_attempt_at <= now()
    ORDER BY i.created_at
    FOR UPDATE OF i SKIP LOCKED
    LIMIT greatest(1, least(p_limit, 20))
  )
  UPDATE grading_job_items i
  SET status = 'running',
      claimed_by = p_worker_id,
      claimed_at = now(),
      attempt_count = attempt_count + 1,
      updated_at = now()
  FROM claimable c
  WHERE i.id = c.id
  RETURNING i.*;

  UPDATE grading_jobs j
  SET status = 'running',
      started_at = coalesce(started_at, now()),
      updated_at = now()
  WHERE status = 'queued'
    AND EXISTS (SELECT 1 FROM grading_job_items i WHERE i.job_id = j.id AND i.claimed_by = p_worker_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_grading_job(p_job_id uuid)
RETURNS grading_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job grading_jobs;
  v_completed integer;
  v_failed integer;
  v_open integer;
BEGIN
  SELECT count(*) FILTER (WHERE status IN ('completed', 'skipped')),
         count(*) FILTER (WHERE status = 'failed'),
         count(*) FILTER (WHERE status IN ('queued', 'running'))
    INTO v_completed, v_failed, v_open
  FROM grading_job_items WHERE job_id = p_job_id;

  UPDATE grading_jobs
  SET completed_items = v_completed,
      failed_items = v_failed,
      status = CASE
        WHEN status = 'cancelled' THEN 'cancelled'::grading_job_status
        WHEN v_open > 0 THEN 'running'::grading_job_status
        WHEN v_failed > 0 THEN 'failed'::grading_job_status
        ELSE 'completed'::grading_job_status
      END,
      completed_at = CASE WHEN v_open = 0 THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_job_id
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

-- Atomic publication and shared competition ranking.
CREATE OR REPLACE FUNCTION public.publish_exam_results(p_exam_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam exams;
  v_version integer;
BEGIN
  SELECT * INTO v_exam FROM exams WHERE id = p_exam_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EXAM_NOT_FOUND'; END IF;
  IF now() < v_exam.ends_at THEN RAISE EXCEPTION 'EXAM_NOT_ENDED'; END IF;

  IF EXISTS (
    SELECT 1 FROM exam_attempts
    WHERE exam_id = p_exam_id AND mode = 'official' AND status <> 'finalized'
  ) THEN
    RAISE EXCEPTION 'ATTEMPTS_NOT_FINALIZED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM exam_submissions
    WHERE exam_id = p_exam_id AND grading_result IS NULL
  ) THEN
    RAISE EXCEPTION 'GRADING_INCOMPLETE';
  END IF;

  DELETE FROM exam_results WHERE exam_id = p_exam_id;

  INSERT INTO exam_results(exam_id, user_id, total_score, max_score)
  SELECT s.exam_id,
         s.user_id,
         sum(coalesce((s.grading_result #>> '{internal,total}')::numeric, 0)),
         sum(eq.marks)
  FROM exam_submissions s
  JOIN exam_questions eq ON eq.id = s.question_id
  WHERE s.exam_id = p_exam_id
  GROUP BY s.exam_id, s.user_id;

  WITH ranked AS (
    SELECT id, rank() OVER (ORDER BY total_score DESC)::integer AS position
    FROM exam_results WHERE exam_id = p_exam_id
  )
  UPDATE exam_results r SET rank = ranked.position
  FROM ranked WHERE ranked.id = r.id;

  UPDATE exams
  SET results_published = true,
      results_version = results_version + 1,
      updated_at = now()
  WHERE id = p_exam_id
  RETURNING results_version INTO v_version;

  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_published_leaderboard(
  p_exam_id uuid,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 100
)
RETURNS TABLE(
  user_id uuid,
  student_name text,
  institute text,
  total_score numeric,
  max_score integer,
  rank integer,
  total_count bigint,
  results_version integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM exams WHERE id = p_exam_id AND results_published = true) THEN
    RAISE EXCEPTION 'RESULTS_EMBARGOED';
  END IF;

  RETURN QUERY
  SELECT r.user_id,
         p.name,
         p.institute,
         r.total_score,
         r.max_score,
         r.rank,
         count(*) OVER (),
         e.results_version
  FROM exam_results r
  JOIN profiles p ON p.id = r.user_id
  JOIN exams e ON e.id = r.exam_id
  WHERE r.exam_id = p_exam_id
  ORDER BY r.rank, p.name
  LIMIT greatest(1, least(p_page_size, 100))
  OFFSET (greatest(1, p_page) - 1) * greatest(1, least(p_page_size, 100));
END;
$$;

REVOKE ALL ON FUNCTION public.start_exam_attempt(uuid, uuid, exam_attempt_mode, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.take_over_exam_attempt(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_practice_usage(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_usage_charge(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_grading_items(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_grading_job(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_exam_results(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.start_exam_attempt(uuid, uuid, exam_attempt_mode, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.take_over_exam_attempt(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_practice_usage(uuid, uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_usage_charge(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_grading_items(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_grading_job(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_exam_results(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_published_leaderboard(uuid, integer, integer) TO authenticated;

