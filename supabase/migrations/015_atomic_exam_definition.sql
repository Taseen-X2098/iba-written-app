CREATE OR REPLACE FUNCTION public.create_exam_definition(
  p_created_by uuid,
  p_title text,
  p_description text,
  p_time_limit_minutes integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_is_published boolean,
  p_questions jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam_id uuid;
  v_question jsonb;
BEGIN
  IF p_ends_at <= p_starts_at OR p_time_limit_minutes < 1 THEN RAISE EXCEPTION 'INVALID_EXAM_TIME'; END IF;
  IF jsonb_array_length(p_questions) = 0 THEN RAISE EXCEPTION 'QUESTIONS_REQUIRED'; END IF;
  INSERT INTO exams(title, description, time_limit_minutes, starts_at, ends_at, is_published, created_by)
  VALUES (p_title, p_description, p_time_limit_minutes, p_starts_at, p_ends_at, p_is_published, p_created_by)
  RETURNING id INTO v_exam_id;
  FOR v_question IN SELECT * FROM jsonb_array_elements(p_questions) LOOP
    INSERT INTO exam_questions(exam_id, question_id, order_index, marks)
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

CREATE OR REPLACE FUNCTION public.update_exam_definition(
  p_exam_id uuid,
  p_title text,
  p_description text,
  p_time_limit_minutes integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_is_published boolean,
  p_questions jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_question jsonb;
BEGIN
  PERFORM 1 FROM exams WHERE id = p_exam_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EXAM_NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM exam_attempts WHERE exam_id = p_exam_id AND mode = 'official') THEN
    RAISE EXCEPTION 'EXAM_ALREADY_STARTED';
  END IF;
  IF p_ends_at <= p_starts_at OR p_time_limit_minutes < 1 THEN RAISE EXCEPTION 'INVALID_EXAM_TIME'; END IF;
  IF jsonb_array_length(p_questions) = 0 THEN RAISE EXCEPTION 'QUESTIONS_REQUIRED'; END IF;
  UPDATE exams SET
    title = p_title,
    description = p_description,
    time_limit_minutes = p_time_limit_minutes,
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    is_published = p_is_published,
    updated_at = now()
  WHERE id = p_exam_id;
  DELETE FROM exam_questions WHERE exam_id = p_exam_id;
  FOR v_question IN SELECT * FROM jsonb_array_elements(p_questions) LOOP
    INSERT INTO exam_questions(exam_id, question_id, order_index, marks)
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

REVOKE ALL ON FUNCTION public.create_exam_definition(uuid, text, text, integer, timestamptz, timestamptz, boolean, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_exam_definition(uuid, text, text, integer, timestamptz, timestamptz, boolean, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_exam_definition(uuid, text, text, integer, timestamptz, timestamptz, boolean, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_exam_definition(uuid, text, text, integer, timestamptz, timestamptz, boolean, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.extend_exam_deadline(p_exam_id uuid, p_extra_minutes integer)
RETURNS TABLE(time_limit_minutes integer, ends_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam exams;
BEGIN
  IF p_extra_minutes < 1 OR p_extra_minutes > 180 THEN RAISE EXCEPTION 'INVALID_EXTENSION'; END IF;
  SELECT * INTO v_exam FROM exams WHERE id = p_exam_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EXAM_NOT_FOUND'; END IF;
  UPDATE exams
  SET time_limit_minutes = exams.time_limit_minutes + p_extra_minutes,
      ends_at = exams.ends_at + make_interval(mins => p_extra_minutes),
      updated_at = now()
  WHERE id = p_exam_id
  RETURNING exams.time_limit_minutes, exams.ends_at INTO time_limit_minutes, ends_at;
  UPDATE exam_attempts
  SET expires_at = least(exam_attempts.expires_at + make_interval(mins => p_extra_minutes), ends_at),
      updated_at = now()
  WHERE exam_id = p_exam_id AND mode = 'official' AND status = 'active';
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.extend_exam_deadline(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_exam_deadline(uuid, integer) TO service_role;
