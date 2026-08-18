-- Infinite scrolling only needs to know whether another page exists. Fetching
-- one extra row avoids counting every filtered question on each request.

DROP FUNCTION IF EXISTS public.get_question_bank_page(integer, integer, text, text, text, text, text);

CREATE FUNCTION public.get_question_bank_page(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 10,
  p_search text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_difficulty text DEFAULT NULL,
  p_sort text DEFAULT 'newest',
  p_status text DEFAULT 'not_done'
)
RETURNS TABLE(
  id uuid,
  category question_category,
  marks integer,
  difficulty difficulty_level,
  source text,
  prompt text,
  space_hint text,
  max_images integer,
  is_active boolean,
  created_at timestamptz,
  created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_status NOT IN ('all', 'done', 'not_done') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;

  RETURN QUERY
  SELECT q.id, q.category, q.marks, q.difficulty, q.source, q.prompt,
         q.space_hint, q.max_images, q.is_active, q.created_at, q.created_by
  FROM questions q
  WHERE q.is_active = true
    AND q.category <> 'translation'
    AND NOT EXISTS (SELECT 1 FROM exam_questions eq WHERE eq.question_id = q.id)
    AND (p_search IS NULL OR btrim(p_search) = '' OR q.prompt ILIKE '%' || p_search || '%')
    AND (p_category IS NULL OR p_category = 'all' OR q.category::text = p_category)
    AND (p_difficulty IS NULL OR p_difficulty = 'all' OR q.difficulty::text = p_difficulty)
    AND (
      p_status = 'all'
      OR (p_status = 'done' AND EXISTS (
        SELECT 1 FROM submissions s WHERE s.user_id = v_user_id AND s.question_id = q.id
      ))
      OR (p_status = 'not_done' AND NOT EXISTS (
        SELECT 1 FROM submissions s WHERE s.user_id = v_user_id AND s.question_id = q.id
      ))
    )
  ORDER BY
    CASE WHEN p_sort = 'oldest' THEN q.created_at END ASC,
    CASE WHEN p_sort = 'difficulty' THEN q.difficulty END ASC,
    CASE WHEN p_sort NOT IN ('oldest', 'difficulty') THEN q.created_at END DESC,
    q.id
  LIMIT greatest(1, least(p_page_size, 50)) + 1
  OFFSET (greatest(1, p_page) - 1) * greatest(1, least(p_page_size, 50));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_question_bank_page(integer, integer, text, text, text, text, text) TO authenticated;
