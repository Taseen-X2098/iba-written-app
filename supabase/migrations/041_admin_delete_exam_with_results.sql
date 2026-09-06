-- Capture the published result rows and delete the complete exam graph in one
-- transaction. The caller turns the returned snapshot into a CSV response.

CREATE OR REPLACE FUNCTION public.delete_exam_with_results(p_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_exam public.exams%ROWTYPE;
  v_results jsonb;
  v_storage_paths jsonb;
BEGIN
  SELECT * INTO v_exam
  FROM public.exams
  WHERE id = p_exam_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXAM_NOT_FOUND';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', result.user_id,
        'student_name', profile.name,
        'institute', profile.institute,
        'total_score', result.total_score,
        'max_score', result.max_score,
        'rank', result.rank,
        'created_at', result.created_at
      )
      ORDER BY result.rank ASC NULLS LAST, profile.name ASC, result.user_id ASC
    ),
    '[]'::jsonb
  )
  INTO v_results
  FROM public.exam_results AS result
  JOIN public.profiles AS profile ON profile.id = result.user_id
  WHERE result.exam_id = p_exam_id;

  SELECT coalesce(
    jsonb_agg(image.storage_path ORDER BY image.storage_path),
    '[]'::jsonb
  )
  INTO v_storage_paths
  FROM public.translation_answer_images AS image
  JOIN public.exam_attempts AS attempt ON attempt.id = image.attempt_id
  WHERE attempt.exam_id = p_exam_id;

  DELETE FROM public.exams WHERE id = p_exam_id;

  RETURN jsonb_build_object(
    'exam_id', v_exam.id,
    'exam_title', v_exam.title,
    'storage_paths', v_storage_paths,
    'results', v_results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_exam_with_results(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_exam_with_results(uuid) TO service_role;
