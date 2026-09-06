-- A practice attempt remains resumable after its writing timer ends while the
-- student chooses answers or waits for grading. Official takeover behavior and
-- its three-minute network grace period remain unchanged.
CREATE OR REPLACE FUNCTION public.take_over_exam_attempt(
  p_attempt_id uuid,
  p_user_id uuid,
  p_writer_token_hash text
)
RETURNS exam_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt exam_attempts;
BEGIN
  UPDATE exam_attempts
  SET writer_token_hash = p_writer_token_hash,
      writer_version = writer_version + 1,
      updated_at = now()
  WHERE id = p_attempt_id
    AND user_id = p_user_id
    AND (
      (
        mode = 'official'
        AND status = 'active'
        AND expires_at + interval '3 minutes' >= now()
      )
      OR (
        mode = 'practice'
        AND status IN ('active', 'locked', 'awaiting_selection', 'grading')
      )
    )
  RETURNING * INTO v_attempt;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_ACTIVE';
  END IF;
  RETURN v_attempt;
END;
$$;

REVOKE ALL ON FUNCTION public.take_over_exam_attempt(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.take_over_exam_attempt(uuid, uuid, text) TO service_role;
