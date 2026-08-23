-- Keep exam notifications linked to the exact destination they describe.
ALTER TABLE public.notifications
  ADD COLUMN exam_id uuid REFERENCES public.exams(id) ON DELETE SET NULL;

CREATE INDEX idx_notifications_exam
  ON public.notifications(exam_id)
  WHERE exam_id IS NOT NULL;

-- Recover links for notifications created before exam_id was stored. When old
-- duplicate exam titles exist, prefer the most recently created matching exam.
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

CREATE OR REPLACE FUNCTION public.notify_exam_published()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_published = true AND (OLD IS NULL OR OLD.is_published = false) THEN
    INSERT INTO public.notifications (user_id, exam_id, type, title, message)
    SELECT
      user_id,
      NEW.id,
      'exam_available',
      'New Weekly Exam!',
      'A new exam "' || NEW.title || '" is now available. You have ' || NEW.time_limit_minutes || ' minutes to complete it.'
    FROM public.subscriptions
    WHERE is_active = true AND plan_type IN ('plan_2', 'plan_3');
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
  IF NEW.results_published = true AND (OLD IS NULL OR OLD.results_published = false) THEN
    INSERT INTO public.notifications (user_id, exam_id, type, title, message)
    SELECT
      user_id,
      NEW.id,
      'results_published',
      'Exam Results Published',
      'The results for "' || NEW.title || '" are now available. Check the leaderboard!'
    FROM public.exam_results
    WHERE exam_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
