-- Official bulk grading can queue the same exam question once per student.
-- The original constraint was designed for single-student practice jobs and
-- rejected those valid official items because it keyed only on the question.
ALTER TABLE public.grading_job_items
  DROP CONSTRAINT IF EXISTS grading_job_items_job_id_exam_question_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS grading_job_items_one_practice_question_per_job
  ON public.grading_job_items(job_id, exam_question_id)
  WHERE exam_submission_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS grading_job_items_one_official_submission_per_job
  ON public.grading_job_items(job_id, exam_submission_id)
  WHERE exam_submission_id IS NOT NULL;

-- Preserve an audit trail while preventing incomplete jobs created by the old
-- constraint from remaining queued forever. The age guard avoids touching a
-- job that a concurrently running request has only just created.
UPDATE public.grading_jobs AS job
SET status = 'failed',
    failed_items = job.total_items,
    last_error = coalesce(job.last_error, 'Grading job creation did not complete; retry the selection.'),
    completed_at = coalesce(job.completed_at, now()),
    updated_at = now()
WHERE job.kind = 'official_exam'
  AND job.status = 'queued'
  AND job.total_items > 0
  AND job.created_at < now() - interval '5 minutes'
  AND NOT EXISTS (
    SELECT 1
    FROM public.grading_job_items AS item
    WHERE item.job_id = job.id
  );
