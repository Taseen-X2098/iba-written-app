-- Free accounts receive one shared, fixed pool of 15 practice questions:
-- three from each of the application's five AI-gradable writing categories.
-- Stable UUID hashes make the selection fixed and make this migration safe to
-- rerun after a partially committed SQL-editor attempt.

CREATE TABLE IF NOT EXISTS public.free_practice_questions (
  question_id uuid PRIMARY KEY REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.free_practice_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.free_practice_questions FROM PUBLIC, anon, authenticated;

-- Migration 008 stored all 250 opinion-writing prompts under one legacy label.
-- Every prompt has now been reviewed against the actual rubric distinction:
-- basic paragraphs explain or develop one main idea; argumentative essays ask
-- the writer to defend a contestable position, compare alternatives, or
-- resolve a policy/ethical trade-off. The 50 genuinely paragraph-style prompts
-- are listed explicitly; the other 200 are argumentative essays.
WITH basic_paragraph_prompts(prompt) AS (
  VALUES
    ('As thousands of Bangladesh''s brightest graduates leave the country each year and rarely return, how should the nation respond to this brain drain? Defend a specific course of action.'),
    ('Does having more money genuinely make people happier, or does happiness mostly come from elsewhere?'),
    ('Is winning a competition always a fair way to measure who worked hardest?'),
    ('Is it better to make quick decisions and adjust later, or take time to plan carefully first?'),
    ('Can staying hopeful actually help someone solve a difficult problem, or is it just a feeling?'),
    ('Why do people often continue bad habits even when they know those habits are harmful?'),
    ('Is starting a business mostly about having a good idea, or about persistence when things go wrong?'),
    ('Are people naturally more cooperative or more competitive by instinct?'),
    ('Can a person live a meaningful life without ever achieving anything widely considered a "success"?'),
    ('Does growing up across more than one culture make it harder or easier to build a clear sense of identity?'),
    ('Can creativity be taught, or is it mostly a natural talent some people are born with?'),
    ('Do people need a clear life purpose to feel genuinely fulfilled, or can daily enjoyment be enough?'),
    ('If a statistic is technically true but used to create a misleading impression, is presenting it dishonest?'),
    ('Why do people often procrastinate on tasks they know are important?'),
    ('Does following too many social media accounts make people compare themselves to others more?'),
    ('Does luck play a bigger role in success than most successful people admit?'),
    ('Do people make better decisions alone, or in a group where everyone shares opinions?'),
    ('Do people get used to good things over time, making it harder to stay happy?'),
    ('If a product claims to be "90% natural," does that make it a genuinely healthy choice?'),
    ('Does global trade make local cultures more similar over time, and is that a problem?'),
    ('Do people usually help others out of genuine kindness, or because it benefits them too?'),
    ('If every choice is shaped by past causes, can people still be considered truly free?'),
    ('Where should the line be drawn between appreciating another culture and appropriating it?'),
    ('Is it possible to feel equally connected to a national identity and a global one?'),
    ('Does spending time on social media affect teenagers'' mental health more than it affects adults?'),
    ('Is offering a small bribe to speed up a process a minor issue, or does it enable larger corruption?'),
    ('Does deciding as a group lead to better outcomes, or does it encourage people to just follow the loudest opinion?'),
    ('Does trying many small experiments lead to better new ideas than carefully planning one big idea?'),
    ('Do people generally trust strangers less in big cities than in small towns?'),
    ('Does spending time bored actually help people come up with more creative ideas?'),
    ('Can a hobby that earns no money still give someone a strong sense of purpose?'),
    ('Can someone be considered successful if they achieved their goals but harmed others to get there?'),
    ('Should important life decisions be based more on logic or on gut feeling?'),
    ('Does giving employees more decision-making power make a company run better or slower?'),
    ('Can a country recover from an economic crisis mainly through the hope and confidence of its citizens?'),
    ('Does publicly shaming corrupt officials actually reduce future corruption?'),
    ('Is it useful to question ideas that most people already agree with?'),
    ('Does trying again after a small failure make the next attempt easier?'),
    ('Does setting small daily goals help people achieve big long-term goals more than one large plan does?'),
    ('Do people change their core personality over time, or mostly stay the same?'),
    ('Does believing a situation will improve actually change how hard people work to improve it?'),
    ('Does comparing yourself to others on social media reduce overall life satisfaction?'),
    ('If two studies on the same topic reach opposite conclusions, how should a reasonable person decide which one to trust?'),
    ('Does the spread of a few dominant global languages threaten the survival of thousands of smaller languages worldwide?'),
    ('Does a society that celebrates only dramatic success stories discourage people from valuing slow, steady, less visible achievements?'),
    ('Does the pressure to fund expensive election campaigns make politicians more vulnerable to corruption once in office?'),
    ('Does a society''s overall wealth improve the happiness of its citizens beyond a certain basic standard of living?'),
    ('After a natural disaster, does a community''s recovery depend more on outside aid or on its own internal resilience?'),
    ('Can a work of art be judged separately from the actions or beliefs of the person who created it?'),
    ('Does offering endless product choice actually make consumers happier, or does it create anxiety and decision fatigue?')
)
UPDATE public.questions q
SET category = CASE
  WHEN EXISTS (
    SELECT 1 FROM basic_paragraph_prompts bp WHERE bp.prompt = q.prompt
  ) THEN 'basic_paragraph'::question_category
  ELSE 'argumentative_essay'::question_category
END
WHERE q.created_by IS NULL
  AND q.category IN ('basic_paragraph', 'argumentative_essay');

DO $$
DECLARE
  v_argumentative integer;
  v_paragraph integer;
  v_total_writing integer;
BEGIN
  SELECT count(*) FILTER (WHERE category = 'argumentative_essay'),
         count(*) FILTER (WHERE category = 'basic_paragraph'),
         count(*)
  INTO v_argumentative, v_paragraph, v_total_writing
  FROM public.questions
  WHERE created_by IS NULL
    AND category IN (
      'argumentative_essay', 'basic_paragraph', 'quote_analysis',
      'creative_writing', 'personal_reflection'
    );

  IF v_argumentative * 100 < v_total_writing * 40 THEN
    RAISE EXCEPTION
      'Argumentative essays are below 40%% after classification (% of % writing questions)',
      v_argumentative,
      v_total_writing;
  END IF;

  IF v_argumentative <> 200 OR v_paragraph <> 50 OR v_total_writing <> 500 THEN
    RAISE EXCEPTION
      'Unexpected seeded writing totals after classification (argumentative %, paragraphs %, total %; expected 200, 50, 500)',
      v_argumentative,
      v_paragraph,
      v_total_writing;
  END IF;
END;
$$;

-- A previous SQL-editor run may have committed the table and initial rows
-- before the old assertion failed. Rebuild the pool deterministically.
DELETE FROM public.free_practice_questions;

WITH ranked_questions AS (
  SELECT
    q.id,
    row_number() OVER (
      PARTITION BY q.category
      ORDER BY md5(q.id::text || ':free-practice-base')
    ) AS category_rank
  FROM public.questions q
  WHERE q.is_active = true
    AND q.category IN (
      'basic_paragraph',
      'argumentative_essay',
      'quote_analysis',
      'creative_writing',
      'personal_reflection'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.exam_questions eq
      WHERE eq.question_id = q.id
    )
)
INSERT INTO public.free_practice_questions (question_id)
SELECT id
FROM ranked_questions
WHERE category_rank <= 3;

DO $$
DECLARE
  v_selected integer;
  v_invalid_categories text;
BEGIN
  SELECT count(*) INTO v_selected FROM public.free_practice_questions;
  WITH expected_categories(category) AS (
    VALUES
      ('argumentative_essay'::question_category),
      ('basic_paragraph'::question_category),
      ('quote_analysis'::question_category),
      ('creative_writing'::question_category),
      ('personal_reflection'::question_category)
  ), category_counts AS (
    SELECT expected.category, count(fpq.question_id)::integer AS selected_count
    FROM expected_categories expected
    LEFT JOIN public.questions q ON q.category = expected.category
    LEFT JOIN public.free_practice_questions fpq ON fpq.question_id = q.id
    GROUP BY expected.category
  )
  SELECT string_agg(category::text || '=' || selected_count::text, ', ' ORDER BY category::text)
  INTO v_invalid_categories
  FROM category_counts
  WHERE selected_count <> 3;

  IF v_selected <> 15 OR v_invalid_categories IS NOT NULL THEN
    RAISE EXCEPTION
      'Unable to seed three free questions for each of five categories (selected % total; invalid category counts: %)',
      v_selected,
      coalesce(v_invalid_categories, 'none');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_practice_question(p_question_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.is_active = true
        AND s.expires_at > now()
    )
    OR EXISTS (
      SELECT 1
      FROM free_practice_questions fpq
      WHERE fpq.question_id = p_question_id
    )
    OR EXISTS (
      SELECT 1
      FROM submissions sub
      WHERE sub.user_id = auth.uid()
        AND sub.question_id = p_question_id
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_practice_question(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_practice_question(uuid) TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can read active questions" ON public.questions;

CREATE POLICY "Users can read entitled active questions"
  ON public.questions FOR SELECT
  USING (
    is_active = true
    AND public.can_access_practice_question(id)
  );

CREATE OR REPLACE FUNCTION public.get_question_bank_page(
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
  v_has_full_access boolean;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_status NOT IN ('all', 'done', 'not_done') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;

  SELECT
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM subscriptions s
      WHERE s.user_id = v_user_id
        AND s.is_active = true
        AND s.expires_at > now()
    )
  INTO v_has_full_access;

  RETURN QUERY
  SELECT q.id, q.category, q.marks, q.difficulty, q.source, q.prompt,
         q.space_hint, q.max_images, q.is_active, q.created_at, q.created_by
  FROM questions q
  WHERE q.is_active = true
    AND q.category <> 'translation'
    AND NOT EXISTS (SELECT 1 FROM exam_questions eq WHERE eq.question_id = q.id)
    AND (
      v_has_full_access
      OR EXISTS (
        SELECT 1
        FROM free_practice_questions fpq
        WHERE fpq.question_id = q.id
      )
    )
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

REVOKE ALL ON FUNCTION public.get_question_bank_page(integer, integer, text, text, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_question_bank_page(integer, integer, text, text, text, text, text)
  TO authenticated;
