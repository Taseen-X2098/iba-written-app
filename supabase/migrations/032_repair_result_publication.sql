-- Repair notification schema drift and make result publication a single-shot
-- action until an administrator explicitly extends the exam deadline.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS exam_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND conname = 'notifications_exam_id_fkey'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_exam_id_fkey
      FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_notifications_exam
  ON public.notifications(exam_id)
  WHERE exam_id IS NOT NULL;

-- Recover links created before the column existed. Duplicate titles are
-- resolved to the most recently created matching exam, as in migration 027.
UPDATE public.notifications AS notification
SET exam_id = (
  SELECT exam.id
  FROM public.exams AS exam
  WHERE notification.message =
    'A new exam "' || exam.title || '" is now available. You have ' ||
    exam.time_limit_minutes || ' minutes to complete it.'
  ORDER BY exam.created_at DESC
  LIMIT 1
)
WHERE notification.type = 'exam_available'
  AND notification.exam_id IS NULL;

UPDATE public.notifications AS notification
SET exam_id = (
  SELECT exam.id
  FROM public.exams AS exam
  WHERE notification.message =
    'The results for "' || exam.title || '" are now available. Check the leaderboard!'
  ORDER BY exam.created_at DESC
  LIMIT 1
)
WHERE notification.type = 'results_published'
  AND notification.exam_id IS NULL;

-- Each publication cycle gets its own key. Extending a previously published
-- exam reopens it, so the replacement results must notify students again.
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
      'exam-results:' || NEW.id::text || ':v' || NEW.results_version::text
    FROM public.exam_results AS result
    WHERE result.exam_id = NEW.id
      AND public.can_access_exam_audience_internal(NEW.id, result.user_id)
    ON CONFLICT (user_id, dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- The existing result builder remains the implementation detail. This wrapper
-- locks the exam first so concurrent clicks cannot republish an already
-- published result set or increment its version twice.
CREATE OR REPLACE FUNCTION public.publish_exam_results_once(p_exam_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_results_published boolean;
  v_version integer;
BEGIN
  SELECT exam.results_published
  INTO v_results_published
  FROM public.exams AS exam
  WHERE exam.id = p_exam_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'EXAM_NOT_FOUND'; END IF;
  IF v_results_published THEN RAISE EXCEPTION 'RESULTS_ALREADY_PUBLISHED'; END IF;

  SELECT public.publish_exam_results(p_exam_id) INTO v_version;
  RETURN v_version;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_exam_results_once(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_exam_results_once(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.publish_exam_results(uuid) FROM service_role;

-- Extending the deadline starts a new publication cycle. Existing result rows
-- remain stored but are embargoed by results_published=false until the new
-- deadline passes and the administrator publishes the rebuilt results.
CREATE OR REPLACE FUNCTION public.extend_exam_deadline(
  p_exam_id uuid,
  p_extra_minutes integer
)
RETURNS TABLE(time_limit_minutes integer, ends_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_exam public.exams%ROWTYPE;
  v_time_limit_minutes integer;
  v_ends_at timestamptz;
BEGIN
  IF p_extra_minutes < 1 OR p_extra_minutes > 180 THEN
    RAISE EXCEPTION 'INVALID_EXTENSION';
  END IF;

  SELECT * INTO v_exam
  FROM public.exams
  WHERE id = p_exam_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EXAM_NOT_FOUND'; END IF;

  UPDATE public.exams AS exam
  SET time_limit_minutes = exam.time_limit_minutes + p_extra_minutes,
      ends_at = exam.ends_at + make_interval(mins => p_extra_minutes),
      results_published = false,
      updated_at = now()
  WHERE exam.id = p_exam_id
  RETURNING exam.time_limit_minutes, exam.ends_at
  INTO v_time_limit_minutes, v_ends_at;

  UPDATE public.exam_attempts AS attempt
  SET expires_at = least(
        attempt.expires_at + make_interval(mins => p_extra_minutes),
        v_ends_at
      ),
      updated_at = now()
  WHERE attempt.exam_id = p_exam_id
    AND attempt.mode = 'official'
    AND attempt.status = 'active';

  time_limit_minutes := v_time_limit_minutes;
  ends_at := v_ends_at;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.extend_exam_deadline(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_exam_deadline(uuid, integer) TO service_role;
