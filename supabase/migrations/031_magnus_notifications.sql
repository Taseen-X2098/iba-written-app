-- Ensure no notification or reminder discloses a Magnus-only exam.

CREATE OR REPLACE FUNCTION public.enforce_retention_exam_audience()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.exam_id IS NOT NULL
    AND NOT public.can_access_exam_audience_internal(NEW.exam_id, NEW.user_id)
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER retention_jobs_enforce_exam_audience
  BEFORE INSERT OR UPDATE OF user_id, exam_id
  ON public.retention_notification_jobs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_retention_exam_audience();

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
      'exam_available'::public.notification_type,
      'New weekly exam',
      '"' || NEW.title || '" has been published. Open it to see the schedule and instructions.',
      '/exams/' || NEW.id::text,
      'exam-published:' || NEW.id::text
    FROM public.subscriptions AS subscription
    JOIN public.profiles AS profile ON profile.id = subscription.user_id
    WHERE subscription.is_active = true
      AND subscription.expires_at > now()
      AND subscription.plan_type IN ('plan_2', 'plan_3')
      AND profile.is_admin = false
      AND public.can_access_exam_audience_internal(NEW.id, subscription.user_id)
    ON CONFLICT (user_id, dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_results_published()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.results_published = true
    AND (OLD IS NULL OR OLD.results_published = false)
  THEN
    INSERT INTO public.notifications (
      user_id, exam_id, type, title, message, action_url, dedupe_key
    )
    SELECT
      result.user_id,
      NEW.id,
      'results_published'::public.notification_type,
      'Exam Results Published',
      'The results for "' || NEW.title || '" are now available. Check the leaderboard!',
      '/exams/' || NEW.id::text || '/results',
      'exam-results:' || NEW.id::text
    FROM public.exam_results AS result
    WHERE result.exam_id = NEW.id
      AND public.can_access_exam_audience_internal(NEW.id, result.user_id)
    ON CONFLICT (user_id, dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
