-- Keep every paid/admin plan transition on one set of atomic rules:
-- exactly one active subscription, a non-stacking base allowance, purchased
-- extras carried forward, and idempotent bKash fulfillment.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL;

-- Older application paths could race and leave multiple rows marked active.
-- Keep the newest row as the authoritative one before enforcing the invariant.
WITH ranked_active AS (
  SELECT
    subscription.id,
    row_number() OVER (
      PARTITION BY subscription.user_id
      ORDER BY subscription.created_at DESC, subscription.id DESC
    ) AS active_rank
  FROM public.subscriptions AS subscription
  WHERE subscription.is_active = true
)
UPDATE public.subscriptions AS subscription
SET is_active = false
FROM ranked_active
WHERE ranked_active.id = subscription.id
  AND ranked_active.active_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_active_per_user_idx
  ON public.subscriptions(user_id)
  WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS payments_unique_bkash_transaction_idx
  ON public.payments(bkash_trx_id)
  WHERE bkash_trx_id IS NOT NULL;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_nonnegative_balances;
UPDATE public.subscriptions
SET tests_remaining = greatest(tests_remaining, 0),
    extra_tests_purchased = greatest(extra_tests_purchased, 0)
WHERE tests_remaining < 0
   OR extra_tests_purchased < 0;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_nonnegative_balances CHECK (
    tests_remaining >= 0 AND extra_tests_purchased >= 0
  );

CREATE OR REPLACE FUNCTION public.activate_subscription_plan(
  p_user_id uuid,
  p_plan_type public.plan_type,
  p_transition text DEFAULT 'replace',
  p_expected_subscription_id uuid DEFAULT NULL
)
RETURNS TABLE(
  activated_subscription_id uuid,
  activated_expires_at timestamptz,
  activated_plan_type public.plan_type,
  activated_tests_remaining integer,
  activated_extra_tests_purchased integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current public.subscriptions%ROWTYPE;
  v_has_current boolean;
  v_has_live_current boolean;
  v_tests_remaining integer;
  v_extra_tests integer;
  v_expires_at timestamptz;
BEGIN
  IF p_user_id IS NULL OR p_plan_type IS NULL THEN
    RAISE EXCEPTION 'INVALID_PLAN_TRANSITION';
  END IF;
  IF p_transition IS NULL OR p_transition NOT IN ('replace', 'subscription', 'upgrade') THEN
    RAISE EXCEPTION 'INVALID_PLAN_TRANSITION';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('subscription-transition:' || p_user_id::text)::bigint
  );

  v_current := NULL;
  SELECT subscription.*
  INTO v_current
  FROM public.subscriptions AS subscription
  WHERE subscription.user_id = p_user_id
    AND subscription.is_active = true
  ORDER BY subscription.created_at DESC, subscription.id DESC
  LIMIT 1
  FOR UPDATE;
  v_has_current := FOUND;
  v_has_live_current := v_has_current AND v_current.expires_at > now();

  IF p_expected_subscription_id IS NOT NULL
    AND (NOT v_has_live_current OR v_current.id <> p_expected_subscription_id) THEN
    RAISE EXCEPTION 'PLAN_CHANGED_DURING_PAYMENT';
  END IF;

  v_extra_tests := CASE
    WHEN v_has_current THEN greatest(v_current.extra_tests_purchased, 0)
    ELSE 0
  END;

  IF p_transition = 'upgrade' THEN
    IF NOT v_has_live_current
      OR p_expected_subscription_id IS NULL
      OR p_plan_type <> 'plan_2'
      OR v_current.plan_type NOT IN ('plan_1', 'plan_3') THEN
      RAISE EXCEPTION 'INVALID_PLAN_UPGRADE';
    END IF;

    -- An upgrade changes features for the remaining term. It never adds a
    -- second 300-test allowance or silently extends the paid expiry.
    v_tests_remaining := CASE
      WHEN v_current.plan_type = 'plan_1'
        THEN least(greatest(v_current.tests_remaining, 0), 300)
      ELSE 300
    END;
    v_expires_at := v_current.expires_at;
  ELSIF p_transition = 'subscription' THEN
    -- A full subscription purchase is for users without a current live term.
    -- Live-plan changes must use the explicit upgrade rules above.
    IF v_has_live_current THEN
      RAISE EXCEPTION 'ACTIVE_SUBSCRIPTION_EXISTS';
    END IF;
    v_tests_remaining := CASE WHEN p_plan_type IN ('plan_1', 'plan_2') THEN 300 ELSE 0 END;
    v_expires_at := now() + interval '30 days';
  ELSE
    -- Admin replacement starts a fresh 30-day term and is the only path that
    -- may switch freely between any two plans.
    v_tests_remaining := CASE WHEN p_plan_type IN ('plan_1', 'plan_2') THEN 300 ELSE 0 END;
    v_expires_at := now() + interval '30 days';
  END IF;

  UPDATE public.subscriptions
  SET is_active = false
  WHERE user_id = p_user_id
    AND is_active = true;

  INSERT INTO public.subscriptions AS new_subscription (
    user_id,
    plan_type,
    tests_remaining,
    extra_tests_purchased,
    starts_at,
    expires_at,
    is_active
  ) VALUES (
    p_user_id,
    p_plan_type,
    v_tests_remaining,
    v_extra_tests,
    now(),
    v_expires_at,
    true
  )
  RETURNING
    new_subscription.id,
    new_subscription.expires_at,
    new_subscription.plan_type,
    new_subscription.tests_remaining,
    new_subscription.extra_tests_purchased
  INTO
    activated_subscription_id,
    activated_expires_at,
    activated_plan_type,
    activated_tests_remaining,
    activated_extra_tests_purchased;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.fulfill_bkash_payment(
  p_payment_id uuid,
  p_bkash_trx_id text
)
RETURNS TABLE(
  fulfilled_now boolean,
  fulfilled_user_id uuid,
  fulfilled_payment_type public.payment_type,
  fulfilled_plan_type public.plan_type,
  fulfilled_subscription_id uuid,
  fulfilled_expires_at timestamptz,
  fulfilled_slots integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_subscription public.subscriptions%ROWTYPE;
  v_transition record;
  v_expected_subscription_id uuid;
  v_slots integer := 0;
BEGIN
  IF p_payment_id IS NULL OR nullif(btrim(p_bkash_trx_id), '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_FULFILLMENT';
  END IF;

  SELECT payment.*
  INTO v_payment
  FROM public.payments AS payment
  WHERE payment.id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND';
  END IF;

  fulfilled_user_id := v_payment.user_id;
  fulfilled_payment_type := v_payment.payment_type;
  fulfilled_plan_type := v_payment.plan_type;
  fulfilled_subscription_id := v_payment.subscription_id;
  fulfilled_slots := 0;

  IF v_payment.status = 'completed' THEN
    IF v_payment.bkash_trx_id IS DISTINCT FROM p_bkash_trx_id THEN
      RAISE EXCEPTION 'PAYMENT_TRANSACTION_MISMATCH';
    END IF;
    fulfilled_now := false;
    IF v_payment.subscription_id IS NOT NULL THEN
      SELECT subscription.expires_at
      INTO fulfilled_expires_at
      FROM public.subscriptions AS subscription
      WHERE subscription.id = v_payment.subscription_id;
    END IF;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'PAYMENT_NOT_PENDING';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('subscription-transition:' || v_payment.user_id::text)::bigint
  );

  IF v_payment.payment_type = 'extra_tests' THEN
    IF v_payment.metadata IS NULL
      OR jsonb_typeof(v_payment.metadata -> 'slots') <> 'number'
      OR nullif(v_payment.metadata ->> 'sourceSubscriptionId', '') IS NULL THEN
      RAISE EXCEPTION 'INVALID_EXTRA_TEST_PAYMENT';
    END IF;
    v_slots := (v_payment.metadata ->> 'slots')::integer;
    v_expected_subscription_id := (v_payment.metadata ->> 'sourceSubscriptionId')::uuid;
    IF v_slots < 1 OR v_slots > 10000 THEN
      RAISE EXCEPTION 'INVALID_EXTRA_TEST_PAYMENT';
    END IF;

    SELECT subscription.*
    INTO v_subscription
    FROM public.subscriptions AS subscription
    WHERE subscription.id = v_expected_subscription_id
      AND subscription.user_id = v_payment.user_id
      AND subscription.is_active = true
      AND subscription.expires_at > now()
      AND subscription.plan_type IN ('plan_1', 'plan_2')
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PLAN_CHANGED_DURING_PAYMENT';
    END IF;

    UPDATE public.subscriptions
    SET extra_tests_purchased = extra_tests_purchased + v_slots
    WHERE id = v_subscription.id
    RETURNING id, expires_at
    INTO fulfilled_subscription_id, fulfilled_expires_at;
    fulfilled_slots := v_slots;
  ELSIF v_payment.payment_type IN ('subscription', 'upgrade') THEN
    IF v_payment.plan_type IS NULL THEN
      RAISE EXCEPTION 'PAYMENT_PLAN_MISSING';
    END IF;

    v_expected_subscription_id := CASE
      WHEN v_payment.payment_type = 'upgrade'
        THEN nullif(v_payment.metadata ->> 'sourceSubscriptionId', '')::uuid
      ELSE NULL
    END;

    SELECT transition.*
    INTO v_transition
    FROM public.activate_subscription_plan(
      v_payment.user_id,
      v_payment.plan_type,
      v_payment.payment_type::text,
      v_expected_subscription_id
    ) AS transition;

    fulfilled_subscription_id := v_transition.activated_subscription_id;
    fulfilled_expires_at := v_transition.activated_expires_at;
    fulfilled_plan_type := v_transition.activated_plan_type;
  ELSE
    RAISE EXCEPTION 'UNSUPPORTED_PAYMENT_TYPE';
  END IF;

  UPDATE public.payments
  SET status = 'completed',
      bkash_trx_id = p_bkash_trx_id,
      fulfilled_at = now(),
      subscription_id = fulfilled_subscription_id
  WHERE id = v_payment.id;

  fulfilled_now := true;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_subscription_plan(uuid, public.plan_type, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fulfill_bkash_payment(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_subscription_plan(uuid, public.plan_type, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fulfill_bkash_payment(uuid, text)
  TO service_role;
