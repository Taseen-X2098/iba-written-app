-- Normalization policy v2:
--   * questions worth 5 or 6 marks keep the model score;
--   * questions worth more than 6 marks receive the 90% AI calibration;
--   * every final mark is floored to the nearest 0.5.
--
-- Versioned results have already been normalized by an application release or
-- an earlier database policy. Preserve them exactly so a rolling deployment
-- cannot calibrate a score twice. Historical v1 results are intentionally not
-- relabeled or approximated because their pre-calibration model totals were not
-- retained.

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
  v_score text;
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
  v_score := (
    CASE
      WHEN v_normalized = trunc(v_normalized) THEN trunc(v_normalized)::text
      ELSE v_normalized::numeric(20, 1)::text
    END
  ) || '/' || (
    CASE
      WHEN v_max = trunc(v_max) THEN trunc(v_max)::text
      ELSE v_max::numeric(20, 1)::text
    END
  );
  v_result := jsonb_set(
    jsonb_set(p_result, '{internal,total}', to_jsonb(v_normalized), true),
    '{studentFeedback,score}',
    to_jsonb(v_score),
    true
  );
  RETURN jsonb_set(
    v_result,
    '{internal,normalizationVersion}',
    '2'::jsonb,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_grading_result_half_down()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_maximum numeric;
  v_factor numeric;
BEGIN
  IF TG_TABLE_NAME = 'grading_job_items' THEN
    v_result := NEW.result;
  ELSE
    v_result := NEW.grading_result;
  END IF;

  -- Both policy versions represent already-final marks. This is especially
  -- important while old and new application instances overlap during deploy.
  IF v_result #>> '{internal,normalizationVersion}' IN ('1', '2') THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_maximum := (v_result #>> '{internal,max}')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_maximum := NULL;
  END;

  IF TG_TABLE_NAME = 'grading_job_items' THEN
    v_factor := CASE WHEN v_maximum <= 6 THEN 1 ELSE 0.90 END;
  ELSIF NEW.graded_by = 'ai' THEN
    v_factor := CASE WHEN v_maximum <= 6 THEN 1 ELSE 0.90 END;
  ELSE
    v_factor := 1;
  END IF;

  IF TG_TABLE_NAME = 'grading_job_items' THEN
    NEW.result := public.normalize_grading_result_half_down(NEW.result, v_factor);
  ELSE
    NEW.grading_result := public.normalize_grading_result_half_down(NEW.grading_result, v_factor);
  END IF;
  RETURN NEW;
END;
$$;

-- Recreate the triggers explicitly so a schema restored from an intermediate
-- migration state still gets the complete v2 persistence policy.
DROP TRIGGER IF EXISTS submissions_half_down_grade ON submissions;
CREATE TRIGGER submissions_half_down_grade
  BEFORE INSERT OR UPDATE OF grading_result ON submissions
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_grading_result_half_down();

DROP TRIGGER IF EXISTS exam_submissions_half_down_grade ON exam_submissions;
CREATE TRIGGER exam_submissions_half_down_grade
  BEFORE INSERT OR UPDATE OF grading_result ON exam_submissions
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_grading_result_half_down();

DROP TRIGGER IF EXISTS grading_job_items_half_down_grade ON grading_job_items;
CREATE TRIGGER grading_job_items_half_down_grade
  BEFORE INSERT OR UPDATE OF result ON grading_job_items
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_grading_result_half_down();
