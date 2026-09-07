-- Translation uploads share the durable OCR-operation barrier so attempt
-- finalization cannot overtake an upload that was accepted before the network
-- grace deadline. The actual row replacement and barrier completion occur in
-- one transaction under the attempt lock, preventing post-finalization image
-- mutation and cross-attempt/question relationships.

CREATE OR REPLACE FUNCTION public.begin_translation_image_operation(
  p_operation_id uuid,
  p_attempt_id uuid,
  p_exam_question_id uuid,
  p_user_id uuid,
  p_writer_token_hash text
)
RETURNS public.exam_ocr_operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
  IF now() > v_attempt.expires_at + interval '3 minutes' THEN
    RAISE EXCEPTION 'ATTEMPT_EXPIRED';
  END IF;

  SELECT question.category::text INTO v_category
  FROM public.exam_questions AS exam_question
  JOIN public.questions AS question ON question.id = exam_question.question_id
  WHERE exam_question.id = p_exam_question_id
    AND exam_question.exam_id = v_attempt.exam_id;
  IF NOT FOUND OR v_category <> 'translation' THEN
    RAISE EXCEPTION 'INVALID_TRANSLATION_QUESTION';
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

CREATE OR REPLACE FUNCTION public.replace_translation_answer_images(
  p_operation_id uuid,
  p_attempt_id uuid,
  p_exam_question_id uuid,
  p_user_id uuid,
  p_writer_token_hash text,
  p_rows jsonb
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.exam_attempts;
  v_operation public.exam_ocr_operations;
  v_old_paths text[];
  v_category text;
BEGIN
  SELECT * INTO v_attempt
  FROM public.exam_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;
  IF NOT FOUND OR v_attempt.user_id <> p_user_id OR v_attempt.status <> 'active' THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_ACTIVE';
  END IF;
  IF v_attempt.writer_token_hash <> p_writer_token_hash THEN
    RAISE EXCEPTION 'WRITER_REVOKED';
  END IF;

  SELECT * INTO v_operation
  FROM public.exam_ocr_operations
  WHERE id = p_operation_id
    AND attempt_id = p_attempt_id
    AND exam_question_id = p_exam_question_id
    AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_operation.status <> 'pending'
    OR v_operation.writer_token_hash <> p_writer_token_hash
    OR v_operation.lease_expires_at <= now()
  THEN
    RAISE EXCEPTION 'OCR_OPERATION_NOT_ACTIVE';
  END IF;

  SELECT question.category::text INTO v_category
  FROM public.exam_questions AS exam_question
  JOIN public.questions AS question ON question.id = exam_question.question_id
  WHERE exam_question.id = p_exam_question_id
    AND exam_question.exam_id = v_attempt.exam_id;
  IF NOT FOUND OR v_category <> 'translation' THEN
    RAISE EXCEPTION 'INVALID_TRANSLATION_QUESTION';
  END IF;

  IF jsonb_typeof(p_rows) <> 'array'
    OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 2
    OR EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(p_rows) AS image(page_index integer, storage_path text)
      WHERE image.page_index NOT BETWEEN 1 AND 2
        OR btrim(coalesce(image.storage_path, '')) = ''
    )
    OR (
      SELECT count(DISTINCT image.page_index)
      FROM jsonb_to_recordset(p_rows) AS image(page_index integer, storage_path text)
    ) <> jsonb_array_length(p_rows)
  THEN
    RAISE EXCEPTION 'INVALID_TRANSLATION_IMAGES';
  END IF;

  SELECT coalesce(array_agg(storage_path), ARRAY[]::text[])
  INTO v_old_paths
  FROM public.translation_answer_images
  WHERE attempt_id = p_attempt_id
    AND exam_question_id = p_exam_question_id;

  DELETE FROM public.translation_answer_images
  WHERE attempt_id = p_attempt_id
    AND exam_question_id = p_exam_question_id;

  INSERT INTO public.translation_answer_images(
    attempt_id,
    exam_question_id,
    user_id,
    page_index,
    storage_path
  )
  SELECT
    p_attempt_id,
    p_exam_question_id,
    p_user_id,
    image.page_index,
    image.storage_path
  FROM jsonb_to_recordset(p_rows) AS image(page_index smallint, storage_path text);

  UPDATE public.exam_ocr_operations
  SET status = 'succeeded',
      extracted_text = 'translation-image-uploaded',
      completed_at = now(),
      updated_at = now()
  WHERE id = v_operation.id;

  RETURN v_old_paths;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_translation_image_operation(uuid, uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_translation_answer_images(uuid, uuid, uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_translation_image_operation(uuid, uuid, uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_translation_answer_images(uuid, uuid, uuid, uuid, text, jsonb)
  TO service_role;
