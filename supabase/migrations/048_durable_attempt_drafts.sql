-- Store every acknowledged typed/OCR draft in Postgres as well as the resume
-- cache. Saves and finalization take the same attempt-row lock, so an accepted
-- save is either included in the final snapshot or rejected after finalization;
-- it can no longer land between a cache read and cache deletion.

CREATE TABLE public.exam_attempt_drafts (
  attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  exam_question_id uuid NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  ocr_text text NOT NULL DEFAULT '',
  edited_text text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, exam_question_id),
  CONSTRAINT exam_attempt_drafts_text_size CHECK (
    octet_length(ocr_text) <= 400000
    AND octet_length(edited_text) <= 400000
  )
);

ALTER TABLE public.exam_attempt_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.exam_attempt_drafts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_exam_attempt_drafts(
  p_attempt_id uuid,
  p_user_id uuid,
  p_writer_token_hash text,
  p_updates jsonb
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.exam_attempts;
  v_updated_at timestamptz := now();
  v_update_count integer;
  v_requested_count integer;
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
  IF v_attempt.mode = 'official'
    AND now() > v_attempt.expires_at + interval '3 minutes'
  THEN
    RAISE EXCEPTION 'ATTEMPT_EXPIRED';
  END IF;
  IF jsonb_typeof(p_updates) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_DRAFTS';
  END IF;
  SELECT count(*) INTO v_requested_count
  FROM jsonb_object_keys(p_updates);
  IF v_requested_count NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'INVALID_DRAFTS';
  END IF;

  SELECT count(*) INTO v_update_count
  FROM jsonb_each(p_updates) AS draft(key, value)
  JOIN public.exam_questions AS exam_question
    ON exam_question.id = draft.key::uuid
   AND exam_question.exam_id = v_attempt.exam_id;
  IF v_update_count <> v_requested_count THEN
    RAISE EXCEPTION 'INVALID_DRAFTS';
  END IF;

  INSERT INTO public.exam_attempt_drafts(
    attempt_id,
    exam_question_id,
    ocr_text,
    edited_text,
    updated_at
  )
  SELECT
    v_attempt.id,
    draft.key::uuid,
    coalesce(draft.value ->> 'ocrText', ''),
    coalesce(draft.value ->> 'editedText', ''),
    v_updated_at
  FROM jsonb_each(p_updates) AS draft(key, value)
  ON CONFLICT (attempt_id, exam_question_id)
  DO UPDATE SET
    ocr_text = EXCLUDED.ocr_text,
    edited_text = EXCLUDED.edited_text,
    updated_at = EXCLUDED.updated_at;

  RETURN v_updated_at;
END;
$$;

-- Take the attempt lock before resolving drafts. Durable rows override the
-- supplied cache snapshot, while the latter preserves in-flight attempts that
-- began before this migration was deployed.
CREATE OR REPLACE FUNCTION public.finalize_exam_attempt_durable(
  p_attempt_id uuid,
  p_user_id uuid,
  p_writer_token_hash text,
  p_cached_drafts jsonb
)
RETURNS public.exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.exam_attempts;
  v_durable_drafts jsonb;
BEGIN
  SELECT * INTO v_attempt
  FROM public.exam_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_ACTIVE';
  END IF;

  SELECT coalesce(
    jsonb_object_agg(
      draft.exam_question_id::text,
      jsonb_build_object(
        'ocrText', draft.ocr_text,
        'editedText', draft.edited_text,
        'updatedAt', draft.updated_at
      )
    ),
    '{}'::jsonb
  ) INTO v_durable_drafts
  FROM public.exam_attempt_drafts AS draft
  WHERE draft.attempt_id = p_attempt_id;

  RETURN public.finalize_exam_attempt(
    p_attempt_id,
    p_user_id,
    p_writer_token_hash,
    coalesce(p_cached_drafts, '{}'::jsonb) || v_durable_drafts
  );
END;
$$;

-- Recreate the expired-owner wrapper so it also consumes the locked durable
-- snapshot. Ownership and timer checks remain under this same transaction.
CREATE OR REPLACE FUNCTION public.finalize_expired_exam_attempt(
  p_attempt_id uuid,
  p_user_id uuid,
  p_drafts jsonb
)
RETURNS public.exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.exam_attempts;
BEGIN
  SELECT * INTO v_attempt
  FROM public.exam_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND OR p_user_id IS NULL OR v_attempt.user_id <> p_user_id THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_ACTIVE';
  END IF;
  IF v_attempt.mode <> 'official' THEN
    RAISE EXCEPTION 'INVALID_ATTEMPT_MODE';
  END IF;
  IF v_attempt.status = 'finalized' THEN
    RETURN v_attempt;
  END IF;
  IF v_attempt.status NOT IN ('active', 'locked') THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_ACTIVE';
  END IF;
  IF now() < v_attempt.expires_at THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_EXPIRED';
  END IF;

  RETURN public.finalize_exam_attempt_durable(
    p_attempt_id,
    NULL::uuid,
    NULL::text,
    coalesce(p_drafts, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_exam_attempt_drafts(uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_exam_attempt_durable(uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_expired_exam_attempt(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_exam_attempt_drafts(uuid, uuid, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_exam_attempt_durable(uuid, uuid, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_expired_exam_attempt(uuid, uuid, jsonb)
  TO service_role;
