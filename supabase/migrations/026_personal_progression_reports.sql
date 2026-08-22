-- Type-scoped learner summaries and subscription-only progression reports.
-- This migration is intentionally additive: existing learner-profile data and
-- grading results remain readable while new writes use the v2 RPC below.

CREATE TABLE student_category_profiles (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  submission_type text NOT NULL CHECK (char_length(submission_type) BETWEEN 1 AND 80),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 4000),
  total_graded integer NOT NULL DEFAULT 0 CHECK (total_graded >= 0),
  latest_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(latest_snapshot) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, submission_type)
);

CREATE TABLE student_progression_deltas (
  update_id uuid PRIMARY KEY REFERENCES student_profile_updates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  submission_type text NOT NULL CHECK (char_length(submission_type) BETWEEN 1 AND 80),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE student_progression_report_jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  submission_type text NOT NULL CHECK (char_length(submission_type) BETWEEN 1 AND 80),
  checkpoint integer NOT NULL CHECK (checkpoint > 0),
  source_update_ids uuid[] NOT NULL CHECK (cardinality(source_update_ids) = 3),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  claimed_by text,
  claimed_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text CHECK (char_length(last_error) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (user_id, submission_type, checkpoint)
);

CREATE TABLE student_progression_reports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  submission_type text NOT NULL CHECK (char_length(submission_type) BETWEEN 1 AND 80),
  checkpoint integer NOT NULL CHECK (checkpoint > 0),
  report_version integer NOT NULL DEFAULT 1 CHECK (report_version > 0),
  report jsonb NOT NULL CHECK (jsonb_typeof(report) = 'object'),
  source_update_ids uuid[] NOT NULL CHECK (cardinality(source_update_ids) = 3),
  input_hash text NOT NULL CHECK (char_length(input_hash) BETWEEN 32 AND 128),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 120),
  prompt_version text NOT NULL CHECK (char_length(prompt_version) BETWEEN 1 AND 80),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, submission_type, checkpoint, report_version)
);

CREATE INDEX student_category_profiles_user_updated
  ON student_category_profiles(user_id, updated_at DESC);
CREATE INDEX student_progression_deltas_user_type_date
  ON student_progression_deltas(user_id, submission_type, created_at DESC);
CREATE INDEX student_progression_report_jobs_claim
  ON student_progression_report_jobs(status, next_attempt_at, created_at);
CREATE INDEX student_progression_reports_user_type_checkpoint
  ON student_progression_reports(user_id, submission_type, checkpoint DESC);

ALTER TABLE student_category_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_progression_deltas ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_progression_report_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_progression_reports ENABLE ROW LEVEL SECURITY;

-- Premium report material is served only through the server-side access
-- layer. Authenticated clients receive no direct table policy, which also
-- keeps internal checkpoints and generation cadence out of browser queries.
-- Service-role workers bypass RLS and the server re-checks live entitlement.
CREATE POLICY "Admins manage category profiles" ON student_category_profiles
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins view progression deltas" ON student_progression_deltas
  FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins manage progression deltas" ON student_progression_deltas
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage progression report jobs" ON student_progression_report_jobs
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage progression reports" ON student_progression_reports
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Deterministic, zero-token backfill. It makes existing same-type history
-- available without generating reports for every historical checkpoint.
WITH ranked AS (
  SELECT
    u.user_id,
    u.category,
    u.personalized_summary,
    u.updated_at,
    row_number() OVER (
      PARTITION BY u.user_id, u.category
      ORDER BY u.updated_at DESC, u.id DESC
    ) AS latest_rank,
    count(*) OVER (PARTITION BY u.user_id, u.category)::integer AS total_graded
  FROM student_profile_updates u
)
INSERT INTO student_category_profiles(
  user_id, submission_type, summary, total_graded, updated_at
)
SELECT
  user_id,
  category,
  '',
  total_graded,
  updated_at
FROM ranked
WHERE latest_rank = 1
ON CONFLICT (user_id, submission_type) DO NOTHING;

CREATE OR REPLACE FUNCTION public.record_student_learning_profile_update_v2(
  p_user_id uuid,
  p_source_kind text,
  p_source_id uuid,
  p_submission_type text,
  p_final_score numeric,
  p_max_score numeric,
  p_personalized_summary text,
  p_profile_summary text,
  p_progression_snapshot jsonb,
  p_observations jsonb
)
RETURNS TABLE(update_id uuid, total_graded integer, report_enqueued boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_update_id uuid;
  v_total_graded integer;
  v_checkpoint integer;
  v_source_update_ids uuid[];
  v_enqueued boolean := false;
  v_affected integer := 0;
BEGIN
  IF p_source_kind NOT IN ('standalone', 'practice_exam', 'official_exam')
    OR p_submission_type IS NULL
    OR char_length(p_submission_type) NOT BETWEEN 1 AND 80
    OR p_max_score IS NULL OR p_max_score <= 0
    OR p_final_score IS NULL OR p_final_score < 0 OR p_final_score > p_max_score
    OR char_length(coalesce(p_personalized_summary, '')) > 4000
    OR char_length(coalesce(p_profile_summary, '')) > 4000
    OR jsonb_typeof(coalesce(p_progression_snapshot, '{}'::jsonb)) <> 'object'
    OR jsonb_typeof(coalesce(p_observations, '[]'::jsonb)) <> 'array'
  THEN
    RAISE EXCEPTION 'INVALID_LEARNER_PROFILE_UPDATE';
  END IF;

  -- Serialize only this student's submission-type stream. This makes the
  -- count/checkpoint decision deterministic under concurrent grades.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_submission_type, 0)
  );

  INSERT INTO student_profile_updates(
    user_id, source_kind, source_id, category, final_score, max_score,
    personalized_summary
  ) VALUES (
    p_user_id, p_source_kind, p_source_id, p_submission_type,
    p_final_score, p_max_score, coalesce(p_personalized_summary, '')
  )
  ON CONFLICT (source_kind, source_id) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      category = EXCLUDED.category,
      final_score = EXCLUDED.final_score,
      max_score = EXCLUDED.max_score,
      personalized_summary = EXCLUDED.personalized_summary,
      updated_at = now()
  RETURNING id INTO v_update_id;

  DELETE FROM student_learning_events e WHERE e.update_id = v_update_id;

  INSERT INTO student_learning_events(
    update_id, user_id, category, skill_key, signal, severity,
    confidence, observed_level, description, evidence
  )
  SELECT
    v_update_id,
    p_user_id,
    p_submission_type,
    observation->>'skillKey',
    observation->>'signal',
    greatest(1, least(3, coalesce((observation->>'severity')::integer, 1))),
    greatest(0, least(1, coalesce((observation->>'confidence')::numeric, 0.5))),
    CASE observation->>'signal'
      WHEN 'strength' THEN 0.45 + 0.15 * greatest(1, least(3, coalesce((observation->>'severity')::integer, 1)))
      ELSE 0.55 - 0.15 * greatest(1, least(3, coalesce((observation->>'severity')::integer, 1)))
    END,
    left(observation->>'description', 1000),
    nullif(left(coalesce(observation->>'evidence', ''), 2000), '')
  FROM jsonb_array_elements(coalesce(p_observations, '[]'::jsonb)) observation
  WHERE observation->>'skillKey' IN (
    'grammar_accuracy', 'sentence_clarity', 'vocabulary_precision',
    'task_fulfilment', 'thesis_clarity', 'paragraph_coherence',
    'argument_depth', 'evidence_integration', 'creativity',
    'style_and_tone', 'overall_effectiveness'
  )
    AND observation->>'signal' IN ('strength', 'weakness')
    AND char_length(coalesce(observation->>'description', '')) > 0
  ON CONFLICT ON CONSTRAINT student_learning_events_update_id_skill_key_key
    DO NOTHING;

  -- Rebuild only this type's compact state. Different writing types can be
  -- recorded concurrently without deleting or replacing one another.
  DELETE FROM student_skill_state
  WHERE user_id = p_user_id AND category = p_submission_type;
  WITH ranked AS (
    SELECT e.*,
      row_number() OVER (
        PARTITION BY e.category, e.skill_key
        ORDER BY e.created_at DESC, e.id DESC
      ) AS observation_rank
    FROM student_learning_events e
    WHERE e.user_id = p_user_id AND e.category = p_submission_type
  ), aggregated AS (
    SELECT
      category,
      skill_key,
      sum(observed_level * confidence) / nullif(sum(confidence), 0) AS estimated_level,
      least(1::numeric, sum(confidence) / 3) AS state_confidence,
      count(*)::integer AS evidence_count,
      max(created_at) AS last_observed_at,
      avg(observed_level) FILTER (WHERE observation_rank <= 3) AS latest_level,
      avg(observed_level) FILTER (WHERE observation_rank BETWEEN 4 AND 6) AS prior_level
    FROM ranked
    GROUP BY category, skill_key
  )
  INSERT INTO student_skill_state(
    user_id, category, skill_key, estimated_level, confidence,
    evidence_count, trend, last_observed_at
  )
  SELECT
    p_user_id,
    category,
    skill_key,
    greatest(0, least(1, estimated_level)),
    greatest(0, least(1, state_confidence)),
    evidence_count,
    CASE
      WHEN prior_level IS NULL THEN 'stable'
      WHEN latest_level - prior_level > 0.05 THEN 'improving'
      WHEN latest_level - prior_level < -0.05 THEN 'declining'
      ELSE 'stable'
    END,
    last_observed_at
  FROM aggregated;

  SELECT count(*)::integer INTO v_total_graded
  FROM student_profile_updates u
  WHERE u.user_id = p_user_id AND u.category = p_submission_type;

  INSERT INTO student_category_profiles(
    user_id, submission_type, summary, total_graded, latest_snapshot, updated_at
  ) VALUES (
    p_user_id,
    p_submission_type,
    coalesce(p_profile_summary, ''),
    v_total_graded,
    coalesce(p_progression_snapshot, '{}'::jsonb),
    now()
  )
  ON CONFLICT (user_id, submission_type) DO UPDATE
  SET summary = EXCLUDED.summary,
      total_graded = EXCLUDED.total_graded,
      latest_snapshot = EXCLUDED.latest_snapshot,
      updated_at = now();

  INSERT INTO student_progression_deltas(
    update_id, user_id, submission_type, snapshot, created_at
  ) VALUES (
    v_update_id,
    p_user_id,
    p_submission_type,
    coalesce(p_progression_snapshot, '{}'::jsonb),
    now()
  )
  ON CONFLICT ON CONSTRAINT student_progression_deltas_pkey DO UPDATE
  SET user_id = EXCLUDED.user_id,
      submission_type = EXCLUDED.submission_type,
      snapshot = EXCLUDED.snapshot;

  -- Keep the legacy global row current for old readers, but new
  -- personalization never reads it because it is not type-scoped.
  INSERT INTO student_profile_summaries(user_id, summary, total_graded, updated_at)
  VALUES (
    p_user_id,
    coalesce(p_profile_summary, ''),
    (SELECT count(*)::integer FROM student_profile_updates WHERE user_id = p_user_id),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET summary = EXCLUDED.summary,
      total_graded = EXCLUDED.total_graded,
      updated_at = now();

  IF v_total_graded >= 3
    AND mod(v_total_graded, 3) = 0
    AND (
      EXISTS (
        SELECT 1 FROM subscriptions s
        WHERE s.user_id = p_user_id
          AND s.is_active = true
          AND s.expires_at > now()
      )
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = p_user_id AND p.is_admin = true
      )
    )
  THEN
    v_checkpoint := v_total_graded / 3;
    SELECT array_agg(recent.id ORDER BY recent.created_at, recent.id)
      INTO v_source_update_ids
    FROM (
      SELECT u.id, u.created_at
      FROM student_profile_updates u
      WHERE u.user_id = p_user_id AND u.category = p_submission_type
      ORDER BY u.created_at DESC, u.id DESC
      LIMIT 3
    ) recent;

    IF cardinality(v_source_update_ids) = 3 THEN
      INSERT INTO student_progression_report_jobs(
        user_id, submission_type, checkpoint, source_update_ids
      ) VALUES (
        p_user_id, p_submission_type, v_checkpoint, v_source_update_ids
      )
      ON CONFLICT (user_id, submission_type, checkpoint) DO NOTHING;
      GET DIAGNOSTICS v_affected = ROW_COUNT;
      v_enqueued := v_affected = 1;
    END IF;
  END IF;

  RETURN QUERY SELECT v_update_id, v_total_graded, v_enqueued;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_student_progression_report_jobs(
  p_worker_id text,
  p_limit integer DEFAULT 2
)
RETURNS SETOF student_progression_report_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE student_progression_report_jobs
  SET status = CASE WHEN attempt_count >= 3 THEN 'failed' ELSE 'queued' END,
      claimed_by = NULL,
      claimed_at = NULL,
      next_attempt_at = now(),
      last_error = 'Recovered stale worker claim',
      updated_at = now()
  WHERE status = 'running'
    AND claimed_at < now() - interval '5 minutes';

  RETURN QUERY
  WITH claimable AS (
    SELECT j.id
    FROM student_progression_report_jobs j
    WHERE j.status = 'queued'
      AND j.attempt_count < 3
      AND j.next_attempt_at <= now()
    ORDER BY j.created_at
    FOR UPDATE OF j SKIP LOCKED
    LIMIT greatest(1, least(p_limit, 10))
  )
  UPDATE student_progression_report_jobs j
  SET status = 'running',
      claimed_by = p_worker_id,
      claimed_at = now(),
      attempt_count = attempt_count + 1,
      updated_at = now()
  FROM claimable c
  WHERE j.id = c.id
  RETURNING j.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_student_progression_report_job(
  p_job_id uuid,
  p_report jsonb,
  p_input_hash text,
  p_model text,
  p_prompt_version text,
  p_input_tokens integer DEFAULT NULL,
  p_output_tokens integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job student_progression_report_jobs;
  v_report_id uuid;
BEGIN
  SELECT * INTO v_job
  FROM student_progression_report_jobs
  WHERE id = p_job_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROGRESSION_REPORT_JOB_NOT_FOUND'; END IF;
  IF jsonb_typeof(p_report) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PROGRESSION_REPORT';
  END IF;

  INSERT INTO student_progression_reports(
    user_id, submission_type, checkpoint, report, source_update_ids,
    input_hash, model, prompt_version, input_tokens, output_tokens
  ) VALUES (
    v_job.user_id, v_job.submission_type, v_job.checkpoint, p_report,
    v_job.source_update_ids, p_input_hash, p_model, p_prompt_version,
    p_input_tokens, p_output_tokens
  )
  ON CONFLICT (user_id, submission_type, checkpoint, report_version) DO NOTHING
  RETURNING id INTO v_report_id;

  IF v_report_id IS NULL THEN
    SELECT r.id INTO v_report_id
    FROM student_progression_reports r
    WHERE r.user_id = v_job.user_id
      AND r.submission_type = v_job.submission_type
      AND r.checkpoint = v_job.checkpoint
      AND r.report_version = 1;
  END IF;

  UPDATE student_progression_report_jobs
  SET status = 'completed',
      completed_at = now(),
      claimed_by = NULL,
      claimed_at = NULL,
      last_error = NULL,
      updated_at = now()
  WHERE id = p_job_id;

  RETURN v_report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_student_learning_profile_update_v2(
  uuid, text, uuid, text, numeric, numeric, text, text, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_student_progression_report_jobs(text, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_student_progression_report_job(
  uuid, jsonb, text, text, text, integer, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_student_learning_profile_update_v2(
  uuid, text, uuid, text, numeric, numeric, text, text, jsonb, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_student_progression_report_jobs(text, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_student_progression_report_job(
  uuid, jsonb, text, text, text, integer, integer
) TO service_role;
