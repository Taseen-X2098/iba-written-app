-- Run after all migrations in a disposable/staging database with
-- ON_ERROR_STOP=1. Everything is rolled back.
BEGIN;

DO $$
DECLARE
  v_upgrade_user constant uuid := '50000000-0000-4000-8000-000000000001';
  v_new_user constant uuid := '50000000-0000-4000-8000-000000000002';
  v_stale_user constant uuid := '50000000-0000-4000-8000-000000000003';
  v_subscription_id uuid;
  v_old_expiry timestamptz := now() + interval '20 days';
  v_result record;
  v_payment_id uuid;
  v_count integer;
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
    (v_upgrade_user, 'transition-upgrade@example.com', '{"name":"Upgrade","institute":"IBA"}'),
    (v_new_user, 'transition-new@example.com', '{"name":"New","institute":"IBA"}'),
    (v_stale_user, 'transition-stale@example.com', '{"name":"Stale","institute":"IBA"}');

  INSERT INTO public.subscriptions(
    user_id, plan_type, tests_remaining, extra_tests_purchased, expires_at
  ) VALUES (
    v_upgrade_user, 'plan_1', 217, 9, v_old_expiry
  ) RETURNING id INTO v_subscription_id;

  -- A paid upgrade preserves the remaining Plan 1 allowance, extras, and term.
  INSERT INTO public.payments(
    user_id, amount, payment_type, plan_type, status, bkash_payment_id, metadata
  ) VALUES (
    v_upgrade_user,
    100,
    'upgrade',
    'plan_2',
    'pending',
    'provider-upgrade',
    jsonb_build_object('sourceSubscriptionId', v_subscription_id::text)
  ) RETURNING id INTO v_payment_id;
  SELECT * INTO v_result
  FROM public.fulfill_bkash_payment(v_payment_id, 'trx-upgrade');
  IF NOT v_result.fulfilled_now
    OR v_result.fulfilled_plan_type <> 'plan_2'
    OR (SELECT tests_remaining FROM public.subscriptions
        WHERE id = v_result.fulfilled_subscription_id) <> 217
    OR (SELECT extra_tests_purchased FROM public.subscriptions
        WHERE id = v_result.fulfilled_subscription_id) <> 9
    OR v_result.fulfilled_expires_at <> v_old_expiry
  THEN
    RAISE EXCEPTION 'ASSERT: Plan 1 to Plan 2 upgrade changed balance, extras, or expiry';
  END IF;

  -- Admin switching may target any plan, but always starts one clean allowance.
  SELECT * INTO v_result
  FROM public.activate_subscription_plan(v_upgrade_user, 'plan_3', 'replace', NULL);
  IF v_result.activated_tests_remaining <> 0
    OR v_result.activated_extra_tests_purchased <> 9
  THEN
    RAISE EXCEPTION 'ASSERT: Exams Only replacement lost extras or gained base tests';
  END IF;
  SELECT * INTO v_result
  FROM public.activate_subscription_plan(v_upgrade_user, 'plan_1', 'replace', NULL);
  IF v_result.activated_tests_remaining <> 300
    OR v_result.activated_extra_tests_purchased <> 9
  THEN
    RAISE EXCEPTION 'ASSERT: admin replacement stacked or lost test balances';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.subscriptions
  WHERE user_id = v_upgrade_user AND is_active = true;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ASSERT: plan replacements left multiple active subscriptions';
  END IF;

  -- Extra-test fulfillment is atomic and a repeated callback cannot add twice.
  v_subscription_id := v_result.activated_subscription_id;
  INSERT INTO public.payments(
    user_id, amount, payment_type, status, bkash_payment_id, metadata
  ) VALUES (
    v_upgrade_user,
    25,
    'extra_tests',
    'pending',
    'provider-extra',
    jsonb_build_object('slots', 5, 'sourceSubscriptionId', v_subscription_id::text)
  ) RETURNING id INTO v_payment_id;
  SELECT * INTO v_result
  FROM public.fulfill_bkash_payment(v_payment_id, 'trx-extra');
  IF NOT v_result.fulfilled_now OR v_result.fulfilled_slots <> 5 THEN
    RAISE EXCEPTION 'ASSERT: extra-test payment was not fulfilled';
  END IF;
  SELECT * INTO v_result
  FROM public.fulfill_bkash_payment(v_payment_id, 'trx-extra');
  IF v_result.fulfilled_now THEN
    RAISE EXCEPTION 'ASSERT: repeated callback fulfilled extra tests twice';
  END IF;
  IF (SELECT extra_tests_purchased FROM public.subscriptions WHERE id = v_subscription_id) <> 14 THEN
    RAISE EXCEPTION 'ASSERT: extra-test balance was not incremented exactly once';
  END IF;

  -- A new paid subscription starts at exactly the target plan allowance.
  INSERT INTO public.payments(
    user_id, amount, payment_type, plan_type, status, bkash_payment_id, metadata
  ) VALUES (
    v_new_user, 699, 'subscription', 'plan_2', 'pending', 'provider-new', '{}'::jsonb
  ) RETURNING id INTO v_payment_id;
  SELECT * INTO v_result
  FROM public.fulfill_bkash_payment(v_payment_id, 'trx-new');
  IF NOT v_result.fulfilled_now
    OR v_result.fulfilled_plan_type <> 'plan_2'
    OR (SELECT tests_remaining FROM public.subscriptions WHERE id = v_result.fulfilled_subscription_id) <> 300
  THEN
    RAISE EXCEPTION 'ASSERT: new subscription did not receive exactly 300 tests';
  END IF;

  -- A checkout quote is tied to its source plan. If that plan changes before
  -- callback, fulfillment stays pending instead of mutating the wrong plan.
  INSERT INTO public.subscriptions(
    user_id, plan_type, tests_remaining, extra_tests_purchased, expires_at
  ) VALUES (
    v_stale_user, 'plan_1', 150, 3, now() + interval '15 days'
  ) RETURNING id INTO v_subscription_id;
  INSERT INTO public.payments(
    user_id, amount, payment_type, plan_type, status, bkash_payment_id, metadata
  ) VALUES (
    v_stale_user,
    100,
    'upgrade',
    'plan_2',
    'pending',
    'provider-stale',
    jsonb_build_object('sourceSubscriptionId', v_subscription_id::text)
  ) RETURNING id INTO v_payment_id;
  PERFORM public.activate_subscription_plan(v_stale_user, 'plan_3', 'replace', NULL);
  BEGIN
    PERFORM public.fulfill_bkash_payment(v_payment_id, 'trx-stale');
    RAISE EXCEPTION 'ASSERT: stale checkout changed a newer plan';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PLAN_CHANGED_DURING_PAYMENT%' THEN RAISE; END IF;
  END;
  IF (SELECT status FROM public.payments WHERE id = v_payment_id) <> 'pending'
    OR (SELECT plan_type FROM public.subscriptions
        WHERE user_id = v_stale_user AND is_active = true) <> 'plan_3'
  THEN
    RAISE EXCEPTION 'ASSERT: stale fulfillment did not roll back cleanly';
  END IF;
END;
$$;

ROLLBACK;
