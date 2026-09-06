-- Allow an administrator to publish a normal exam that every authenticated
-- student can take without an exam subscription. Existing exams remain paid.

ALTER TABLE public.exams
  ADD COLUMN is_free boolean NOT NULL DEFAULT false;

ALTER TABLE public.exams
  ADD CONSTRAINT exams_free_audience_consistent
  CHECK (NOT (is_free AND is_magnus_only));

-- Both access choices become immutable on first publication. This preserves
-- the audience that saw the announcement and prevents entitlement changes
-- after students have been invited to the exam.
CREATE OR REPLACE FUNCTION public.lock_exam_audience_after_publication()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.audience_locked_at IS NOT NULL
    AND (
      NEW.is_magnus_only IS DISTINCT FROM OLD.is_magnus_only
      OR NEW.is_free IS DISTINCT FROM OLD.is_free
    )
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

-- Add new overloads instead of replacing the deployed signatures. Older
-- application instances continue to create normal paid exams during a rolling
-- deployment, while the new signature persists the free flag atomically with
-- the exam definition and question mapping.
CREATE FUNCTION public.create_exam_definition(
  p_created_by uuid,
  p_title text,
  p_description text,
  p_time_limit_minutes integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_is_published boolean,
  p_is_magnus_only boolean,
  p_is_free boolean,
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
  IF p_is_free AND p_is_magnus_only THEN
    RAISE EXCEPTION 'INVALID_EXAM_AUDIENCE';
  END IF;
  IF jsonb_array_length(p_questions) = 0 THEN
    RAISE EXCEPTION 'QUESTIONS_REQUIRED';
  END IF;

  INSERT INTO public.exams(
    title, description, time_limit_minutes, starts_at, ends_at,
    is_published, is_magnus_only, is_free, created_by
  ) VALUES (
    p_title, p_description, p_time_limit_minutes, p_starts_at, p_ends_at,
    p_is_published, p_is_magnus_only, p_is_free, p_created_by
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
  p_is_free boolean,
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
    AND (
      p_is_magnus_only IS DISTINCT FROM v_exam.is_magnus_only
      OR p_is_free IS DISTINCT FROM v_exam.is_free
    )
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
  IF p_is_free AND p_is_magnus_only THEN
    RAISE EXCEPTION 'INVALID_EXAM_AUDIENCE';
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
    is_free = p_is_free,
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
  uuid, text, text, integer, timestamptz, timestamptz, boolean, boolean, boolean, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_exam_definition(
  uuid, text, text, integer, timestamptz, timestamptz, boolean, boolean, boolean, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_exam_definition(
  uuid, text, text, integer, timestamptz, timestamptz, boolean, boolean, boolean, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_exam_definition(
  uuid, text, text, integer, timestamptz, timestamptz, boolean, boolean, boolean, jsonb
) TO service_role;
