-- Re-enabling is a status-only operation. It must not run the original Magnus
-- approval grant again, replace the student's subscription, extend its expiry,
-- or change any test balance.

CREATE OR REPLACE FUNCTION public.reenable_magnus_student(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reenabled boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_STUDENT';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('magnus-approval:' || p_user_id::text)::bigint
  );

  UPDATE public.magnus_memberships
  SET status = 'approved'
  WHERE user_id = p_user_id
    AND status = 'disabled';
  v_reenabled := FOUND;

  IF v_reenabled THEN
    INSERT INTO public.retention_notification_jobs (
      user_id,
      kind,
      event_key,
      scheduled_for,
      requires_email,
      next_attempt_at
    ) VALUES (
      p_user_id,
      'magnus_approved',
      'magnus-reenabled:' || public.uuid_generate_v4()::text,
      now(),
      true,
      now()
    );
  END IF;

  RETURN v_reenabled;
END;
$$;

REVOKE ALL ON FUNCTION public.reenable_magnus_student(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reenable_magnus_student(uuid)
  TO authenticated;
