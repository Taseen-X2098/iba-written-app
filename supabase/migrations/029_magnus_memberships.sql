-- Magnus Academy candidate verification, membership approval, and entitlement grants.

CREATE TYPE public.magnus_membership_status AS ENUM ('pending', 'approved');
CREATE TYPE public.magnus_membership_source AS ENUM ('promo', 'admin');

CREATE TABLE public.magnus_memberships (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.magnus_membership_status NOT NULL,
  source public.magnus_membership_source NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT magnus_memberships_approval_shape CHECK (
    (status = 'approved' AND approved_at IS NOT NULL)
    OR (status = 'pending' AND approved_at IS NULL AND approved_by IS NULL)
  )
);

CREATE INDEX magnus_memberships_pending_requests
  ON public.magnus_memberships(requested_at, user_id)
  WHERE status = 'pending';

ALTER TABLE public.magnus_memberships ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER magnus_memberships_updated_at
  BEFORE UPDATE ON public.magnus_memberships
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();

CREATE POLICY "Users view own Magnus membership"
  ON public.magnus_memberships
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins manage Magnus memberships"
  ON public.magnus_memberships
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.magnus_memberships FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.magnus_memberships TO authenticated;
GRANT ALL ON TABLE public.magnus_memberships TO service_role;

CREATE OR REPLACE FUNCTION public.is_magnus_student(
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    p_user_id IS NOT NULL
    AND (p_user_id = auth.uid() OR public.is_admin())
    AND EXISTS (
      SELECT 1
      FROM public.magnus_memberships AS membership
      WHERE membership.user_id = p_user_id
        AND membership.status = 'approved'
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_magnus_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_magnus_student(uuid) TO authenticated, service_role;

-- A server-created, short-lived claim is passed through Supabase Auth metadata.
-- The auth trigger consumes it once and only when it matches the signing-up email,
-- so clients cannot flag themselves by forging a boolean metadata field.
CREATE TABLE public.magnus_signup_claims (
  token uuid PRIMARY KEY,
  email text NOT NULL
    CHECK (char_length(email) BETWEEN 3 AND 320 AND email = lower(btrim(email))),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX magnus_signup_claims_expiry
  ON public.magnus_signup_claims(expires_at);

ALTER TABLE public.magnus_signup_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.magnus_signup_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.magnus_signup_claims TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim_text text := lower(btrim(coalesce(
    new.raw_user_meta_data ->> 'magnus_signup_claim',
    ''
  )));
  v_consumed_claim uuid;
BEGIN
  INSERT INTO public.profiles (id, name, institute, phone)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'institute', ''),
    new.raw_user_meta_data ->> 'phone'
  );

  DELETE FROM public.magnus_signup_claims
  WHERE expires_at <= now();

  IF char_length(v_claim_text) BETWEEN 32 AND 40 THEN
    DELETE FROM public.magnus_signup_claims AS claim
    WHERE claim.token::text = v_claim_text
      AND claim.email = lower(btrim(coalesce(new.email, '')))
      AND claim.expires_at > now()
    RETURNING claim.token INTO v_consumed_claim;

    IF v_consumed_claim IS NOT NULL THEN
      INSERT INTO public.magnus_memberships (
        user_id, status, source, requested_at
      ) VALUES (
        new.id, 'pending', 'promo', now()
      );
    END IF;
  END IF;

  RETURN new;
END;
$$;

-- Magnus approvals use the existing durable notification queue. Migration 031
-- extends the worker to deliver this email-only job kind.
ALTER TABLE public.retention_notification_jobs
  DROP CONSTRAINT IF EXISTS retention_notification_jobs_kind_check;

ALTER TABLE public.retention_notification_jobs
  ADD CONSTRAINT retention_notification_jobs_kind_check CHECK (kind IN (
    'practice_reminder', 'exam_reminder',
    'subscription_expiring', 'subscription_lapsed', 'magnus_approved'
  ));

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
    -- Serialize approval of each student across concurrent single and bulk calls.
    PERFORM pg_advisory_xact_lock(
      hashtext('magnus-approval:' || v_user_id::text)::bigint
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
      v_tests_remaining + 300,
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
      'magnus-approved:' || v_user_id::text,
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

REVOKE ALL ON FUNCTION public.approve_magnus_students(uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_magnus_students(uuid[])
  TO authenticated;
