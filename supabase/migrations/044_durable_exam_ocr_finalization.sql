-- Coordinate last-second OCR with attempt finalization in Postgres. The OCR
-- request itself remains the processor; this is a durable lease/barrier, not a
-- second background worker.

CREATE TABLE public.exam_ocr_operations (
  id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  exam_question_id uuid NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  writer_token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed')),
  extracted_text text,
  started_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_ocr_operations_result_shape CHECK (
    (status = 'pending' AND completed_at IS NULL AND extracted_text IS NULL)
    OR (status = 'succeeded' AND completed_at IS NOT NULL AND extracted_text IS NOT NULL)
    OR (status = 'failed' AND completed_at IS NOT NULL AND extracted_text IS NULL)
  )
);

CREATE INDEX exam_ocr_operations_attempt_status
  ON public.exam_ocr_operations(attempt_id, status, lease_expires_at);
CREATE INDEX exam_ocr_operations_latest_answer
  ON public.exam_ocr_operations(attempt_id, exam_question_id, completed_at DESC)
  WHERE status = 'succeeded';

ALTER TABLE public.exam_ocr_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.exam_ocr_operations FROM PUBLIC, anon, authenticated;

-- Lock the attempt row before registering the operation. Finalization takes the
-- same row lock, so either it sees this pending scan or the scan is rejected
-- because the attempt was already finalized.
CREATE OR REPLACE FUNCTION public.begin_exam_ocr_operation(
  p_operation_id uuid,
  p_attempt_id uuid,
  p_exam_question_id uuid,
  p_user_id uuid,
  p_writer_token_hash text
)
RETURNS public.exam_ocr_operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.exam_attempts;
  v_operation public.exam_ocr_operations;
  v_category text;
BEGIN
  SELECT * INTO v_attempt
  FROM public.exam_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND OR v_attempt.user_id <> p_user_id THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_ACTIVE';
  END IF;
  IF v_attempt.writer_token_hash <> p_writer_token_hash THEN
    RAISE EXCEPTION 'WRITER_REVOKED';
  END IF;
  IF v_attempt.status <> 'active' THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_ACTIVE';
  END IF;
  -- The existing three-minute network grace lets a request selected at the
  -- deadline finish authentication and upload without permitting a stale tab
  -- to write indefinitely.
  IF now() > v_attempt.expires_at + interval '3 minutes' THEN
    RAISE EXCEPTION 'ATTEMPT_EXPIRED';
  END IF;

  SELECT q.category::text INTO v_category
  FROM public.exam_questions AS eq
  JOIN public.questions AS q ON q.id = eq.question_id
  WHERE eq.id = p_exam_question_id
    AND eq.exam_id = v_attempt.exam_id;

  IF NOT FOUND OR v_category = 'translation' THEN
    RAISE EXCEPTION 'INVALID_OCR_QUESTION';
  END IF;

  INSERT INTO public.exam_ocr_operations(
    id,
    attempt_id,
    exam_question_id,
    user_id,
    writer_token_hash,
    lease_expires_at
  ) VALUES (
    p_operation_id,
    v_attempt.id,
    p_exam_question_id,
    p_user_id,
    p_writer_token_hash,
    now() + interval '10 minutes'
  )
  RETURNING * INTO v_operation;

  RETURN v_operation;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_exam_ocr_operation(
  p_operation_id uuid,
  p_user_id uuid,
  p_success boolean,
  p_extracted_text text DEFAULT NULL
)
RETURNS public.exam_ocr_operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation public.exam_ocr_operations;
  v_attempt public.exam_attempts;
  v_attempt_id uuid;
BEGIN
  SELECT attempt_id INTO v_attempt_id
  FROM public.exam_ocr_operations
  WHERE id = p_operation_id
    AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OCR_OPERATION_NOT_ACTIVE';
  END IF;

  SELECT * INTO v_attempt
  FROM public.exam_attempts
  WHERE id = v_attempt_id
  FOR UPDATE;

  SELECT * INTO v_operation
  FROM public.exam_ocr_operations
  WHERE id = p_operation_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_operation.status <> 'pending' THEN
    RAISE EXCEPTION 'OCR_OPERATION_NOT_ACTIVE';
  END IF;

  IF p_success AND (
    v_attempt.status <> 'active'
    OR v_attempt.writer_token_hash <> v_operation.writer_token_hash
  ) THEN
    RAISE EXCEPTION 'WRITER_REVOKED';
  END IF;
  IF p_success AND btrim(coalesce(p_extracted_text, '')) = '' THEN
    RAISE EXCEPTION 'EMPTY_OCR_RESULT';
  END IF;

  UPDATE public.exam_ocr_operations
  SET status = CASE WHEN p_success THEN 'succeeded' ELSE 'failed' END,
      extracted_text = CASE WHEN p_success THEN p_extracted_text ELSE NULL END,
      completed_at = now(),
      updated_at = now()
  WHERE id = v_operation.id
  RETURNING * INTO v_operation;

  RETURN v_operation;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_exam_ocr_operation(uuid, uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_exam_ocr_operation(uuid, uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_exam_ocr_operation(uuid, uuid, uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_exam_ocr_operation(uuid, uuid, boolean, text)
  TO service_role;

-- Finalization is still one transaction. It refuses to snapshot while any
-- live OCR lease exists and uses the latest completed OCR result if it is newer
-- than the latest acknowledged browser draft. This closes both the
-- check/finalize race and the OCR-response/draft-save race.
CREATE OR REPLACE FUNCTION public.finalize_exam_attempt(
  p_attempt_id uuid,
  p_user_id uuid,
  p_writer_token_hash text,
  p_drafts jsonb
)
RETURNS public.exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.exam_attempts;
BEGIN
  SELECT * INTO v_attempt
  FROM public.exam_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ATTEMPT_NOT_ACTIVE'; END IF;
  IF v_attempt.mode <> 'official' THEN RAISE EXCEPTION 'INVALID_ATTEMPT_MODE'; END IF;
  IF p_user_id IS NOT NULL AND v_attempt.user_id <> p_user_id THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_writer_token_hash IS NOT NULL AND v_attempt.writer_token_hash <> p_writer_token_hash THEN
    RAISE EXCEPTION 'WRITER_REVOKED';
  END IF;
  IF v_attempt.status = 'finalized' THEN RETURN v_attempt; END IF;
  IF v_attempt.status NOT IN ('active', 'locked') THEN RAISE EXCEPTION 'ATTEMPT_NOT_ACTIVE'; END IF;
  IF p_user_id IS NOT NULL AND now() > v_attempt.expires_at + interval '3 minutes' THEN
    RAISE EXCEPTION 'ATTEMPT_EXPIRED';
  END IF;

  UPDATE public.exam_ocr_operations
  SET status = 'failed', completed_at = now(), updated_at = now()
  WHERE attempt_id = v_attempt.id
    AND status = 'pending'
    AND lease_expires_at <= now();

  IF EXISTS (
    SELECT 1
    FROM public.exam_ocr_operations
    WHERE attempt_id = v_attempt.id
      AND status = 'pending'
      AND lease_expires_at > now()
  ) THEN
    RAISE EXCEPTION 'OCR_PENDING';
  END IF;

  WITH resolved_answers AS (
    SELECT
      eq.id,
      eq.marks,
      q.category,
      CASE
        WHEN q.category = 'translation' THEN ''
        WHEN latest_ocr.completed_at IS NOT NULL
          AND (
            nullif(p_drafts -> eq.id::text ->> 'updatedAt', '') IS NULL
            OR latest_ocr.completed_at >= (p_drafts -> eq.id::text ->> 'updatedAt')::timestamptz
          )
          THEN latest_ocr.extracted_text
        ELSE coalesce(p_drafts -> eq.id::text ->> 'ocrText', '')
      END AS ocr_text,
      CASE
        WHEN q.category = 'translation' THEN ''
        WHEN latest_ocr.completed_at IS NOT NULL
          AND (
            nullif(p_drafts -> eq.id::text ->> 'updatedAt', '') IS NULL
            OR latest_ocr.completed_at >= (p_drafts -> eq.id::text ->> 'updatedAt')::timestamptz
          )
          THEN latest_ocr.extracted_text
        ELSE coalesce(p_drafts -> eq.id::text ->> 'editedText', '')
      END AS edited_text
    FROM public.exam_questions AS eq
    JOIN public.questions AS q ON q.id = eq.question_id
    LEFT JOIN LATERAL (
      SELECT operation.extracted_text, operation.completed_at
      FROM public.exam_ocr_operations AS operation
      WHERE operation.attempt_id = v_attempt.id
        AND operation.exam_question_id = eq.id
        AND operation.status = 'succeeded'
      ORDER BY operation.completed_at DESC, operation.id DESC
      LIMIT 1
    ) AS latest_ocr ON true
    WHERE eq.exam_id = v_attempt.exam_id
  )
  INSERT INTO public.exam_submissions(
    exam_id, user_id, question_id, attempt_id, ocr_text, edited_text,
    started_at, submitted_at, grading_result, graded_by
  )
  SELECT
    v_attempt.exam_id,
    v_attempt.user_id,
    answer.id,
    v_attempt.id,
    answer.ocr_text,
    answer.edited_text,
    v_attempt.started_at,
    now(),
    CASE
      WHEN answer.category = 'translation' THEN NULL
      WHEN btrim(answer.edited_text) = '' THEN
        jsonb_build_object(
          'internal', jsonb_build_object('total', 0, 'max', answer.marks, 'criteria', '[]'::jsonb),
          'studentFeedback', jsonb_build_object(
            'score', '0/' || answer.marks::text,
            'summary', 'No answer was submitted for this question.',
            'highlights', '[]'::jsonb
          )
        )
      ELSE NULL
    END,
    CASE
      WHEN answer.category = 'translation' THEN NULL
      WHEN btrim(answer.edited_text) = '' THEN 'admin'::public.graded_by_type
      ELSE NULL
    END
  FROM resolved_answers AS answer
  ON CONFLICT (attempt_id, question_id) WHERE attempt_id IS NOT NULL
  DO UPDATE SET
    ocr_text = EXCLUDED.ocr_text,
    edited_text = EXCLUDED.edited_text,
    submitted_at = EXCLUDED.submitted_at,
    grading_result = EXCLUDED.grading_result,
    graded_by = EXCLUDED.graded_by;

  UPDATE public.exam_attempts
  SET status = 'finalized',
      submitted_at = coalesce(submitted_at, now()),
      finalized_at = coalesce(finalized_at, now()),
      updated_at = now()
  WHERE id = v_attempt.id
  RETURNING * INTO v_attempt;

  RETURN v_attempt;
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_practice_attempt(
  p_attempt_id uuid,
  p_user_id uuid,
  p_writer_token_hash text
)
RETURNS public.exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.exam_attempts;
BEGIN
  SELECT * INTO v_attempt
  FROM public.exam_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND OR v_attempt.user_id <> p_user_id OR v_attempt.mode <> 'practice' THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_ACTIVE';
  END IF;
  IF v_attempt.writer_token_hash <> p_writer_token_hash THEN RAISE EXCEPTION 'WRITER_REVOKED'; END IF;

  UPDATE public.exam_ocr_operations
  SET status = 'failed', completed_at = now(), updated_at = now()
  WHERE attempt_id = v_attempt.id
    AND status = 'pending'
    AND lease_expires_at <= now();

  IF EXISTS (
    SELECT 1
    FROM public.exam_ocr_operations
    WHERE attempt_id = v_attempt.id
      AND status = 'pending'
      AND lease_expires_at > now()
  ) THEN
    RAISE EXCEPTION 'OCR_PENDING';
  END IF;

  IF v_attempt.status = 'active' THEN
    UPDATE public.exam_attempts
    SET status = 'awaiting_selection', submitted_at = now(), updated_at = now()
    WHERE id = p_attempt_id
    RETURNING * INTO v_attempt;
  ELSIF v_attempt.status NOT IN ('awaiting_selection', 'grading') THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_ACTIVE';
  END IF;

  RETURN v_attempt;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_exam_attempt(uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_practice_attempt(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_exam_attempt(uuid, uuid, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.lock_practice_attempt(uuid, uuid, text)
  TO service_role;
