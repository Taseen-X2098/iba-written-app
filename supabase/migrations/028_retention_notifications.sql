-- Scheduled retention notifications, editable practice hooks, and durable jobs.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'practice_reminder';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'exam_reminder';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'subscription_lapsed';

ALTER TABLE public.notifications
  ADD COLUMN details text,
  ADD COLUMN action_url text,
  ADD COLUMN dedupe_key text;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_details_input_length
    CHECK (details IS NULL OR char_length(details) <= 12000),
  ADD CONSTRAINT notifications_action_url_input_length
    CHECK (
      action_url IS NULL
      OR (
        char_length(action_url) BETWEEN 1 AND 500
        AND action_url LIKE '/%'
        AND action_url NOT LIKE '//%'
      )
    ),
  ADD CONSTRAINT notifications_dedupe_key_input_length
    CHECK (dedupe_key IS NULL OR char_length(dedupe_key) BETWEEN 1 AND 300),
  ADD CONSTRAINT notifications_user_dedupe UNIQUE (user_id, dedupe_key);

CREATE TABLE public.retention_notification_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  practice_enabled boolean NOT NULL DEFAULT true,
  practice_days smallint[] NOT NULL DEFAULT ARRAY[1, 3]::smallint[],
  practice_time time NOT NULL DEFAULT '19:00',
  exam_reminder_enabled boolean NOT NULL DEFAULT true,
  exam_reminder_minutes_before integer NOT NULL DEFAULT 60
    CHECK (exam_reminder_minutes_before BETWEEN 5 AND 10080),
  subscription_expiry_enabled boolean NOT NULL DEFAULT true,
  subscription_expiry_days_before integer NOT NULL DEFAULT 5
    CHECK (subscription_expiry_days_before BETWEEN 1 AND 30),
  subscription_lapsed_enabled boolean NOT NULL DEFAULT true,
  subscription_lapsed_days_after integer NOT NULL DEFAULT 5
    CHECK (subscription_lapsed_days_after BETWEEN 1 AND 30),
  timezone text NOT NULL DEFAULT 'Asia/Dhaka'
    CHECK (char_length(timezone) BETWEEN 1 AND 80),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    cardinality(practice_days) BETWEEN 1 AND 7
    AND practice_days <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]
  )
);

INSERT INTO public.retention_notification_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.practice_notification_hooks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 240),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.practice_notification_hooks (content, is_active)
VALUES
  ('One focused answer today can prevent the mistake that costs you marks on exam day.', true),
  ('Your next improvement is hiding inside one more practice question.', true),
  ('Ten focused minutes now can make your next written answer clearer and faster.', true),
  ('Do not wait to feel ready. Practice one answer and let feedback show the next step.', true);

CREATE TABLE public.retention_notification_jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'practice_reminder', 'exam_reminder',
    'subscription_expiring', 'subscription_lapsed'
  )),
  event_key text NOT NULL CHECK (char_length(event_key) BETWEEN 1 AND 300),
  scheduled_for timestamptz NOT NULL,
  exam_id uuid REFERENCES public.exams(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  requires_email boolean NOT NULL DEFAULT false,
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  email_sent_at timestamptz,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  claimed_by text,
  claimed_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (user_id, event_key)
);

CREATE INDEX retention_notification_jobs_claim
  ON public.retention_notification_jobs(status, next_attempt_at, scheduled_for);

ALTER TABLE public.retention_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_notification_hooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_notification_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage retention notification settings"
  ON public.retention_notification_settings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage practice notification hooks"
  ON public.practice_notification_hooks
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins view retention notification jobs"
  ON public.retention_notification_jobs
  FOR SELECT USING (public.is_admin());

CREATE TRIGGER retention_notification_settings_updated_at
  BEFORE UPDATE ON public.retention_notification_settings
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();
CREATE TRIGGER practice_notification_hooks_updated_at
  BEFORE UPDATE ON public.practice_notification_hooks
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();

-- Atomically attach a browser token to the signed-in account. Removing it from
-- another profile prevents a shared browser from receiving the previous
-- account's private notifications after a login switch.
CREATE OR REPLACE FUNCTION public.register_fcm_token(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_token IS NULL OR char_length(p_token) NOT BETWEEN 20 AND 4096 THEN
    RAISE EXCEPTION 'INVALID_FCM_TOKEN';
  END IF;

  UPDATE public.profiles
  SET fcm_tokens = array_remove(coalesce(fcm_tokens, '{}'::text[]), p_token)
  WHERE id <> v_user_id AND p_token = ANY(coalesce(fcm_tokens, '{}'::text[]));

  UPDATE public.profiles
  SET fcm_tokens = (
    array_prepend(p_token, array_remove(coalesce(fcm_tokens, '{}'::text[]), p_token))
  )[1:10]
  WHERE id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unregister_fcm_token(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_token IS NULL OR char_length(p_token) > 4096 THEN RETURN; END IF;
  UPDATE public.profiles
  SET fcm_tokens = array_remove(coalesce(fcm_tokens, '{}'::text[]), p_token)
  WHERE id = auth.uid();
END;
$$;

-- This RPC only creates durable, idempotent work. The Railway worker builds
-- student-facing copy from current learner history and performs delivery.
CREATE OR REPLACE FUNCTION public.enqueue_due_retention_notification_jobs(
  p_now timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.retention_notification_settings;
  v_local_now timestamp;
  v_inserted integer := 0;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_settings
  FROM public.retention_notification_settings
  WHERE id = 1;
  IF NOT FOUND THEN RETURN 0; END IF;

  v_local_now := p_now AT TIME ZONE v_settings.timezone;

  IF v_settings.practice_enabled
    AND extract(isodow FROM v_local_now)::smallint = ANY(v_settings.practice_days)
    AND v_local_now::time >= v_settings.practice_time
  THEN
    INSERT INTO public.retention_notification_jobs(
      user_id, kind, event_key, scheduled_for
    )
    SELECT DISTINCT
      subscription.user_id,
      'practice_reminder',
      'practice:' || v_local_now::date::text,
      p_now
    FROM public.subscriptions AS subscription
    JOIN public.profiles AS profile ON profile.id = subscription.user_id
    WHERE subscription.is_active = true
      AND subscription.expires_at > p_now
      AND subscription.plan_type IN ('plan_1', 'plan_2')
      AND profile.is_admin = false
    ON CONFLICT (user_id, event_key) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_inserted := v_inserted + v_count;
  END IF;

  IF v_settings.exam_reminder_enabled THEN
    INSERT INTO public.retention_notification_jobs(
      user_id, kind, event_key, scheduled_for, exam_id
    )
    SELECT DISTINCT
      subscription.user_id,
      'exam_reminder',
      'exam-reminder:' || exam.id::text || ':' || exam.starts_at::text,
      exam.starts_at - make_interval(mins => v_settings.exam_reminder_minutes_before),
      exam.id
    FROM public.exams AS exam
    JOIN public.subscriptions AS subscription
      ON subscription.is_active = true
      AND subscription.expires_at > p_now
      AND subscription.plan_type IN ('plan_2', 'plan_3')
    JOIN public.profiles AS profile ON profile.id = subscription.user_id
    WHERE exam.is_published = true
      AND exam.starts_at > p_now
      AND exam.starts_at <= p_now + make_interval(mins => v_settings.exam_reminder_minutes_before)
      AND profile.is_admin = false
    ON CONFLICT (user_id, event_key) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_inserted := v_inserted + v_count;
  END IF;

  IF v_settings.subscription_expiry_enabled THEN
    INSERT INTO public.retention_notification_jobs(
      user_id, kind, event_key, scheduled_for, subscription_id
    )
    SELECT
      subscription.user_id,
      'subscription_expiring',
      'subscription-expiring:' || subscription.id::text,
      subscription.expires_at - make_interval(days => v_settings.subscription_expiry_days_before),
      subscription.id
    FROM public.subscriptions AS subscription
    JOIN public.profiles AS profile ON profile.id = subscription.user_id
    WHERE subscription.is_active = true
      AND subscription.expires_at > p_now
      AND subscription.expires_at <= p_now + make_interval(days => v_settings.subscription_expiry_days_before)
      AND profile.is_admin = false
    ON CONFLICT (user_id, event_key) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_inserted := v_inserted + v_count;
  END IF;

  IF v_settings.subscription_lapsed_enabled THEN
    WITH latest_expired AS (
      SELECT DISTINCT ON (subscription.user_id)
        subscription.id,
        subscription.user_id,
        subscription.expires_at
      FROM public.subscriptions AS subscription
      WHERE subscription.expires_at <= p_now
      ORDER BY subscription.user_id, subscription.expires_at DESC, subscription.created_at DESC
    )
    INSERT INTO public.retention_notification_jobs(
      user_id, kind, event_key, scheduled_for, subscription_id, requires_email
    )
    SELECT
      expired.user_id,
      'subscription_lapsed',
      'subscription-lapsed:' || expired.id::text,
      expired.expires_at + make_interval(days => v_settings.subscription_lapsed_days_after),
      expired.id,
      true
    FROM latest_expired AS expired
    JOIN public.profiles AS profile ON profile.id = expired.user_id
    WHERE expired.expires_at <= p_now - make_interval(days => v_settings.subscription_lapsed_days_after)
      AND profile.is_admin = false
      AND NOT EXISTS (
        SELECT 1
        FROM public.subscriptions AS live
        WHERE live.user_id = expired.user_id
          AND live.is_active = true
          AND live.expires_at > p_now
      )
    ON CONFLICT (user_id, event_key) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_inserted := v_inserted + v_count;
  END IF;

  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_retention_notification_jobs(
  p_worker_id text,
  p_limit integer DEFAULT 20
)
RETURNS SETOF public.retention_notification_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.retention_notification_jobs
  SET status = CASE WHEN attempt_count >= 8 THEN 'failed' ELSE 'queued' END,
      claimed_by = NULL,
      claimed_at = NULL,
      next_attempt_at = now(),
      last_error = 'Recovered stale worker claim',
      updated_at = now()
  WHERE status = 'running'
    AND claimed_at < now() - interval '10 minutes';

  RETURN QUERY
  WITH claimable AS (
    SELECT job.id
    FROM public.retention_notification_jobs AS job
    WHERE job.status = 'queued'
      AND job.attempt_count < 8
      AND job.next_attempt_at <= now()
      AND job.scheduled_for <= now()
    ORDER BY job.scheduled_for, job.created_at
    FOR UPDATE OF job SKIP LOCKED
    LIMIT greatest(1, least(p_limit, 100))
  )
  UPDATE public.retention_notification_jobs AS job
  SET status = 'running',
      claimed_by = p_worker_id,
      claimed_at = now(),
      attempt_count = job.attempt_count + 1,
      updated_at = now()
  FROM claimable
  WHERE job.id = claimable.id
  RETURNING job.*;
END;
$$;

-- Publishing can happen before the exam starts. Keep the immediate announcement
-- but limit it to unique, live entitlements and give it an explicit destination.
CREATE OR REPLACE FUNCTION public.notify_exam_published()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_published = true AND (OLD IS NULL OR OLD.is_published = false) THEN
    INSERT INTO public.notifications (
      user_id, exam_id, type, title, message, action_url, dedupe_key
    )
    SELECT DISTINCT
      subscription.user_id,
      NEW.id,
      'exam_available',
      'New weekly exam',
      '"' || NEW.title || '" has been published. Open it to see the schedule and instructions.',
      '/exams/' || NEW.id::text,
      'exam-published:' || NEW.id::text
    FROM public.subscriptions AS subscription
    WHERE subscription.is_active = true
      AND subscription.expires_at > now()
      AND subscription.plan_type IN ('plan_2', 'plan_3')
    ON CONFLICT (user_id, dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.register_fcm_token(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unregister_fcm_token(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enqueue_due_retention_notification_jobs(timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_retention_notification_jobs(text, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.register_fcm_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_fcm_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_due_retention_notification_jobs(timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_retention_notification_jobs(text, integer)
  TO service_role;
