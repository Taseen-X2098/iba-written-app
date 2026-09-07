-- Expiration ends answer mutation, not the owner's ability to reconcile an
-- unfinished official attempt. This wrapper performs the owner and timer
-- checks under the same row lock used by finalization, then delegates to the
-- existing OCR-aware snapshot transaction. Browser drafts are never accepted
-- directly by the RPC; the service route supplies its server-held snapshot.

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

  RETURN public.finalize_exam_attempt(
    p_attempt_id,
    NULL::uuid,
    NULL::text,
    coalesce(p_drafts, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_expired_exam_attempt(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_expired_exam_attempt(uuid, uuid, jsonb)
  TO service_role;
