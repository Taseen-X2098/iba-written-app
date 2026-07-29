-- Missing RLS policies for exam_results:
-- 1. Students need to INSERT their own results after submission
-- 2. Students need to SELECT their own results even before results_published=true
--    (so the redirect on re-entry works and they can see their personal score)

-- Allow students to insert their own exam results
CREATE POLICY "Users can insert own exam results"
  ON exam_results FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow students to view their own results regardless of results_published flag
-- (The existing policy only shows results when results_published=true,
--  but a student should always be able to see their own score)
CREATE POLICY "Users can view own exam results"
  ON exam_results FOR SELECT
  USING (auth.uid() = user_id);
