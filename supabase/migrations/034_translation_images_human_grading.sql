-- Translation answers are image-only and human-graded. Keep the original
-- page photos in a private bucket and never snapshot OCR/typed text for them.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'translation-answer-images',
  'translation-answer-images',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE public.translation_answer_images (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  exam_question_id uuid NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  page_index smallint NOT NULL CHECK (page_index BETWEEN 1 AND 2),
  storage_path text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, exam_question_id, page_index)
);

CREATE INDEX translation_answer_images_attempt
  ON public.translation_answer_images(attempt_id, exam_question_id, page_index);

ALTER TABLE public.translation_answer_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view translation answer images"
  ON public.translation_answer_images
  FOR SELECT
  USING (public.is_admin());

-- All student writes and signed preview URLs go through authenticated server
-- routes using the service role. No direct authenticated storage-object policy
-- is intentionally granted for this private bucket.

CREATE OR REPLACE FUNCTION public.finalize_exam_attempt(
  p_attempt_id uuid,
  p_user_id uuid,
  p_writer_token_hash text,
  p_drafts jsonb
)
RETURNS exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt exam_attempts;
BEGIN
  SELECT * INTO v_attempt FROM exam_attempts WHERE id = p_attempt_id FOR UPDATE;
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

  INSERT INTO exam_submissions(
    exam_id, user_id, question_id, attempt_id, ocr_text, edited_text,
    started_at, submitted_at, grading_result, graded_by
  )
  SELECT
    v_attempt.exam_id,
    v_attempt.user_id,
    eq.id,
    v_attempt.id,
    CASE
      WHEN q.category = 'translation' THEN ''
      ELSE coalesce(p_drafts -> eq.id::text ->> 'ocrText', '')
    END,
    CASE
      WHEN q.category = 'translation' THEN ''
      ELSE coalesce(p_drafts -> eq.id::text ->> 'editedText', '')
    END,
    v_attempt.started_at,
    now(),
    CASE
      WHEN q.category = 'translation' THEN NULL
      WHEN btrim(coalesce(p_drafts -> eq.id::text ->> 'editedText', '')) = '' THEN
        jsonb_build_object(
          'internal', jsonb_build_object('total', 0, 'max', eq.marks, 'criteria', '[]'::jsonb),
          'studentFeedback', jsonb_build_object(
            'score', '0/' || eq.marks::text,
            'summary', 'No answer was submitted for this question.',
            'highlights', '[]'::jsonb
          )
        )
      ELSE NULL
    END,
    CASE
      WHEN q.category = 'translation' THEN NULL
      WHEN btrim(coalesce(p_drafts -> eq.id::text ->> 'editedText', '')) = ''
        THEN 'admin'::graded_by_type
      ELSE NULL
    END
  FROM exam_questions eq
  JOIN questions q ON q.id = eq.question_id
  WHERE eq.exam_id = v_attempt.exam_id
  ON CONFLICT (attempt_id, question_id) WHERE attempt_id IS NOT NULL
  DO UPDATE SET
    ocr_text = EXCLUDED.ocr_text,
    edited_text = EXCLUDED.edited_text,
    submitted_at = EXCLUDED.submitted_at,
    grading_result = EXCLUDED.grading_result,
    graded_by = EXCLUDED.graded_by;

  UPDATE exam_attempts
  SET status = 'finalized',
      submitted_at = coalesce(submitted_at, now()),
      finalized_at = coalesce(finalized_at, now()),
      updated_at = now()
  WHERE id = v_attempt.id
  RETURNING * INTO v_attempt;
  RETURN v_attempt;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_exam_attempt(uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_exam_attempt(uuid, uuid, text, jsonb)
  TO service_role;
