CREATE TABLE standalone_usage_charges (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id),
  idempotency_key uuid NOT NULL,
  source usage_source NOT NULL,
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  status usage_charge_status NOT NULL DEFAULT 'reserved',
  submission_id uuid REFERENCES submissions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, idempotency_key)
);

ALTER TABLE standalone_usage_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own standalone usage" ON standalone_usage_charges
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins manage standalone usage" ON standalone_usage_charges
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.reserve_standalone_usage(
  p_user_id uuid,
  p_question_id uuid,
  p_idempotency_key uuid
)
RETURNS standalone_usage_charges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing standalone_usage_charges;
  v_subscription subscriptions;
  v_profile profiles;
BEGIN
  -- Serialize duplicate HTTP retries before checking the idempotency row.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_idempotency_key::text, 0)
  );
  SELECT * INTO v_existing FROM standalone_usage_charges
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.question_id <> p_question_id THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN v_existing;
  END IF;

  SELECT * INTO v_subscription FROM subscriptions
  WHERE user_id = p_user_id AND is_active = true AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF v_subscription.id IS NOT NULL AND v_subscription.extra_tests_purchased > 0 THEN
    UPDATE subscriptions SET extra_tests_purchased = extra_tests_purchased - 1 WHERE id = v_subscription.id;
    INSERT INTO standalone_usage_charges(user_id, question_id, idempotency_key, source, subscription_id)
    VALUES (p_user_id, p_question_id, p_idempotency_key, 'extra', v_subscription.id)
    RETURNING * INTO v_existing;
  ELSIF v_subscription.id IS NOT NULL
    AND v_subscription.plan_type IN ('plan_1', 'plan_2')
    AND v_subscription.tests_remaining > 0 THEN
    UPDATE subscriptions SET tests_remaining = tests_remaining - 1 WHERE id = v_subscription.id;
    INSERT INTO standalone_usage_charges(user_id, question_id, idempotency_key, source, subscription_id)
    VALUES (p_user_id, p_question_id, p_idempotency_key, 'plan', v_subscription.id)
    RETURNING * INTO v_existing;
  ELSIF v_profile.free_tests_remaining > 0 THEN
    UPDATE profiles SET free_tests_remaining = free_tests_remaining - 1 WHERE id = v_profile.id;
    INSERT INTO standalone_usage_charges(user_id, question_id, idempotency_key, source)
    VALUES (p_user_id, p_question_id, p_idempotency_key, 'free')
    RETURNING * INTO v_existing;
  ELSE
    RAISE EXCEPTION 'INSUFFICIENT_SLOTS';
  END IF;
  RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_standalone_usage(p_charge_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge standalone_usage_charges;
BEGIN
  SELECT * INTO v_charge FROM standalone_usage_charges WHERE id = p_charge_id FOR UPDATE;
  IF NOT FOUND OR v_charge.status <> 'reserved' THEN RETURN; END IF;
  IF v_charge.source = 'free' THEN
    UPDATE profiles SET free_tests_remaining = free_tests_remaining + 1 WHERE id = v_charge.user_id;
  ELSIF v_charge.source = 'extra' THEN
    UPDATE subscriptions SET extra_tests_purchased = extra_tests_purchased + 1 WHERE id = v_charge.subscription_id;
  ELSE
    UPDATE subscriptions SET tests_remaining = tests_remaining + 1 WHERE id = v_charge.subscription_id;
  END IF;
  UPDATE standalone_usage_charges SET status = 'released', updated_at = now() WHERE id = p_charge_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_standalone_grade(
  p_charge_id uuid,
  p_user_id uuid,
  p_question_id uuid,
  p_ocr_text text,
  p_edited_text text,
  p_time_taken_seconds integer,
  p_grading_result jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge standalone_usage_charges;
  v_submission_id uuid;
BEGIN
  SELECT * INTO v_charge FROM standalone_usage_charges
  WHERE id = p_charge_id AND user_id = p_user_id AND question_id = p_question_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'USAGE_CHARGE_NOT_FOUND'; END IF;
  IF v_charge.status = 'consumed' AND v_charge.submission_id IS NOT NULL THEN RETURN v_charge.submission_id; END IF;
  IF v_charge.status <> 'reserved' THEN RAISE EXCEPTION 'USAGE_CHARGE_NOT_RESERVED'; END IF;

  INSERT INTO submissions(user_id, question_id, ocr_text, edited_text, time_taken_seconds, grading_result, graded_by)
  VALUES (p_user_id, p_question_id, p_ocr_text, p_edited_text, greatest(0, p_time_taken_seconds), p_grading_result, 'ai')
  RETURNING id INTO v_submission_id;
  UPDATE standalone_usage_charges
  SET status = 'consumed', submission_id = v_submission_id, updated_at = now()
  WHERE id = p_charge_id;
  RETURN v_submission_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_standalone_usage(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_standalone_usage(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_standalone_grade(uuid, uuid, uuid, text, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_standalone_usage(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_standalone_usage(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_standalone_grade(uuid, uuid, uuid, text, text, integer, jsonb) TO service_role;
