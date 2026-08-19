-- Bind OCR spending to real question attempts and cache successful results by
-- image hash. Abuse throttling is intentionally user-level rather than a rigid
-- per-answer cap so legitimate retries of unclear handwriting remain possible.

CREATE TABLE public.ocr_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  context_key text NOT NULL,
  question_id uuid REFERENCES public.questions(id) ON DELETE CASCADE,
  attempt_id uuid REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  exam_question_id uuid REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  image_sha256 text NOT NULL,
  request_token uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  extracted_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ocr_requests_context_shape CHECK (
    (question_id IS NOT NULL AND attempt_id IS NULL AND exam_question_id IS NULL)
    OR
    (question_id IS NULL AND attempt_id IS NOT NULL AND exam_question_id IS NOT NULL)
  ),
  CONSTRAINT ocr_requests_hash_shape CHECK (image_sha256 ~ '^[0-9a-f]{64}$'),
  UNIQUE(user_id, context_key, image_sha256)
);

CREATE INDEX ocr_requests_user_created
  ON public.ocr_requests(user_id, created_at DESC);
CREATE INDEX ocr_requests_context_status
  ON public.ocr_requests(user_id, context_key, status);

ALTER TABLE public.ocr_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own OCR requests" ON public.ocr_requests
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins manage OCR requests" ON public.ocr_requests
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.reserve_ocr_request(
  p_user_id uuid,
  p_context_key text,
  p_question_id uuid,
  p_attempt_id uuid,
  p_exam_question_id uuid,
  p_image_sha256 text,
  p_request_token uuid
)
RETURNS public.ocr_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.ocr_requests;
BEGIN
  IF p_image_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_IMAGE_HASH';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_context_key, 0));

  SELECT * INTO v_request
  FROM public.ocr_requests
  WHERE user_id = p_user_id
    AND context_key = p_context_key
    AND image_sha256 = p_image_sha256
  FOR UPDATE;

  IF FOUND AND v_request.status = 'succeeded' THEN
    RETURN v_request;
  END IF;
  IF FOUND AND v_request.status = 'pending'
    AND v_request.updated_at > now() - interval '2 minutes' THEN
    RETURN v_request;
  END IF;

  IF v_request.id IS NOT NULL THEN
    UPDATE public.ocr_requests
    SET request_token = p_request_token,
        status = 'pending',
        extracted_text = NULL,
        updated_at = now()
    WHERE id = v_request.id
    RETURNING * INTO v_request;
    RETURN v_request;
  END IF;

  INSERT INTO public.ocr_requests(
    user_id, context_key, question_id, attempt_id, exam_question_id,
    image_sha256, request_token
  ) VALUES (
    p_user_id, p_context_key, p_question_id, p_attempt_id, p_exam_question_id,
    p_image_sha256, p_request_token
  )
  RETURNING * INTO v_request;
  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_ocr_request(
  p_request_id uuid,
  p_user_id uuid,
  p_request_token uuid,
  p_success boolean,
  p_extracted_text text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ocr_requests
  SET status = CASE WHEN p_success THEN 'succeeded' ELSE 'failed' END,
      extracted_text = CASE WHEN p_success THEN p_extracted_text ELSE NULL END,
      updated_at = now()
  WHERE id = p_request_id
    AND user_id = p_user_id
    AND request_token = p_request_token
    AND status = 'pending';
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ocr_request(uuid, text, uuid, uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_ocr_request(uuid, uuid, uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ocr_request(uuid, text, uuid, uuid, uuid, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_ocr_request(uuid, uuid, uuid, boolean, text)
  TO service_role;
