-- Private Magnus exam audiences, consolidated RLS, and reliable result pages.

ALTER TABLE public.exams
  ADD COLUMN is_magnus_only boolean NOT NULL DEFAULT false,
  ADD COLUMN audience_locked_at timestamptz;

UPDATE public.exams
SET audience_locked_at = now()
WHERE is_published = true
  AND audience_locked_at IS NULL;

CREATE INDEX exams_published_audience_start
  ON public.exams(is_published, is_magnus_only, starts_at);

CREATE FUNCTION public.can_access_exam_audience_internal(
  p_exam_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(EXISTS (
    SELECT 1
    FROM public.exams AS exam
    WHERE exam.id = p_exam_id
      AND (
        exam.is_magnus_only = false
        OR EXISTS (
          SELECT 1
          FROM public.profiles AS profile
          WHERE profile.id = p_user_id
            AND profile.is_admin = true
        )
        OR EXISTS (
          SELECT 1
          FROM public.magnus_memberships AS membership
          WHERE membership.user_id = p_user_id
            AND membership.status = 'approved'
        )
      )
  ), false);
$$;

REVOKE ALL ON FUNCTION public.can_access_exam_audience_internal(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_exam_audience_internal(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.can_access_exam_audience(
  p_exam_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    p_user_id IS NOT NULL
    AND (p_user_id = auth.uid() OR public.is_admin())
    AND public.can_access_exam_audience_internal(p_exam_id, p_user_id),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_exam_audience(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_exam_audience(uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lock_exam_audience_after_publication()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.audience_locked_at IS NOT NULL
    AND NEW.is_magnus_only IS DISTINCT FROM OLD.is_magnus_only
  THEN
    RAISE EXCEPTION 'EXAM_AUDIENCE_LOCKED';
  END IF;

  IF NEW.is_published = true
    AND (TG_OP = 'INSERT' OR OLD.is_published = false)
  THEN
    NEW.audience_locked_at := coalesce(NEW.audience_locked_at, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER exams_lock_audience
  BEFORE INSERT OR UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.lock_exam_audience_after_publication();

-- Remove the duplicate permissive student policies accumulated by the early
-- migrations, then recreate one audience-aware policy per table.
DROP POLICY IF EXISTS "Users can view published exams" ON public.exams;
DROP POLICY IF EXISTS "Anyone can read published exams" ON public.exams;
CREATE POLICY "Students view accessible published exams"
  ON public.exams FOR SELECT
  USING (
    is_published = true
    AND public.can_access_exam_audience(id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can view exam questions for published exams"
  ON public.exam_questions;
DROP POLICY IF EXISTS "Anyone can read exam questions"
  ON public.exam_questions;
CREATE POLICY "Students view accessible started exam questions"
  ON public.exam_questions FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM public.exams AS exam
    WHERE exam.id = exam_id
      AND exam.is_published = true
      AND exam.starts_at <= now()
      AND public.can_access_exam_audience(exam.id, auth.uid())
  ));

DROP POLICY IF EXISTS "Users can view own attempts" ON public.exam_attempts;
CREATE POLICY "Users view own accessible attempts"
  ON public.exam_attempts FOR SELECT
  USING (
    auth.uid() = user_id
    AND public.can_access_exam_audience(exam_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can view own exam submissions"
  ON public.exam_submissions;
CREATE POLICY "Users view own accessible exam submissions"
  ON public.exam_submissions FOR SELECT
  USING (
    auth.uid() = user_id
    AND public.can_access_exam_audience(exam_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can view exam results when published"
  ON public.exam_results;
DROP POLICY IF EXISTS "Users can view own exam results"
  ON public.exam_results;
CREATE POLICY "Users view accessible published exam results"
  ON public.exam_results FOR SELECT
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

DROP POLICY IF EXISTS "Users can view own practice jobs" ON public.grading_jobs;
CREATE POLICY "Users view own accessible practice jobs"
  ON public.grading_jobs FOR SELECT
  USING (
    auth.uid() = requested_by
    AND public.can_access_exam_audience(exam_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can view own job items" ON public.grading_job_items;
CREATE POLICY "Users view own accessible job items"
  ON public.grading_job_items FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM public.grading_jobs AS job
    WHERE job.id = job_id
      AND job.requested_by = auth.uid()
      AND public.can_access_exam_audience(job.exam_id, auth.uid())
  ));

-- Service-role application paths still pass through these write guards. This
-- prevents a future route from accidentally creating a Magnus attempt, answer,
-- or practice job for a normal or pending student.
CREATE OR REPLACE FUNCTION public.enforce_exam_audience_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_exam_id uuid;
  v_user_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'exam_attempts' THEN
    v_exam_id := NEW.exam_id;
    v_user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'exam_submissions' THEN
    v_exam_id := NEW.exam_id;
    v_user_id := NEW.user_id;
  ELSE
    v_exam_id := NEW.exam_id;
    v_user_id := NEW.requested_by;
  END IF;

  IF NOT public.can_access_exam_audience_internal(v_exam_id, v_user_id) THEN
    RAISE EXCEPTION 'EXAM_NOT_FOUND';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER exam_attempts_enforce_audience
  BEFORE INSERT OR UPDATE OF exam_id, user_id ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_exam_audience_write();
CREATE TRIGGER exam_submissions_enforce_audience
  BEFORE INSERT OR UPDATE OF exam_id, user_id ON public.exam_submissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_exam_audience_write();
CREATE TRIGGER grading_jobs_enforce_audience
  BEFORE INSERT OR UPDATE OF exam_id, requested_by ON public.grading_jobs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_exam_audience_write();

-- New overloads carry the audience bit. The old service-role signatures remain
-- available temporarily and continue to create/update normal exams.
CREATE FUNCTION public.create_exam_definition(
  p_created_by uuid,
  p_title text,
  p_description text,
  p_time_limit_minutes integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_is_published boolean,
  p_is_magnus_only boolean,
  p_questions jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_exam_id uuid;
  v_question jsonb;
BEGIN
  IF p_ends_at <= p_starts_at OR p_time_limit_minutes < 1 THEN
    RAISE EXCEPTION 'INVALID_EXAM_TIME';
  END IF;
  IF jsonb_array_length(p_questions) = 0 THEN
    RAISE EXCEPTION 'QUESTIONS_REQUIRED';
  END IF;

  INSERT INTO public.exams(
    title, description, time_limit_minutes, starts_at, ends_at,
    is_published, is_magnus_only, created_by
  ) VALUES (
    p_title, p_description, p_time_limit_minutes, p_starts_at, p_ends_at,
    p_is_published, p_is_magnus_only, p_created_by
  ) RETURNING id INTO v_exam_id;

  FOR v_question IN SELECT * FROM jsonb_array_elements(p_questions) LOOP
    INSERT INTO public.exam_questions(exam_id, question_id, order_index, marks)
    VALUES (
      v_exam_id,
      (v_question ->> 'questionId')::uuid,
      (v_question ->> 'orderIndex')::integer,
      (v_question ->> 'marks')::integer
    );
  END LOOP;
  RETURN v_exam_id;
END;
$$;

CREATE FUNCTION public.update_exam_definition(
  p_exam_id uuid,
  p_title text,
  p_description text,
  p_time_limit_minutes integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_is_published boolean,
  p_is_magnus_only boolean,
  p_questions jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_question jsonb;
  v_exam public.exams%ROWTYPE;
BEGIN
  SELECT * INTO v_exam
  FROM public.exams
  WHERE id = p_exam_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EXAM_NOT_FOUND'; END IF;
  IF v_exam.audience_locked_at IS NOT NULL
    AND p_is_magnus_only IS DISTINCT FROM v_exam.is_magnus_only
  THEN
    RAISE EXCEPTION 'EXAM_AUDIENCE_LOCKED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.exam_attempts
    WHERE exam_id = p_exam_id AND mode = 'official'
  ) THEN
    RAISE EXCEPTION 'EXAM_ALREADY_STARTED';
  END IF;
  IF p_ends_at <= p_starts_at OR p_time_limit_minutes < 1 THEN
    RAISE EXCEPTION 'INVALID_EXAM_TIME';
  END IF;
  IF jsonb_array_length(p_questions) = 0 THEN
    RAISE EXCEPTION 'QUESTIONS_REQUIRED';
  END IF;

  UPDATE public.exams SET
    title = p_title,
    description = p_description,
    time_limit_minutes = p_time_limit_minutes,
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    is_published = p_is_published,
    is_magnus_only = p_is_magnus_only,
    updated_at = now()
  WHERE id = p_exam_id;

  DELETE FROM public.exam_questions WHERE exam_id = p_exam_id;
  FOR v_question IN SELECT * FROM jsonb_array_elements(p_questions) LOOP
    INSERT INTO public.exam_questions(exam_id, question_id, order_index, marks)
    VALUES (
      p_exam_id,
      (v_question ->> 'questionId')::uuid,
      (v_question ->> 'orderIndex')::integer,
      (v_question ->> 'marks')::integer
    );
  END LOOP;
  RETURN p_exam_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_exam_definition(
  uuid, text, text, integer, timestamptz, timestamptz, boolean, boolean, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_exam_definition(
  uuid, text, text, integer, timestamptz, timestamptz, boolean, boolean, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_exam_definition(
  uuid, text, text, integer, timestamptz, timestamptz, boolean, boolean, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_exam_definition(
  uuid, text, text, integer, timestamptz, timestamptz, boolean, boolean, jsonb
) TO service_role;

-- Results are generated only from finalized official attempts. Null-attempt
-- submissions are retained solely as a guarded compatibility path for exams
-- created before durable attempts existed.
CREATE OR REPLACE FUNCTION public.publish_exam_results(p_exam_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_exam public.exams%ROWTYPE;
  v_version integer;
  v_participant_count integer;
BEGIN
  SELECT * INTO v_exam
  FROM public.exams
  WHERE id = p_exam_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EXAM_NOT_FOUND'; END IF;
  IF now() < v_exam.ends_at THEN RAISE EXCEPTION 'EXAM_NOT_ENDED'; END IF;

  IF EXISTS (
    SELECT 1
    FROM public.exam_attempts
    WHERE exam_id = p_exam_id
      AND mode = 'official'
      AND status <> 'finalized'
  ) THEN
    RAISE EXCEPTION 'ATTEMPTS_NOT_FINALIZED';
  END IF;

  WITH participants AS (
    SELECT attempt.user_id, attempt.id AS attempt_id
    FROM public.exam_attempts AS attempt
    WHERE attempt.exam_id = p_exam_id
      AND attempt.mode = 'official'
      AND attempt.status = 'finalized'
      AND public.can_access_exam_audience_internal(p_exam_id, attempt.user_id)
    UNION ALL
    SELECT DISTINCT submission.user_id, NULL::uuid
    FROM public.exam_submissions AS submission
    WHERE submission.exam_id = p_exam_id
      AND submission.attempt_id IS NULL
      AND submission.submitted_at IS NOT NULL
      AND public.can_access_exam_audience_internal(p_exam_id, submission.user_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.exam_attempts AS attempt
        WHERE attempt.exam_id = p_exam_id
          AND attempt.user_id = submission.user_id
          AND attempt.mode = 'official'
      )
  )
  SELECT count(*) INTO v_participant_count FROM participants;

  IF v_participant_count = 0 THEN RAISE EXCEPTION 'NO_PARTICIPANTS'; END IF;

  IF EXISTS (
    WITH participants AS (
      SELECT attempt.user_id, attempt.id AS attempt_id
      FROM public.exam_attempts AS attempt
      WHERE attempt.exam_id = p_exam_id
        AND attempt.mode = 'official'
        AND attempt.status = 'finalized'
        AND public.can_access_exam_audience_internal(p_exam_id, attempt.user_id)
      UNION ALL
      SELECT DISTINCT submission.user_id, NULL::uuid
      FROM public.exam_submissions AS submission
      WHERE submission.exam_id = p_exam_id
        AND submission.attempt_id IS NULL
        AND submission.submitted_at IS NOT NULL
        AND public.can_access_exam_audience_internal(p_exam_id, submission.user_id)
        AND NOT EXISTS (
          SELECT 1 FROM public.exam_attempts AS attempt
          WHERE attempt.exam_id = p_exam_id
            AND attempt.user_id = submission.user_id
            AND attempt.mode = 'official'
        )
    )
    SELECT 1
    FROM participants AS participant
    CROSS JOIN public.exam_questions AS exam_question
    LEFT JOIN LATERAL (
      SELECT submission.id, submission.grading_result
      FROM public.exam_submissions AS submission
      WHERE submission.exam_id = p_exam_id
        AND submission.user_id = participant.user_id
        AND submission.question_id = exam_question.id
        AND (
          (participant.attempt_id IS NOT NULL AND submission.attempt_id = participant.attempt_id)
          OR (participant.attempt_id IS NULL AND submission.attempt_id IS NULL)
        )
      ORDER BY submission.created_at DESC, submission.id DESC
      LIMIT 1
    ) AS answer ON true
    WHERE exam_question.exam_id = p_exam_id
      AND (answer.id IS NULL OR answer.grading_result IS NULL)
  ) THEN
    RAISE EXCEPTION 'GRADING_INCOMPLETE';
  END IF;

  DELETE FROM public.exam_results WHERE exam_id = p_exam_id;

  INSERT INTO public.exam_results(exam_id, user_id, total_score, max_score)
  WITH participants AS (
    SELECT attempt.user_id, attempt.id AS attempt_id
    FROM public.exam_attempts AS attempt
    WHERE attempt.exam_id = p_exam_id
      AND attempt.mode = 'official'
      AND attempt.status = 'finalized'
      AND public.can_access_exam_audience_internal(p_exam_id, attempt.user_id)
    UNION ALL
    SELECT DISTINCT submission.user_id, NULL::uuid
    FROM public.exam_submissions AS submission
    WHERE submission.exam_id = p_exam_id
      AND submission.attempt_id IS NULL
      AND submission.submitted_at IS NOT NULL
      AND public.can_access_exam_audience_internal(p_exam_id, submission.user_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.exam_attempts AS attempt
        WHERE attempt.exam_id = p_exam_id
          AND attempt.user_id = submission.user_id
          AND attempt.mode = 'official'
      )
  )
  SELECT
    p_exam_id,
    participant.user_id,
    sum(coalesce((answer.grading_result #>> '{internal,total}')::numeric, 0)),
    sum(exam_question.marks)
  FROM participants AS participant
  CROSS JOIN public.exam_questions AS exam_question
  LEFT JOIN LATERAL (
    SELECT submission.grading_result
    FROM public.exam_submissions AS submission
    WHERE submission.exam_id = p_exam_id
      AND submission.user_id = participant.user_id
      AND submission.question_id = exam_question.id
      AND (
        (participant.attempt_id IS NOT NULL AND submission.attempt_id = participant.attempt_id)
        OR (participant.attempt_id IS NULL AND submission.attempt_id IS NULL)
      )
    ORDER BY submission.created_at DESC, submission.id DESC
    LIMIT 1
  ) AS answer ON true
  WHERE exam_question.exam_id = p_exam_id
  GROUP BY participant.user_id;

  WITH ranked AS (
    SELECT
      result.id,
      rank() OVER (ORDER BY result.total_score DESC)::integer AS position
    FROM public.exam_results AS result
    WHERE result.exam_id = p_exam_id
  )
  UPDATE public.exam_results AS result
  SET rank = ranked.position
  FROM ranked
  WHERE ranked.id = result.id;

  UPDATE public.exams
  SET results_published = true,
      results_version = results_version + 1,
      updated_at = now()
  WHERE id = p_exam_id
  RETURNING results_version INTO v_version;
  RETURN v_version;
END;
$$;

CREATE FUNCTION public.get_published_leaderboard_page(
  p_exam_id uuid,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_version integer;
  v_total_count bigint;
  v_rows jsonb;
  v_offset integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_page < 1 OR p_page_size < 1 OR p_page_size > 100 THEN
    RAISE EXCEPTION 'INVALID_PAGE';
  END IF;

  SELECT exam.results_version INTO v_version
  FROM public.exams AS exam
  WHERE exam.id = p_exam_id
    AND exam.results_published = true
    AND public.can_access_exam_audience(exam.id, v_user_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'EXAM_NOT_FOUND'; END IF;

  SELECT count(*) INTO v_total_count
  FROM public.exam_results AS result
  WHERE result.exam_id = p_exam_id
    AND public.can_access_exam_audience_internal(p_exam_id, result.user_id);
  v_offset := (p_page - 1) * p_page_size;
  IF (v_total_count = 0 AND p_page > 1)
    OR (v_total_count > 0 AND v_offset >= v_total_count)
  THEN
    RAISE EXCEPTION 'INVALID_PAGE';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(page_row)), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      result.user_id,
      profile.name AS student_name,
      profile.institute,
      result.total_score,
      result.max_score,
      result.rank,
      CASE
        WHEN result.max_score > 0
        THEN round(result.total_score * 100 / result.max_score, 2)
        ELSE 0
      END AS percentage
    FROM public.exam_results AS result
    JOIN public.profiles AS profile ON profile.id = result.user_id
    WHERE result.exam_id = p_exam_id
      AND public.can_access_exam_audience_internal(p_exam_id, result.user_id)
    ORDER BY result.rank, profile.name, result.user_id
    LIMIT p_page_size
    OFFSET v_offset
  ) AS page_row;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'total_count', v_total_count,
    'results_version', v_version
  );
END;
$$;

-- Compatibility wrapper for older clients. New clients use the JSON page RPC
-- because it retains count/version metadata even when the row page is empty.
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
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_page jsonb;
BEGIN
  v_page := public.get_published_leaderboard_page(p_exam_id, p_page, p_page_size);
  RETURN QUERY
  SELECT
    row_data.user_id,
    row_data.student_name,
    row_data.institute,
    row_data.total_score,
    row_data.max_score,
    row_data.rank,
    (v_page ->> 'total_count')::bigint,
    (v_page ->> 'results_version')::integer
  FROM jsonb_to_recordset(v_page -> 'rows') AS row_data(
    user_id uuid,
    student_name text,
    institute text,
    total_score numeric,
    max_score integer,
    rank integer,
    percentage numeric
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_published_leaderboard_page(uuid, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_published_leaderboard_page(uuid, integer, integer)
  TO authenticated;
REVOKE ALL ON FUNCTION public.get_published_leaderboard(uuid, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_published_leaderboard(uuid, integer, integer)
  TO authenticated;
