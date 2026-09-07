-- The publish trigger can fire for INSERT as well as UPDATE. Referencing OLD
-- during INSERT raises an unassigned-record error, so branch on TG_OP first.
-- Notifications intentionally remain limited to active paid Exam-plan users,
-- including when the published exam itself is free.

CREATE OR REPLACE FUNCTION public.notify_exam_published()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_published = true
    AND (TG_OP = 'INSERT' OR OLD.is_published = false)
  THEN
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
