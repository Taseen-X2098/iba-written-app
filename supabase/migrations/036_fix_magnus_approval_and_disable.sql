-- A Magnus grant is a 300-test allowance, not 300 tests stacked on top of an
-- existing monthly allowance. Also let admins revoke Magnus-only access while
-- preserving the student's account, plan, test balance, and approval history.

ALTER TABLE public.magnus_memberships
  DROP CONSTRAINT IF EXISTS magnus_memberships_approval_shape;

ALTER TABLE public.magnus_memberships
  ADD CONSTRAINT magnus_memberships_approval_shape CHECK (
    (status = 'approved' AND approved_at IS NOT NULL)
    OR (status = 'pending' AND approved_at IS NULL AND approved_by IS NULL)
    OR (status = 'disabled' AND approved_at IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.approve_magnus_students(p_user_ids uuid[])
RETURNS TABLE(approved_user_id uuid, notification_queued boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_user_id uuid;
  v_membership_status public.magnus_membership_status;
  v_has_membership boolean;
  v_subscription public.subscriptions%ROWTYPE;
  v_has_subscription boolean;
  v_tests_remaining integer;
  v_extra_tests integer;
  v_expires_at timestamptz;
  v_notification_queued boolean;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF p_user_ids IS NULL OR cardinality(p_user_ids) = 0 THEN
    RAISE EXCEPTION 'NO_STUDENTS_SELECTED';
  END IF;
  IF cardinality(p_user_ids) > 500 THEN
    RAISE EXCEPTION 'TOO_MANY_STUDENTS';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(p_user_ids) AS requested(user_id)
    LEFT JOIN public.profiles AS profile ON profile.id = requested.user_id
    WHERE requested.user_id IS NULL
      OR profile.id IS NULL
      OR profile.is_admin = true
  ) THEN
    RAISE EXCEPTION 'INVALID_STUDENT';
  END IF;

  FOR v_user_id IN
    SELECT DISTINCT requested.user_id
    FROM unnest(p_user_ids) AS requested(user_id)
    ORDER BY requested.user_id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext('subscription-transition:' || v_user_id::text)::bigint
    );

    SELECT membership.status
    INTO v_membership_status
    FROM public.magnus_memberships AS membership
    WHERE membership.user_id = v_user_id
    FOR UPDATE;
    v_has_membership := FOUND;

    IF v_has_membership AND v_membership_status = 'approved' THEN
      CONTINUE;
    END IF;

    IF v_has_membership THEN
      UPDATE public.magnus_memberships
      SET status = 'approved',
          approved_at = now(),
          approved_by = v_admin_id
      WHERE user_id = v_user_id;
    ELSE
      INSERT INTO public.magnus_memberships (
        user_id, status, source, requested_at, approved_at, approved_by
      ) VALUES (
        v_user_id, 'approved', 'admin', now(), now(), v_admin_id
      );
    END IF;

    v_subscription := NULL;
    SELECT subscription.*
    INTO v_subscription
    FROM public.subscriptions AS subscription
    WHERE subscription.user_id = v_user_id
      AND subscription.is_active = true
      AND subscription.expires_at > now()
    ORDER BY subscription.created_at DESC, subscription.id DESC
    LIMIT 1
    FOR UPDATE;
    v_has_subscription := FOUND;

    v_tests_remaining := CASE
      WHEN v_has_subscription
        AND v_subscription.plan_type IN ('plan_1', 'plan_2')
      THEN greatest(v_subscription.tests_remaining, 0)
      ELSE 0
    END;
    v_extra_tests := CASE
      WHEN v_has_subscription THEN greatest(v_subscription.extra_tests_purchased, 0)
      ELSE 0
    END;
    v_expires_at := greatest(
      now(),
      CASE WHEN v_has_subscription THEN v_subscription.expires_at ELSE now() END
    ) + interval '30 days';

    UPDATE public.subscriptions
    SET is_active = false
    WHERE user_id = v_user_id
      AND is_active = true;

    INSERT INTO public.subscriptions (
      user_id,
      plan_type,
      tests_remaining,
      extra_tests_purchased,
      starts_at,
      expires_at,
      is_active
    ) VALUES (
      v_user_id,
      'plan_2',
      greatest(v_tests_remaining, 300),
      v_extra_tests,
      now(),
      v_expires_at,
      true
    );

    v_notification_queued := false;
    INSERT INTO public.retention_notification_jobs (
      user_id,
      kind,
      event_key,
      scheduled_for,
      requires_email,
      next_attempt_at
    ) VALUES (
      v_user_id,
      'magnus_approved',
      'magnus-approved:' || public.uuid_generate_v4()::text,
      now(),
      true,
      now()
    )
    ON CONFLICT (user_id, event_key) DO NOTHING
    RETURNING true INTO v_notification_queued;

    approved_user_id := v_user_id;
    notification_queued := coalesce(v_notification_queued, false);
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.disable_magnus_student(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_disabled boolean := false;
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
  SET status = 'disabled'
  WHERE user_id = p_user_id
    AND status = 'approved';
  v_disabled := FOUND;

  IF v_disabled THEN
    UPDATE public.retention_notification_jobs
    SET status = 'cancelled',
        claimed_by = NULL,
        claimed_at = NULL,
        completed_at = now(),
        last_error = 'Magnus status was disabled before delivery completed',
        updated_at = now()
    WHERE user_id = p_user_id
      AND kind = 'magnus_approved'
      AND status IN ('queued', 'failed');
  END IF;

  RETURN v_disabled;
END;
$$;

REVOKE ALL ON FUNCTION public.disable_magnus_student(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disable_magnus_student(uuid)
  TO authenticated;

-- Repair rows produced by the old additive approval function. Matching the
-- subscription start to the recorded approval timestamp limits this update to
-- subscriptions created by that approval transaction.
UPDATE public.subscriptions AS subscription
SET tests_remaining = greatest(subscription.tests_remaining - 300, 300)
FROM public.magnus_memberships AS membership
WHERE membership.user_id = subscription.user_id
  AND membership.status = 'approved'
  AND subscription.plan_type = 'plan_2'
  AND subscription.starts_at = membership.approved_at
  AND subscription.tests_remaining > 300;
