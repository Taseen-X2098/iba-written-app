-- Practice grading originally retained feedback only on grading_job_items, then
-- removed the answer drafts from Redis. Persist each graded answer in the same
-- durable table used by the History screen.
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS practice_grading_item_id uuid
  REFERENCES public.grading_job_items(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'submissions_practice_grading_item_unique'
      AND conrelid = 'public.submissions'::regclass
  ) THEN
    ALTER TABLE public.submissions
      ADD CONSTRAINT submissions_practice_grading_item_unique
      UNIQUE (practice_grading_item_id);
  END IF;
END;
$$;

-- Recover feedback and scores for practice answers graded before this migration.
-- Their answer text was already removed by the previous cleanup path, so it
-- cannot be reconstructed and remains empty.
INSERT INTO public.submissions (
  user_id,
  question_id,
  ocr_text,
  edited_text,
  time_taken_seconds,
  grading_result,
  graded_by,
  is_exam_submission,
  practice_grading_item_id,
  created_at
)
SELECT
  job.requested_by,
  exam_question.question_id,
  '',
  '',
  least(
    2147483647,
    greatest(
      0,
      round(extract(epoch FROM (
        coalesce(attempt.submitted_at, attempt.expires_at) - attempt.started_at
      )))
    )
  )::integer,
  item.result,
  'ai'::public.graded_by_type,
  true,
  item.id,
  coalesce(attempt.submitted_at, job.completed_at, item.updated_at, job.created_at)
FROM public.grading_job_items AS item
JOIN public.grading_jobs AS job ON job.id = item.job_id
JOIN public.exam_attempts AS attempt ON attempt.id = job.attempt_id
JOIN public.exam_questions AS exam_question ON exam_question.id = item.exam_question_id
WHERE job.kind = 'practice_exam'
  AND item.status = 'completed'
  AND item.result IS NOT NULL
ON CONFLICT (practice_grading_item_id) DO NOTHING;
