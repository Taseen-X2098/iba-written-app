-- Structured, evidence-backed learner profiles and mark normalization.

CREATE TABLE student_profile_updates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_kind text NOT NULL CHECK (source_kind IN ('standalone', 'practice_exam', 'official_exam')),
  source_id uuid NOT NULL,
  category text NOT NULL CHECK (char_length(category) BETWEEN 1 AND 80),
  final_score numeric NOT NULL CHECK (final_score >= 0 AND final_score <= max_score),
  max_score numeric NOT NULL CHECK (max_score > 0),
  personalized_summary text NOT NULL CHECK (char_length(personalized_summary) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_kind, source_id)
);

CREATE TABLE student_learning_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  update_id uuid NOT NULL REFERENCES student_profile_updates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (char_length(category) BETWEEN 1 AND 80),
  skill_key text NOT NULL CHECK (skill_key IN (
    'grammar_accuracy', 'sentence_clarity', 'vocabulary_precision',
    'task_fulfilment', 'thesis_clarity', 'paragraph_coherence',
    'argument_depth', 'evidence_integration', 'creativity',
    'style_and_tone', 'overall_effectiveness'
  )),
  signal text NOT NULL CHECK (signal IN ('strength', 'weakness')),
  severity smallint NOT NULL CHECK (severity BETWEEN 1 AND 3),
  confidence numeric NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  observed_level numeric NOT NULL CHECK (observed_level BETWEEN 0 AND 1),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 1000),
  evidence text CHECK (char_length(evidence) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(update_id, skill_key)
);

CREATE TABLE student_skill_state (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (char_length(category) BETWEEN 1 AND 80),
  skill_key text NOT NULL CHECK (skill_key IN (
    'grammar_accuracy', 'sentence_clarity', 'vocabulary_precision',
    'task_fulfilment', 'thesis_clarity', 'paragraph_coherence',
    'argument_depth', 'evidence_integration', 'creativity',
    'style_and_tone', 'overall_effectiveness'
  )),
  estimated_level numeric NOT NULL CHECK (estimated_level BETWEEN 0 AND 1),
  confidence numeric NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence_count integer NOT NULL CHECK (evidence_count > 0),
  trend text NOT NULL CHECK (trend IN ('improving', 'stable', 'declining')),
  last_observed_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, category, skill_key)
);

CREATE TABLE student_profile_summaries (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  summary text NOT NULL CHECK (char_length(summary) <= 4000),
  total_graded integer NOT NULL DEFAULT 0 CHECK (total_graded >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX student_profile_updates_user_date
  ON student_profile_updates(user_id, created_at DESC);
CREATE INDEX student_learning_events_user_category_date
  ON student_learning_events(user_id, category, created_at DESC);

ALTER TABLE student_profile_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_learning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_skill_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profile_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own profile updates" ON student_profile_updates
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins manage profile updates" ON student_profile_updates
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Users view own learning events" ON student_learning_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins manage learning events" ON student_learning_events
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Users view own skill state" ON student_skill_state
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins manage skill state" ON student_skill_state
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Users view own profile summary" ON student_profile_summaries
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins manage profile summaries" ON student_profile_summaries
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.record_student_learning_profile_update(
  p_user_id uuid,
  p_source_kind text,
  p_source_id uuid,
  p_category text,
  p_final_score numeric,
  p_max_score numeric,
  p_personalized_summary text,
  p_profile_summary text,
  p_observations jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_update_id uuid;
BEGIN
  IF p_source_kind NOT IN ('standalone', 'practice_exam', 'official_exam')
    OR p_category IS NULL OR char_length(p_category) NOT BETWEEN 1 AND 80
    OR p_max_score IS NULL OR p_max_score <= 0
    OR p_final_score IS NULL OR p_final_score < 0 OR p_final_score > p_max_score
    OR char_length(coalesce(p_personalized_summary, '')) > 4000
    OR char_length(coalesce(p_profile_summary, '')) > 4000
    OR jsonb_typeof(coalesce(p_observations, '[]'::jsonb)) <> 'array'
  THEN
    RAISE EXCEPTION 'INVALID_LEARNER_PROFILE_UPDATE';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  INSERT INTO student_profile_updates(
    user_id, source_kind, source_id, category, final_score, max_score,
    personalized_summary
  ) VALUES (
    p_user_id, p_source_kind, p_source_id, p_category, p_final_score,
    p_max_score, coalesce(p_personalized_summary, '')
  )
  ON CONFLICT (source_kind, source_id) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      category = EXCLUDED.category,
      final_score = EXCLUDED.final_score,
      max_score = EXCLUDED.max_score,
      personalized_summary = EXCLUDED.personalized_summary,
      updated_at = now()
  RETURNING id INTO v_update_id;

  DELETE FROM student_learning_events WHERE update_id = v_update_id;

  INSERT INTO student_learning_events(
    update_id, user_id, category, skill_key, signal, severity,
    confidence, observed_level, description, evidence
  )
  SELECT
    v_update_id,
    p_user_id,
    p_category,
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
  ON CONFLICT (update_id, skill_key) DO NOTHING;

  -- Rebuild the compact state from evidence so regrades remove stale signals.
  DELETE FROM student_skill_state WHERE user_id = p_user_id;
  WITH ranked AS (
    SELECT e.*,
      row_number() OVER (
        PARTITION BY e.category, e.skill_key
        ORDER BY e.created_at DESC, e.id DESC
      ) AS observation_rank
    FROM student_learning_events e
    WHERE e.user_id = p_user_id
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

  RETURN v_update_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_student_learning_profile_update(
  uuid, text, uuid, text, numeric, numeric, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_student_learning_profile_update(
  uuid, text, uuid, text, numeric, numeric, text, text, jsonb
) TO service_role;

-- Keep every persisted final mark on a 0.5 boundary. Version each normalized
-- result so the AI factor cannot be applied twice by a migration rerun or by a
-- database trigger receiving an already-normalized application result.
CREATE OR REPLACE FUNCTION public.normalize_grading_result_half_down(
  p_result jsonb,
  p_factor numeric DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_total numeric;
  v_max numeric;
  v_normalized numeric;
  v_result jsonb;
BEGIN
  IF p_result IS NULL THEN RETURN NULL; END IF;
  BEGIN
    v_total := (p_result #>> '{internal,total}')::numeric;
    v_max := (p_result #>> '{internal,max}')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN p_result;
  END;
  IF v_total IS NULL OR v_max IS NULL OR v_max <= 0 THEN RETURN p_result; END IF;
  v_normalized := floor(greatest(0, least(v_max, v_total * p_factor)) * 2) / 2;
  v_result := jsonb_set(
    jsonb_set(p_result, '{internal,total}', to_jsonb(v_normalized), true),
    '{studentFeedback,score}',
    to_jsonb(v_normalized::text || '/' || v_max::text),
    true
  );
  RETURN jsonb_set(
    v_result,
    '{internal,normalizationVersion}',
    '1'::jsonb,
    true
  );
END;
$$;

UPDATE submissions
SET grading_result = public.normalize_grading_result_half_down(
  grading_result,
  CASE WHEN graded_by = 'ai' THEN 0.85 ELSE 1 END
)
WHERE grading_result #>> '{internal,normalizationVersion}' IS DISTINCT FROM '1';

UPDATE exam_submissions
SET grading_result = public.normalize_grading_result_half_down(
  grading_result,
  CASE WHEN graded_by = 'ai' THEN 0.85 ELSE 1 END
)
WHERE grading_result IS NOT NULL
  AND grading_result #>> '{internal,normalizationVersion}' IS DISTINCT FROM '1';

UPDATE grading_job_items
SET result = public.normalize_grading_result_half_down(result, 0.85)
WHERE result IS NOT NULL
  AND result #>> '{internal,normalizationVersion}' IS DISTINCT FROM '1';

-- Published totals must agree with the normalized answer records.
UPDATE exam_results r
SET total_score = totals.total_score
FROM (
  SELECT s.exam_id, s.user_id,
    sum(coalesce((s.grading_result #>> '{internal,total}')::numeric, 0)) AS total_score
  FROM exam_submissions s
  GROUP BY s.exam_id, s.user_id
) totals
WHERE r.exam_id = totals.exam_id AND r.user_id = totals.user_id;

WITH ranked AS (
  SELECT id, rank() OVER (PARTITION BY exam_id ORDER BY total_score DESC)::integer AS position
  FROM exam_results
)
UPDATE exam_results r SET rank = ranked.position
FROM ranked WHERE ranked.id = r.id;

CREATE OR REPLACE FUNCTION public.enforce_grading_result_half_down()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_factor numeric;
BEGIN
  IF TG_TABLE_NAME = 'grading_job_items' THEN
    v_factor := CASE
      WHEN NEW.result #>> '{internal,normalizationVersion}' = '1' THEN 1
      ELSE 0.85
    END;
    NEW.result := public.normalize_grading_result_half_down(NEW.result, v_factor);
  ELSE
    v_factor := CASE
      WHEN NEW.grading_result #>> '{internal,normalizationVersion}' = '1' THEN 1
      WHEN NEW.graded_by = 'ai' THEN 0.85
      ELSE 1
    END;
    NEW.grading_result := public.normalize_grading_result_half_down(NEW.grading_result, v_factor);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS submissions_half_down_grade ON submissions;
CREATE TRIGGER submissions_half_down_grade
  BEFORE INSERT OR UPDATE OF grading_result ON submissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_grading_result_half_down();
DROP TRIGGER IF EXISTS exam_submissions_half_down_grade ON exam_submissions;
CREATE TRIGGER exam_submissions_half_down_grade
  BEFORE INSERT OR UPDATE OF grading_result ON exam_submissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_grading_result_half_down();
DROP TRIGGER IF EXISTS grading_job_items_half_down_grade ON grading_job_items;
CREATE TRIGGER grading_job_items_half_down_grade
  BEFORE INSERT OR UPDATE OF result ON grading_job_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_grading_result_half_down();
